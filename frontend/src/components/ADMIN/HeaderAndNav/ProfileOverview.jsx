import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FaBoxArchive,
  FaCamera,
  FaClipboardList,
  FaGear,
  FaPenToSquare,
  FaRotateLeft,
  FaStar,
  FaTrashCan,
  FaUser,
  FaUsers,
  FaXmark,
} from 'react-icons/fa6';
import { api, firstValidationMessage } from '../../../lib/api';
import { formatDate, titleCase } from '../../../lib/format';
import { useAuth } from '../../../context/AuthContext';
import useRemote from '../../../lib/useRemote';
import { EmptyState, LoadingState, Modal, Notice } from '../../ApiUi';
// DO NOT IMPORT A LOCAL CSS FILE HERE. The CSS is in index.css.

const ARCHIVE_SECTIONS = [
  { key: 'users', label: 'Users' },
  { key: 'inquiries', label: 'Inquiries' },
  { key: 'applicants', label: 'Applicants' },
];

const ADMIN_PRIVILEGES = [
  { icon: FaGear, title: 'Full System Access', detail: 'All modules and features' },
  { icon: FaUsers, title: 'User & Role Management', detail: 'Manage users and permissions' },
  { icon: FaBoxArchive, title: 'Archive Management', detail: 'Restore or permanently delete records' },
  { icon: FaClipboardList, title: 'Audit Logs', detail: 'Review system activity' },
];

const DEFAULT_PRIVILEGES = [
  { icon: FaGear, title: 'Workspace Access', detail: 'Modules assigned to your role' },
];

function initials(name = 'User') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';
}

