(() => {
  'use strict';
  const tokenKey = 'herald_api_token';
  let baseline = null;
  let pendingReload = false;
  let running = false;
  let navigationRole = '';
  let resolvingRole = false;

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

  function ensureBranchNavigation() {
    if (!['admin', 'logistics'].includes(navigationRole) || document.querySelector('.herald-branches-link, a[href="/branch-management"], a[href$="/branches"]')) return;
    const operationsGroup = [...document.querySelectorAll('.nav-group')].find((group) => group.querySelector('.nav-group-label')?.textContent?.trim() === 'Operations');
    if (!operationsGroup) return;
    const link = document.createElement('a');
    link.href = '/branch-management';
    link.className = 'side-link herald-branches-link';
    link.title = 'Branches';
    link.innerHTML = '<span class="side-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M4 3h16a1 1 0 0 1 1 1v4a3 3 0 0 1-2 2.83V20h1a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2h1v-9.17A3 3 0 0 1 3 8V4a1 1 0 0 1 1-1Zm3 8v9h3v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5h3v-9a3.1 3.1 0 0 1-1.5-.55A3.1 3.1 0 0 1 14 11a3.1 3.1 0 0 1-2-.78A3.1 3.1 0 0 1 10 11a3.1 3.1 0 0 1-1.5-.55A3.1 3.1 0 0 1 7 11ZM5 5v3a1 1 0 0 0 2 0V5H5Zm4 0v3a1 1 0 0 0 2 0V5H9Zm4 0v3a1 1 0 0 0 2 0V5h-2Zm4 0v3a1 1 0 0 0 2 0V5h-2Z"/></svg></span><span class="side-link-copy"><strong>Branches</strong><small>Branch command panel</small></span>';
    const firstInventoryLink = operationsGroup.querySelector('a[href$="/inventory"]');
    if (firstInventoryLink) {
      const label = firstInventoryLink.querySelector('.side-link-copy strong');
      const description = firstInventoryLink.querySelector('.side-link-copy small');
      if (label) label.textContent = 'Warehouse inventory';
      if (description) description.textContent = 'Central stock visibility';
    }
    operationsGroup.insertBefore(link, firstInventoryLink || operationsGroup.querySelector('a'));
  }

  async function resolveNavigationRole() {
    const token = getToken();
    if (!token || navigationRole || resolvingRole) return;
    resolvingRole = true;
    try {
      const response = await fetch('/api/v1/auth/me', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      navigationRole = payload.data?.role?.name || '';
      ensureBranchNavigation();
    } catch (_) {
      // Navigation remains usable without the optional branch shortcut.
    } finally {
      resolvingRole = false;
    }
  }

  function updateInventoryHeading() {
    if (!['admin', 'logistics'].includes(navigationRole) || !window.location.pathname.endsWith('/inventory')) return;
    const heading = document.querySelector('.page-heading');
    const title = heading?.querySelector('h1');
    const subtitle = heading?.querySelector('p');
    if (title) title.textContent = 'Warehouse inventory';
    if (subtitle) subtitle.textContent = 'Central warehouse stock is managed here. Branch stock and deductions are organized in the separate Branches panel.';
  }

  async function check() {
    resolveNavigationRole();
    ensureBranchNavigation();
    updateInventoryHeading();
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

  const observer = new MutationObserver(() => { ensureBranchNavigation(); updateInventoryHeading(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(check, 2500);
  window.addEventListener('focus', check);
  window.addEventListener('popstate', () => { baseline = null; pendingReload = false; });
  check();
})();
