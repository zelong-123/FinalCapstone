import React, { useEffect, useState } from 'react';
import { FaPlus } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatNumber, titleCase } from '../lib/format';
import { EmptyState, Field, LoadingState, Modal, Notice, PageHeader, Pagination, StatusBadge } from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';

export default function Inventory() {
  const { role } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [mode, setMode] = useState('delta');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [brands, setBrands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [productForm, setProductForm] = useState({ brand_id: '', name: '', sku: '', unit: '', category: '', current_stock: 0, reorder_level: 10, critical_level: 5 });
  const [creatingProduct, setCreatingProduct] = useState(false);
  const warehouseOnly = ['admin', 'logistics'].includes(role);
  const remote = useRemote(async () => api.get('/inventories', { page, per_page: 50, stock_status: status, location_type: warehouseOnly ? 'warehouse' : undefined }), [page, status, warehouseOnly]);
  const canAdjust = ['admin', 'logistics', 'franchisee'].includes(role);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void remote.reload({ silent: true });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [remote.reload]);

  const openAddProduct = async () => {
    setActionError('');
    setShowAddProduct(true);
    try {
      const [brandList, locationList] = await Promise.all([api.get('/brands'), api.get('/locations')]);
      setBrands(brandList.data || []);
      setLocations((locationList.data || []).filter((location) => location.type === 'warehouse' && location.is_active !== false));
    } catch {
      // Lists stay empty; the form still renders with a manual sync hint.
    }
  };

  const createProduct = async (event) => {
    event.preventDefault();
    setCreatingProduct(true);
    setActionError('');
    setSuccess('');
    const warehouse = locations[0];
    if (!warehouse) {
      setActionError('No active warehouse location was found. Configure the warehouse location first.');
      setCreatingProduct(false);
      return;
    }
    try {
      const product = await api.post('/products', {
        brand_id: productForm.brand_id ? Number(productForm.brand_id) : null,
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || `${String(productForm.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        unit: productForm.unit.trim() || 'units',
        category: productForm.category.trim() || null,
        is_active: true,
      });
      await api.post('/inventories', {
        location_id: warehouse.id,
        product_id: product.data.id,
        current_stock: Math.max(0, Number(productForm.current_stock) || 0),
        reorder_level: Math.max(0, Number(productForm.reorder_level) || 0),
        critical_level: Math.max(0, Number(productForm.critical_level) || 0),
      });
      setShowAddProduct(false);
      setProductForm({ brand_id: '', name: '', sku: '', unit: '', category: '', current_stock: 0, reorder_level: 10, critical_level: 5 });
      setSuccess(`“${product.data.name}” was added to warehouse inventory.`);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setCreatingProduct(false);
    }
  };

  const adjust = async (event) => {
    event.preventDefault();
    const numericQuantity = Number(quantity);
    if (!Number.isInteger(numericQuantity) || (mode === 'set' && numericQuantity < 0) || (mode === 'delta' && numericQuantity === 0)) {
      setActionError(mode === 'set' ? 'Enter a whole-number stock balance of zero or more.' : 'Enter a non-zero whole number to add or subtract.');
      return;
    }
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.post(`/inventories/${selected.id}/adjust`, { mode, quantity: numericQuantity, remarks: remarks.trim() || null });
      setSelected(null);
      setQuantity('');
      setRemarks('');
      setSuccess('Inventory balance updated successfully.');
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title={warehouseOnly ? "Warehouse inventory" : "My inventory"}
        subtitle={warehouseOnly ? "Central warehouse stock is managed here. Branch stock and deductions are organized in the separate Branches panel." : "Monitor your branch stock levels with threshold-driven risk visibility."}
        actions={(
          <>
            <span className="live-sync-label">Live sync · 3 seconds</span>
            {warehouseOnly && (
              <button className="primary-button" onClick={openAddProduct}><FaPlus aria-hidden="true" /> Add product type</button>
            )}
          </>
        )}
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError || remote.error}</Notice>
      <div className="toolbar"><select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Filter stock level"><option value="">All stock levels</option>{['normal', 'low', 'critical'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div>
      <section className="data-panel">
        {remote.loading ? <LoadingState /> : !remote.data?.data.length ? (
          <EmptyState label="No inventory records match this filter." detail="Choose another stock level or verify inventory has been initialized." />
        ) : (
          <div className="table-wrap"><table><thead><tr><th>Product</th><th>Location</th><th>Stock</th><th>Reorder</th><th>Critical</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {remote.data.data.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.product?.name || '—'}</strong><small>{item.product?.sku || item.product?.brand?.name || ''}</small></td>
                <td>{item.location?.name || '—'}<small>{titleCase(item.location?.type || '')}</small></td>
                <td><strong>{formatNumber(item.current_stock)} {item.product?.unit || ''}</strong></td>
                <td>{formatNumber(item.reorder_level)}</td>
                <td>{formatNumber(item.critical_level)}</td>
                <td><StatusBadge value={item.stock_status} /></td>
                <td>{canAdjust ? <button onClick={() => { setActionError(''); setSelected(item); setQuantity(''); setMode('delta'); }}>Adjust</button> : '—'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <Pagination meta={remote.data?.meta} onPage={setPage} />
      </section>

      {showAddProduct && (
        <Modal title="Add a new product type" onClose={() => setShowAddProduct(false)} footer={<><button onClick={() => setShowAddProduct(false)}>Cancel</button><button className="primary-button" form="new-product-form" disabled={creatingProduct}>{creatingProduct ? 'Adding…' : 'Add to warehouse'}</button></>}>
          <Notice type="error">{actionError}</Notice>
          <p className="muted-note" style={{ marginTop: 0 }}>
            The product type is created, then registered into the warehouse so it can be requested,
            dispatched, and deducted automatically with every supply order.
          </p>
          <form id="new-product-form" className="form-grid" onSubmit={createProduct}>
            <Field label="Brand">
              <select value={productForm.brand_id} onChange={(e) => setProductForm({ ...productForm, brand_id: e.target.value })}>
                <option value="">No specific brand</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </Field>
            <Field label="Unit" hint="Piece of measure, e.g. pcs, packs, boxes">
              <input value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} placeholder="pcs" />
            </Field>
            <Field label="Product name" required full>
              <input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="e.g. Cup 12oz" />
            </Field>
            <Field label="SKU" hint="Left blank, a unique code is generated.">
              <input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} placeholder="CUP-12OZ" />
            </Field>
            <Field label="Category">
              <input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} placeholder="Packaging, syrup, equipment…" />
            </Field>
            <Field label="Opening stock" hint="Whole number of units already on hand.">
              <input type="number" min="0" step="1" value={productForm.current_stock} onChange={(e) => setProductForm({ ...productForm, current_stock: e.target.value })} />
            </Field>
            <Field label="Reorder level">
              <input type="number" min="0" step="1" value={productForm.reorder_level} onChange={(e) => setProductForm({ ...productForm, reorder_level: e.target.value })} />
            </Field>
            <Field label="Critical level">
              <input type="number" min="0" step="1" value={productForm.critical_level} onChange={(e) => setProductForm({ ...productForm, critical_level: e.target.value })} />
            </Field>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={`Adjust ${selected.product?.name || 'inventory'}`} onClose={() => setSelected(null)} size="small" footer={<><button onClick={() => setSelected(null)}>Cancel</button><button className="primary-button" form="adjust-form" disabled={saving}>{saving ? 'Saving…' : 'Apply adjustment'}</button></>}>
          <Notice type="error">{actionError}</Notice>
          <div className="record-context"><span>Current balance</span><strong>{formatNumber(selected.current_stock)} {selected.product?.unit || ''}</strong><small>{selected.location?.name || 'Unknown location'}</small></div>
          <form id="adjust-form" className="form-grid" onSubmit={adjust}>
            <Field label="Adjustment mode" required><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="delta">Add or subtract</option><option value="set">Set exact balance</option></select></Field>
            <Field label={mode === 'delta' ? 'Quantity change' : 'New balance'} required hint={mode === 'delta' ? 'Use −1 to deduct one unit or +1 to add one unit. Whole numbers only.' : 'Enter the exact whole-number balance.'}>
              <div className="inventory-quantity-stepper">
                {mode === 'delta' && <button type="button" onClick={() => setQuantity(String((Number(quantity) || 0) - 1))} aria-label="Subtract one unit">−1</button>}
                <input required type="number" inputMode="numeric" min={mode === 'set' ? '0' : undefined} step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                <button type="button" onClick={() => setQuantity(String(Math.max(mode === 'set' ? 0 : -999999999, (Number(quantity) || 0) + 1)))} aria-label="Add one unit">+1</button>
              </div>
            </Field>
            <Field label="Remarks" full><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason, reference, or reconciliation note" /></Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
