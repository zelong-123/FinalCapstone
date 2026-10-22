<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Applicant;
use App\Models\FranchiseInquiry;
use App\Models\InquiryArchiveLog;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ArchiveController extends ApiController
{
    /**
     * Admin settings archive: soft-archived and deleted records across users,
     * inquiries, and applicants.
     */
    public function index(Request $request): JsonResponse
    {
        $type = $request->string('type')->toString() ?: 'all';
        $limit = $this->perPage($request, 25);

        if (! in_array($type, ['all', 'users', 'inquiries', 'applicants'], true)) {
            return response()->json(['message' => 'Unknown archive type.'], 422);
        }

        $payload = [];

        if (in_array($type, ['all', 'users'], true)) {
            $users = User::query()->archived()
                ->with(['role:id,name,label', 'archivedBy:id,full_name'])
                ->latest('archived_at')
                ->limit($limit)
                ->get()
                ->map(fn (User $user) => [
                    'id' => $user->id,
                    'label' => $user->full_name,
                    'detail' => $user->email,
                    'badge' => $user->role?->label,
                    'archived_at' => $user->archived_at?->toIso8601String(),
                    'archived_by' => $user->archivedBy?->full_name,
                ]);

            $payload['users'] = [
                'count' => User::query()->archived()->count(),
                'items' => $users,
            ];
        }

        if (in_array($type, ['all', 'inquiries'], true)) {
            $inquiries = FranchiseInquiry::query()->archived()
                ->with(['preferredBrand:id,name', 'archivedBy:id,full_name', 'currentArchiveLog', 'applicant'])
                ->latest('archived_at')
                ->limit($limit)
                ->get()
                ->map(fn (FranchiseInquiry $inquiry) => [
                    'id' => $inquiry->id,
                    'label' => $inquiry->lead_name,
                    'archive_id' => $inquiry->currentArchiveLog?->archive_id,
                    'has_applicant' => $inquiry->applicant !== null,
                    'original_display_no' => $inquiry->currentArchiveLog?->original_display_no,
                    'detail' => implode(' · ', array_filter([
                        $inquiry->currentArchiveLog ? 'Archive ID '.$inquiry->currentArchiveLog->archive_id : null,
                        $inquiry->currentArchiveLog?->original_display_no ? 'Original #'.$inquiry->currentArchiveLog->original_display_no : null,
                        $inquiry->email,
                        $inquiry->preferredBrand?->name,
                        $inquiry->status->value,
                    ])),
                    'badge' => $inquiry->source,
                    'archived_at' => $inquiry->archived_at?->toIso8601String(),
                    'archived_by' => $inquiry->archivedBy?->full_name,
                ]);

            $payload['inquiries'] = [
                'count' => FranchiseInquiry::query()->archived()->count(),
                'items' => $inquiries,
            ];
        }

        if (in_array($type, ['all', 'applicants'], true)) {
            $applicants = Applicant::query()->archived()
                ->with(['preferredBrand:id,name', 'archivedBy:id,full_name'])
                ->latest('archived_at')
                ->limit($limit)
                ->get()
                ->map(fn (Applicant $applicant) => [
                    'id' => $applicant->id,
                    'label' => $applicant->full_name,
                    'detail' => implode(' · ', array_filter([
                        $applicant->email,
                        $applicant->preferredBrand?->name,
                        $applicant->status->value,
                    ])),
                    'badge' => 'Applicant',
                    'archived_at' => $applicant->archived_at?->toIso8601String(),
                    'archived_by' => $applicant->archivedBy?->full_name,
                ]);

            $payload['applicants'] = [
                'count' => Applicant::query()->archived()->count(),
                'items' => $applicants,
            ];
        }

        $payload['totals'] = [
            'users' => User::query()->archived()->count(),
            'inquiries' => FranchiseInquiry::query()->archived()->count(),
            'applicants' => Applicant::query()->archived()->count(),
            'all' => User::query()->archived()->count()
                + FranchiseInquiry::query()->archived()->count()
                + Applicant::query()->archived()->count(),
        ];

        return $this->success($payload);
    }

    public function restore(Request $request, string $type, int $id, AuditService $audit): JsonResponse
    {
        $model = match ($type) {
            'users' => User::class,
            'inquiries' => FranchiseInquiry::class,
            'applicants' => Applicant::class,
            default => null,
        };

        if ($model === null) {
            return response()->json(['message' => 'Unknown archive type.'], 422);
        }

        $record = $model::query()->archived()->findOrFail($id);
        $old = ['archived_at' => $record->archived_at, 'archived_by_user_id' => $record->archived_by_user_id];

        if ($record instanceof FranchiseInquiry) {
            // Also closes the inquiry's open archive history row.
            $record->restoreBy($request->user()->id);
        } else {
            $record->update(['archived_at' => null, 'archived_by_user_id' => null]);
        }

        $audit->record("{$type}.restored", $record, $old, [], $request);

        return $this->success($record, 'Record restored.');
    }

    /**
     * Permanently delete ONE archived inquiry (admin only, route-protected).
     * Requires a written reason. The row is really removed from `franchise_inquiries`
     * (the model has no soft deletes) together with its archive history. Only a minimal
     * trace (id, name, Archive ID, reason, who, when) stays in the audit log.
     */
    public function purgeInquiry(Request $request, int $id, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ]);

        // Active inquiries are never found here, so they cannot be removed by this endpoint.
        $inquiry = FranchiseInquiry::query()
            ->archived()
            ->with(['applicant', 'currentArchiveLog'])
            ->findOrFail($id);

        if ($inquiry->applicant) {
            throw ValidationException::withMessages([
                'inquiry' => ['This inquiry was converted to an applicant. Restore it and use "Undo convert" first, then archive it again.'],
            ]);
        }

        $trace = [
            'id' => $inquiry->id,
            'lead_name' => $inquiry->lead_name,
            'archive_id' => $inquiry->currentArchiveLog?->archive_id,
        ];

        DB::transaction(function () use ($inquiry): void {
            InquiryArchiveLog::query()->where('franchise_inquiry_id', $inquiry->id)->delete();
            $inquiry->delete();
        });

        $audit->record('inquiry.purged', $inquiry, $trace, ['reason' => $validated['reason']], $request);

        return $this->success(['deleted' => 1], 'Inquiry permanently deleted.');
    }
}
