// Smoke render: mounts every changed page in a real React tree to catch
// render-phase crashes (bad hooks, undefined references, invalid JSX) that a
// static build and lint cannot detect. Network and auth are mocked away.
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pages = [
  ['Applicants', 'src/pages/Applicants.jsx'],
  ['Activities', 'src/pages/Activities.jsx'],
  ['Inquiries', 'src/pages/Inquiries.jsx'],
  ['Dashboard', 'src/pages/Dashboard.jsx'],
  ['AdminSettings', 'src/pages/AdminSettings.jsx'],
];

const pagesDir = process.cwd();

const entry = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
${pages.map(([name, path]) => `import ${name} from ${JSON.stringify(join(pagesDir, path))};`).join('\n')}

const wrap = (node) => <MemoryRouter>{node}</MemoryRouter>;

export const targets = ${JSON.stringify(pages.map(([name]) => name))};
${pages.map(([name]) => `export const render_${name} = () => renderToString(wrap(<${name} />));`).join('\n')}
`;

// Redirect auth context and the API client to local mocks.
const stubPlugin = {
  name: 'stubs',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /context[\\/]AuthContext(\.jsx)?$/ }, () => ({
      path: join(process.cwd(), 'scripts/.smoke/auth-mock.jsx'),
    }));
    pluginBuild.onResolve({ filter: /lib[\\/]api(\.js)?$/ }, () => ({
      path: join(process.cwd(), 'scripts/.smoke/api-mock.js'),
    }));
  },
};

const authMock = `
import React, { createContext } from 'react';
export const AuthContext = createContext(null);
export function AuthProvider({ children }) { return children; }
export function useAuth() {
  return { role: 'admin', user: { full_name: 'Admin User' }, logout: async () => {} };
}
export function roleName(u) { return u?.role ?? 'admin'; }
export const ROLE_HOME = {};
export default AuthContext;
`;

const apiMock = `
const applicant = {
  id: 1, full_name: 'Ana Reyes', email: 'a@b.test', phone: '1', address: null,
  status: 'scheduled', application_date: '2026-01-01', preferred_brand: { id: 1, name: 'Brand' },
  progress: { milestones_completed: 2, milestones_total: 7, milestone_percent: 28, stage_percent: 33,
    percent: 33, state: 'in_progress' },
};
const activity = {
  id: 1, applicant_id: 1, applicant: { id: 1, full_name: 'Ana Reyes' },
  activity_type: 'orientation', title: 'Orientation', starts_at: '2026-10-05T10:00:00Z',
  ends_at: '2026-10-05T11:30:00Z', duration_minutes: 90, venue: 'Office', status: 'confirmed',
  participants: ['Ana Reyes'], assigned_to: { id: 2, full_name: 'Ana Reyes' },
};
const rows = {
  '/applicants': { data: [applicant], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 } },
  '/applicants/active-franchisees': { data: [{ id: 1, business_name: 'Stall', franchise_status: 'active',
    approval_date: '2026-01-01', applicant: { full_name: 'Ana Reyes', email: 'a@b.test', preferred_brand: { name: 'Brand' } },
    locations: [{ id: 1 }] }], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 } },
  '/activities/grouped': { data: [{ person: 'Ana Reyes', total: 1, completed: 0, upcoming: 1, activities: [activity] }] },
  '/inquiries': { data: [{ id: 1, lead_name: 'Lead', email: 'l@b.test', phone: '1', source: 'facebook',
    inquiry_date: '2026-01-01', status: 'converted', preferred_brand: { name: 'Brand' },
    applicant: { status: 'inquiry' } }], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 } },
  '/brands': { data: [{ id: 1, name: 'Brand' }] },
  '/analytics/overview': { data: { kpis: { total_inquiries: 1, active_applicants: 1, conversion_rate_percent: 5,
    fulfillment_rate_percent: 90, supply_requests: 1, critical_inventory_items: 0 },
    inquiries_by_source: { facebook: 1 }, inventory_status: { normal: 1 }, applicant_funnel: { inquiry: 1 },
    inquiry_trend: [{ period: '2026-01', count: 1 }], supply_statuses: {} } },
  '/analytics/franchising-dashboard': { data: {
    period: 'month',
    sales_trend: [{ period: '2026-10', label: 'Oct 2026', sales: 2, quantity: 10 }],
    top_branches: [{ location_id: 1, name: 'Branch', quantity: 5, sales: 1, rank: 1 }],
    insights: [{ type: 'demand', message: 'Milk is in high demand this week.' }],
    alerts: [{ severity: 'warning', message: '1 payment awaiting verification.' }],
    recent_applications: [{ id: 1, full_name: 'Ana Reyes', brand: 'Brand', status: 'scheduled',
      application_date: '2026-01-01', progress: applicant.progress }],
    summary: { active_applicants: 1, active_franchisees: 1, branches_with_sales: 1 } } },
  '/archive': { data: { totals: { users: 1, inquiries: 1, applicants: 1, all: 3 },
    users: { count: 1, items: [{ id: 1, label: 'User', detail: 'u@b.test', badge: 'Admin',
      archived_at: '2026-01-01T00:00:00Z', archived_by: 'Admin' }] },
    inquiries: { count: 1, items: [{ id: 1, label: 'Lead', detail: 'l@b.test', badge: 'facebook',
      archived_at: '2026-01-01T00:00:00Z', archived_by: 'Admin' }] },
    applicants: { count: 1, items: [{ id: 1, label: 'Ana', detail: 'a@b.test', badge: 'Applicant',
      archived_at: '2026-01-01T00:00:00Z', archived_by: 'Admin' }] } } },
  '/inventories': { data: [], meta: null },
  '/supply-requests': { data: [], meta: null },
  '/forecasts': { data: [], meta: null },
};

