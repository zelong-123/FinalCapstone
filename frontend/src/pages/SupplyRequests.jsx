import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaTruckFast, FaRotateLeft, FaXmark } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, formatNumber, localDateInputValue, titleCase } from '../lib/format';
import { EmptyState, Field, LoadingState, Modal, Notice, PageHeader, Pagination } from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';
import './SupplyRequests.css';

/* ------------------------------------------------------------------ */
/* Workflow configuration                                              */
/* ------------------------------------------------------------------ */

// Allowed forward / terminal transitions (must match your backend rules)
const transitionMap = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'rejected', 'cancelled'],
  under_review: ['endorsed', 'rejected'],
  endorsed: ['preparing', 'rejected'],
  preparing: ['dispatched'],
  dispatched: ['delivered'],
  delivered: ['completed'],
};

// Ordered main flow. "completed" is the final state (all dots filled).
const workflowStage = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'endorsed', label: 'Endorsed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

// The tracker shows 6 dots; "completed" fills all of them.
const TRACK = workflowStage.slice(0, 6);

// The button label describes the ACTION that moves the request INTO that status.
const actionLabel = {
  submitted: 'Submit',
  under_review: 'Start review',
  endorsed: 'Endorse',
  preparing: 'Start preparing',
  dispatched: 'Mark dispatched',
  delivered: 'Mark delivered',
  completed: 'Complete',
  rejected: 'Reject',
  cancelled: 'Cancel',
};

const DANGER_STATUSES = ['rejected', 'cancelled'];
const TERMINAL_STATUSES = ['completed', 'rejected', 'cancelled'];

// Who can move a request INTO which status
const roleAllowed = {
  admin: ['submitted', 'under_review', 'endorsed', 'preparing', 'dispatched', 'delivered', 'completed', 'rejected', 'cancelled'],
  sales: ['under_review', 'endorsed', 'rejected'],
  logistics: ['preparing', 'dispatched', 'delivered', 'completed'],
  franchisee: ['submitted', 'cancelled'],
};

// Who can step a request back one stage (Undo)
const undoRoles = ['admin', 'logistics'];

const newItem = () => ({ product_id: '', quantity_requested: 1 });

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const DAY_MS = 86400000;

function stageIndex(status) {
  return workflowStage.findIndex((item) => item.key === status);
}

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function overdueDays(request) {
  if (!request.target_delivery_date || TERMINAL_STATUSES.includes(request.status)) return 0;
  const diff = Math.floor((startOfDay(new Date()) - startOfDay(request.target_delivery_date)) / DAY_MS);
  return diff > 0 ? diff : 0;
}

function daysInStage(request) {
  const ref = request.status_changed_at || request.updated_at;
  if (!ref) return null;
  const diff = Math.floor((startOfDay(new Date()) - startOfDay(ref)) / DAY_MS);
  return diff > 0 ? diff : 0;
}

function totalQuantity(request) {
  return (request.items || []).reduce((sum, item) => sum + Number(item.quantity_requested || 0), 0);
}

function canStepBack(request) {
  const idx = stageIndex(request.status);
  return idx > 0 && request.status !== 'completed';
}

/* ------------------------------------------------------------------ */
/* KPI cards                                                           */
/* ------------------------------------------------------------------ */

