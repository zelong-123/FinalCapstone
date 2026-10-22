import React, { useEffect, useId, useRef } from 'react';
import {
  FaCircleCheck,
  FaCircleInfo,
  FaInbox,
  FaTriangleExclamation,
  FaXmark,
} from 'react-icons/fa6';
import AppIconImg from '../assets/icon.png.png';

const noticeIcons = {
  error: FaTriangleExclamation,
  success: FaCircleCheck,
  info: FaCircleInfo,
};

export function Notice({ type = 'info', children }) {
  if (!children) return null;
  const Icon = noticeIcons[type] || FaCircleInfo;
  return (
    <div className={`notice notice-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function AppLoader({ label = 'Connecting to Herald…', detail = 'Securing your workspace and synchronizing live data.' }) {
  return (
    <main className="app-loading" role="status" aria-live="polite">
      <div className="app-loader-orbit" aria-hidden="true">
        <span className="app-loader-ring" />
        <img src={AppIconImg} alt="" />
      </div>
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </main>
  );
}

export function LoadingState({ label = 'Loading data…' }) {
  return (
    <div className="panel-state loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div><strong>{label}</strong><small>Fetching the latest information</small></div>
    </div>
  );
}

export function EmptyState({ label = 'No records found.', detail = 'Try changing the filters or add a new record.' }) {
  return (
    <div className="panel-state empty-state">
      <span className="empty-state-icon"><FaInbox aria-hidden="true" /></span>
      <strong>{label}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow = 'Herald operations' }) {
  return (
    <header className="page-heading">
      <div>
        <span className="page-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Modal({ title, onClose, children, footer, size = 'normal' }) {
  const titleId = useId();
  const cardRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusable = Array.from(cardRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const firstFocusable = cardRef.current?.querySelector('input, select, textarea, button, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={cardRef}
        className={`modal-card modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><FaXmark /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.last_page <= 1) return null;
  const firstRecord = ((meta.current_page - 1) * meta.per_page) + 1;
  const lastRecord = Math.min(meta.current_page * meta.per_page, meta.total);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-summary">Showing {firstRecord}–{lastRecord} of {meta.total}</span>
      <div className="pagination-controls">
        <button type="button" disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}>Previous</button>
        <span>Page {meta.current_page} of {meta.last_page}</span>
        <button type="button" disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)}>Next</button>
      </div>
    </nav>
  );
}

export function StatusBadge({ value }) {
  const normalized = String(value || 'unknown').toLowerCase().replaceAll('_', '-');
  return (
    <span className={`status-pill status-${normalized}`}>
      <span className="status-dot" aria-hidden="true" />
      {String(value || 'unknown').replaceAll('_', ' ')}
    </span>
  );
}

export function ProgressBar({ percent = 0, state = 'in_progress', label, detail }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const suffix = state === 'complete' ? 'Complete' : state === 'rejected' ? 'Rejected' : `${value}%`;
  return (
    <div className="progress-cell">
      {(label || detail) && (
        <div className="progress-meta">
          {label && <strong>{label}</strong>}
          <span>{detail || suffix}</span>
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
      >
        <div className={`progress-fill state-${state}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function Field({ label, children, full = false, hint, required = false }) {
  return (
    <label className={`form-field${full ? ' full' : ''}`}>
      <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
