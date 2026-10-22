export const routeTitles = {
  '/admin-dashboard': ['Executive dashboard', 'Organization-wide operations'],
  '/marketing-dashboard': ['Marketing dashboard', 'Lead acquisition and conversion'],
  '/sales-dashboard': ['Sales dashboard', 'Applicant pipeline and activities'],
  '/logistics-dashboard': ['Logistics dashboard', 'Inventory and fulfillment'],
  '/franchisee-dashboard': ['Franchise dashboard', 'Your application and supply activity'],
  '/inquiries': ['Leads & inquiries', 'Marketing and sales pipeline'],
  '/applicants': ['Applicant pipeline', 'Candidate progress and approvals'],
  '/activities': ['Activities & schedules', 'Orientations, training, and events'],
  '/users': ['User management', 'Accounts and role-based access'],
  '/branches': ['Branches', 'Branch stock, deductions, and requests'],
  '/inventory': ['Inventory', 'Warehouse stock and thresholds'],
  '/supply-requests': ['Supply requests', 'Ordering and fulfillment workflow'],
  '/analytics': ['Analytics & forecasting', 'Performance and demand insights'],
};

export function getRouteTitle(pathname) {
  return routeTitles[pathname] || ['Herald workspace', 'Franchise operations'];
}