function SupplyKpis({ stats }) {
  const done = Number(stats?.by_status?.completed || 0);
  const active = Number(stats?.active || 0);
  const total = Number(stats?.total || 0) || 1;
  const percent = Math.min(100, Math.round((done / total) * 100));

  const cards = [
    ['Active orders', stats?.active, 'Submitted through dispatched'],
    ['Overdue', stats?.overdue, 'Past the target delivery date'],
    ['Dispatch queue', (stats?.by_status?.endorsed || 0) + (stats?.by_status?.preparing || 0), 'Endorsed or being prepared'],
    ['Completed this month', stats?.completed_this_month, `Avg ${stats?.avg_fulfillment_days ?? 0} days to fulfill`],
  ];

  return (
    <section className="metric-grid supply-kpi-grid" aria-label="Supply request KPIs">
      {cards.map(([label, value, caption]) => (
        <article className="metric-card" key={label}>
          <div className="metric-top"><span>{label}</span></div>
          <strong>{formatNumber(value)}</strong>
          <small className="metric-caption">{caption}</small>
        </article>
      ))}
      <article className="metric-card metric-tone-success">
        <div className="metric-top"><span>Fulfillment progress</span></div>
        <strong>{percent}%</strong>
        <div className="sr-kpi-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="sr-kpi-bar-fill" style={{ width: `${percent}%` }} />
        </div>
        <small className="metric-caption">{formatNumber(done)} completed · {formatNumber(active)} in progress</small>
      </article>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Progress tracker (dots + label)                                     */
/* ------------------------------------------------------------------ */

function ProgressTracker({ status }) {
  const idx = stageIndex(status);
  const inFlow = idx !== -1;
  const isFinal = status === 'completed';
  const label = inFlow ? workflowStage[idx].label : titleCase(status);

  return (
    <div className="sr-progress">
      <ol className="sr-track" aria-label={`Progress: ${label}`}>
        {TRACK.map((step, i) => {
          let state = 'todo';
          if (inFlow) state = isFinal || i < idx ? 'done' : i === idx ? 'active' : 'todo';
          const lineDone = inFlow && (isFinal || i <= idx);
          return (
            <li className="sr-track-item" key={step.key} title={step.label}>
              {i > 0 && <span className={`sr-track-line${lineDone ? ' is-done' : ''}`} aria-hidden="true" />}
              <span className={`sr-dot is-${state}`} aria-current={state === 'active' ? 'step' : undefined} />
            </li>
          );
        })}
      </ol>
      <span className={`sr-progress-label${DANGER_STATUSES.includes(status) ? ' is-danger' : ''}${isFinal ? ' is-final' : ''}`}>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

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
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmTransition, setConfirmTransition] = useState(null); // only for Reject / Cancel

  const remote = useRemote(async () => {
    const [requests, stats, locations, products] = await Promise.all([
      api.get('/supply-requests', { page, per_page: 20, status }),
      api.get('/supply-requests/stats'),
      api.get('/locations'),
      api.get('/products', { per_page: 100 }),
    ]);
    return { requests: requests.data, meta: requests.meta, stats: stats.data, locations: locations.data, products: products.data };
  }, [page, status]);

  const canCreate = ['admin', 'franchisee'].includes(role);
  const productMap = useMemo(
    () => new Map((remote.data?.products || []).map((product) => [product.id, product])),
    [remote.data?.products],
  );

  // Live refresh every 5 seconds while the tab is visible
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void remote.reload({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [remote.reload]);

  /* ---------------- status chips ---------------- */
  const byStatus = remote.data?.stats?.by_status || {};
  const totalCount = Number(remote.data?.stats?.total ?? 0);
  const chipKeys = [...workflowStage.map((s) => s.key), 'draft', 'rejected', 'cancelled'].filter(
    (key) => Number(byStatus[key] || 0) > 0 || key === status,
  );

  /* ---------------- workflow actions ---------------- */
  const forwardOptions = (request) =>
    (transitionMap[request.status] || []).filter((next) => (roleAllowed[role] || []).includes(next));

  const primaryAction = (request) => forwardOptions(request).find((next) => !DANGER_STATUSES.includes(next));
  const dangerActions = (request) => forwardOptions(request).filter((next) => DANGER_STATUSES.includes(next));

  const runTransition = async (request, nextStatus) => {
    setBusyId(request.id);
    setActionError('');
    setSuccess('');
    try {
      await api.patch(`/supply-requests/${request.id}/status`, { status: nextStatus });
      setSuccess(`${request.request_number} moved to ${titleCase(nextStatus)}.`);
      setConfirmTransition(null);
      await remote.reload({ silent: true });
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  // Reject / Cancel ask for confirmation, everything else is a single click.
  const handleAction = (request, nextStatus) => {
    if (DANGER_STATUSES.includes(nextStatus)) {
      setActionError('');
      setConfirmTransition({ request, nextStatus });
      return;
    }
    void runTransition(request, nextStatus);
  };

  const handleUndo = (request) => {
    const prev = workflowStage[stageIndex(request.status) - 1];
    if (prev) void runTransition(request, prev.key);
  };

  /* ---------------- create request ---------------- */
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

  /* ---------------- render ---------------- */
  return (
    <div className="page-container">
      <PageHeader
        title="Supply requests"
        subtitle="Control every order from request and review through preparation, dispatch, delivery, and completion."
        actions={canCreate && (
          <button className="primary-button" onClick={() => { setActionError(''); setShowCreate(true); }}>
            <FaPlus /> New supply request
          </button>
        )}
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{!showCreate && !confirmTransition ? (actionError || remote.error) : remote.error}</Notice>

      {!remote.loading && remote.data?.stats && <SupplyKpis stats={remote.data.stats} />}

      {/* Status filter chips */}
      <div className="sr-chips" role="tablist" aria-label="Filter supply request status">
        <button
          type="button"
          role="tab"
          aria-selected={status === ''}
          className={`sr-chip${status === '' ? ' is-active' : ''}`}
          onClick={() => { setPage(1); setStatus(''); }}
        >
          All <span className="sr-chip-count">{formatNumber(totalCount)}</span>
        </button>
        {chipKeys.map((key) => (
          <button
            type="button"
            role="tab"
            aria-selected={status === key}
            key={key}
            className={`sr-chip${status === key ? ' is-active' : ''}`}
            onClick={() => { setPage(1); setStatus(key); }}
          >
            {titleCase(key)} <span className="sr-chip-count">{formatNumber(byStatus[key] || 0)}</span>
          </button>
        ))}
      </div>

      <section className="data-panel">
        {remote.loading ? <LoadingState /> : !remote.data?.requests.length ? (
          <EmptyState label="No supply requests match this filter." detail="Choose another status or create a new restock request." />
        ) : (
          <div className="table-wrap">
            <table className="sr-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Progress</th>
                  <th>Target</th>
                  <th className="sr-th-right">Next step</th>
                </tr>
              </thead>
              <tbody>
                {remote.data.requests.map((request) => {
                  const late = overdueDays(request);
                  const stageDays = daysInStage(request);
                  const next = primaryAction(request);
                  const dangers = dangerActions(request);
                  const busy = busyId === request.id;
                  const showUndo = undoRoles.includes(role) && canStepBack(request);
                  const itemNames = (request.items || [])
                    .map((item) => `${item.product?.name || productMap.get(item.product_id)?.name || 'Item'} × ${formatNumber(item.quantity_requested)}`)
                    .join(', ');

                  return (
                    <tr key={request.id} className={busy ? 'is-busy' : ''}>
                      <td>
                        <strong className="sr-req-number">{request.request_number}</strong>
                        <span className="sr-req-meta" title={itemNames || undefined}>
                          {request.location?.name || '—'} · {formatNumber(totalQuantity(request))} items
                        </span>
                      </td>

                      <td><ProgressTracker status={request.status} /></td>

                      <td>
                        <strong className="sr-target-date">{formatDate(request.target_delivery_date)}</strong>
                        {late > 0 ? (
                          <span className="sr-target-sub is-late">Overdue {late}d</span>
                        ) : request.status === 'completed' ? (
                          <span className="sr-target-sub">Completed</span>
                        ) : stageDays === null ? null : (
                          <span className="sr-target-sub">{stageDays === 0 ? 'Just updated' : `${stageDays}d in stage`}</span>
                        )}
                      </td>

                      <td>
                        <div className="sr-actions">
                          {showUndo && (
                            <button
                              type="button"
                              className="sr-btn sr-btn-ghost sr-btn-icon"
                              onClick={() => handleUndo(request)}
                              disabled={busy}
                              title={`Undo: back to ${workflowStage[stageIndex(request.status) - 1].label}`}
                              aria-label={`Undo ${request.request_number} back to ${workflowStage[stageIndex(request.status) - 1].label}`}
                            >
                              <FaRotateLeft aria-hidden="true" />
                            </button>
                          )}
                          {dangers.map((danger) => (
                            <button
                              key={danger}
                              type="button"
                              className="sr-btn sr-btn-secondary"
                              onClick={() => handleAction(request, danger)}
                              disabled={busy}
                            >
                              <FaXmark aria-hidden="true" /> {actionLabel[danger]}
                            </button>
                          ))}
                          {next && (
                            <button
                              type="button"
                              className="sr-btn sr-btn-primary"
                              onClick={() => handleAction(request, next)}
                              disabled={busy}
                            >
                              {busy ? 'Updating…' : actionLabel[next]}
                            </button>
                          )}
                          {!next && !dangers.length && !showUndo && <span className="sr-no-action">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={remote.data?.meta} onPage={setPage} />
      </section>

      {showCreate && (
        <Modal
          title="Create supply request"
          onClose={() => setShowCreate(false)}
          size="wide"
          footer={<><button onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" form="supply-form" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button></>}
        >
          <Notice type="error">{actionError}</Notice>
          <form id="supply-form" className="form-grid" onSubmit={createRequest}>
            <Field label="Destination location" required>
              <select
                required
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  const loc = remote.data?.locations.find((row) => String(row.id) === e.target.value);
                  setAddress(loc?.address || '');
                }}
              >
                <option value="">Select location</option>
                {remote.data?.locations.filter((location) => location.type === 'franchise').map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Target delivery date">
              <input type="date" min={localDateInputValue()} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </Field>
            <Field label="Delivery address" full required>
              <input required value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="Items" full required hint="Each product may appear once. Quantities must be whole numbers of at least 1.">
              <div className="item-editor">
                {items.map((item, index) => (
                  <div className="item-row" key={`${index}-${item.product_id}`}>
                    <select
                      required
                      value={item.product_id}
                      onChange={(e) => setItems(items.map((row, i) => (i === index ? { ...row, product_id: e.target.value } : row)))}
                    >
                      <option value="">Select product</option>
                      {remote.data?.products.map((product) => (
                        <option
                          key={product.id}
                          value={product.id}
                          disabled={items.some((row, i) => i !== index && row.product_id === String(product.id))}
                        >
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      aria-label="Requested quantity"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={item.quantity_requested}
                      onChange={(e) => setItems(items.map((row, i) => (i === index ? { ...row, quantity_requested: e.target.value } : row)))}
                    />
                    <button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => setItems([...items, newItem()])}>Add another item</button>
              </div>
            </Field>
            <Field label="Remarks" full>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Delivery instructions, priority, or operational context" />
            </Field>
          </form>
        </Modal>
      )}

      {confirmTransition && (
        <Modal
          title={`${actionLabel[confirmTransition.nextStatus]} request`}
          onClose={() => setConfirmTransition(null)}
          size="small"
          footer={
            <>
              <button onClick={() => setConfirmTransition(null)}>Keep request</button>
              <button
                className="primary-button"
                onClick={() => runTransition(confirmTransition.request, confirmTransition.nextStatus)}
                disabled={busyId === confirmTransition.request.id}
              >
                {busyId === confirmTransition.request.id ? 'Updating…' : `Yes, ${actionLabel[confirmTransition.nextStatus].toLowerCase()}`}
              </button>
            </>
          }
        >
          <Notice type="error">{actionError}</Notice>
          <div className="confirmation-copy">
            <span className="confirmation-icon confirmation-accent"><FaTruckFast /></span>
            <div>
              <strong>{confirmTransition.request.request_number}</strong>
              <p>
                This will move the request from {titleCase(confirmTransition.request.status)} to {titleCase(confirmTransition.nextStatus)} and
                update the workflow for all connected teams.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
