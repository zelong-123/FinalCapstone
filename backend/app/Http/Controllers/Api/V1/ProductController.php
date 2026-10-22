<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Product;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $query = Product::query()->with('brand')->orderBy('name');
        if ($request->filled('brand_id')) {
            $query->where('brand_id', $request->integer('brand_id'));
        }
        if (! $request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }
        if ($request->filled('search')) {
            $term = '%'.$request->string('search').'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('sku', 'like', $term));
        }

        return $this->paginated($query->paginate($this->perPage($request, 50)));
    }

    public function store(Request $request, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'brand_id' => ['nullable', 'exists:brands,id'],
            'sku' => ['required', 'string', 'max:80', 'unique:products,sku'],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:100'],
            'unit' => ['required', 'string', 'max:30'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $product = Product::create($validated);
        $audit->record('product.created', $product, newValues: $product->toArray(), request: $request);

        return $this->success($product->load('brand'), 'Product created.', 201);
    }

    public function update(Request $request, Product $product, AuditService $audit): JsonResponse
    {
        $validated = $request->validate([
            'brand_id' => ['nullable', 'exists:brands,id'],
            'sku' => ['sometimes', 'required', 'string', 'max:80', Rule::unique('products', 'sku')->ignore($product)],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:100'],
            'unit' => ['sometimes', 'required', 'string', 'max:30'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $old = $product->toArray();
        $product->update($validated);
        $audit->record('product.updated', $product, $old, $product->fresh()->toArray(), $request);

        return $this->success($product->fresh('brand'), 'Product updated.');
    }

    public function destroy(Request $request, Product $product, AuditService $audit): JsonResponse
    {
        $old = $product->toArray();
        $product->update(['is_active' => false]);
        $audit->record('product.deactivated', $product, $old, $product->fresh()->toArray(), $request);

        return $this->success(message: 'Product deactivated.');
    }
}
