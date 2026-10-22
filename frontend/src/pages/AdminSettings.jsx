import React, { useEffect, useState } from 'react';
import { FaBoxArchive, FaRotateLeft, FaTrashCan, FaXmark } from 'react-icons/fa6';
import { api, firstValidationMessage } from '../lib/api';
import useRemote from '../lib/useRemote';
import { formatDate } from '../lib/format';
import { EmptyState, LoadingState, Modal, Notice, PageHeader } from '../components/ApiUi';
import './InquiryDrawer.css';

const SECTIONS = [
  { key: 'users', label: 'Users', heading: 'Archived users' },
  { key: 'inquiries', label: 'Inquiries', heading: 'Archived inquiries' },
  { key: 'applicants', label: 'Applicants', heading: 'Archived applicants' },
];

export default function AdminSettings() {
  const [tab, setTab] = useState('users');
  const [restoringId, setRestoringId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');

  // Inquiries tab: select several records (Ctrl/Cmd+click, Shift+click) to RESTORE them together.
  // Permanent delete is deliberately single-record only.
  const [selectedIds, setSelectedIds] = useState([]); // click order; the first one hosts the buttons
  const [bulkBusy, setBulkBusy] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purgeReason, setPurgeReason] = useState('');
  const [purgeError, setPurgeError] = useState('');
  const [purging, setPurging] = useState(false);

  const remote = useRemote(async () => (await api.get('/archive')).data, []);

  const data = remote.data || {};
  const totals = data.totals || {};
  const section = data[tab] || { items: [] };
  const items = section.items || [];
  const selectable = tab === 'inquiries';
  const selectedItems = selectedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  const reasonOk = purgeReason.trim().length >= 5;

  useEffect(() => { setSelectedIds([]); }, [tab]);
  useEffect(() => {
    // Drop selections that are no longer in the list (after a restore or delete).
    setSelectedIds((current) => {
      const next = current.filter((id) => items.some((item) => item.id === id));
      return next.length === current.length ? current : next;
    });
  }, [remote.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedIds.length) return undefined;
    const onKey = (event) => { if (event.key === 'Escape' && !purgeTarget) setSelectedIds([]); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds.length, purgeTarget]);

  const restore = async (item) => {
    setRestoringId(item.id);
    setActionError('');
    setSuccess('');
    try {
      await api.post(`/archive/${tab}/${item.id}/restore`);
      setSuccess(`${item.label} restored.`);
      await remote.reload();
    } catch (error) {
      setActionError(firstValidationMessage(error));
    } finally {
      setRestoringId(null);
    }
  };

  const restoreSelected = async () => {
    if (!selectedItems.length) return;
    setBulkBusy(true);
    setActionError('');
    setSuccess('');
    let restored = 0;
    try {
      for (const item of selectedItems) {
        await api.post(`/archive/inquiries/${item.id}/restore`);
        restored += 1;
      }
      setSuccess(`${restored} ${restored === 1 ? 'inquiry' : 'inquiries'} restored.`);
    } catch (error) {
      setActionError(`Restored ${restored} of ${selectedItems.length}. ${firstValidationMessage(error)}`);
    }
    setSelectedIds([]);
    setBulkBusy(false);
    await remote.reload();
  };

  const handleItemClick = (event, item) => {
    if (!selectable) return;
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) => (
        current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
      ));
      return;
    }
    if (event.shiftKey && selectedIds.length) {
      const anchor = items.findIndex((entry) => entry.id === selectedIds[0]);
      const target = items.findIndex((entry) => entry.id === item.id);
      if (anchor >= 0 && target >= 0) {
        const [from, to] = anchor < target ? [anchor, target] : [target, anchor];
        const range = items.slice(from, to + 1).map((entry) => entry.id).filter((id) => id !== selectedIds[0]);
        setSelectedIds([selectedIds[0], ...range]);
        return;
      }
    }
    if (selectedIds.length) setSelectedIds([]);
  };

  const openPurge = (item) => {
    setPurgeError('');
    setPurgeReason('');
    setPurgeTarget(item);
  };

  const confirmPurge = async () => {
    if (!purgeTarget || !reasonOk) return;
    setPurging(true);
    setPurgeError('');
    setActionError('');
    setSuccess('');
    try {
      await api.post(`/archive/inquiries/${purgeTarget.id}/purge`, { reason: purgeReason.trim() });
      setSuccess(`${purgeTarget.label} was permanently deleted.`);
      setPurgeTarget(null);
      setPurgeReason('');
      setSelectedIds([]);
      await remote.reload();
    } catch (error) {
      setPurgeError(firstValidationMessage(error));
    } finally {
      setPurging(false);
    }
  };

  // Buttons for one archived item. While several inquiries are selected, only the first
  // selected row shows them (Restore for the whole selection) and Permanent delete is hidden.
  const renderActions = (item) => {
    const hasSelection = selectable && selectedIds.length > 0;
    if (hasSelection && selectedIds[0] !== item.id) {
      return selectedIds.includes(item.id) ? <span className="selected-tag">Selected</span> : null;
    }
    const many = hasSelection && selectedItems.length > 1;
    const busy = restoringId === item.id || bulkBusy;
    return (
      <>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => (many ? restoreSelected() : restore(item))}
        >
          <FaRotateLeft /> {busy ? 'Restoring…' : `Restore${many ? ` (${selectedItems.length})` : ''}`}
        </button>
        {selectable && !many && (
          <button
            type="button"
            className="danger-button"
            disabled={busy || item.has_applicant}
            title={item.has_applicant ? 'Converted to an applicant. Restore it and use Undo convert first.' : 'Permanently delete this inquiry'}
            onClick={() => openPurge(item)}
          >
            <FaTrashCan /> Delete permanently
          </button>
        )}
        {hasSelection && (
          <button type="button" className="icon-button" title="Clear selection" aria-label="Clear selection" onClick={() => setSelectedIds([])}>
            <FaXmark aria-hidden="true" />
          </button>
        )}
      </>
    );
  };

  if (remote.loading) return <div className="page-container"><LoadingState label="Loading admin settings…" /></div>;
  if (remote.error) return <div className="page-container"><Notice type="error">{remote.error}</Notice></div>;

  return (
    <div className="page-container">
      <PageHeader
        title="Admin settings"
        subtitle="Archived users, inquiries, and applicants. Restore anything that should return to the active workspace."
        eyebrow="Workspace administration"
      />
      <Notice type="success">{success}</Notice>
      <Notice type="error">{actionError}</Notice>

      <div className="archive-summary">
        {SECTIONS.map((item) => (
          <article className="archive-stat" key={item.key}>
            <span>{item.label}</span>
            <strong>{totals[item.key] ?? 0}</strong>
          </article>
        ))}
        <article className="archive-stat">
          <span>Total archived</span>
          <strong>{totals.all ?? 0}</strong>
        </article>
      </div>

      <div className="tabs" role="tablist" aria-label="Archive sections">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`tab${tab === item.key ? ' active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.label} ({data[item.key]?.count ?? 0})
          </button>
        ))}
      </div>

      <section className="data-panel">
        <div className="panel-title">
          <div className="panel-heading-copy">
            <h2>{SECTIONS.find((item) => item.key === tab)?.heading}</h2>
            <span>Records removed from the active workspace</span>
          </div>
        </div>

        {selectable && items.length > 0 && (
          <p className="muted-note archive-hint">
            Hold Ctrl (⌘ on Mac) and click to select several inquiries to restore together, or Shift+click for a range.
            Permanent delete works on one inquiry at a time.
          </p>
        )}

        {!items.length ? (
          <EmptyState
            label={`No archived ${tab}.`}
            detail="Archived records will appear here and can be restored at any time."
          />
        ) : (
          <div className={selectable ? 'archive-selectable' : undefined}>
            {items.map((item) => (
              <div
                className={`archive-item${selectedIds.includes(item.id) ? ' is-picked' : ''}`}
                key={item.id}
                onClick={(event) => handleItemClick(event, item)}
              >
                <span className="archive-item-copy">
                  <strong>{item.label}</strong>
                  <small>
                    {item.detail || '—'}
                    {item.badge ? ` · ${item.badge}` : ''}
                  </small>
                </span>
                <span className="row-actions" onClick={(event) => event.stopPropagation()}>
                  <small className="muted-note">
                    {item.archived_at ? `${formatDate(item.archived_at, true)}` : ''}
                    {item.archived_by ? ` · ${item.archived_by}` : ''}
                  </small>
                  {renderActions(item)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="muted-note" style={{ marginTop: 12 }}>
        <FaBoxArchive aria-hidden="true" /> Permanent delete removes an archived inquiry from the database for good. Archive instead
        when a record may be needed later.
      </p>

      {purgeTarget && (
        <Modal
          title="Permanently delete this inquiry?"
          onClose={() => setPurgeTarget(null)}
          size="small"
          footer={(
            <>
              <button onClick={() => setPurgeTarget(null)} disabled={purging}>Cancel</button>
              <button className="danger-button" onClick={confirmPurge} disabled={purging || !reasonOk}>
                {purging ? 'Deleting…' : 'Confirm delete'}
              </button>
            </>
          )}
        >
          <Notice type="error">{purgeError}</Notice>
          <div className="confirmation-copy">
            <span className="confirmation-icon confirmation-accent"><FaTrashCan /></span>
            <div>
              <strong>{purgeTarget.label}</strong>
              <p>
                This removes the record from the database and cannot be undone. The reason you enter is saved in the audit log.
              </p>
            </div>
          </div>
          <label className="purge-reason">
            <span>Reason for deletion <em>(required, at least 5 characters)</em></span>
            <textarea
              value={purgeReason}
              onChange={(e) => setPurgeReason(e.target.value)}
              placeholder="e.g. Duplicate record, same email and phone as an existing inquiry"
              autoFocus
            />
          </label>
        </Modal>
      )}
    </div>
  );
}
