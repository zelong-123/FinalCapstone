(() => {
  'use strict';
  const token = sessionStorage.getItem('herald_api_token') || localStorage.getItem('herald_api_token');
  const state = { branches: [], selected: '', loading: false };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const number = (value) => new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(Math.round(Number(value || 0)));
  const date = (value) => value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
  const title = (value) => String(value || '').replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase());

  async function api(path) {
    const response = await fetch(`/api/v1${path}`, { headers: { Accept:'application/json', Authorization:`Bearer ${token}` }, cache:'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status}).`);
    return payload.data;
  }

  function showError(message) {
    const notice = $('#notice');
    notice.textContent = message;
    notice.hidden = false;
  }

  function metric(label, value) { return `<article class="metric"><span>${label}</span><strong>${number(value)}</strong></article>`; }
  function risk(branch) { return branch.critical_stock_count > 0 ? 'critical' : branch.low_stock_count > 0 ? 'low' : 'normal'; }

  function renderCards() {
    $('#branch-cards').innerHTML = state.branches.map((branch) => `
      <button type="button" class="branch-card${branch.branch_code === state.selected ? ' active' : ''}" data-code="${escapeHtml(branch.branch_code)}">
        <span class="branch-card-top"><span class="branch-code">${escapeHtml(branch.branch_code)}</span><span class="badge ${risk(branch)}">${title(risk(branch))}</span></span>
        <strong>${escapeHtml(branch.name)}</strong><small>${escapeHtml(branch.address || 'Address not provided')}</small>
        <span class="card-stats"><span><b>${number(branch.total_units)}</b>units</span><span><b>${number(branch.open_request_count)}</b>requests</span></span>
      </button>`).join('');
  }

  function renderWorkspace() {
    const branch = state.branches.find((item) => item.branch_code === state.selected) || state.branches[0];
    if (!branch) { $('#workspace').innerHTML = ''; return; }
    const inventory = branch.inventory?.length ? branch.inventory.map((item) => `
      <article class="stock-card ${escapeHtml(item.stock_status)}">
        <div class="stock-title"><div><strong>${escapeHtml(item.product?.name || 'Item')}</strong><small>${escapeHtml(item.product?.sku || '')}</small></div><span class="badge ${escapeHtml(item.stock_status)}">${title(item.stock_status)}</span></div>
        <div class="stock-balance"><strong>${number(item.current_stock)}</strong><span>${escapeHtml(item.product?.unit || 'units')} on hand</span></div>
        <div class="thresholds"><span>Reorder<b>${number(item.reorder_level)}</b></span><span>Critical<b>${number(item.critical_level)}</b></span></div>
      </article>`).join('') : '<div class="empty">No branch stock configured.</div>';
    const deductions = branch.recent_deductions?.length ? branch.recent_deductions.map((sale) => `
      <article class="activity"><div class="activity-top"><strong>${escapeHtml(sale.sale_number)}</strong><span>−${number(sale.total_quantity)}</span></div><p>${(sale.items || []).map((item)=>`${escapeHtml(item.product?.name || 'Item')} × ${number(item.quantity)}`).join(', ')}</p><small>${escapeHtml(sale.recorded_by?.full_name || 'Branch operator')} · ${date(sale.created_at)}</small></article>`).join('') : '<div class="empty">No deductions recorded yet.</div>';
    $('#workspace').innerHTML = `
      <header class="workspace-head"><div><span class="eyebrow">${escapeHtml(branch.branch_code)}</span><h2>${escapeHtml(branch.name)}</h2><p>${escapeHtml(branch.address || '')}${branch.operator?.full_name ? ` · Operator: ${escapeHtml(branch.operator.full_name)}` : ''}</p></div><a class="button" href="${escapeHtml(branch.portal_path)}" target="_blank" rel="noreferrer">Open branch portal</a></header>
      <div class="workspace-grid"><section class="panel"><div class="panel-head"><strong>Branch stock</strong><small>Separate from warehouse</small></div><div class="stock-grid">${inventory}</div></section><aside class="panel"><div class="panel-head"><strong>Recent deductions</strong><small>Live audit trail</small></div><div class="activity-list">${deductions}</div></aside></div>`;
  }

  function render(data) {
    state.branches = data.branches || [];
    if (!state.selected || !state.branches.some((branch) => branch.branch_code === state.selected)) state.selected = state.branches[0]?.branch_code || '';
    const summary = data.summary || {};
    $('#metrics').innerHTML = [metric('Active branches',summary.active_branches),metric('Branch units',summary.total_units),metric('Low-stock items',summary.low_stock_items),metric('Critical items',summary.critical_stock_items),metric('Open requests',summary.open_requests)].join('');
    renderCards();
    renderWorkspace();
    $('#loading').hidden = true;
    $('#content').hidden = false;
  }

  async function load(silent = false) {
    if (state.loading) return;
    if (!token) { $('#loading').textContent = 'Your Herald session is not available. Sign in to the main Herald site first.'; showError('Open the main Herald site, sign in as Admin or Logistics, then return to this panel.'); return; }
    state.loading = true;
    if (!silent) $('#refresh-button').disabled = true;
    try {
      const [me, overview] = await Promise.all([api('/auth/me'), api('/branches/overview')]);
      const role = me?.role?.name;
      $('#back-link').href = role === 'logistics' ? '/app/logistics-dashboard' : '/app/admin-dashboard';
      render(overview);
      $('#notice').hidden = true;
      $('#sync-pill').classList.remove('offline');
      $('#sync-pill').textContent = 'Live sync';
    } catch (error) {
      showError(error.message);
      $('#sync-pill').classList.add('offline');
      $('#sync-pill').textContent = 'Sync error';
    } finally {
      state.loading = false;
      $('#refresh-button').disabled = false;
    }
  }

  $('#branch-cards').addEventListener('click',(event)=>{ const card=event.target.closest('.branch-card'); if(!card)return; state.selected=card.dataset.code; renderCards(); renderWorkspace(); });
  $('#refresh-button').addEventListener('click',()=>load(false));
  window.addEventListener('online',()=>load(true));
  window.addEventListener('offline',()=>{ $('#sync-pill').classList.add('offline'); $('#sync-pill').textContent='Offline'; });
  window.setInterval(()=>{ if(document.visibilityState==='visible' && navigator.onLine) load(true); },3000);
  load(false);
})();
