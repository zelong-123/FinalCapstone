import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FaAngleLeft,
  FaAngleRight,
  FaBoxesStacked,
  FaCalendarDays,
  FaChartLine,
  FaClipboardList,
  FaHandshake,
  FaRightFromBracket,
  FaTableColumns,
  FaStore,
  FaUserShield,
  FaUsers,
  FaGear,
} from 'react-icons/fa6';
import AppIconImg from '../../../assets/icon.png.png';
import { useAuth } from '../../../context/AuthContext';
import { titleCase } from '../../../lib/format';
import { Modal } from '../../ApiUi';

const item = (label, path, Icon, description) => ({ label, path, Icon, description });

const navigation = {
  admin: [
    { label: 'Overview', items: [
      item('Executive dashboard', '/admin-dashboard', FaTableColumns, 'Organization health'),
    ] },
    { label: 'Inquiry', items: [
      item('Inquiries', '/inquiries', FaHandshake, 'Lead pipeline'),
      item('Applicants', '/applicants', FaUsers, 'Franchise candidates'),
      item('Activities', '/activities', FaCalendarDays, 'Events and schedules'),
    ] },
    { label: 'Operations', items: [
      item('Branches', '/branches', FaStore, 'Branch command panel'),
      item('Warehouse inventory', '/inventory', FaBoxesStacked, 'Central stock visibility'),
      item('Supply requests', '/supply-requests', FaClipboardList, 'Fulfillment workflow'),
      item('Users', '/users', FaUserShield, 'Access control'),
      item('Admin settings', '/admin-settings', FaGear, 'Archive and restore'),
    ] },
    { label: 'Intelligence', items: [item('Analytics', '/analytics', FaChartLine, 'Performance insights')] },
  ],
  marketing: [
    { label: 'Overview', items: [
      item('Marketing dashboard', '/marketing-dashboard', FaTableColumns, 'Acquisition health'),
    ] },
    { label: 'Growth', items: [item('Inquiries', '/inquiries', FaHandshake, 'Lead pipeline')] },
    { label: 'Intelligence', items: [item('Analytics', '/analytics', FaChartLine, 'Conversion insights')] },
  ],
  sales: [
    { label: 'Overview', items: [
      item('Sales dashboard', '/sales-dashboard', FaTableColumns, 'Pipeline health'),
    ] },
    { label: 'Pipeline', items: [
      item('Inquiries', '/inquiries', FaHandshake, 'Qualified leads'),
      item('Applicants', '/applicants', FaUsers, 'Candidate progress'),
      item('Activities', '/activities', FaCalendarDays, 'Scheduled touchpoints'),
    ] },
    { label: 'Operations', items: [item('Supply requests', '/supply-requests', FaClipboardList, 'Order visibility')] },
    { label: 'Intelligence', items: [item('Analytics', '/analytics', FaChartLine, 'Sales insights')] },
  ],
  logistics: [
    { label: 'Overview', items: [
      item('Logistics dashboard', '/logistics-dashboard', FaTableColumns, 'Fulfillment health'),
    ] },
    { label: 'Operations', items: [
      item('Branches', '/branches', FaStore, 'Branch command panel'),
      item('Warehouse inventory', '/inventory', FaBoxesStacked, 'Central stock visibility'),
      item('Supply requests', '/supply-requests', FaClipboardList, 'Fulfillment workflow'),
    ] },
    { label: 'Intelligence', items: [item('Analytics & forecasts', '/analytics', FaChartLine, 'Demand planning')] },
  ],
  franchisee: [
    { label: 'Overview', items: [
      item('Franchise dashboard', '/franchisee-dashboard', FaTableColumns, 'Your operation'),
    ] },
    { label: 'My journey', items: [
      item('My application', '/applicants', FaUsers, 'Application progress'),
      item('My activities', '/activities', FaCalendarDays, 'Upcoming events'),
    ] },
    { label: 'My operations', items: [
      item('My inventory', '/inventory', FaBoxesStacked, 'Stock visibility'),
      item('Supply requests', '/supply-requests', FaClipboardList, 'Restock workflow'),
    ] },
  ],
};

export default function Sidebar({ isCollapsed, setIsCollapsed, onNavigate }) {
  const { role, logout } = useAuth();
  const navigate = useNavigate();
  const groups = navigation[role] || [];
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setConfirmLogout(false);
    setLoggingOut(true);
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <>
      <aside className="herald-sidebar" aria-label="Primary navigation">
        <div className="brand-zone">
          <span className="brand-mark"><img src={AppIconImg} alt="" /></span>
          <div><strong>FRANCHISE TITAN</strong><span>Global franchise operations</span></div>
        </div>

        <div className="role-chip"><span className="role-dot" />{titleCase(role || 'user')} workspace</div>

        <nav className="side-nav">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map(({ label, path, Icon, description }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={onNavigate}
                  className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}
                  title={isCollapsed ? label : undefined}
                >
                  <span className="side-link-icon"><Icon aria-hidden="true" /></span>
                  <span className="side-link-copy"><strong>{label}</strong><small>{description}</small></span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-security">
            <span className="security-dot" />
            <span><strong>Secure session</strong><small>Encrypted API access</small></span>
          </div>
          <button
            type="button"
            className="side-link logout-link"
            onClick={() => setConfirmLogout(true)}
            title={isCollapsed ? 'Log out' : undefined}
          >
            <span className="side-link-icon"><FaRightFromBracket aria-hidden="true" /></span>
            <span className="side-link-copy"><strong>Log out</strong><small>End this session</small></span>
          </button>
        </div>

        <button
          type="button"
          className="collapse-button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {isCollapsed ? <FaAngleRight /> : <FaAngleLeft />}
        </button>
      </aside>

      {confirmLogout && (
        <Modal
          title="End your Herald session?"
          onClose={() => setConfirmLogout(false)}
          size="small"
          footer={(
            <>
              <button type="button" onClick={() => setConfirmLogout(false)}>Stay signed in</button>
              <button type="button" className="danger-button" onClick={handleLogout}>Log out securely</button>
            </>
          )}
        >
          <div className="confirmation-copy">
            <span className="confirmation-icon"><FaRightFromBracket /></span>
            <div><strong>You will return to the sign-in screen.</strong><p>Any saved server data remains safe. Unsaved form entries in this browser will be cleared.</p></div>
          </div>
        </Modal>
      )}

      {loggingOut && (
        <div className="logout-overlay" role="status" aria-live="polite">
          <div className="logout-card"><span className="spinner" /><strong>Signing out securely…</strong><small>Closing your authenticated session</small></div>
        </div>
      )}
    </>
  );
}
