<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Brand;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BrandController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $brands = Brand::query()
            ->when(! $request->boolean('include_inactive'), fn ($q) => $q->where('is_active', true))
            ->withCount(['products', 'locations'])
            ->orderBy('name')
            ->get();

        return $this->success($brands);
    }

    public function store(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150', 'unique:brands,name'],
            'code' => ['required', 'string', 'max:30', 'alpha_dash', 'unique:brands,code'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $brand = Brand::create($validated);
        $audit->record('brand.created', $brand, newValues: $brand->toArray(), request: $request);

        return $this->success($brand, 'Brand created.', 201);
    }

    public function update(Request $request, Brand $brand, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:150', Rule::unique('brands', 'name')->ignore($brand)],
            'code' => ['sometimes', 'required', 'string', 'max:30', 'alpha_dash', Rule::unique('brands', 'code')->ignore($brand)],
            'description' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $old = $brand->toArray();
        $brand->update($validated);
        $audit->record('brand.updated', $brand, $old, $brand->fresh()->toArray(), $request);

        return $this->success($brand->fresh(), 'Brand updated.');
    }

    public function destroy(Request $request, Brand $brand, AuditService $audit): JsonResponse
    {
        $old = $brand->toArray();
        $brand->update(['is_active' => false]);
        $audit->record('brand.deactivated', $brand, $old, $brand->fresh()->toArray(), $request);

        return $this->success(message: 'Brand deactivated.');
    }
}
