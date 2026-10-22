(() => {
  'use strict';
  const tokenKey = 'herald_api_token';
  let baseline = null;
  let pendingReload = false;
  let running = false;

  const getToken = () => sessionStorage.getItem(tokenKey) || localStorage.getItem(tokenKey);
  const currentArea = () => {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path.endsWith('/inventory')) return 'inventory';
    if (path.endsWith('/supply-requests')) return 'supply';
    return '';
  };

  const showBadge = () => {
    if (document.getElementById('herald-live-update')) return;
    const badge = document.createElement('div');
    badge.id = 'herald-live-update';
    badge.textContent = 'New shared data received · refreshing';
    Object.assign(badge.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '99999',
      padding: '11px 14px', borderRadius: '999px', background: '#147a4a',
      color: '#fff', font: '700 13px system-ui, sans-serif', boxShadow: '0 12px 30px rgba(0,0,0,.22)'
    });
    document.body.appendChild(badge);
  };

  async function check() {
    const area = currentArea();
    const token = getToken();
    if (!area || !token || running || document.visibilityState !== 'visible') return;
    running = true;
    try {
      const response = await fetch('/api/v1/sync-status', {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload = await response.json();
      const current = payload.data || {};
      if (baseline) {
        const changed = area === 'inventory'
          ? Number(current.inventory_version || 0) !== Number(baseline.inventory_version || 0)
          : String(current.supply_request_version || '') !== String(baseline.supply_request_version || '');
        if (changed) pendingReload = true;
      }
      baseline = current;

      if (pendingReload && !document.querySelector('[role="dialog"], .modal-backdrop, .modal-overlay')) {
        showBadge();
        window.setTimeout(() => window.location.reload(), 350);
      }
    } catch (_) {
      // The normal Herald API client will show server errors when the user performs an action.
    } finally {
      running = false;
    }
  }

  window.setInterval(check, 2500);
  window.addEventListener('focus', check);
  window.addEventListener('popstate', () => { baseline = null; pendingReload = false; });
  check();
})();
