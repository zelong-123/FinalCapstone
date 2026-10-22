import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaTruckFast } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, formatNumber, localDateInputValue, titleCase } from '../lib/format';
import { EmptyState, Field, LoadingState, Modal, Notice, PageHeader, Pagination, StatusBadge } from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';

const transitionMap = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'rejected', 'cancelled'],
  under_review: ['endorsed', 'rejected'],
  endorsed: ['preparing', 'rejected'],
  preparing: ['dispatched'],
  dispatched: ['delivered'],
  delivered: ['completed'],
};
const roleAllowed = {
  admin: ['submitted', 'cancelled', 'under_review', 'endorsed', 'rejected'],
  sales: ['under_review', 'endorsed', 'rejected'],
  logistics: ['preparing', 'dispatched', 'delivered', 'completed'],
  franchisee: ['submitted', 'cancelled'],
};
const newItem = () => ({ product_id: '', quantity_requested: 1 });

export default function SupplyRequests() {
  const { role } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState([newItem()]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedTransition, setSelectedTransition] = useState(null);

  const remote = useRemote(async () => {
    const [requests, locations, products] = await Promise.all([
      api.get('/supply-requests', { page, per_page: 20, status }),
      api.get('/locations'),
      api.get('/products', { per_page: 100 }),
    ]);
    return { requests: requests.data, meta: requests.meta, locations: locations.data, products: products.data };
  }, [page, status]);

  const canCreate = ['admin', 'franchisee'].includes(role);
  const productMap = useMemo(() => new Map((remote.data?.products || []).map((product) => [product.id, product])), [remote.data?.products]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void remote.reload({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [remote.reload]);

  const transition = async () => {
    if (!selectedTransition) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.patch(`/supply-requests/${selectedTransition.request.id}/status`, { status: selectedTransition.nextStatus });
      setSuccess(`Request ${selectedTransition.request.request_number} moved to ${titleCase(selectedTransition.nextStatus)}.`);
      setSelectedTransition(null);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const createRequest = async (event) => {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    setSuccess('');
    const productIds = items.map((item) => item.product_id);
    const invalidQuantity = items.find((item) => !Number.isInteger(Number(item.quantity_requested)) || Number(item.quantity_requested) < 1);
    if (invalidQuantity) {
      setActionError('Every requested quantity must be a whole number of at least 1.');
      setSaving(false);
      return;
    }
    if (new Set(productIds).size !== productIds.length) {
      setActionError('Each product can appear only once in a supply request. Combine duplicate quantities before submitting.');
      setSaving(false);
      return;
    }
    try {
      await api.post('/supply-requests', {
        location_id: Number(locationId),
        submit: true,
        target_delivery_date: deliveryDate || null,
        delivery_address: address.trim(),
        remarks: remarks.trim() || null,
        items: items.map((item) => ({ product_id: Number(item.product_id), quantity_requested: Number(item.quantity_requested) })),
      });
      setShowCreate(false);
      setLocationId('');
      setAddress('');
      setDeliveryDate('');
      setRemarks('');
      setItems([newItem()]);
      setSuccess('Supply request submitted successfully.');
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const nextOptions = (request) => (transitionMap[request.status] || []).filter((next) => (roleAllowed[role] || []).includes(next));
  const statuses = [...new Set([...Object.keys(transitionMap), 'completed', 'cancelled', 'rejected'])];

  return (
    <div className="page-container">
      <PageHeader
        title="Supply requests"
        subtitle="Control every order from request and review through preparation, dispatch, delivery, and completion."
        actions={canCreate && <button className="primary-button" onClick={() => { setActionError(''); setShowCreate(true); }}><FaPlus /> New supply request</button>}
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError || remote.error}</Notice>
      <div className="toolbar"><select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} aria-label="Filter supply request status"><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></div>
      <section className="data-panel">
        {remote.loading ? <LoadingState /> : !remote.data?.requests.length ? (
          <EmptyState label="No supply requests match this filter." detail="Choose another status or create a new restock request." />
        ) : (
          <div className="table-wrap"><table><thead><tr><th>Request</th><th>Location</th><th>Items</th><th>Target</th><th>Status</th><th>Next step</th></tr></thead><tbody>
            {remote.data.requests.map((request) => (
              <tr key={request.id}>
                <td><strong>{request.request_number}</strong><small>{request.requested_by?.full_name || 'Unknown requester'}</small></td>
                <td>{request.location?.name || '—'}</td>
                <td>{request.items?.map((item) => `${item.product?.name || productMap.get(item.product_id)?.name || 'Item'} × ${formatNumber(item.quantity_requested)}`).join(', ') || '—'}</td>
                <td>{formatDate(request.target_delivery_date)}</td>
                <td><StatusBadge value={request.status} /></td>
                <td>{nextOptions(request).length ? (
                  <select className="inline-select" value="" onChange={(e) => { if (e.target.value) setSelectedTransition({ request, nextStatus: e.target.value }); }}>
                    <option value="">Choose action</option>
                    {nextOptions(request).map((next) => <option key={next} value={next}>{titleCase(next)}</option>)}
                  </select>
                ) : '—'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <Pagination meta={remote.data?.meta} onPage={setPage} />
      </section>

      {showCreate && (
        <Modal title="Create supply request" onClose={() => setShowCreate(false)} size="wide" footer={<><button onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" form="supply-form" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button></>}>
          <Notice type="error">{actionError}</Notice>
          <form id="supply-form" className="form-grid" onSubmit={createRequest}>
            <Field label="Destination location" required><select required value={locationId} onChange={(e) => { setLocationId(e.target.value); const loc = remote.data?.locations.find((row) => String(row.id) === e.target.value); setAddress(loc?.address || ''); }}><option value="">Select location</option>{remote.data?.locations.filter((location) => location.type === 'franchise').map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
            <Field label="Target delivery date"><input type="date" min={localDateInputValue()} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
            <Field label="Delivery address" full required><input required value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
            <Field label="Items" full required hint="Each product may appear once. Quantities must be whole numbers of at least 1.">
              <div className="item-editor">
                {items.map((item, index) => (
                  <div className="item-row" key={`${index}-${item.product_id}`}>
                    <select required value={item.product_id} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, product_id: e.target.value } : row))}><option value="">Select product</option>{remote.data?.products.map((product) => <option key={product.id} value={product.id} disabled={items.some((row, i) => i !== index && row.product_id === String(product.id))}>{product.name}</option>)}</select>
                    <input required aria-label="Requested quantity" type="number" inputMode="numeric" min="1" step="1" value={item.quantity_requested} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, quantity_requested: e.target.value } : row))} />
                    <button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => setItems([...items, newItem()])}>Add another item</button>
              </div>
            </Field>
            <Field label="Remarks" full><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Delivery instructions, priority, or operational context" /></Field>
          </form>
        </Modal>
      )}

      {selectedTransition && (
        <Modal title="Confirm workflow update" onClose={() => setSelectedTransition(null)} size="small" footer={<><button onClick={() => setSelectedTransition(null)}>Cancel</button><button className="primary-button" onClick={transition} disabled={saving}>{saving ? 'Updating…' : `Move to ${titleCase(selectedTransition.nextStatus)}`}</button></>}>
          <Notice type="error">{actionError}</Notice>
          <div className="confirmation-copy">
            <span className="confirmation-icon confirmation-accent"><FaTruckFast /></span>
            <div><strong>{selectedTransition.request.request_number}</strong><p>This will move the request from {titleCase(selectedTransition.request.status)} to {titleCase(selectedTransition.nextStatus)} and update the workflow for all connected teams.</p></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
