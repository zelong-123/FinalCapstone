const configuredBase = import.meta.env.VITE_API_URL?.trim();
export const API_BASE_URL = (configuredBase || '/api/v1').replace(/\/$/, '');

const TOKEN_KEY = 'herald_api_token';
const PERSIST_KEY = 'herald_persist_token';
const DEFAULT_TIMEOUT = 30000;

export class ApiError extends Error {
  constructor(message, status = 0, errors = {}, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.payload = payload;
  }
}

export const authToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY),
  set: (token, persist = false) => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(PERSIST_KEY, persist ? '1' : '0');
    (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PERSIST_KEY);
  },
};

function makeQuery(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

function parsePayload(response) {
  if (response.status === 204) return Promise.resolve({});
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => ({}));
  return response.text().then((text) => (text ? { message: text } : {})).catch(() => ({}));
}

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    headers = {},
    signal,
    skipAuth = false,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const token = authToken.get();
  const isFormData = body instanceof FormData;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort('timeout'), timeout);
  const abortFromCaller = () => controller.abort('caller');
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(`${API_BASE_URL}${path}${makeQuery(query)}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(isFormData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });

    const payload = await parsePayload(response);
    if (!response.ok) {
      if (response.status === 401) {
        authToken.clear();
        window.dispatchEvent(new CustomEvent('herald:unauthorized'));
      }
      throw new ApiError(
        payload.message || `Request failed with status ${response.status}.`,
        response.status,
        payload.errors || {},
        payload,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted) throw new ApiError('The request was cancelled.', 0);
      throw new ApiError('The server took too long to respond. Check XAMPP and try again.', 0);
    }
    throw new ApiError('Herald could not reach the server. Confirm MySQL and the Herald backend are running.', 0);
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export const api = {
  get: (path, query, options = {}) => apiRequest(path, { ...options, query }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options = {}) => apiRequest(path, { ...options, method: 'DELETE' }),
};

export function firstValidationMessage(error) {
  if (!(error instanceof ApiError)) return error?.message || 'Something went wrong.';
  const first = Object.values(error.errors || {}).flat()[0];
  return first || error.message;
}
