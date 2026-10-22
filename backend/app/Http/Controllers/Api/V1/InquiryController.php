<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ApplicantStatus;
use App\Enums\InquiryStatus;
use App\Enums\RoleName;
use App\Models\Applicant;
use App\Models\ApplicantStatusHistory;
use App\Models\FranchiseInquiry;
use App\Models\User;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class InquiryController extends ApiController
{
    /** 404 for any inquiry the signed-in user is not allowed to see (see FranchiseInquiry::scopeVisibleTo). */
    private function ensureVisible(Request $request, FranchiseInquiry $inquiry): void
    {
        abort_unless(
            FranchiseInquiry::query()->visibleTo($request->user())->whereKey($inquiry->getKey())->exists(),
            404,
            'Inquiry not found.'
        );
    }

    public function index(Request $request): JsonResponse
    {
        $archived = $request->boolean('archived');

        $query = FranchiseInquiry::query()
            ->visibleTo($request->user())
            ->with(['preferredBrand', 'encodedBy:id,full_name', 'endorsedTo:id,full_name', 'applicant:id,status']);

        if ($archived) {
            $query->archived()->with('currentArchiveLog');
        } else {
            $query->active();

            // Displayed Inquiry ID: this inquiry's position among ACTIVE inquiries, in the
            // order they were entered (by permanent id). It is derived on every request, so
            // it updates by itself when records are archived, restored, added, or deleted.
            // The permanent `id` is never changed and keeps being used by URLs and relations.
            $query->select('franchise_inquiries.*')->selectSub(
                FranchiseInquiry::query()
                    ->from('franchise_inquiries as seq')
                    ->selectRaw('count(*)')
                    ->whereNull('seq.archived_at')
                    ->visibleTo($request->user(), 'seq')
                    ->whereColumn('seq.id', '<=', 'franchise_inquiries.id'),
                'display_no'
            );
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('source')) {
            $query->where('source', $request->string('source'));
        }
        if ($request->filled('brand_id')) {
            $query->where('preferred_brand_id', $request->integer('brand_id'));
        }
        if ($request->filled('from')) {
            $query->whereDate('inquiry_date', '>=', $request->date('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('inquiry_date', '<=', $request->date('to'));
        }
        if ($request->filled('year')) {
            $query->whereYear('inquiry_date', $request->integer('year'));
        }
        if ($request->filled('month')) {
            $query->whereMonth('inquiry_date', $request->integer('month'));
        }
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q
                ->where('lead_name', 'like', $term)
                ->orWhere('email', 'like', $term)
                ->orWhere('phone', 'like', $term));
        }

        if ($request->string('sort')->toString() === 'date') {
            // Most recent inquiry date first.
            $query->orderByDesc('inquiry_date')->orderByDesc('id');
        } elseif ($archived) {
            $query->orderByDesc('archived_at')->orderByDesc('id');
        } else {
            // Default: displayed Inquiry ID, lowest to highest.
            $query->orderBy('id');
        }

        return $this->paginated($query->paginate($this->perPage($request, 20)));
    }

    public function store(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'lead_name' => ['required', 'string', 'max:255'],
            'first_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'viber_number' => ['nullable', 'required_if:source,viber', 'string', 'max:30'],
            'address' => ['nullable', 'string'],
            'current_city' => ['nullable', 'string', 'max:255'],
            'preferred_franchise_location' => ['nullable', 'string', 'max:255'],
            'source' => ['required', Rule::in(['facebook', 'viber', 'gmail', 'walk_in', 'referral', 'other'])],
            'preferred_brand_id' => ['nullable', 'exists:brands,id'],
            'status' => ['nullable', Rule::enum(InquiryStatus::class)],
            'remarks' => ['nullable', 'string'],
            'inquiry_date' => ['nullable', 'date'],
        ]);

        $inquiry = FranchiseInquiry::create([
            ...$validated,
            'status' => $validated['status'] ?? InquiryStatus::New,
            'encoded_by_user_id' => $request->user()->id,
            'inquiry_date' => $validated['inquiry_date'] ?? now()->toDateString(),
        ]);

        $audit->record('inquiry.created', $inquiry, newValues: $inquiry->toArray(), request: $request);

        return $this->success($inquiry->load(['preferredBrand', 'encodedBy:id,full_name']), 'Inquiry recorded.', 201);
    }

    public function show(Request $request, FranchiseInquiry $inquiry): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        return $this->success($inquiry->load([
            'preferredBrand', 'encodedBy:id,full_name', 'endorsedTo:id,full_name',
            'applicant.statusHistory.changedBy:id,full_name',
        ]));
    }

    public function update(Request $request, FranchiseInquiry $inquiry, AuditService $audit): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        $validated = $request->validate([
            'lead_name' => ['sometimes', 'required', 'string', 'max:255'],
            'first_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'viber_number' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string'],
            'current_city' => ['nullable', 'string', 'max:255'],
            'preferred_franchise_location' => ['nullable', 'string', 'max:255'],
            'source' => ['sometimes', Rule::in(['facebook', 'viber', 'gmail', 'walk_in', 'referral', 'other'])],
            'preferred_brand_id' => ['nullable', 'exists:brands,id'],
            'status' => ['sometimes', Rule::enum(InquiryStatus::class)],
            'remarks' => ['nullable', 'string'],
            'inquiry_date' => ['sometimes', 'date'],
        ]);

        if ($inquiry->status === InquiryStatus::Converted && isset($validated['status']) && $validated['status'] !== InquiryStatus::Converted->value) {
            throw ValidationException::withMessages(['status' => ['A converted inquiry cannot be moved back.']]);
        }

        $old = $inquiry->toArray();
        $inquiry->update($validated);
        $audit->record('inquiry.updated', $inquiry, $old, $inquiry->fresh()->toArray(), $request);

        return $this->success($inquiry->fresh(['preferredBrand', 'encodedBy:id,full_name']), 'Inquiry updated.');
    }

    public function endorse(Request $request, FranchiseInquiry $inquiry, NotificationService $notifications, AuditService $audit): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        // Only Marketing and Sales hand inquiries over. Admin only receives them.
        $me = $request->user();
        abort_unless(
            in_array($me->role?->name?->value, ['marketing', 'sales'], true),
            403,
            'Only Marketing and Sales can endorse inquiries.'
        );

        if ($inquiry->status === InquiryStatus::Converted) {
            throw ValidationException::withMessages(['inquiry' => ['A converted inquiry cannot be endorsed.']]);
        }
        // Already handed to someone else: only the current holder may pass it on.
        if ($inquiry->endorsed_to_user_id && (int) $inquiry->endorsed_to_user_id !== (int) $me->id) {
            throw ValidationException::withMessages(['inquiry' => ['This inquiry was already endorsed.']]);
        }

        $validated = $request->validate([
            'endorsed_to_user_id' => ['nullable', 'exists:users,id'],
            'remarks' => ['nullable', 'string'],
        ]);

        $targetUser = isset($validated['endorsed_to_user_id'])
            ? User::query()->with('role')->find((int) $validated['endorsed_to_user_id'])
            : User::query()
                ->with('role')
                ->where('account_status', 'active')
                ->whereHas('role', fn ($query) => $query->where('name', RoleName::Admin->value))
                ->first();

        $targetUser ??= User::query()
            ->with('role')
            ->where('account_status', 'active')
            ->whereHas('role', fn ($query) => $query->where('name', RoleName::Sales->value))
            ->first();

        if (! $targetUser
            || $targetUser->account_status !== 'active'
            || ! in_array($targetUser->role?->name, [RoleName::Admin, RoleName::Sales], true)) {
            throw ValidationException::withMessages([
                'endorsed_to_user_id' => ['Choose an active admin or sales account to receive this inquiry.'],
            ]);
        }

        $targetUserId = $targetUser->id;

        if ((int) $targetUserId === (int) $me->id) {
            throw ValidationException::withMessages([
                'endorsed_to_user_id' => ['You cannot endorse an inquiry to yourself.'],
            ]);
        }

        $old = $inquiry->toArray();
        $inquiry->update([
            'status' => InquiryStatus::Endorsed,
            'endorsed_to_user_id' => $targetUserId,
            'remarks' => $validated['remarks'] ?? $inquiry->remarks,
        ]);

        $notifications->notifyUser(
            $targetUserId,
            'inquiry_endorsed',
            'New inquiry endorsed',
            "Inquiry from {$inquiry->lead_name} has been endorsed to you.",
            ['inquiry_id' => $inquiry->id],
        );
        $audit->record('inquiry.endorsed', $inquiry, $old, $inquiry->fresh()->toArray(), $request);

        return $this->success($inquiry->fresh(['endorsedTo:id,full_name']), 'Inquiry endorsed.');
    }

    public function convert(Request $request, FranchiseInquiry $inquiry, AuditService $audit): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        $inquiry->loadMissing('applicant');
        if ($inquiry->applicant) {
            return $this->success($inquiry->applicant, 'Inquiry was already converted.');
        }

        $validated = $request->validate([
            'notes' => ['nullable', 'string'],
            'application_date' => ['nullable', 'date'],
        ]);

        $applicant = DB::transaction(function () use ($request, $inquiry, $validated): Applicant {
            $applicant = Applicant::create([
                'inquiry_id' => $inquiry->id,
                'preferred_brand_id' => $inquiry->preferred_brand_id,
                'full_name' => $inquiry->lead_name,
                'email' => $inquiry->email,
                'phone' => $inquiry->phone,
                'address' => $inquiry->address,
                'status' => ApplicantStatus::Inquiry,
                'application_date' => $validated['application_date'] ?? now()->toDateString(),
                'notes' => $validated['notes'] ?? $inquiry->remarks,
            ]);

            ApplicantStatusHistory::create([
                'applicant_id' => $applicant->id,
                'from_status' => null,
                'to_status' => ApplicantStatus::Inquiry,
                'remarks' => 'Created from inquiry.',
                'changed_by_user_id' => $request->user()->id,
            ]);

            $inquiry->update([
                'status' => InquiryStatus::Converted,
                'converted_from_status' => $inquiry->status,
            ]);

            return $applicant;
        });

        $audit->record('inquiry.converted', $inquiry, newValues: ['applicant_id' => $applicant->id], request: $request);

        return $this->success($applicant->load(['preferredBrand', 'inquiry']), 'Inquiry converted to applicant.', 201);
    }

    /**
     * Undo a conversion: removes the applicant record created by convert() and
     * returns the lead to the pipeline. Only reversible while the candidate has
     * not progressed past the first stage.
     */
    public function unconvert(Request $request, FranchiseInquiry $inquiry, AuditService $audit): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        $inquiry->loadMissing('applicant');

        if (! $inquiry->applicant) {
            return $this->success($inquiry->fresh(), 'This inquiry is not converted.');
        }

        if ($inquiry->applicant->status !== ApplicantStatus::Inquiry) {
            throw ValidationException::withMessages([
                'inquiry' => ['This applicant has already progressed past the inquiry stage and can no longer be unconverted.'],
            ]);
        }

        $applicantId = $inquiry->applicant->id;

        // Restore the exact stage the lead sat at before it was converted. Falls back
        // to the endorse/new heuristic for rows converted before this was tracked.
        $restoreTo = $inquiry->converted_from_status
            ? InquiryStatus::tryFrom($inquiry->converted_from_status)
            : null;

        DB::transaction(function () use ($inquiry, $restoreTo): void {
            $inquiry->applicant->delete();
            $inquiry->update([
                'status' => $restoreTo
                    ?? ($inquiry->endorsed_to_user_id ? InquiryStatus::Endorsed : InquiryStatus::New),
                'converted_from_status' => null,
            ]);
        });

        $audit->record('inquiry.unconverted', $inquiry, newValues: ['removed_applicant_id' => $applicantId], request: $request);

        return $this->success($inquiry->fresh(['preferredBrand']), 'Conversion undone. The applicant record was removed.');
    }

    public function archive(Request $request, FranchiseInquiry $inquiry, AuditService $audit): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        if ($inquiry->archived_at) {
            return $this->success($inquiry, 'Inquiry is already archived.');
        }

        $old = $inquiry->toArray();
        // Updates archived_at and writes the archive history row (Archive ID + original display no).
        $log = $inquiry->archiveBy($request->user()->id);
        $audit->record(
            'inquiry.archived',
            $inquiry,
            $old,
            $inquiry->fresh()->toArray() + ['archive_id' => $log?->archive_id, 'original_display_no' => $log?->original_display_no],
            $request,
        );

        return $this->success($inquiry->fresh(['currentArchiveLog']), 'Inquiry archived.');
    }

    public function restore(Request $request, FranchiseInquiry $inquiry, AuditService $audit): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        $old = $inquiry->toArray();
        $inquiry->restoreBy($request->user()->id);
        $audit->record('inquiry.restored', $inquiry, $old, $inquiry->fresh()->toArray(), $request);

        return $this->success($inquiry->fresh(), 'Inquiry restored.');
    }

    /**
     * Remove an inquiry outright. Converted leads keep their applicant record, so
     * conversion must be undone first.
     */
    public function destroy(Request $request, FranchiseInquiry $inquiry, AuditService $audit): JsonResponse
    {
        $this->ensureVisible($request, $inquiry);

        $inquiry->loadMissing('applicant');
        if ($inquiry->applicant) {
            throw ValidationException::withMessages([
                'inquiry' => ['Undo the conversion before deleting this inquiry.'],
            ]);
        }

        $old = $inquiry->toArray();
        $inquiry->delete();
        $audit->record('inquiry.deleted', $inquiry, $old, [], $request);

        return $this->success(message: 'Inquiry deleted.');
    }
}
