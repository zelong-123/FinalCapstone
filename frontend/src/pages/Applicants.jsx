import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck, FaClipboardCheck, FaClock, FaPen, FaStore, FaTrashCan, FaUserCheck, FaUserPlus } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate, titleCase } from '../lib/format';
import {
  EmptyState,
  Field,
  LoadingState,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  StatusBadge,
} from '../components/ApiUi';
import { useAuth } from '../context/AuthContext';
import './Applicants.css';

const statuses = [
  'inquiry', 'qualified', 'scheduled', 'loi_submitted',
  'payment_submitted', 'for_approval', 'approved', 'rejected', 'active_franchisee',
];

// Order matters: it drives the stage stepper.
const pipelineStages = statuses.filter((item) => item !== 'rejected');

const blank = {
  full_name: '', email: '', phone: '', address: '', preferred_brand_id: '', notes: '',
};

const TABS = [
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'franchisees', label: 'Active franchisees' },
  { key: 'archived', label: 'Archived' },
];

// Show the compact progress preview for every applicant status.
const HOVER_STATUSES = statuses;

// The backend decides the milestone keys, so milestones are split into two groups by name.
// Anything matching this pattern goes to "Schedule activity"; everything else to "Legalities & documents".
const SCHEDULE_PATTERN = /orientation|tasting|training|onboard|schedule/i;
const isScheduleItem = (milestone) => SCHEDULE_PATTERN.test(`${milestone.key} ${milestone.label}`);

// Value for <input type="datetime-local">: "YYYY-MM-DDTHH:mm" in the viewer's local time.
const toLocalInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const nowLocal = () => toLocalInput(new Date());

const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

/* ---------------- Stepper ----------------
 * items: [{ key, label, state: 'done' | 'current' | 'todo', onClick?, disabled? }]
 *
 * Each step draws the connector that leads to the NEXT step (see .ap-step::after in the CSS).
 * That connector is green only when this step is completed AND progress has reached the next
 * step (the next step is completed or is the current one). Connectors after the current step,
 * or leading into steps that are still ahead, stay grey.
 */
function Stepper({ items }) {
  return (
    <ol className="ap-stepper">
      {items.map((item, index) => {
        const Inner = item.onClick ? 'button' : 'div';
        const innerProps = item.onClick ? { type: 'button', onClick: item.onClick, disabled: item.disabled } : {};
        const next = items[index + 1];
        const lineDone = item.state === 'done' && Boolean(next) && next.state !== 'todo';
        return (
          <li
            key={item.key}
            className={`ap-step is-${item.state}${lineDone ? ' line-done' : ''}`}
          >
            <Inner className="ap-step-inner" {...innerProps}>
              <span className="ap-node">
                {item.state === 'done' ? <FaCheck aria-hidden="true" /> : item.state === 'current' ? <FaClock aria-hidden="true" /> : index + 1}
              </span>
              <span className="ap-step-label">{item.label}</span>
            </Inner>
          </li>
        );
      })}
    </ol>
  );
}

const milestoneSteps = (items, milestones) => {
  const firstOpen = items.findIndex((m) => !milestones[m.key]);
  return items.map((m, index) => ({
    key: m.key,
    label: m.label,
    state: milestones[m.key] ? 'done' : index === firstOpen ? 'current' : 'todo',
  }));
};

/* ---------------- Hover card on the Status badge ----------------
 * Rendered through a portal into <body> with position: fixed, so table rows,
 * .table-wrap overflow, or stacking contexts can never cover it.
 */
const CARD_W = 340;
const CARD_H = 190;

function ProgressRow({ label, done, total, percent }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="ap-summary-row">
      <div className="ap-summary-label">
        <span>{label}</span>
        <strong>{total ? `${done}/${total}` : `${safePercent}%`}</strong>
      </div>
      <div className="ap-summary-track" aria-label={`${label}: ${safePercent}%`}>
        <span style={{ width: `${safePercent}%` }} />
      </div>
    </div>
  );
}

