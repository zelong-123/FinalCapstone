(() => {
  'use strict';

  const body = document.body;
  const config = {
    branchCode: body.dataset.branchCode,
    branchName: body.dataset.branchName,
    branchEmail: body.dataset.branchEmail,
    apiBase: '/api/v1',
  };
  const tokenKey = `herald_branch_token_${config.branchCode}`;
  const state = {
    token: sessionStorage.getItem(tokenKey) || localStorage.getItem(tokenKey) || '',
    context: null,
    inventory: [],
    sales: [],
    requests: [],
    polling: false,
    mutating: false,
    pendingSaleReference: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const loginView = $('#login-view');
  const portalView = $('#portal-view');
  const loading = $('#loading-overlay');
  const toast = $('#toast');
  let toastTimer = 0;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const formatNumber = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value || 0));
  const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: value.includes?.('T') ? 'short' : undefined }).format(new Date(value)) : '—';
  const titleCase = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  function setBusy(isBusy) {
    loading.hidden = !isBusy;
  }

  function showToast(message, type = 'success') {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast show${type === 'error' ? ' error' : ''}`;
    toastTimer = window.setTimeout(() => { toast.className = 'toast'; }, 4200);
  }

  function firstError(payload, fallback) {
    const errors = payload?.errors || {};
    const first = Object.values(errors).flat()[0];
    return first || payload?.message || fallback;
  }

  async function api(path, { method = 'GET', body: requestBody, skipAuth = false } = {}) {
    const response = await fetch(`${config.apiBase}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(requestBody === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(!skipAuth && state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) logout(false);
      throw new Error(firstError(payload, `Request failed (${response.status}).`));
    }
    return payload;
  }

  function saveToken(token, persist) {
    sessionStorage.removeItem(tokenKey);
    localStorage.removeItem(tokenKey);
    (persist ? localStorage : sessionStorage).setItem(tokenKey, token);
    state.token = token;
  }

  async function logout(callServer = true) {
    try {
      if (callServer && state.token) await api('/auth/logout', { method: 'POST' });
    } catch (_) {
      // Local logout still completes when the server is unavailable.
    }
    sessionStorage.removeItem(tokenKey);
    localStorage.removeItem(tokenKey);
    state.token = '';
    state.context = null;
    loginView.hidden = false;
    portalView.hidden = true;
  }

  function updateOnlineState() {
    const pill = $('#sync-pill');
    const online = navigator.onLine;
    pill.classList.toggle('offline', !online);
    $('#sync-label').textContent = online ? 'Live sync' : 'Offline';
  }

  function renderInventory() {
    const tbody = $('#inventory-body');
    if (!state.inventory.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No inventory has been initialized for this branch.</td></tr>';
      return;
    }
    tbody.innerHTML = state.inventory.map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.product?.name || 'Item')}</strong><small>${escapeHtml(item.product?.sku || '')}</small></td>
        <td><span class="stock-number"><strong>${formatNumber(item.current_stock)}</strong></span><small>${escapeHtml(item.product?.unit || '')}</small></td>
        <td>${formatNumber(item.reorder_level)}</td>
        <td><span class="badge ${escapeHtml(item.stock_status)}">${escapeHtml(titleCase(item.stock_status))}</span></td>
        <td>${formatDate(item.updated_at)}</td>
        <td><input class="qty-input sale-qty" data-inventory-id="${item.id}" type="number" min="0" max="${Number(item.current_stock)}" step="0.01" value="0" aria-label="Quantity to deduct for ${escapeHtml(item.product?.name || 'item')}"></td>
      </tr>
    `).join('');
  }

  function renderRequestLines() {
    const products = state.context?.available_products || [];
    const container = $('#request-lines');
    if (!products.length) {
      container.innerHTML = '<div class="empty">No products are available for this branch brand.</div>';
      return;
    }
    container.innerHTML = products.map((product) => `
      <div class="request-line">
        <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(product.unit || 'unit')}</small></div>
        <input class="request-qty" data-product-id="${product.id}" type="number" min="0" step="0.01" value="0" aria-label="Request quantity for ${escapeHtml(product.name)}">
      </div>
    `).join('');
  }

  function renderSales() {
    const container = $('#sales-list');
    if (!state.sales.length) {
      container.innerHTML = '<div class="empty">No branch deductions have been recorded yet.</div>';
      return;
    }
    container.innerHTML = state.sales.slice(0, 12).map((sale) => {
      const detail = (sale.items || []).map((item) => `${escapeHtml(item.product?.name || 'Item')} × ${formatNumber(item.quantity)}`).join(', ');
      return `<article class="history-item"><div class="history-item-top"><strong>${escapeHtml(sale.sale_number)}</strong><small>${formatDate(sale.created_at)}</small></div><p>${detail || 'No line details'}${sale.notes ? `<br>${escapeHtml(sale.notes)}` : ''}</p></article>`;
    }).join('');
  }

  function renderRequests() {
    const container = $('#requests-list');
    if (!state.requests.length) {
      container.innerHTML = '<div class="empty">No stock requests have been submitted.</div>';
      return;
    }
    container.innerHTML = state.requests.slice(0, 12).map((request) => {
      const detail = (request.items || []).map((item) => `${escapeHtml(item.product?.name || 'Item')} × ${formatNumber(item.quantity_requested)}`).join(', ');
      return `<article class="history-item"><div class="history-item-top"><strong>${escapeHtml(request.request_number)}</strong><span class="badge ${escapeHtml(request.status)}">${escapeHtml(titleCase(request.status))}</span></div><p>${detail || 'No line details'}<br>Submitted ${formatDate(request.created_at)}</p></article>`;
    }).join('');
  }

  function renderSummary() {
    const low = state.inventory.filter((item) => item.stock_status === 'low').length;
    const critical = state.inventory.filter((item) => item.stock_status === 'critical').length;
    const totalUnits = state.inventory.reduce((sum, item) => sum + Number(item.current_stock || 0), 0);
    $('#metric-products').textContent = formatNumber(state.inventory.length);
    $('#metric-units').textContent = formatNumber(totalUnits);
    $('#metric-low').textContent = formatNumber(low);
    $('#metric-critical').textContent = formatNumber(critical);
    $('#operator-name').textContent = state.context?.user?.full_name || 'Branch operator';
    $('#location-name').textContent = state.context?.location?.name || config.branchName;
    $('#location-address').textContent = state.context?.location?.address || '';
    $('#last-sync').textContent = `Last synced ${formatDate(state.context?.sync?.server_time)}`;
  }

  function captureQuantityDrafts() {
    return {
      sales: new Map($$('.sale-qty').map((input) => [String(input.dataset.inventoryId), input.value])),
      requests: new Map($$('.request-qty').map((input) => [String(input.dataset.productId), input.value])),
    };
  }

  function restoreQuantityDrafts(drafts) {
    $$('.sale-qty').forEach((input) => {
      const value = drafts.sales.get(String(input.dataset.inventoryId));
      if (value !== undefined) input.value = value;
    });
    $$('.request-qty').forEach((input) => {
      const value = drafts.requests.get(String(input.dataset.productId));
      if (value !== undefined) input.value = value;
    });
  }

  function renderAll(drafts = { sales: new Map(), requests: new Map() }) {
    renderSummary();
    renderInventory();
    renderRequestLines();
    renderSales();
    renderRequests();
    restoreQuantityDrafts(drafts);
  }

  async function loadAll({ silent = false } = {}) {
    if (!state.token || state.polling || state.mutating) return;
    state.polling = true;
    if (!silent) setBusy(true);
    try {
      const drafts = captureQuantityDrafts();
      const code = encodeURIComponent(config.branchCode);
      const [contextResponse, inventoryResponse, salesResponse, requestsResponse] = await Promise.all([
        api(`/branch/context?branch_code=${code}`),
        api(`/branch/inventory?branch_code=${code}`),
        api(`/branch/sales?branch_code=${code}`),
        api('/supply-requests?per_page=30'),
      ]);
      if (contextResponse.data.branch_code !== config.branchCode) throw new Error('This account is assigned to a different branch.');
      state.context = contextResponse.data;
      state.inventory = inventoryResponse.data.inventory || [];
      state.sales = salesResponse.data || [];
      state.requests = requestsResponse.data || [];
      loginView.hidden = true;
      portalView.hidden = false;
      renderAll(drafts);
      updateOnlineState();
    } catch (error) {
      if (!silent) showToast(error.message, 'error');
      if (error.message.includes('not assigned')) logout(false);
    } finally {
      state.polling = false;
      if (!silent) setBusy(false);
    }
  }

  $('#login-email').value = config.branchEmail;
  $('#branch-login-label').textContent = config.branchName;
  $('#branch-login-code').textContent = config.branchCode;
  $('#request-date').min = new Date().toISOString().slice(0, 10);

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = $('#login-error');
    error.textContent = '';
    setBusy(true);
    try {
      const response = await api('/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: {
          email: $('#login-email').value.trim(),
          password: $('#login-password').value,
          device_name: `herald-${config.branchCode}`,
        },
      });
      saveToken(response.data.token, $('#keep-signed-in').checked);
      await loadAll({ silent: false });
    } catch (loginError) {
      error.textContent = loginError.message;
    } finally {
      setBusy(false);
    }
  });

  $('#logout-button').addEventListener('click', () => logout(true));
  $('#refresh-button').addEventListener('click', () => loadAll());

  $('#sale-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const items = $$('.sale-qty')
      .map((input) => ({ inventory_id: Number(input.dataset.inventoryId), quantity: Number(input.value) }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (!items.length) {
      showToast('Enter at least one quantity to deduct.', 'error');
      return;
    }
    state.pendingSaleReference ||= (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    state.mutating = true;
    setBusy(true);
    try {
      const code = encodeURIComponent(config.branchCode);
      const response = await api(`/branch/sales?branch_code=${code}`, {
        method: 'POST',
        body: {
          branch_code: config.branchCode,
          client_reference: state.pendingSaleReference,
          notes: $('#sale-notes').value.trim() || null,
          items,
        },
      });
      state.pendingSaleReference = null;
      $$('.sale-qty').forEach((input) => { input.value = '0'; });
      $('#sale-notes').value = '';
      showToast(response.message || 'Stock deducted successfully.');
      state.mutating = false;
      await loadAll({ silent: true });
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      state.mutating = false;
      setBusy(false);
    }
  });

  $('#clear-sale-button').addEventListener('click', () => {
    $$('.sale-qty').forEach((input) => { input.value = '0'; });
    $('#sale-notes').value = '';
    state.pendingSaleReference = null;
  });

  $('#request-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const items = $$('.request-qty')
      .map((input) => ({ product_id: Number(input.dataset.productId), quantity_requested: Number(input.value) }))
      .filter((item) => Number.isFinite(item.quantity_requested) && item.quantity_requested > 0);
    if (!items.length) {
      showToast('Enter at least one quantity to request.', 'error');
      return;
    }
    state.mutating = true;
    setBusy(true);
    try {
      await api('/supply-requests', {
        method: 'POST',
        body: {
          location_id: state.context.location.id,
          submit: true,
          target_delivery_date: $('#request-date').value || null,
          delivery_address: state.context.location.address,
          remarks: $('#request-notes').value.trim() || null,
          items,
        },
      });
      $$('.request-qty').forEach((input) => { input.value = '0'; });
      $('#request-date').value = '';
      $('#request-notes').value = '';
      showToast('Stock request submitted to Herald.');
      state.mutating = false;
      await loadAll({ silent: true });
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      state.mutating = false;
      setBusy(false);
    }
  });

  window.addEventListener('online', () => { updateOnlineState(); loadAll({ silent: true }); });
  window.addEventListener('offline', updateOnlineState);
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) loadAll({ silent: true });
  }, 3000);

  updateOnlineState();
  if (state.token) loadAll();
})();