const empty = { data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } };

export const authToken = { get: () => null, set: () => {}, clear: () => {} };
export class ApiError extends Error {}
export const API_BASE_URL = '/api/v1';
export function firstValidationMessage(e) { return e?.message ?? 'error'; }

export const api = {
  get: async (path) => rows[path] ?? empty,
  post: async () => ({ data: {} }),
  put: async () => ({ data: {} }),
  patch: async () => ({ data: {} }),
  delete: async () => ({ data: {} }),
};
`;

const dir = mkdtempSync(join(tmpdir(), 'herald-smoke-'));
const smokeDir = join(process.cwd(), 'scripts/.smoke');
mkdirSync(smokeDir, { recursive: true });
writeFileSync(join(smokeDir, 'auth-mock.jsx'), authMock);
writeFileSync(join(smokeDir, 'api-mock.js'), apiMock);

const out = join(smokeDir, 'bundle.mjs');
const entryFile = join(dir, 'entry.jsx');
writeFileSync(entryFile, entry);
await build({
  entryPoints: [entryFile],
  bundle: true,
  outfile: out,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: process.cwd(),
  define: { 'import.meta.env.VITE_API_URL': 'undefined' },
  loader: { '.png': 'dataurl', '.jpg': 'dataurl' },
  external: ['react', 'react-dom', 'react-dom/server', 'react-router-dom', 'react-icons/fa6'],
  plugins: [stubPlugin],
  logLevel: 'silent',
});

const mod = await import(`file://${out}`);

let failures = 0;
for (const name of mod.targets) {
  try {
    const html = mod[`render_${name}`]();
    const ok = typeof html === 'string' && html.includes('page-container');
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${html.length} chars)`);
    if (!ok) failures += 1;
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}  ${error.message.split('\n')[0]}`);
  }
}

console.log(failures === 0 ? '\nALL PAGES RENDERED' : `\n${failures} PAGE(S) FAILED`);

rmSync(smokeDir, { recursive: true, force: true });
rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);