function StatusHover({ applicant, loadDetail, children }) {
  const normalizedStatus = String(applicant.status || '').toLowerCase().replace(/[\s-]+/g, '_');
  const enabled = HOVER_STATUSES.includes(normalizedStatus);
  const anchorRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const hideTimer = useRef(null);
  const requestRef = useRef(0);

  const show = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (!enabled || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const cardWidth = Math.min(CARD_W, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - cardWidth / 2), window.innerWidth - cardWidth - 8);
    const below = rect.bottom + 9;
    const top = below + CARD_H > window.innerHeight - 8
      ? Math.max(8, rect.top - CARD_H - 9)
      : below;
    setPos({ left, top, arrowX: rect.left + rect.width / 2 - left, flipped: top < rect.top });

    // Show the row's existing summary immediately, then enrich it with detail API data.
    const requestId = ++requestRef.current;
    setDetailLoading(true);
    loadDetail(applicant.id)
      .then((result) => {
        if (requestRef.current === requestId) setDetail(result?.data || result);
      })
      .catch(() => {
        if (requestRef.current === requestId) setDetail(null);
      })
      .finally(() => {
        if (requestRef.current === requestId) setDetailLoading(false);
      });
  };

  const hide = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPos(null), 180);
  };
  const keepOpen = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  };

  useEffect(() => {
    if (!pos) return undefined;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [pos]);

  const all = detail?.milestone_state || [];
  const scheduleItems = all.filter(isScheduleItem);
  const legalItems = all.filter((m) => !isScheduleItem(m));
  const milestones = detail?.milestones || {};
  const scheduleDone = scheduleItems.filter((m) => milestones[m.key]).length;
  const legalDone = legalItems.filter((m) => milestones[m.key]).length;
  const stageIndex = pipelineStages.indexOf(normalizedStatus);
  const stagePercent = normalizedStatus === 'active_franchisee'
    ? 100
    : normalizedStatus === 'rejected'
      ? 100
      : Math.round(((Math.max(stageIndex, 0) + (stageIndex >= 0 ? 1 : 0)) / pipelineStages.length) * 100);
  const progress = applicant.progress || {};
  const fallbackLegalTotal = Number(progress.legalities_total || progress.documents_total || 0);
  const fallbackLegalDone = Number(progress.legalities_completed || progress.documents_completed || 0);
  const fallbackScheduleTotal = Number(progress.schedule_total || progress.activities_total || progress.milestones_total || 0);
  const fallbackScheduleDone = Number(progress.schedule_completed || progress.activities_completed || progress.milestones_completed || 0);
  const legalTotal = legalItems.length || fallbackLegalTotal;
  const legalCount = legalItems.length ? legalDone : fallbackLegalDone;
  const scheduleTotal = scheduleItems.length || fallbackScheduleTotal;
  const scheduleCount = scheduleItems.length ? scheduleDone : fallbackScheduleDone;

  return (
    <>
      <span
        ref={anchorRef}
        className="ap-hover-anchor"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={enabled ? 0 : undefined}
        aria-haspopup="true"
      >
        {children}
      </span>
      {pos && createPortal(
        <div
          className={`ap-hover-card ap-progress-popover${pos.flipped ? ' flipped' : ''}`}
          role="tooltip"
          onMouseEnter={keepOpen}
          onMouseLeave={hide}
          style={{ left: pos.left, top: pos.top, width: `min(${CARD_W}px, calc(100vw - 16px))`, '--arrow-x': `${pos.arrowX}px`, zIndex: 2147483000 }}
        >
          <div className="ap-hover-title">
            <span>Applicant progress</span>
            <small className="ap-status-label">{titleCase(normalizedStatus)}</small>
          </div>
          <ProgressRow label="Application stage" done={stagePercent} total={0} percent={stagePercent} />
          <ProgressRow
            label="Legalities & documents"
            done={legalCount}
            total={legalTotal}
            percent={legalTotal ? Math.round((legalCount / legalTotal) * 100) : 0}
          />
          <ProgressRow
            label="Schedule activity"
            done={scheduleCount}
            total={scheduleTotal}
            percent={scheduleTotal ? Math.round((scheduleCount / scheduleTotal) * 100) : 0}
          />
          {detailLoading && <p className="ap-hover-footnote">Refreshing progress details…</p>}
          {!detailLoading && !all.length && !fallbackLegalTotal && !fallbackScheduleTotal && (
            <p className="ap-hover-footnote">Detailed milestone progress appears as activities are added.</p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ---------------- Checklist section (Legalities / Schedule) ---------------- */
function MilestoneSection({ title, items, draft, onPick }) {
  if (!items.length) return null;
  const done = items.filter((m) => draft.milestones[m.key]);
  return (
    <section className="ap-section">
      <div className="ap-section-head">
        <h3>{title}</h3>
        <small>{done.length} of {items.length} completed</small>
      </div>
      <Stepper items={milestoneSteps(items, draft.milestones)} />
      <div className="ap-checklist">
        {items.map((m) => {
          const checked = !!draft.milestones[m.key];
          return (
            <button
              key={m.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              className={`ap-check${checked ? ' checked' : ''}`}
              onClick={() => onPick(m)}
            >
              <span className="ap-box" aria-hidden="true">{checked && <FaCheck />}</span>
              {m.label}
            </button>
          );
        })}
      </div>
      {done.length > 0 && (
        <div className="ap-records">
          {done.map((m) => {
            const detail = draft.details[m.key];
            return (
              <div key={m.key} className="ap-record">
                <h4>{m.label}</h4>
                <dl>
                  <dt>Date marked</dt><dd>{fmtDateTime(detail?.on)}</dd>
                  <dt>Marked by</dt><dd>{detail?.by || '—'}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function Applicants() {
  const { role, user } = useAuth();
  const [tab, setTab] = useState('pipeline');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [mark, setMark] = useState(null); // small "accomplishment record" (date marked / marked by) dialog
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  // The signed-in user, used for "Marked by". The backend names users with `full_name`.
  const authName = String(user?.full_name || user?.name || user?.email || '').trim();
  const authLabel = authName ? `${authName}${role ? ` (${titleCase(role)})` : ''}` : '';

  // Cache of applicant details used by the hover card (cleared after every save).
  const detailCache = useRef(new Map());
  const loadDetail = (id) => {
    if (!detailCache.current.has(id)) {
      const request = api.get(`/applicants/${id}`).then((result) => result.data).catch((error) => {
        detailCache.current.delete(id);
        throw error;
      });
      detailCache.current.set(id, request);
    }
    return detailCache.current.get(id);
  };

  const remote = useRemote(async () => {
    const [applicants, brands, franchisees] = await Promise.all([
      api.get('/applicants', {
        page,
        per_page: 20,
        search,
        status,
        ...(tab === 'archived' ? { archived: 1 } : {}),
      }),
      api.get('/brands'),
      tab === 'franchisees'
        ? api.get('/applicants/active-franchisees', { page, per_page: 20 })
        : Promise.resolve({ data: [] }),
    ]);

    // The backend derives display_no on every request: each applicant's position
    // among the ACTIVE applicants in entry order, so archived/deleted rows never
    // leave a gap and restoring returns the original number (same as inquiries).
    const rows = applicants.data || [];
    const reindexed = rows.map((row) => ({ ...row, display_index: row.display_no ?? null }));

    return {
      applicants: reindexed,
      meta: applicants.meta,
      brands: brands.data,
      franchisees: franchisees.data,
    };
  }, [page, search, status, tab]);

  const canManage = ['admin', 'sales'].includes(role);

  const closeEditor = () => {
    setEditing(null);
    setDraft(null);
    setMark(null);
    setDetailsOpen(false);
  };

  const loadApplicant = async (id) => {
    setActionError('');
    setSuccess('');
    try {
      const detail = await api.get(`/applicants/${id}`);
      setEditing(detail.data);
      setDraft({
        full_name: detail.data.full_name || '',
        email: detail.data.email || '',
        phone: detail.data.phone || '',
        address: detail.data.address || '',
        notes: detail.data.notes || '',
        status: detail.data.status,
        // Always include EVERY milestone key (false when not completed). An applicant with no
        // saved checklist would otherwise send an empty object and fail the "milestones" validation.
        milestones: Object.fromEntries(
          (detail.data.milestone_state || []).map((m) => [m.key, Boolean(detail.data.milestones?.[m.key])]),
        ),
        details: { ...(detail.data.milestone_details || {}) },
      });
    } catch (error) {
      setActionError(firstValidationMessage(error));
    }
  };

  const saveApplicant = async (event) => {
    event.preventDefault();
    if (!editing || !draft) return;
    if (!draft.full_name.trim()) {
      setDetailsOpen(true);
      setActionError('Full name is required.');
      return;
    }
    setSaving(true);
    setActionError('');
    setSuccess('');
    let partial = false;
    try {
      await api.put(`/applicants/${editing.id}`, {
        full_name: draft.full_name,
        email: draft.email || null,
        phone: draft.phone || null,
        address: draft.address || null,
        notes: draft.notes || null,
      });
      partial = true; // the applicant is already changed, so the list must reload even if a later step fails

      if (draft.status !== editing.status) {
        await api.patch(`/applicants/${editing.id}/status`, { status: draft.status });
      }
      await api.patch(`/applicants/${editing.id}/milestones`, {
        milestones: draft.milestones,
        milestone_details: draft.details,
      });

      // Read the applicant back and confirm that "Date marked" and "Marked by" really were stored.
      // Without this check the page would report success even if the server silently drops them.
      const fresh = (await api.get(`/applicants/${editing.id}`)).data;
      const lost = Object.keys(draft.details)
        .filter((key) => draft.milestones[key])
        .filter((key) => !(fresh?.milestone_details?.[key]?.on && fresh?.milestone_details?.[key]?.by));
      if (lost.length) {
        const labels = (editing.milestone_state || []).filter((m) => lost.includes(m.key)).map((m) => m.label);
        const error = new Error(
          `The applicant was saved, but the server did not store Date marked / Marked by for: ${(labels.length ? labels : lost).join(', ')}. `
          + 'These records are not saved yet.',
        );
        error.verification = true;
        throw error;
      }

      detailCache.current.clear();
      closeEditor();
      setSuccess('Applicant updated successfully.');
      await remote.reload();
    } catch (error) {
      setActionError(error.verification ? error.message : firstValidationMessage(error));
      if (partial) {
        detailCache.current.clear();
        await remote.reload();
      }
    } finally {
      setSaving(false);
    }
  };

  const createApplicant = async (event) => {
    event.preventDefault();
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.post('/applicants', {
        ...form,
        preferred_brand_id: form.preferred_brand_id ? Number(form.preferred_brand_id) : null,
      });
      setForm(blank);
      setShowCreate(false);
      setSuccess('Applicant created successfully.');
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const archiveApplicant = async (applicant) => {
    setUpdatingId(applicant.id);
    setActionError('');
    setSuccess('');
    try {
      await api.post(`/applicants/${applicant.id}/archive`);
      setSuccess(`${applicant.full_name} moved to the archive.`);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const restoreApplicant = async (applicant) => {
    setUpdatingId(applicant.id);
    setActionError('');
    setSuccess('');
    try {
      await api.post(`/applicants/${applicant.id}/restore`);
      setSuccess(`${applicant.full_name} restored to the pipeline.`);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const removeApplicant = async () => {
    if (!removeTarget) return;
    setSaving(true);
    setActionError('');
    setSuccess('');
    try {
      await api.delete(`/applicants/${removeTarget.id}`);
      setSuccess(`${removeTarget.full_name} removed from the pipeline.`);
      setRemoveTarget(null);
      setShowRemove(false);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setSaving(false);
    }
  };

  /* ---------- checkbox -> accomplishment record dialog ---------- */
  const openMark = (milestone) => {
    const existing = draft.details[milestone.key];
    // An existing record keeps the person who originally marked it; a new one uses the signed-in user.
    const by = existing?.by || authLabel;
    setMark({
      milestone,
      checked: !!draft.milestones[milestone.key],
      on: existing?.on ? toLocalInput(existing.on) : nowLocal(),
      by,
      byLocked: Boolean(by), // only ask for a name if the signed-in user cannot be identified
    });
  };

  const saveMark = () => {
    if (!mark || !mark.on || !mark.by.trim()) return;
    const { key } = mark.milestone;
    setDraft((current) => ({
      ...current,
      milestones: { ...current.milestones, [key]: true },
      details: { ...current.details, [key]: { on: mark.on, by: mark.by.trim() } },
    }));
    setMark(null);
  };

  const removeMark = () => {
    const { key } = mark.milestone;
    setDraft((current) => {
      const details = { ...current.details };
      delete details[key];
      return { ...current, milestones: { ...current.milestones, [key]: false }, details };
    });
    setMark(null);
  };

  const onMarkKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation(); // do not also close the Update modal
      setMark(null);
    } else if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
      event.preventDefault();
      saveMark();
    }
  };

  const rows = remote.data?.applicants || [];
  const franchisees = remote.data?.franchisees || [];
  const activeStatuses = tab === 'pipeline' ? statuses : [];
  const milestoneState = editing?.milestone_state || [];
  const scheduleItems = milestoneState.filter(isScheduleItem);
  const legalItems = milestoneState.filter((m) => !isScheduleItem(m));

  const switchTab = (next) => {
    setTab(next);
    setPage(1);
    setStatus('');
  };

  const stageItems = draft ? pipelineStages.map((stage, index) => {
    const currentIndex = pipelineStages.indexOf(draft.status);
    return {
      key: stage,
      label: titleCase(stage),
      state: stage === draft.status ? 'current' : currentIndex > -1 && index < currentIndex ? 'done' : 'todo',
      onClick: () => setDraft({ ...draft, status: stage }),
      disabled: saving || editing?.status === 'active_franchisee',
    };
  }) : [];

  return (
    <div className="page-container">
      <PageHeader
        title="Applicant pipeline"
        subtitle="Manage candidate progress, commercial milestones, approvals, and franchise activation."
        actions={canManage && (
          <div className="row-actions">
            <button className="primary-button" onClick={() => { setActionError(''); setShowCreate(true); }}>
              <FaUserPlus /> New applicant
            </button>
            <button onClick={() => { setActionError(''); setRemoveTarget(null); setShowRemove(true); }}>
              <FaTrashCan /> Remove applicant
            </button>
          </div>
        )}
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError || remote.error}</Notice>

      <div className="ap-tabs" role="tablist" aria-label="Applicant views">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`ap-tab${tab === item.key ? ' active' : ''}`}
            onClick={() => switchTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab !== 'franchisees' && (
        <div className="toolbar">
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search applicants"
            aria-label="Search applicants"
          />
          <select
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            aria-label="Filter applicant status"
          >
            <option value="">All statuses</option>
            {activeStatuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
        </div>
      )}

      {tab === 'franchisees' ? (
        <section className="data-panel">
          {remote.loading ? <LoadingState /> : !franchisees.length ? (
            <EmptyState label="No active franchisees yet." detail="Approved applicants appear here once activated." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th><th>Owner</th><th>Brand</th><th>Locations</th><th>Approved</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {franchisees.map((franchisee) => (
                    <tr key={franchisee.id}>
                      <td>
                        <strong>{franchisee.business_name}</strong>
                        <small><FaStore aria-hidden="true" /> Franchisee #{franchisee.id}</small>
                      </td>

                      <td>
                        {franchisee.applicant?.full_name || '—'}
                        <small>{franchisee.applicant?.email || '—'}</small>
                      </td>
                      <td>{franchisee.applicant?.preferred_brand?.name || '—'}</td>
                      <td>{franchisee.locations?.length || 0}</td>
                      <td>{formatDate(franchisee.approval_date)}</td>
                      <td><StatusBadge value={franchisee.franchise_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination meta={remote.data?.meta} onPage={setPage} />
        </section>
      ) : (
        <section className="data-panel">
          {remote.loading ? <LoadingState /> : !rows.length ? (
            <EmptyState
              label={tab === 'archived' ? 'No archived applicants.' : 'No applicants match these filters.'}
              detail={tab === 'archived' ? 'Archived candidates can be restored at any time.' : 'Adjust the filters or add a new applicant to the pipeline.'}
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Applicant</th><th>Contact</th><th>Brand</th><th>Applied</th>
                    <th>Status</th><th>Update</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((applicant, idx) => (
                    <tr key={applicant.id} data-applicant-id={applicant.id}>
                      <td><strong>{applicant.full_name}</strong><small>{applicant.display_index ? `#${applicant.display_index}` : `Applicant #${applicant.id}`}</small></td>
                      <td>{applicant.email || '—'}<small>{applicant.phone || '—'}</small></td>
                      <td>{applicant.preferred_brand?.name || '—'}</td>
                      <td>{formatDate(applicant.application_date)}</td>
                      <td>
                        {tab === 'archived' ? (
                          <StatusBadge value={applicant.status} />
                        ) : (
                          <StatusHover applicant={applicant} loadDetail={loadDetail}>
                            <StatusBadge value={applicant.status} />
                          </StatusHover>
                        )}
                        {tab === 'archived' && applicant.archived_at && (
                          <small>Archived {formatDate(applicant.archived_at)}</small>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {canManage && tab === 'archived' ? (
                            <button
                              disabled={updatingId === applicant.id}
                              onClick={() => restoreApplicant(applicant)}
                            >
                              Restore
                            </button>
                          ) : canManage ? (
                            <>
                              <button
                                className="primary-button"
                                disabled={updatingId === applicant.id}
                                onClick={() => loadApplicant(applicant.id)}
                              >
                                <FaPen /> Update
                              </button>
                              {role === 'admin' && (
                                <button disabled={updatingId === applicant.id} onClick={() => archiveApplicant(applicant)}>
                                  Archive
                                </button>
                              )}
                            </>
                          ) : '—'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination meta={remote.data?.meta} onPage={setPage} />
        </section>
      )}

      {showCreate && (
        <Modal
          title="Create applicant"
          onClose={() => setShowCreate(false)}
          footer={(
            <>
              <button onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="primary-button" form="applicant-form" disabled={saving}>
                {saving ? 'Saving…' : 'Create applicant'}
              </button>
            </>
          )}
        >
          <Notice type="error">{actionError}</Notice>
          <form id="applicant-form" className="form-grid" onSubmit={createApplicant}>
            <Field label="Full name" required>
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Preferred brand">
              <select value={form.preferred_brand_id} onChange={(e) => setForm({ ...form, preferred_brand_id: e.target.value })}>
                <option value="">No preference</option>
                {remote.data?.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </Field>
            <Field label="Address" full><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Notes" full>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Commercial context, qualifications, and next steps" />
            </Field>
          </form>
        </Modal>
      )}

      {editing && draft && (
        <Modal
          title={`Update ${editing.full_name}`}
          onClose={closeEditor}
          footer={(
            <>
              <button type="button" onClick={closeEditor}>Cancel</button>
              <button className="primary-button" form="update-applicant-form" disabled={saving}>
                {saving ? 'Saving…' : 'Save applicant'}
              </button>
            </>
          )}
        >
          <Notice type="error">{actionError}</Notice>
          <form id="update-applicant-form" onSubmit={saveApplicant} noValidate>
            <section className="ap-section">
              <div className="ap-section-head">
                <h3>Application stage</h3>
                {draft.status === 'rejected' && <small className="ap-rejected">Rejected</small>}
              </div>
              <Stepper items={stageItems} />
              {editing.status !== 'active_franchisee' && draft.status !== 'rejected' && (
                <button type="button" className="ap-reject" onClick={() => setDraft({ ...draft, status: 'rejected' })}>
                  <span className="ap-reject-mark" aria-hidden="true">×</span>
                  <span>Mark as rejected</span>
                </button>
              )}
            </section>

            <MilestoneSection title="Legalities & documents" items={legalItems} draft={draft} onPick={openMark} />
            <MilestoneSection title="Schedule activity" items={scheduleItems} draft={draft} onPick={openMark} />

            <details
              className="ap-section ap-details"
              open={detailsOpen}
              onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
            >
              <summary>Applicant details</summary>
              <div className="form-grid">
                <Field label="Full name" required>
                  <input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
                </Field>
                <Field label="Email"><input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
                <Field label="Phone"><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
                <Field label="Address"><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
                <Field label="Notes" full>
                  <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </Field>
              </div>
            </details>
          </form>

          {/* Not a <form>: a nested submit would bubble to the Update form through the React tree. */}
          {mark && createPortal(
            <div
              className="ap-sub-overlay"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setMark(null); }}
              onKeyDown={onMarkKeyDown}
            >
              <div className="ap-subform ap-record-card" role="dialog" aria-modal="true" aria-labelledby="ap-rec-title">
                <header className="ap-rec-head">
                  <span className="ap-rec-icon" aria-hidden="true"><FaClipboardCheck /></span>
                  <div className="ap-rec-heading">
                    <span className="ap-rec-kicker">Accomplishment record</span>
                    <h3 id="ap-rec-title">{mark.milestone.label}</h3>
                  </div>
                  <span className={`ap-rec-status${mark.checked ? ' is-done' : ''}`}>{mark.checked ? 'Completed' : 'Pending'}</span>
                </header>

                <dl className="ap-rec-ledger">
                  <div className="ap-rec-row">
                    <dt>Applicant</dt>
                    <dd>{editing.full_name}</dd>
                  </div>
                  <div className="ap-rec-row">
                    <dt><label htmlFor="ap-rec-date">Date marked</label></dt>
                    <dd>
                      <input
                        id="ap-rec-date"
                        type="datetime-local"
                        autoFocus
                        value={mark.on}
                        onChange={(e) => setMark({ ...mark, on: e.target.value })}
                      />
                    </dd>
                  </div>
                  <div className="ap-rec-row">
                    <dt><label htmlFor="ap-rec-by">Marked by</label></dt>
                    <dd>
                      {mark.byLocked ? (
                        <span id="ap-rec-by" className="ap-rec-signed"><FaUserCheck aria-hidden="true" /> {mark.by}</span>
                      ) : (
                        <input
                          id="ap-rec-by"
                          value={mark.by}
                          placeholder="Name of the person responsible"
                          onChange={(e) => setMark({ ...mark, by: e.target.value })}
                        />
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="ap-rec-note">
                  {mark.byLocked
                    ? 'Recorded under the signed-in account. It is saved when you save the applicant.'
                    : 'Your name could not be detected, so please enter who is responsible.'}
                </p>

                <footer className="ap-subform-actions">
                  {mark.checked && <button type="button" className="ap-danger-text" onClick={removeMark}>Remove mark</button>}
                  <span className="ap-spacer" />
                  <button type="button" onClick={() => setMark(null)}>Cancel</button>
                  <button type="button" className="primary-button" onClick={saveMark} disabled={!mark.on || !mark.by.trim()}>Save record</button>
                </footer>
              </div>
            </div>,
            document.body,
          )}
        </Modal>
      )}

      {showRemove && (
        <Modal
          title="Remove applicant"
          onClose={() => setShowRemove(false)}
          size="small"
          footer={(
            <>
              <button onClick={() => setShowRemove(false)}>Cancel</button>
              <button className="danger-button" onClick={removeApplicant} disabled={saving || !removeTarget}>
                {saving ? 'Removing…' : 'Remove applicant'}
              </button>
            </>
          )}
        >
          <Notice type="error">{actionError}</Notice>
          <p className="ap-muted">
            Removing deletes the candidate permanently. Use Archive instead to keep the record.
          </p>
          <div className="ap-checklist ap-single" role="radiogroup" aria-label="Choose an applicant to remove">
            {rows.map((applicant) => (
              <label
                key={applicant.id}
                className={`ap-check${removeTarget?.id === applicant.id ? ' checked' : ''}`}
              >
                <input
                  type="radio"
                  name="remove-applicant"
                  className="ap-visually-hidden"
                  checked={removeTarget?.id === applicant.id}
                  onChange={() => setRemoveTarget(applicant)}
                />
                <span className="ap-box" aria-hidden="true">{removeTarget?.id === applicant.id && <FaCheck />}</span>
                <span>
                  {applicant.full_name}
                  <small className="ap-sub">{titleCase(applicant.status)}</small>
                </span>
              </label>
            ))}
          </div>
          {!rows.length && <EmptyState label="No applicants available to remove." />}
        </Modal>
      )}
    </div>
  );
}