export default function ProfileOverview({ onClose }) {
  const { user, role, updateUser } = useAuth();
  const isAdmin = role === 'admin';
  const fileInputRef = useRef(null);

  const [tab, setTab] = useState('overview'); 
  const [isEditing, setIsEditing] = useState(false);
  const [showAllPrivileges, setShowAllPrivileges] = useState(false);

  // Profile edit
  const [editName, setEditName] = useState(user?.full_name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || user?.contact_number || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Archive (admin only)
  const [archiveTab, setArchiveTab] = useState('users');
  const [restoringId, setRestoringId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purgeReason, setPurgeReason] = useState('');
  const [purgeError, setPurgeError] = useState('');
  const [purging, setPurging] = useState(false);

  const remote = useRemote(
    async () => (isAdmin ? (await api.get('/archive')).data : null),
    [isAdmin]
  );

  const data = remote.data || {};
  const items = (data[archiveTab] || { items: [] }).items || [];
  const selectable = archiveTab === 'inquiries';
  const selectedItems = selectedIds.map((id) => items.find((i) => i.id === id)).filter(Boolean);
  const reasonOk = purgeReason.trim().length >= 5;

  const roleLabel = isAdmin ? 'Super Administrator' : titleCase(role);
  const employeeId =
    user?.employee_id ||
    `${isAdmin ? 'FT-ADMIN-' : 'FT-'}${String(user?.id ?? 1).padStart(4, '0')}`;
  const privileges = isAdmin ? ADMIN_PRIVILEGES : DEFAULT_PRIVILEGES;
  const visiblePrivileges = showAllPrivileges ? privileges : privileges.slice(0, 2);

  useEffect(() => {
    setEditName(user?.full_name || '');
    setEditPhone(user?.phone || user?.contact_number || '');
    setAvatarPreview(user?.avatar_url || null);
  }, [user]);

  useEffect(() => { setSelectedIds([]); }, [archiveTab]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => items.some((i) => i.id === id));
      return next.length === current.length ? current : next;
    });
  }, [remote.data]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || purgeTarget) return;
      if (selectedIds.length) setSelectedIds([]);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, purgeTarget, selectedIds.length]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const toggleEdit = () => {
    if (isEditing) {
      setEditName(user?.full_name || '');
      setEditPhone(user?.phone || user?.contact_number || '');
    }
    setProfileMsg('');
    setProfileErr('');
    setIsEditing((v) => !v);
  };

  const onAvatarPick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileErr('Please choose an image file.');
      return;
    }
    setProfileErr('');
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveProfile = async () => {
    setSaving(true);
    setProfileMsg('');
    setProfileErr('');
    try {
      const payload = { full_name: editName.trim(), phone: editPhone.trim() };
      const updated = await api.patch('/me', payload);
      if (typeof updateUser === 'function') updateUser(updated.data || { ...user, ...payload });
      setProfileMsg('Profile updated.');
      setIsEditing(false);
    } catch (err) {
      setProfileErr(firstValidationMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const restore = async (item) => {
    setRestoringId(item.id);
    setActionError('');
    setSuccess('');
    try {
      await api.post(`/archive/${archiveTab}/${item.id}/restore`);
      setSuccess(`${item.label} restored.`);
      await remote.reload();
    } catch (err) {
      setActionError(firstValidationMessage(err));
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
    } catch (err) {
      setActionError(`Restored ${restored} of ${selectedItems.length}. ${firstValidationMessage(err)}`);
    }
    setSelectedIds([]);
    setBulkBusy(false);
    await remote.reload();
  };

  const handleItemClick = (event, item) => {
    if (!selectable) return;
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((c) => (c.includes(item.id) ? c.filter((id) => id !== item.id) : [...c, item.id]));
      return;
    }
    if (event.shiftKey && selectedIds.length) {
      const anchor = items.findIndex((e) => e.id === selectedIds[0]);
      const target = items.findIndex((e) => e.id === item.id);
      if (anchor >= 0 && target >= 0) {
        const [from, to] = anchor < target ? [anchor, target] : [target, anchor];
        const range = items.slice(from, to + 1).map((e) => e.id).filter((id) => id !== selectedIds[0]);
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
    } catch (err) {
      setPurgeError(firstValidationMessage(err));
    } finally {
      setPurging(false);
    }
  };

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

  // RENDER USING PORTAL TO ESCAPE THE HEADER
  return createPortal(
    <div
      className="po-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !purgeTarget) onClose(); }}
    >
      <div className="po-modal" role="dialog" aria-modal="true" aria-labelledby="po-title">
        <div className="po-header">
          <div>
            <h2 id="po-title">Profile Overview</h2>
            <p>View and manage your account information and credentials.</p>
          </div>
          <button type="button" className="po-close" onClick={onClose} aria-label="Close">
            <FaXmark />
          </button>
        </div>

        <div className="po-body">
          <aside className="po-sidebar">
            <div className="po-avatar">
              {avatarPreview ? <img src={avatarPreview} alt="" /> : <FaUser aria-hidden="true" />}
              <button
                type="button"
                className="po-avatar-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Change photo"
                aria-label="Change photo"
              >
                <FaCamera />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onAvatarPick} />
            </div>

            <h3 className="po-name">{user?.full_name || 'User'}</h3>
            <span className="po-role">{roleLabel}</span>
            {isAdmin && (
              <span className="po-badge"><FaStar /> Super Administrator</span>
            )}

            <nav className="po-nav">
              <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
                <FaUser /> Profile Overview
              </button>
              {isAdmin && (
                <button type="button" className={tab === 'archive' ? 'active' : ''} onClick={() => setTab('archive')}>
                  <FaBoxArchive /> Admin Archive
                </button>
              )}
            </nav>

            <div className="po-meta">
              <div>
                <label>Member since</label>
                <span>{user?.created_at ? formatDate(user.created_at) : '—'}</span>
              </div>
              <div>
                <label>Last login</label>
                <span>{user?.last_login_at ? formatDate(user.last_login_at, true) : '—'}</span>
              </div>
            </div>
          </aside>

          <section className="po-content">
            {tab === 'overview' && (
              <>
                <div className="po-card">
                  <div className="po-card-head">
                    <h3>Account Information</h3>
                    <button type="button" className="po-outline-btn" onClick={toggleEdit}>
                      <FaPenToSquare /> {isEditing ? 'Cancel' : 'Edit Profile'}
                    </button>
                  </div>

                  <div className="po-grid">
                    <div className="po-field">
                      <label>Full Name</label>
                      {isEditing
                        ? <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        : <span>{user?.full_name || '—'}</span>}
                    </div>
                    <div className="po-field">
                      <label>Role / Designation</label>
                      <span>{roleLabel}</span>
                    </div>
                    <div className="po-field">
                      <label>Email Address</label>
                      <span className="po-link">{user?.email || '—'}</span>
                    </div>
                    <div className="po-field">
                      <label>Department</label>
                      <span>{user?.department || (isAdmin ? 'Administration' : 'Operations')}</span>
                    </div>
                    <div className="po-field">
                      <label>Contact Number</label>
                      {isEditing
                        ? <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                        : <span>{user?.phone || user?.contact_number || '—'}</span>}
                    </div>
                    <div className="po-field">
                      <label>Employee ID</label>
                      <span>{employeeId}</span>
                    </div>
                  </div>

                  {(profileMsg || profileErr) && (
                    <div className="po-notice">
                      <Notice type={profileMsg ? 'success' : 'error'}>{profileMsg || profileErr}</Notice>
                    </div>
                  )}

                  {isEditing && (
                    <div className="po-actions">
                      <button type="button" className="primary-button" disabled={saving} onClick={saveProfile}>
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="po-card">
                  <div className="po-card-head">
                    <h3>Module Privileges</h3>
                    {privileges.length > 2 && (
                      <button type="button" className="po-text-btn" onClick={() => setShowAllPrivileges((v) => !v)}>
                        {showAllPrivileges ? 'Show Less' : 'View All'}
                      </button>
                    )}
                  </div>
                  <p className="po-note">System access and module permissions assigned to your account.</p>
                  <div className="po-privileges">
                    {visiblePrivileges.map(({ icon: Icon, title, detail }) => (
                      <div className="po-privilege" key={title}>
                        <span className="po-priv-icon"><Icon /></span>
                        <div>
                          <strong>{title}</strong>
                          <span>{detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'archive' && isAdmin && (
              <div className="po-card">
                <div className="po-card-head">
                  <h3>Admin Archive</h3>
                </div>
                <p className="po-note">
                  Archived users, inquiries, and applicants. Restore anything that should return to the active workspace.
                </p>

                {success && <Notice type="success">{success}</Notice>}
                {actionError && <Notice type="error">{actionError}</Notice>}

                <div className="tabs" role="tablist" aria-label="Archive sections">
                  {ARCHIVE_SECTIONS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      role="tab"
                      aria-selected={archiveTab === s.key}
                      className={`tab${archiveTab === s.key ? ' active' : ''}`}
                      onClick={() => setArchiveTab(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {remote.loading ? (
                  <LoadingState label="Loading archive…" />
                ) : remote.error ? (
                  <Notice type="error">{remote.error}</Notice>
                ) : (
                  <>
                    {!items.length ? (
                      <EmptyState
                        label={`No archived ${archiveTab}.`}
                        detail="Archived records will appear here and can be restored at any time."
                      />
                    ) : (
                      <div className={selectable ? 'archive-selectable' : undefined}>
                        {items.map((item) => (
                          <div
                            className={`archive-item${selectedIds.includes(item.id) ? ' is-picked' : ''}`}
                            key={item.id}
                            onClick={(e) => handleItemClick(e, item)}
                          >
                            <span className="archive-item-copy">
                              <strong>{item.label}</strong>
                              <small>
                                {item.detail || '—'}
                                {item.badge ? ` · ${item.badge}` : ''}
                              </small>
                            </span>
                            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                              <small className="muted-note">
                                {item.archived_at ? formatDate(item.archived_at, true) : ''}
                                {item.archived_by ? ` · ${item.archived_by}` : ''}
                              </small>
                              {renderActions(item)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {purgeTarget && (
        <Modal
          title="Permanently delete this inquiry?"
          onClose={() => setPurgeTarget(null)}
          size="small"
          footer={
            <>
              <button onClick={() => setPurgeTarget(null)} disabled={purging}>Cancel</button>
              <button className="danger-button" onClick={confirmPurge} disabled={purging || !reasonOk}>
                {purging ? 'Deleting…' : 'Confirm delete'}
              </button>
            </>
          }
        >
          <Notice type="error">{purgeError}</Notice>
          <div className="confirmation-copy">
            <span className="confirmation-icon confirmation-accent"><FaTrashCan /></span>
            <div>
              <strong>{purgeTarget.label}</strong>
              <p>This removes the record from the database and cannot be undone.</p>
            </div>
          </div>
          <label className="purge-reason">
            <span>Reason for deletion <em>(required, at least 5 characters)</em></span>
            <textarea
              value={purgeReason}
              onChange={(e) => setPurgeReason(e.target.value)}
              placeholder="e.g. Duplicate record"
              autoFocus
            />
          </label>
        </Modal>
      )}
    </div>,
    document.body
  );
}