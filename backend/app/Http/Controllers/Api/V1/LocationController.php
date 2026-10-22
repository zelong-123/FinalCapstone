<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\LocationType;
use App\Enums\RoleName;
use App\Models\FranchiseLocation;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LocationController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = FranchiseLocation::query()->with(['brand', 'franchisee.user:id,full_name,email'])->orderBy('name');
        if ($request->filled('type')) {
            $query->where('type', $request->string('type'));
        }
        if ($request->filled('brand_id')) {
            $query->where('brand_id', $request->integer('brand_id'));
        }
        if (! $request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }
        if ($request->user()->role->name === RoleName::Franchisee) {
            $query->whereHas('franchisee', fn ($q) => $q->where('user_id', $request->user()->id));
        }

        return $this->success($query->get());
    }

    public function store(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'franchisee_id' => ['nullable', 'exists:franchisees,id'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'name' => ['required', 'string', 'max:255'],
            'branch_code' => ['nullable', 'string', 'max:50', 'alpha_dash', 'unique:franchise_locations,branch_code'],
            'type' => ['required', Rule::enum(LocationType::class)],
            'address' => ['required', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'province' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:100'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $this->validateLocationOwnership(LocationType::from($validated['type']), $validated['franchisee_id'] ?? null, $validated['brand_id'] ?? null);
        $location = FranchiseLocation::create($validated);
        $audit->record('location.created', $location, newValues: $location->toArray(), request: $request);

        return $this->success($location->load(['brand', 'franchisee']), 'Location created.', 201);
    }

    public function update(Request $request, FranchiseLocation $location, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'franchisee_id' => ['nullable', 'exists:franchisees,id'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'branch_code' => ['nullable', 'string', 'max:50', 'alpha_dash', Rule::unique('franchise_locations', 'branch_code')->ignore($location->id)],
            'type' => ['sometimes', Rule::enum(LocationType::class)],
            'address' => ['sometimes', 'required', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'province' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:100'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $type = isset($validated['type']) ? LocationType::from($validated['type']) : $location->type;
        $franchiseeId = array_key_exists('franchisee_id', $validated) ? $validated['franchisee_id'] : $location->franchisee_id;
        $brandId = array_key_exists('brand_id', $validated) ? $validated['brand_id'] : $location->brand_id;
        $this->validateLocationOwnership($type, $franchiseeId, $brandId);

        $old = $location->toArray();
        $location->update($validated);
        $audit->record('location.updated', $location, $old, $location->fresh()->toArray(), $request);

        return $this->success($location->fresh(['brand', 'franchisee']), 'Location updated.');
    }
    private function validateLocationOwnership(LocationType $type, ?int $franchiseeId, ?int $brandId): void
    {
        if ($type === LocationType::Franchise && (! $franchiseeId || ! $brandId)) {
            throw ValidationException::withMessages([
                'franchisee_id' => ['A franchise location requires both a franchisee and a brand.'],
            ]);
        }

        if ($type === LocationType::Warehouse && $franchiseeId) {
            throw ValidationException::withMessages([
                'franchisee_id' => ['A warehouse cannot be assigned to a franchisee.'],
            ]);
        }
    }

}
