<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ApplicantStatus;
use App\Enums\DocumentType;
use App\Enums\PaymentStatus;
use App\Enums\RoleName;
use App\Models\Applicant;
use App\Models\ApplicantStatusHistory;
use App\Models\Document;
use App\Models\Franchisee;
use App\Models\FranchiseLocation;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ApplicantController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = Applicant::query()->with(['preferredBrand', 'user:id,full_name,email', 'inquiry:id,source']);

        if ($request->boolean('archived')) {
            $query->archived();
        } else {
            $query->active();
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('brand_id')) {
            $query->where('preferred_brand_id', $request->integer('brand_id'));
        }
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('full_name', 'like', $term)->orWhere('email', 'like', $term)->orWhere('phone', 'like', $term));
        }

        if ($request->user()->role->name === RoleName::Franchisee) {
            $query->where('user_id', $request->user()->id);
        }

        // Displayed applicant ID: the applicant's position among the ACTIVE
        // applicants in the order they were entered (using the permanent id), so
        // archiving, restoring, adding, or deleting never leaves gaps and restore
        // returns the original number. The permanent id keeps driving URLs and
        // relations — same mechanic as the inquiries pipeline.
        $query->select('applicants.*')->selectSub(
            Applicant::query()
                ->from('applicants as seq')
                ->selectRaw('count(*)')
                ->whereNull('seq.archived_at')
                ->when(
                    $request->user()->role->name === RoleName::Franchisee,
                    fn ($seq) => $seq->where('seq.user_id', $request->user()->id)
                )
                ->whereColumn('seq.id', '<=', 'applicants.id'),
            'display_no'
        );

        return $this->paginated($query->latest('application_date')->paginate($this->perPage($request, 20)));
    }

    /**
     * Approved applicants that are now trading, listed separately from the
     * in-progress pipeline.
     */
    public function activeFranchisees(Request $request): JsonResponse
    {
        if ($request->user()->role->name === RoleName::Franchisee) {
            abort(403, 'You cannot access this list.');
        }

        $query = Franchisee::query()->with([
            'applicant:id,full_name,email,phone,status',
            'applicant.preferredBrand:id,name',
            'user:id,full_name,email',
            'locations:id,franchisee_id,name,city,province,is_active',
        ]);

        if ($request->filled('status')) {
            $query->where('franchise_status', $request->string('status'));
        }
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q
                ->where('business_name', 'like', $term)
                ->orWhereHas('applicant', fn ($a) => $a->where('full_name', 'like', $term)));
        }

        return $this->paginated($query->latest('approval_date')->paginate($this->perPage($request, 20)));
    }

    public function store(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'preferred_brand_id' => ['nullable', 'exists:brands,id'],
            'status' => ['nullable', Rule::enum(ApplicantStatus::class)],
            'application_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $applicant = Applicant::create([
            ...$validated,
            'status' => $validated['status'] ?? ApplicantStatus::Inquiry,
            'application_date' => $validated['application_date'] ?? now()->toDateString(),
        ]);

        ApplicantStatusHistory::create([
            'applicant_id' => $applicant->id,
            'from_status' => null,
            'to_status' => $applicant->status,
            'remarks' => 'Applicant created directly.',
            'changed_by_user_id' => $request->user()->id,
        ]);

        $audit->record('applicant.created', $applicant, newValues: $applicant->toArray(), request: $request);

        return $this->success($applicant->load('preferredBrand'), 'Applicant created.', 201);
    }

    public function show(Request $request, Applicant $applicant): JsonResponse
    {
        $this->authorizeApplicantAccess($request, $applicant);

        return $this->success($applicant->load([
            'preferredBrand', 'inquiry', 'user:id,full_name,email,phone',
            'statusHistory.changedBy:id,full_name', 'schedules.assignedTo:id,full_name',
            'payments.documents', 'documents.uploadedBy:id,full_name',
            'franchisee.locations.brand',
        ])->toArray() + ['milestone_state' => $applicant->milestoneState()]);
    }

    /**
     * Save the activities/legalities checklist shown in the applicant update form,
     * together with "Date marked" / "Marked by" for every completed accomplishment.
     */
    public function updateMilestones(Request $request, Applicant $applicant, AuditService $audit): JsonResponse
    {
        $this->authorizeApplicantAccess($request, $applicant, staffOnly: true);

        $known = array_keys(config('franchise.milestones', []));
        $validated = $request->validate([
            'milestones' => ['present', 'array'],
            'milestones.*' => ['boolean'],
            'milestone_details' => ['nullable', 'array'],
            'milestone_details.*' => ['array'],
            'milestone_details.*.on' => ['required', 'date'],
        ]);

        $submittedDetails = $validated['milestone_details'] ?? [];

        $unknown = array_diff(
            array_merge(array_keys($validated['milestones']), array_keys($submittedDetails)),
            $known
        );
        if ($unknown !== []) {
            throw ValidationException::withMessages([
                'milestones' => ['Unknown milestone keys: '.implode(', ', array_unique($unknown)).'.'],
            ]);
        }

        $milestones = collect($known)
            ->mapWithKeys(fn (string $key) => [$key => (bool) ($validated['milestones'][$key] ?? false)])
            ->all();

        // "Date marked" / "Marked by" per completed accomplishment:
        // - an unmarked milestone loses its record;
        // - an existing record keeps its original marker (the date may be corrected);
        // - a new record is signed by the logged-in user, never by a name sent from the browser;
        // - if the request carries no details for an already recorded milestone, the saved record stays.
        $user = $request->user();
        $previous = $applicant->milestone_details ?? [];
        $details = [];
        foreach ($known as $key) {
            if (! $milestones[$key]) {
                continue;
            }
            $existing = $previous[$key] ?? null;
            $sent = $submittedDetails[$key] ?? null;
            if ($sent === null && $existing === null) {
                continue;
            }
            $details[$key] = [
                'on' => $sent !== null ? Carbon::parse($sent['on'])->format('Y-m-d\TH:i') : $existing['on'],
                'by' => $existing['by'] ?? $this->markerLabel($user),
                'by_user_id' => $existing['by_user_id'] ?? $user->id,
            ];
        }

        $old = ['milestones' => $applicant->milestones, 'milestone_details' => $previous];
        $applicant->update(['milestones' => $milestones, 'milestone_details' => $details]);
        $audit->record(
            'applicant.milestones_updated',
            $applicant,
            $old,
            ['milestones' => $milestones, 'milestone_details' => $details],
            $request,
        );

        return $this->success(
            $applicant->fresh()->toArray() + ['milestone_state' => $applicant->fresh()->milestoneState()],
            'Applicant activities updated.',
        );
    }

    public function archive(Request $request, Applicant $applicant, AuditService $audit): JsonResponse
    {
        $this->authorizeApplicantAccess($request, $applicant, staffOnly: true);

        if ($applicant->archived_at) {
            return $this->success($applicant, 'Applicant is already archived.');
        }

        $old = $applicant->toArray();
        $applicant->update([
            'archived_at' => now(),
            'archived_by_user_id' => $request->user()->id,
        ]);
        $audit->record('applicant.archived', $applicant, $old, $applicant->fresh()->toArray(), $request);

        return $this->success($applicant->fresh(), 'Applicant archived.');
    }

    public function restore(Request $request, Applicant $applicant, AuditService $audit): JsonResponse
    {
        $this->authorizeApplicantAccess($request, $applicant, staffOnly: true);

        $old = $applicant->toArray();
        $applicant->update(['archived_at' => null, 'archived_by_user_id' => null]);
        $audit->record('applicant.restored', $applicant, $old, $applicant->fresh()->toArray(), $request);

        return $this->success($applicant->fresh(), 'Applicant restored to the pipeline.');
    }

    /**
     * Remove an applicant outright. Blocked once the candidate has become an
     * active franchisee, so live franchise records cannot be destroyed.
     */
    public function destroy(Request $request, Applicant $applicant, AuditService $audit): JsonResponse
    {
        if ($applicant->status === ApplicantStatus::ActiveFranchisee) {
            throw ValidationException::withMessages([
                'applicant' => ['An active franchisee cannot be removed. Archive the record instead.'],
            ]);
        }

        $old = $applicant->toArray();
        $applicant->delete();
        $audit->record('applicant.deleted', $applicant, $old, [], $request);

        return $this->success(message: 'Applicant removed.');
    }

    public function update(Request $request, Applicant $applicant, AuditService $audit): JsonResponse
    {
        $this->authorizeApplicantAccess($request, $applicant, staffOnly: true);

        $validated = $request->validate([
            'full_name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'preferred_brand_id' => ['nullable', 'exists:brands,id'],
            'notes' => ['nullable', 'string'],
        ]);

        $old = $applicant->toArray();
        $applicant->update($validated);
        $audit->record('applicant.updated', $applicant, $old, $applicant->fresh()->toArray(), $request);

        return $this->success($applicant->fresh('preferredBrand'), 'Applicant updated.');
    }

    public function updateStatus(Request $request, Applicant $applicant, NotificationService $notifications, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::enum(ApplicantStatus::class)],
            'remarks' => ['nullable', 'string'],
        ]);
        $to = ApplicantStatus::from($validated['status']);
        $from = $applicant->status;

        if ($from === ApplicantStatus::ActiveFranchisee && $to !== $from) {
            throw ValidationException::withMessages(['status' => ['An active franchisee cannot be moved back through the applicant pipeline.']]);
        }

        $applicant->update([
            'status' => $to,
            'approved_at' => $to === ApplicantStatus::Approved ? now() : $applicant->approved_at,
            'rejected_at' => $to === ApplicantStatus::Rejected ? now() : null,
        ]);

        ApplicantStatusHistory::create([
            'applicant_id' => $applicant->id,
            'from_status' => $from,
            'to_status' => $to,
            'remarks' => $validated['remarks'] ?? null,
            'changed_by_user_id' => $request->user()->id,
        ]);

        if ($applicant->user_id) {
            $notifications->notifyUser($applicant->user_id, 'applicant_status', 'Application status updated', "Your application is now {$to->value}.", [
                'applicant_id' => $applicant->id,
                'status' => $to->value,
            ]);
        }
        $audit->record('applicant.status_changed', $applicant, ['status' => $from->value], ['status' => $to->value], $request);

        return $this->success($applicant->fresh('statusHistory.changedBy'), 'Applicant status updated.');
    }

    public function createPortalUser(Request $request, Applicant $applicant, AuditService $audit): JsonResponse
    {
        if ($applicant->user_id) {
            return response()->json(['message' => 'The applicant already has a portal account.'], 422);
        }

        $validated = $request->validate([
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:10'],
        ]);

        $role = Role::query()->where('name', RoleName::Franchisee->value)->firstOrFail();
        $user = DB::transaction(function () use ($applicant, $validated, $role): User {
            $user = User::create([
                'role_id' => $role->id,
                'full_name' => $applicant->full_name,
                'email' => strtolower($validated['email']),
                'phone' => $applicant->phone,
                'password' => $validated['password'],
                'account_status' => 'active',
            ]);
            $applicant->update(['user_id' => $user->id, 'email' => $validated['email']]);

            return $user;
        });

        $audit->record('applicant.portal_user_created', $applicant, newValues: ['user_id' => $user->id], request: $request);

        return $this->success($user->load('role'), 'Applicant portal account created.', 201);
    }

    public function submitLoi(Request $request, Applicant $applicant, NotificationService $notifications, AuditService $audit): JsonResponse
    {
        $this->authorizeApplicantAccess($request, $applicant);
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:'.config('franchise.max_upload_kb')],
            'submission_date' => ['nullable', 'date'],
        ]);

        $file = $validated['file'];
        $storedName = str()->uuid().'.'.$file->getClientOriginalExtension();
        $path = $file->storeAs("applicants/{$applicant->id}/loi", $storedName, 'private');

        $document = $applicant->documents()->create([
            'type' => DocumentType::Loi,
            'original_name' => $file->getClientOriginalName(),
            'stored_name' => $storedName,
            'disk' => 'private',
            'path' => $path,
            'mime_type' => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'uploaded_by_user_id' => $request->user()->id,
            'metadata' => ['submission_date' => $validated['submission_date'] ?? now()->toDateString()],
        ]);

        $this->setApplicantStatus($applicant, ApplicantStatus::LoiSubmitted, $request->user()->id, 'Letter of Intent submitted.');
        $notifications->notifyRoles(['admin', 'sales'], 'loi_submitted', 'LOI submitted', "{$applicant->full_name} submitted a Letter of Intent.", ['applicant_id' => $applicant->id]);
        $audit->record('applicant.loi_submitted', $applicant, newValues: ['document_id' => $document->id], request: $request);

        return $this->success($document, 'Letter of Intent uploaded.', 201);
    }

    public function recordPayment(Request $request, Applicant $applicant, NotificationService $notifications, AuditService $audit): JsonResponse
    {
        $this->authorizeApplicantAccess($request, $applicant);
        $validated = $request->validate([
            'payment_type' => ['required', 'string', 'max:50'],
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_date' => ['required', 'date'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'remarks' => ['nullable', 'string'],
            'receipt' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:'.config('franchise.max_upload_kb')],
        ]);

        $payment = DB::transaction(function () use ($request, $applicant, $validated): Payment {
            $payment = Payment::create([
                'applicant_id' => $applicant->id,
                'payment_type' => $validated['payment_type'],
                'amount' => $validated['amount'],
                'payment_date' => $validated['payment_date'],
                'reference_number' => $validated['reference_number'] ?? null,
                'status' => PaymentStatus::Pending,
                'recorded_by_user_id' => $request->user()->id,
                'remarks' => $validated['remarks'] ?? null,
            ]);

            if (isset($validated['receipt'])) {
                $file = $validated['receipt'];
                $storedName = str()->uuid().'.'.$file->getClientOriginalExtension();
                $path = $file->storeAs("applicants/{$applicant->id}/payments", $storedName, 'private');
                $payment->documents()->create([
                    'type' => DocumentType::PaymentReceipt,
                    'original_name' => $file->getClientOriginalName(),
                    'stored_name' => $storedName,
                    'disk' => 'private',
                    'path' => $path,
                    'mime_type' => $file->getMimeType(),
                    'size_bytes' => $file->getSize(),
                    'uploaded_by_user_id' => $request->user()->id,
                ]);
            }

            return $payment;
        });

        $this->setApplicantStatus($applicant, ApplicantStatus::PaymentSubmitted, $request->user()->id, 'Required payment recorded.');
        $notifications->notifyRoles(['admin'], 'payment_submitted', 'Payment submitted', "A payment was submitted for {$applicant->full_name}.", ['applicant_id' => $applicant->id, 'payment_id' => $payment->id]);
        $audit->record('applicant.payment_recorded', $payment, newValues: $payment->toArray(), request: $request);

        return $this->success($payment->load('documents'), 'Payment recorded.', 201);
    }

    public function verifyPayment(Request $request, Applicant $applicant, Payment $payment, AuditService $audit): JsonResponse
    {
        if ($payment->applicant_id !== $applicant->id) {
            abort(404);
        }

        $validated = $request->validate([
            'status' => ['required', Rule::in([PaymentStatus::Verified->value, PaymentStatus::Rejected->value])],
            'remarks' => ['nullable', 'string'],
        ]);

        $old = $payment->toArray();
        $payment->update([
            'status' => $validated['status'],
            'verified_by_user_id' => $request->user()->id,
            'verified_at' => now(),
            'remarks' => $validated['remarks'] ?? $payment->remarks,
        ]);

        if ($validated['status'] === PaymentStatus::Verified->value) {
            $this->setApplicantStatus($applicant, ApplicantStatus::ForApproval, $request->user()->id, 'Payment verified.');
        }

        $audit->record('payment.verified', $payment, $old, $payment->fresh()->toArray(), $request);

        return $this->success($payment->fresh(['verifiedBy:id,full_name', 'documents']), 'Payment review saved.');
    }

    public function approve(Request $request, Applicant $applicant, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'business_name' => ['required', 'string', 'max:255'],
            'location' => ['required', 'array'],
            'location.name' => ['required', 'string', 'max:255'],
            'location.address' => ['required', 'string'],
            'location.city' => ['nullable', 'string', 'max:100'],
            'location.province' => ['nullable', 'string', 'max:100'],
            'location.region' => ['nullable', 'string', 'max:100'],
            'location.contact_number' => ['nullable', 'string', 'max:50'],
        ]);

        $completed = $applicant->milestones ? count(array_filter((array) $applicant->milestones)) : 0;
        $total = count(config('franchise.milestones', []));
        if ($completed < $total) {
            $missing = array_keys(config('franchise.milestones', []));
            $missing = array_filter($missing, fn (string $key) => empty($applicant->milestones[$key]));
            $missingLabels = array_map(
                fn (string $key) => config("franchise.milestones.{$key}", $key),
                $missing,
            );

            throw ValidationException::withMessages([
                'applicant' => ['Activation Failed: Applicant has completed '.$completed.'/'.$total.' required activities. Pending: '.implode(', ', $missingLabels).'.'],
            ]);
        }

        $verifiedPayment = $applicant->payments()->where('status', PaymentStatus::Verified->value)->exists();
        $loiExists = $applicant->documents()->where('type', DocumentType::Loi->value)->exists();
        if (! $verifiedPayment || ! $loiExists) {
            throw ValidationException::withMessages([
                'applicant' => ['A verified payment and Letter of Intent are required before approval.'],
            ]);
        }

        $franchisee = DB::transaction(function () use ($request, $applicant, $validated): Franchisee {
            $franchisee = Franchisee::query()->updateOrCreate(
                ['applicant_id' => $applicant->id],
                [
                    'user_id' => $applicant->user_id,
                    'business_name' => $validated['business_name'],
                    'franchise_status' => 'active',
                    'approval_date' => now()->toDateString(),
                ],
            );

            FranchiseLocation::query()->updateOrCreate(
                ['franchisee_id' => $franchisee->id, 'name' => $validated['location']['name']],
                [
                    'brand_id' => $applicant->preferred_brand_id,
                    'type' => 'franchise',
                    'address' => $validated['location']['address'],
                    'city' => $validated['location']['city'] ?? null,
                    'province' => $validated['location']['province'] ?? null,
                    'region' => $validated['location']['region'] ?? null,
                    'contact_number' => $validated['location']['contact_number'] ?? null,
                    'is_active' => true,
                ],
            );

            $from = $applicant->status;
            $applicant->update(['status' => ApplicantStatus::ActiveFranchisee, 'approved_at' => now(), 'rejected_at' => null]);
            ApplicantStatusHistory::create([
                'applicant_id' => $applicant->id,
                'from_status' => $from,
                'to_status' => ApplicantStatus::ActiveFranchisee,
                'remarks' => 'Applicant approved and converted to active franchisee.',
                'changed_by_user_id' => $request->user()->id,
            ]);

            return $franchisee;
        });

        $audit->record('applicant.approved', $applicant, newValues: ['franchisee_id' => $franchisee->id], request: $request);

        return $this->success($franchisee->load(['applicant', 'user', 'locations.brand']), 'Applicant approved and activated as a franchisee.');
    }

    public function downloadDocument(Request $request, Applicant $applicant, Document $document)
    {
        $this->authorizeApplicantAccess($request, $applicant);
        if ($document->documentable_type !== Applicant::class || $document->documentable_id !== $applicant->id) {
            abort(404);
        }
        abort_unless(Storage::disk($document->disk)->exists($document->path), 404, 'File not found.');

        return Storage::disk($document->disk)->download($document->path, $document->original_name);
    }

    public function downloadPaymentDocument(Request $request, Applicant $applicant, Payment $payment, Document $document)
    {
        $this->authorizeApplicantAccess($request, $applicant);
        if ($payment->applicant_id !== $applicant->id
            || $document->documentable_type !== Payment::class
            || $document->documentable_id !== $payment->id) {
            abort(404);
        }
        abort_unless(Storage::disk($document->disk)->exists($document->path), 404, 'File not found.');

        return Storage::disk($document->disk)->download($document->path, $document->original_name);
    }

    private function setApplicantStatus(Applicant $applicant, ApplicantStatus $status, int $userId, string $remarks): void
    {
        if ($applicant->status === $status) {
            return;
        }
        $from = $applicant->status;
        $applicant->update(['status' => $status]);
        ApplicantStatusHistory::create([
            'applicant_id' => $applicant->id,
            'from_status' => $from,
            'to_status' => $status,
            'remarks' => $remarks,
            'changed_by_user_id' => $userId,
        ]);
    }

    private function authorizeApplicantAccess(Request $request, Applicant $applicant, bool $staffOnly = false): void
    {
        $role = $request->user()->role->name;
        if ($role === RoleName::Franchisee && ($staffOnly || $applicant->user_id !== $request->user()->id)) {
            abort(403, 'You cannot access this applicant record.');
        }
    }

    /** "Marked by" text for a new accomplishment record, e.g. "John Rey (Admin)". */
    private function markerLabel(User $user): string
    {
        $role = str($user->role->name->value)->replace('_', ' ')->title();

        return trim($user->full_name.' ('.$role.')');
    }
}
