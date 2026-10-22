import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBars,
  FaBell,
  FaCheck,
  FaCommentDots,
  FaMoon,
  FaSun,
  FaWifi,
} from 'react-icons/fa6';
import { useLocation } from 'react-router-dom';
import { api, firstValidationMessage } from '../../../lib/api';
import { formatDate, titleCase } from '../../../lib/format';
import { getRouteTitle } from '../../../lib/routes';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { useTheme } from '../../../context/ThemeContext';

function initials(name = 'User') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

export default function Header({ onMenu, mobileOpen }) {
  const { user, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { unreadTotal, toggleMessenger } = useChat();
  const location = useLocation();
  const notificationRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('checking');
  const [routeTitle, routeSubtitle] = getRouteTitle(location.pathname);

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

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (open && notificationRef.current && !notificationRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const unread = useMemo(() => notifications.filter((item) => !item.read_at).length, [notifications]);

  const toggleNotifications = async () => {
    const next = !open;
    setOpen(next);
    if (next) await loadNotifications();
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
                <div><strong>Notifications</strong><span>{unread ? `${unread} unread` : 'You are all caught up'}</span></div>
                <button type="button" onClick={markAllRead} disabled={!unread}><FaCheck /> Mark all read</button>
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

        <div className="current-user" title={`${user?.full_name || 'User'} · ${titleCase(role)}`}>
          <span className="user-avatar" aria-hidden="true">{initials(user?.full_name)}</span>
          <div><strong>{user?.full_name || 'User'}</strong><span>{titleCase(role)} workspace</span></div>
        </div>
      </div>
    </header>
  );
}
