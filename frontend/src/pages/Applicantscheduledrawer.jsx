import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCalendarDays, FaCheck, FaUsers, FaXmark } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';
import { StatusBadge } from './ApiUi';

/* ------------------------------------------------------------------ */
/* Eligibility: the drawer only exists once the applicant has reached  */
/* the "Scheduled" stage (or any stage after it).                      */
/* ------------------------------------------------------------------ */

const STAGE_ORDER = [
  'inquiry',
  'qualified',
  'scheduled',
  'loi_submitted',
  'payment_submitted',
  'for_approval',
  'approved',
  'active_franchisee',
];

const normalizeStatus = (status) => String(status || '').toLowerCase().replace(/[\s-]+/g, '_');

export function canViewSchedule(status) {
  const index = STAGE_ORDER.indexOf(normalizeStatus(status));
  return index >= STAGE_ORDER.indexOf('scheduled');
}

/* ------------------------------------------------------------------ */
/* Helpers (same logic as the Activities & schedules page)             */
/* ------------------------------------------------------------------ */

const trackedTypes = ['orientation', 'product_tasting', 'training'];

const activityLabel = (activity) => titleCase(activity?.activity_type || 'other');

function formatDuration(minutes) {
  const value = Number(minutes || 0);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function initialsOf(name = 'Applicant') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'A';
}

function typeProgress(activities) {
  return trackedTypes.map((type) => {
    const held = activities.filter((item) => item.activity_type === type && item.status !== 'cancelled');
    const done = held.find((item) => item.status === 'completed');
    const pending = held.find((item) => item.status !== 'completed');
    return {
      type,
      done: Boolean(done),
      label: titleCase(type),
      detail: done
        ? `Completed ${formatDate(done.completed_at || done.starts_at)}`
        : pending
          ? `Scheduled ${formatDate(pending.starts_at)}`
          : 'Not started',
    };
  });
}

// Find this applicant's group in /activities/grouped (by applicant id first, then by name).
function findGroup(groups, applicant) {
  const id = String(applicant.id);
  const byId = groups.find((group) => (group.activities || []).some(
    (activity) => String(activity.applicant_id ?? activity.applicant?.id ?? '') === id,
  ));
  if (byId) return byId;
  const name = String(applicant.full_name || '').trim().toLowerCase();
  return groups.find((group) => String(group.person || '').trim().toLowerCase() === name) || null;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/**
 * applicant:      the applicant row to read, or null/undefined to keep the drawer closed.
 * onClose:        called by the close button and the Escape key.
 * disableEscape:  pass true while another modal is open so Esc only closes that modal.
 */
export default function ApplicantScheduleDrawer({ applicant, onClose, disableEscape = false }) {
  const open = Boolean(applicant) && canViewSchedule(applicant.status);
  const [state, setState] = useState({ loading: false, error: '', group: null });
  const lastApplicant = useRef(null);
  const requestRef = useRef(0);

  if (open) lastApplicant.current = applicant;
  const shown = open ? applicant : lastApplicant.current; // keeps content visible during the slide-out

  // Load the schedule whenever a (different) eligible applicant is opened.
  useEffect(() => {
    if (!open) return undefined;
    const requestId = ++requestRef.current;
    setState({ loading: true, error: '', group: null });
    api.get('/activities/grouped')
      .then((result) => {
        if (requestRef.current !== requestId) return;
        const groups = result?.data || [];
        setState({ loading: false, error: '', group: findGroup(groups, applicant) });
      })
      .catch((error) => {
        if (requestRef.current !== requestId) return;
        setState({ loading: false, error: firstValidationMessage(error), group: null });
      });
    return () => { requestRef.current += 1; };
  }, [open, applicant?.id, applicant?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || disableEscape) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, disableEscape, onClose]);

  if (!shown) return null;

  const activities = state.group?.activities || [];
  const progress = typeProgress(activities);
  const progressDone = progress.filter((item) => item.done).length;
  const percent = Math.round((progressDone / trackedTypes.length) * 100);
  const attendees = [...new Set(activities.flatMap((activity) => {
    const names = [...(activity.participants || [])];
    if (activity.assigned_to?.full_name) names.push(activity.assigned_to.full_name);
    return names;
  }))];
  const total = state.group?.total ?? activities.length;

  return createPortal(
    <aside
      className={`asd-drawer${open ? ' is-open' : ''}`}
      aria-label="Applicant activities and schedules"
      aria-hidden={!open}
    >
      <button type="button" className="asd-close" onClick={onClose} aria-label="Close details" title="Close (Esc)">
        <FaXmark />
      </button>

      <header className="asd-head">
        <span className="asd-avatar" aria-hidden="true">{initialsOf(shown.full_name)}</span>
        <div>
          <h2>{shown.full_name}</h2>
          <p>
            {state.loading
              ? 'Loading schedule…'
              : `${total} scheduled ${total === 1 ? 'activity' : 'activities'} · ${progressDone}/${trackedTypes.length} milestones done`}
          </p>
        </div>
      </header>

      <div className="asd-body">
        {state.error && <p className="asd-error" role="alert">{state.error}</p>}

        {!state.loading && !state.error && !activities.length && (
          <div className="asd-empty">
            <FaCalendarDays aria-hidden="true" />
            <strong>No activities scheduled yet</strong>
            <span>Set one from Activities &amp; schedules and it will show up here.</span>
          </div>
        )}

        {activities.length > 0 && (
          <>
            <section className="asd-section">
              <h3>Schedule progress</h3>
              <div className="asd-bar-meta">
                <span>Activity milestones</span>
                <span>{progressDone}/{trackedTypes.length}</span>
              </div>
              <div
                className="asd-bar"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className={progressDone === trackedTypes.length ? 'is-complete' : ''} style={{ width: `${percent}%` }} />
              </div>
              <ul className="asd-progress-list">
                {progress.map((item) => (
                  <li key={item.type} className={item.done ? 'is-done' : ''}>
                    <span className="asd-progress-icon">
                      {item.done ? <FaCheck aria-hidden="true" /> : <FaCalendarDays aria-hidden="true" />}
                    </span>
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="asd-section">
              <h3>All activities</h3>
              <ul className="asd-activity-list">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <div className="asd-activity-top">
                      <strong>{activityLabel(activity)}</strong>
                      <StatusBadge value={activity.status === 'no_show' ? 'no show' : activity.status} />
                    </div>
                    <small>
                      {formatDate(activity.starts_at, true)} · {formatDuration(activity.duration_minutes)}
                      {activity.venue ? ` · ${activity.venue}` : ''}
                    </small>
                    {activity.result_notes && <p>{activity.result_notes}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="asd-section">
              <h3>Attendees</h3>
              <div className="asd-attendees">
                <FaUsers aria-hidden="true" />
                <span>{attendees.join(', ') || 'Applicant only'}</span>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>,
    document.body,
  );
}
