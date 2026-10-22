import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/ADMIN/HeaderAndNav/Sidebar';
import Header from '../components/ADMIN/HeaderAndNav/Header';
import MessengerWidget from '../components/Messenger/MessengerWidget';
import { getRouteTitle } from '../lib/routes';

const SIDEBAR_KEY = 'herald_sidebar_collapsed';

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const updateCollapsed = (value) => {
    setCollapsed(value);
    localStorage.setItem(SIDEBAR_KEY, value ? '1' : '0');
  };

  useEffect(() => {
    const [title] = getRouteTitle(location.pathname);
    document.title = `${title} · Franchise Titan`;
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [location.pathname]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth > 860) setMobileOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('navigation-open', mobileOpen);
    return () => document.body.classList.remove('navigation-open');
  }, [mobileOpen]);

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' mobile-sidebar-open' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Sidebar
        isCollapsed={collapsed}
        setIsCollapsed={updateCollapsed}
        onNavigate={() => setMobileOpen(false)}
      />
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close navigation"
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Header onMenu={() => setMobileOpen((value) => !value)} mobileOpen={mobileOpen} />
        <main id="main-content" className="route-content" tabIndex="-1">
          <div key={location.pathname} className="route-transition"><Outlet /></div>
        </main>
      </div>
      <MessengerWidget />
    </div>
  );
}
