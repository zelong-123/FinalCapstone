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
    saleDrafts: new Map(),
    requestDrafts: new Map(),
    confirmResolver: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const loginView = $('#login-view');
  const portalView = $('#portal-view');
  const loading = $('#loading-overlay');
  const toast = $('#toast');
  const confirmModal = $('#confirm-modal');
  let toastTimer = 0;

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const formatNumber = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0)));
  const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: value.includes?.('T') ? 'short' : undefined }).format(new Date(value)) : '—';
  const titleCase = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const wholeNumber = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  };

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
    state.saleDrafts.clear();
    state.requestDrafts.clear();
    loginView.hidden = false;
    portalView.hidden = true;
  }

  function updateOnlineState() {
    const pill = $('#sync-pill');
    const online = navigator.onLine;
    pill.classList.toggle('offline', !online);
    $('#sync-label').textContent = online ? 'Live sync' : 'Offline';
  }

  function quantityControl({ className, dataName, dataValue, value, max, label }) {
    const maxAttribute = Number.isFinite(max) ? ` data-max="${max}"` : '';
    return `
      <div class="quantity-control">
        <button class="quantity-step" type="button" data-step="-1" aria-label="Decrease ${escapeHtml(label)} by 1">−</button>
        <input class="${className}" data-${dataName}="${dataValue}"${maxAttribute} type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${wholeNumber(value)}" aria-label="${escapeHtml(label)}">
        <button class="quantity-step" type="button" data-step="1" aria-label="Increase ${escapeHtml(label)} by 1">+</button>
      </div>
      <small class="quantity-warning" aria-live="polite"></small>
    `;
  }

  function inventorySignature(items) {
    return items.map((item) => String(item.id)).join(',');
  }

  function renderInventory({ force = false } = {}) {
    const tbody = $('#inventory-body');
    if (!state.inventory.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No inventory has been initialized for this branch.</td></tr>';
      tbody.dataset.signature = '';
      return;
    }

    const signature = inventorySignature(state.inventory);
    const needsFullRender = force || tbody.dataset.signature !== signature;
    const editingQuantity = document.activeElement?.matches?.('.sale-qty, .request-qty');
    if (needsFullRender && (!editingQuantity || force)) {
      tbody.innerHTML = state.inventory.map((item) => {
        const currentStock = Math.max(0, Math.floor(Number(item.current_stock || 0)));
        const draft = state.saleDrafts.get(String(item.id)) ?? 0;
        return `
          <tr data-inventory-row="${item.id}">
            <td data-label="Product"><strong>${escapeHtml(item.product?.name || 'Item')}</strong><small>${escapeHtml(item.product?.sku || '')}</small></td>
            <td data-label="On hand"><span class="stock-number"><strong data-stock-current>${formatNumber(item.current_stock)}</strong></span><small>${escapeHtml(item.product?.unit || '')}</small></td>
            <td data-label="Reorder" data-stock-reorder>${formatNumber(item.reorder_level)}</td>
            <td data-label="Status"><span data-stock-status class="badge ${escapeHtml(item.stock_status)}">${escapeHtml(titleCase(item.stock_status))}</span></td>
            <td data-label="Updated" data-stock-updated>${formatDate(item.updated_at)}</td>
            <td data-label="Deduct" class="qty-cell">${quantityControl({ className: 'sale-qty', dataName: 'inventory-id', dataValue: item.id, value: draft, max: currentStock, label: `Quantity to deduct for ${item.product?.name || 'item'}` })}</td>
          </tr>
        `;
      }).join('');
      tbody.dataset.signature = signature;
    }

    state.inventory.forEach((item) => {
      const row = tbody.querySelector(`[data-inventory-row="${item.id}"]`);
      if (!row) return;
      const currentStock = Math.max(0, Math.floor(Number(item.current_stock || 0)));
      row.querySelector('[data-stock-current]').textContent = formatNumber(item.current_stock);
      row.querySelector('[data-stock-reorder]').textContent = formatNumber(item.reorder_level);
      row.querySelector('[data-stock-updated]').textContent = formatDate(item.updated_at);
      const badge = row.querySelector('[data-stock-status]');
      badge.className = `badge ${item.stock_status}`;
      badge.textContent = titleCase(item.stock_status);
      const input = row.querySelector('.sale-qty');
      input.dataset.max = String(currentStock);
      const warning = row.querySelector('.quantity-warning');
      const draft = wholeNumber(input.value);
      const invalid = draft > currentStock;
      input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      input.closest('.quantity-control').classList.toggle('invalid', invalid);
      warning.textContent = invalid ? `Only ${formatNumber(currentStock)} available` : '';
    });
  }

  function requestSignature(products) {
    return products.map((product) => String(product.id)).join(',');
  }

  function renderRequestLines({ force = false } = {}) {
    const products = state.context?.available_products || [];
    const container = $('#request-lines');
    if (!products.length) {
      container.innerHTML = '<div class="empty">No products are available for this branch brand.</div>';
      container.dataset.signature = '';
      return;
    }
    const signature = requestSignature(products);
    if (!force && container.dataset.signature === signature) return;
    if (!force && document.activeElement?.matches?.('.sale-qty, .request-qty')) return;
    container.innerHTML = products.map((product) => {
      const draft = state.requestDrafts.get(String(product.id)) ?? 0;
      return `
        <div class="request-line">
          <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(product.unit || 'unit')}</small></div>
          <div class="request-quantity">${quantityControl({ className: 'request-qty', dataName: 'product-id', dataValue: product.id, value: draft, max: Number.POSITIVE_INFINITY, label: `Request quantity for ${product.name}` })}</div>
        </div>
      `;
    }).join('');
    container.dataset.signature = signature;
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

  function renderAll({ force = false } = {}) {
    renderSummary();
    renderInventory({ force });
    renderRequestLines({ force });
    renderSales();
    renderRequests();
  }

  async function loadAll({ silent = false, force = false } = {}) {
    if (!state.token || state.polling || state.mutating) return;
    state.polling = true;
    if (!silent) setBusy(true);
    try {
      const firstLoad = !state.context;
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
      renderAll({ force: force || firstLoad });
      updateOnlineState();
    } catch (error) {
      if (!silent) showToast(error.message, 'error');
      if (error.message.includes('not assigned')) logout(false);
    } finally {
      state.polling = false;
      if (!silent) setBusy(false);
    }
  }

  function sanitizeQuantityInput(input) {
    const raw = String(input.value || '').replace(/[^0-9]/g, '');
    const normalized = raw.replace(/^0+(?=\d)/, '');
    input.value = normalized;
    const value = normalized === '' ? 0 : Number.parseInt(normalized, 10);
    if (input.classList.contains('sale-qty')) state.saleDrafts.set(String(input.dataset.inventoryId), value);
    if (input.classList.contains('request-qty')) state.requestDrafts.set(String(input.dataset.productId), value);
    if (input.classList.contains('sale-qty')) renderInventory();
    return value;
  }

  function setQuantity(input, value) {
    const max = input.dataset.max === undefined ? Number.POSITIVE_INFINITY : Number(input.dataset.max);
    const next = Math.max(0, Math.min(Number.isFinite(max) ? max : Number.MAX_SAFE_INTEGER, Math.trunc(value)));
    input.value = String(next);
    sanitizeQuantityInput(input);
    input.focus({ preventScroll: true });
    input.select();
  }

  function openConfirmation({ title, message, lines, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      state.confirmResolver?.(false);
      state.confirmResolver = resolve;
      $('#confirm-title').textContent = title;
      $('#confirm-message').textContent = message;
      $('#confirm-lines').innerHTML = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
      const confirmButton = $('#confirm-accept');
      confirmButton.textContent = confirmLabel;
      confirmButton.className = danger ? 'danger-button' : 'primary';
      confirmModal.hidden = false;
      confirmButton.focus();
    });
  }

  function closeConfirmation(accepted) {
    if (confirmModal.hidden) return;
    confirmModal.hidden = true;
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    resolver?.(accepted);
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
      await loadAll({ force: true });
    } catch (loginError) {
      error.textContent = loginError.message;
    } finally {
      setBusy(false);
    }
  });

  $('#logout-button').addEventListener('click', () => logout(true));
  $('#refresh-button').addEventListener('click', () => loadAll({ force: false }));

  document.addEventListener('input', (event) => {
    const input = event.target.closest?.('.sale-qty, .request-qty');
    if (input) sanitizeQuantityInput(input);
  });

  document.addEventListener('blur', (event) => {
    const input = event.target.closest?.('.sale-qty, .request-qty');
    if (input && input.value === '') setQuantity(input, 0);
  }, true);

  document.addEventListener('click', (event) => {
    const stepButton = event.target.closest?.('.quantity-step');
    if (!stepButton) return;
    const input = stepButton.closest('.quantity-control')?.querySelector('.sale-qty, .request-qty');
    if (!input) return;
    const current = wholeNumber(input.value);
    setQuantity(input, current + Number(stepButton.dataset.step || 0));
  });

  $('#sale-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const items = $$('.sale-qty')
      .map((input) => ({ inventory_id: Number(input.dataset.inventoryId), quantity: wholeNumber(input.value), max: wholeNumber(input.dataset.max) }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      showToast('Enter at least one whole-number quantity to deduct.', 'error');
      return;
    }
    const invalidItem = items.find((item) => item.quantity > item.max);
    if (invalidItem) {
      const inventory = state.inventory.find((item) => item.id === invalidItem.inventory_id);
      showToast(`${inventory?.product?.name || 'Item'} only has ${formatNumber(invalidItem.max)} available.`, 'error');
      return;
    }
    const lines = items.map((item) => {
      const inventory = state.inventory.find((row) => row.id === item.inventory_id);
      return `${inventory?.product?.name || 'Item'}: deduct ${formatNumber(item.quantity)}`;
    });
    const confirmed = await openConfirmation({
      title: 'Confirm stock deduction',
      message: 'Review every item carefully. This will immediately reduce the shared stock for this branch.',
      lines,
      confirmLabel: 'Confirm deduction',
      danger: true,
    });
    if (!confirmed) return;

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
          items: items.map(({ inventory_id, quantity }) => ({ inventory_id, quantity })),
        },
      });
      state.pendingSaleReference = null;
      state.saleDrafts.clear();
      $$('.sale-qty').forEach((input) => { input.value = '0'; });
      $('#sale-notes').value = '';
      showToast(response.message || 'Stock deducted successfully.');
      state.mutating = false;
      await loadAll({ silent: true, force: true });
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      state.mutating = false;
      setBusy(false);
    }
  });

  $('#clear-sale-button').addEventListener('click', () => {
    state.saleDrafts.clear();
    $$('.sale-qty').forEach((input) => { input.value = '0'; });
    $('#sale-notes').value = '';
    state.pendingSaleReference = null;
    renderInventory();
  });

  $('#request-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const items = $$('.request-qty')
      .map((input) => ({ product_id: Number(input.dataset.productId), quantity_requested: wholeNumber(input.value) }))
      .filter((item) => item.quantity_requested > 0);
    if (!items.length) {
      showToast('Enter at least one whole-number quantity to request.', 'error');
      return;
    }
    const products = state.context?.available_products || [];
    const lines = items.map((item) => {
      const product = products.find((row) => row.id === item.product_id);
      return `${product?.name || 'Item'}: request ${formatNumber(item.quantity_requested)}`;
    });
    const confirmed = await openConfirmation({
      title: 'Confirm stock request',
      message: 'Review the quantities before sending this request to the main Herald office.',
      lines,
      confirmLabel: 'Submit request',
    });
    if (!confirmed) return;

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
      state.requestDrafts.clear();
      $$('.request-qty').forEach((input) => { input.value = '0'; });
      $('#request-date').value = '';
      $('#request-notes').value = '';
      showToast('Stock request submitted to Herald.');
      state.mutating = false;
      await loadAll({ silent: true, force: true });
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      state.mutating = false;
      setBusy(false);
    }
  });

  $('#confirm-cancel').addEventListener('click', () => closeConfirmation(false));
  $('#confirm-accept').addEventListener('click', () => closeConfirmation(true));
  confirmModal.addEventListener('click', (event) => {
    if (event.target === confirmModal) closeConfirmation(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmModal.hidden) closeConfirmation(false);
  });

  window.addEventListener('online', () => { updateOnlineState(); loadAll({ silent: true }); });
  window.addEventListener('offline', updateOnlineState);
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) loadAll({ silent: true });
  }, 3000);

  updateOnlineState();
  if (state.token) loadAll({ force: true });
})();
