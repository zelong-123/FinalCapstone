import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBars,
  FaBell,
  FaCheck,
  FaCommentDots,
  FaMoon,
  FaSun,
  FaWifi,
  FaBoxArchive,
  FaRotateLeft,
  FaTrashCan,
  FaXmark,
  FaCamera,
  FaUser,
  FaPenToSquare,
  FaGear,
  FaUsers,
} from 'react-icons/fa6';
import { useLocation } from 'react-router-dom';
import { api, firstValidationMessage } from '../../../lib/api';
import { formatDate, titleCase } from '../../../lib/format';
import { getRouteTitle } from '../../../lib/routes';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { useTheme } from '../../../context/ThemeContext';
import useRemote from '../../../lib/useRemote';
import { EmptyState, LoadingState, Modal, Notice } from '../../ApiUi';

function initials(name = 'User') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

const ARCHIVE_SECTIONS = [
  { key: 'users', label: 'Users', heading: 'Archived users' },
  { key: 'inquiries', label: 'Inquiries', heading: 'Archived inquiries' },
  { key: 'applicants', label: 'Applicants', heading: 'Archived applicants' },
];

export default function Header({ onMenu, mobileOpen }) {
  const { user, role, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { unreadTotal, toggleMessenger } = useChat();
  const location = useLocation();
  const notificationRef = useRef(null);
  const fileInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState('overview'); // 'overview' or 'archive'
  const [isEditing, setIsEditing] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('checking');
  const [routeTitle, routeSubtitle] = getRouteTitle(location.pathname);

  // Profile edit
  const [editName, setEditName] = useState(user?.full_name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || user?.contact_number || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Archive (admin only)
  const isAdmin = role === 'admin';
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
  const section = data[archiveTab] || { items: [] };
  const items = section.items || [];
  const selectable = archiveTab === 'inquiries';
  const selectedItems = selectedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  const reasonOk = purgeReason.trim().length >= 5;

  useEffect(() => {
    setEditName(user?.full_name || '');
    setEditPhone(user?.phone || user?.contact_number || '');
    setAvatarPreview(user?.avatar_url || null);
  }, [user]);

  useEffect(() => { setSelectedIds([]); }, [archiveTab]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => items.some((item) => item.id === id));
      return next.length === current.length ? current : next;
    });
  }, [remote.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (purgeTarget) return;
        setProfileOpen(false);
        setOpen(false);
        if (selectedIds.length) setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds.length, purgeTarget]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (open && notificationRef.current && !notificationRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Notifications
  const loadNotifications = async () => {
    setNotificationLoading(true);
    try {
      const response = await api.get('/notifications', { per_page: 10 });
      setNotifications(response.data || []);
      setError('');
    } catch (requestError) {
      setError(firstValidationMessage(requestError));
    } finally {
      setNotificationLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadNotifications(); }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        await api.get('/health', undefined, { skipAuth: true, timeout: 8000 });
        if (mounted) setSystemStatus('online');
      } catch {
        if (mounted) setSystemStatus('offline');
      }
    };
    void checkHealth();
    const interval = window.setInterval(checkHealth, 60000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const unread = useMemo(() => notifications.filter((item) => !item.read_at).length, [notifications]);

  const toggleNotifications = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setProfileOpen(false);
      await loadNotifications();
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all', {});
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
      setError('');
    } catch (requestError) {
      setError(firstValidationMessage(requestError));
    }
  };

  const markRead = async (item) => {
    if (item.read_at) return;
    try {
      await api.patch(`/notifications/${item.id}/read`, {});
      setNotifications((items) => items.map((row) => (
        row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row
      )));
    } catch (requestError) {
      setError(firstValidationMessage(requestError));
    }
  };

  // Profile
  const toggleProfile = () => {
    setProfileOpen((v) => !v);
    setOpen(false);
    setIsEditing(false); // reset edit mode on open
    setActiveProfileTab('overview'); // reset to first tab
  };

  const onAvatarPick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileErr('Please choose an image file.');
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg('');
    setProfileErr('');
    try {
      const payload = {
        full_name: editName.trim(),
        phone: editPhone.trim(),
      };
      const updated = await api.patch('/me', payload);
      if (typeof updateUser === 'function') {
        updateUser(updated.data || { ...user, ...payload });
      }
      setProfileMsg('Profile updated.');
      setIsEditing(false);
    } catch (err) {
      setProfileErr(firstValidationMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  // Archive actions
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

  return (
    <header className="herald-header">
      <div className="header-left">
        <button
          type="button"
          className="mobile-menu header-icon-button"
          onClick={onMenu}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          <FaBars />
        </button>
        <div className="header-title">
          <strong>{routeTitle}</strong>
          <span>{routeSubtitle}</span>
        </div>
      </div>

      <div className="header-right">
        <div className={`system-health system-${systemStatus}`} title={`API status: ${systemStatus}`}>
          <FaWifi aria-hidden="true" />
          <span>{systemStatus === 'checking' ? 'Checking' : systemStatus === 'online' ? 'Live' : 'Offline'}</span>
        </div>

        <button
          type="button"
          className="header-icon-button theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <FaSun /> : <FaMoon />}
        </button>

        <button
          type="button"
          className="header-icon-button"
          onClick={toggleMessenger}
          aria-label={`Live Messenger${unreadTotal ? `, ${unreadTotal} unread` : ''}`}
          title="Live Department Messenger"
        >
          <FaCommentDots />
          {unreadTotal > 0 && <span className="notification-count">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
        </button>

        <div className="notification-wrap" ref={notificationRef}>
          <button
            type="button"
            className="header-icon-button"
            onClick={toggleNotifications}
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            aria-expanded={open}
          >
            <FaBell />
            {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
          </button>

          {open && (
            <section className="notification-popover" aria-label="Notifications">
              <div className="notification-head">
                <div>
                  <strong>Notifications</strong>
                  <span>{unread ? `${unread} unread` : 'You are all caught up'}</span>
                </div>
                <button type="button" onClick={markAllRead} disabled={!unread}>
                  <FaCheck /> Mark all read
                </button>
              </div>
              {error && <p className="notification-error">{error}</p>}
              {notificationLoading && notifications.length === 0 ? (
                <div className="notification-empty"><span className="spinner" /> Loading updates…</div>
              ) : notifications.length === 0 ? (
                <p className="notification-empty">No notifications yet.</p>
              ) : notifications.map((item) => (
                <button
                  type="button"
                  className={`notification-item${item.read_at ? '' : ' unread'}`}
                  key={item.id}
                  onClick={() => markRead(item)}
                >
                  <span className="notification-dot" aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <p>{item.message}</p>
                    <small>{formatDate(item.created_at, true)}</small>
                  </span>
                </button>
              ))}
            </section>
          )}
        </div>

        {/* Current User → Profile Modal */}
        <div className="current-user-wrap">
          <button
            type="button"
            className="current-user"
            onClick={toggleProfile}
            aria-expanded={profileOpen}
            aria-label="Open user profile"
            title={`${user?.full_name || 'User'} · ${titleCase(role)}`}
          >
            <span className="user-avatar" aria-hidden="true">
              {avatarPreview
                ? <img src={avatarPreview} alt="" className="user-avatar-img" />
                : initials(user?.full_name)}
            </span>
            <div>
              <strong>{user?.full_name || 'User'}</strong>
              <span>{titleCase(role)} workspace</span>
            </div>
          </button>

          {profileOpen && (
            <div className="profile-modal-overlay">
              <div className="profile-modal" role="dialog" aria-modal="true">
                
                {/* Modal Header */}
                <div className="profile-modal-header">
                  <div>
                    <h2>Profile Overview</h2>
                    <p>View and manage your account information and credentials.</p>
                  </div>
                  <button type="button" className="profile-close-btn" onClick={() => setProfileOpen(false)} aria-label="Close">
                    <FaXmark />
                  </button>
                </div>

                <div className="profile-modal-body">
                  {/* Left Sidebar */}
                  <div className="profile-sidebar">
                    <div className="profile-avatar-large">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="" />
                      ) : (
                        <span>{initials(user?.full_name)}</span>
                      )}
                      <button
                        type="button"
                        className="avatar-edit-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Change photo"
                      >
                        <FaCamera />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={onAvatarPick}
                      />
                    </div>
                    <h3 className="sidebar-user-name">{user?.full_name || 'User'}</h3>
                    <span className="sidebar-user-role">{titleCase(role)}</span>

                    <div className="profile-nav">
                      <button
                        className={activeProfileTab === 'overview' ? 'active' : ''}
                        onClick={() => setActiveProfileTab('overview')}
                      >
                        <FaUser /> Profile Overview
                      </button>
                      {isAdmin && (
                        <button
                          className={activeProfileTab === 'archive' ? 'active' : ''}
                          onClick={() => setActiveProfileTab('archive')}
                        >
                          <FaBoxArchive /> Admin Archive
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Content Area */}
                  <div className="profile-main-content">
                    
                    {activeProfileTab === 'overview' && (
                      <>
                        <div className="profile-card">
                          <div className="profile-card-header">
                            <h3>Account Information</h3>
                            <button 
                              type="button" 
                              className="outline-button"
                              onClick={() => setIsEditing(!isEditing)}
                            >
                              <FaPenToSquare /> {isEditing ? 'Cancel' : 'Edit Profile'}
                            </button>
                          </div>

                          <div className="profile-grid">
                            <div className="profile-field">
                              <label>FULL NAME</label>
                              {isEditing ? (
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                              ) : (
                                <span>{user?.full_name || '—'}</span>
                              )}
                            </div>
                            <div className="profile-field">
                              <label>ROLE / DESIGNATION</label>
                              <span>{titleCase(role)}</span>
                            </div>
                            <div className="profile-field">
                              <label>EMAIL ADDRESS</label>
                              <span>{user?.email || 'admin@gmail.com'}</span>
                            </div>
                            <div className="profile-field">
                              <label>DEPARTMENT</label>
                              <span>{role === 'admin' ? 'Administration' : 'Operations'}</span>
                            </div>
                            <div className="profile-field">
                              <label>CONTACT NUMBER</label>
                              {isEditing ? (
                                <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                              ) : (
                                <span>{user?.phone || user?.contact_number || '—'}</span>
                              )}
                            </div>
                            <div className="profile-field">
                              <label>EMPLOYEE ID</label>
                              <span>FT-{String(user?.id || 'ADMIN').padStart(4, '0')}</span>
                            </div>
                          </div>

                          {(profileMsg || profileErr) && (
                            <div className="profile-notice-wrap">
                              <Notice type={profileMsg ? 'success' : 'error'}>{profileMsg || profileErr}</Notice>
                            </div>
                          )}
                          
                          {isEditing && (
                            <div className="profile-edit-actions">
                              <button type="button" className="primary-button" disabled={savingProfile} onClick={saveProfile}>
                                {savingProfile ? 'Saving…' : 'Save Changes'}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Placeholder for Module Privileges (Matches Image) */}
                        <div className="profile-card">
                          <div className="profile-card-header">
                            <h3>Module Privileges</h3>
                          </div>
                          <p className="muted-note">System access and module permissions assigned to your account.</p>
                          <div className="privileges-grid">
                            <div className="privilege-item">
                              <div className="priv-icon"><FaGear /></div>
                              <div>
                                <strong>Full System Access</strong>
                                <span>All modules and features</span>
                              </div>
                            </div>
                            <div className="privilege-item">
                              <div className="priv-icon"><FaUsers /></div>
                              <div>
                                <strong>User & Role Management</strong>
                                <span>Manage users and permissions</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {activeProfileTab === 'archive' && isAdmin && (
                      <div className="profile-card archive-in-profile">
                        <div className="profile-card-header">
                          <h3>Admin Archive</h3>
                        </div>
                        <p className="muted-note">
                          Archived users, inquiries, and applicants. Restore anything that should return to the active workspace.
                        </p>

                        {success && <Notice type="success">{success}</Notice>}
                        {actionError && <Notice type="error">{actionError}</Notice>}

                        <div className="tabs" role="tablist" aria-label="Archive sections">
                          {ARCHIVE_SECTIONS.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              role="tab"
                              aria-selected={archiveTab === item.key}
                              className={`tab${archiveTab === item.key ? ' active' : ''}`}
                              onClick={() => setArchiveTab(item.key)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>

                        {remote.loading ? (
                          <LoadingState label="Loading archive…" />
                        ) : remote.error ? (
                          <Notice type="error">{remote.error}</Notice>
                        ) : (
                          <>
                            {selectable && items.length > 0 && (
                              <p className="muted-note archive-hint">
                                Hold Ctrl (⌘ on Mac) and click to select several inquiries to restore together, or Shift+click for a range.
                              </p>
                            )}

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
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
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
    </header>
  );
}