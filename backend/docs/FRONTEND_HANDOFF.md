# Frontend Handoff

## Connection details

- Development base URL: `http://localhost:8080/api/v1`
- OpenAPI contract: `/docs/openapi.yaml`
- Required headers on JSON requests:
  - `Accept: application/json`
  - `Content-Type: application/json`
  - `Authorization: Bearer <token>` for protected endpoints
- File uploads use `multipart/form-data`; do not manually set the boundary.
- CORS origins are configured through the comma-separated `CORS_ALLOWED_ORIGINS` environment value.

## Login and session handling

Call `POST /auth/login` with `email`, `password`, and optional `device_name`. Persist the returned opaque token in a secure location and send it as a bearer token. For browser frontends, prefer memory storage or a carefully reviewed secure storage strategy rather than long-lived JavaScript-readable local storage.

On application load, call `GET /auth/me` to hydrate the user and role. On a `401`, clear local authentication state. On a `403`, keep the session but show a permission error. Use `POST /auth/logout` before deleting the token client-side.

## Roles and suggested navigation

| Role | Suggested modules |
|---|---|
| `marketing` | Inquiries, inquiry endorsement, analytics, notifications |
| `sales` | Endorsed inquiries, applicants, activities, supply review, analytics |
| `admin` | Full coordination, users, payments, approval, locations, reports, audit logs |
| `logistics` | Inventory, endorsed supply requests, POD, forecasts, analytics |
| `franchisee` | Own profile/applicant record, activities, own inventories, supply requests, notifications |

The backend remains the source of truth. Hiding a button in the UI is not authorization; every protected action is checked again by the API.

## Core enum values

### Inquiry status

`new`, `contacted`, `endorsed`, `converted`, `closed`

### Applicant status

`inquiry`, `qualified`, `scheduled`, `loi_submitted`, `payment_submitted`, `for_approval`, `approved`, `rejected`, `active_franchisee`

### Activity type

`orientation`, `product_tasting`, `training`, `other`

### Activity status

`pending`, `confirmed`, `completed`, `cancelled`, `no_show`

### Supply status

`draft`, `submitted`, `under_review`, `endorsed`, `preparing`, `dispatched`, `delivered`, `completed`, `rejected`, `cancelled`

### Payment status

`pending`, `verified`, `rejected`

### Location type

`warehouse`, `franchise`

## Recommended frontend screens

1. Login and account/password screen
2. Role-aware dashboard consuming `/analytics/overview`
3. Inquiry table/detail/editor and endorsement dialog
4. Applicant pipeline/detail with timeline, LOI upload, payment panel, and approval actions
5. Calendar/list for activities with conflict errors displayed inline
6. Brand/product/location master data pages
7. Inventory table with normal/low/critical badges and adjustment drawer
8. Supply request composer and role-specific workflow detail/timeline
9. Logistics dispatch/POD form and franchisee acknowledgement form
10. Forecast table and trend visualization
11. Notifications tray and admin audit-log viewer

## Error handling

- `401`: missing, invalid, or expired token
- `403`: authenticated but unauthorized
- `404`: entity/file not found or inaccessible
- `409`: reserve for future conflict semantics; current scheduling/workflow conflicts are usually `422`
- `422`: field validation, invalid transition, insufficient inventory, or schedule conflict
- `429`: rate limit exceeded
- `500`: unexpected server error

Validation errors have an `errors` object keyed by field. Nested request item errors use keys such as `items.0.product_id`.

## Pagination and filtering

List endpoints accept `page` and `per_page`; most accept domain filters such as `status`, `search`, `from`, `to`, `brand_id`, or `location_id`. Use the returned `meta.current_page`, `meta.last_page`, and `links` rather than guessing total pages.

## Uploads and downloads

LOI upload:

```text
POST /applicants/{applicant}/loi
multipart fields: file, submission_date?
```

POD upload:

```text
POST /supply-requests/{request}/pod
multipart fields: file, recipient_name?, notes?
```

For downloads, request the authenticated URL as a blob and use the `Content-Disposition` filename. Do not expose storage paths directly.

## Dashboard data shapes

`GET /analytics/overview` returns:

- `kpis`: totals, rates, average fulfillment time, critical stock count
- `inquiry_trend`: monthly `{period, count}` series
- `supply_request_trend`: monthly `{period, submitted, completed}` series
- `inventory_status`: `{normal, low, critical}`
- `inquiries_by_source`
- `applicant_funnel`
- `supply_statuses`

`GET /analytics/inventory-movement` returns daily inbound/outbound points suitable for a line or bar chart.

## Suggested TypeScript API wrapper

```ts
export type ApiEnvelope<T> = {
  message?: string;
  data: T;
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  links?: Record<string, string | null>;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const token = authStore.getState().token;
  const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message ?? "Request failed"), {
    status: response.status,
    errors: body.errors,
  });
  return body;
}
```

## Integration sequence

1. Start backend and verify `/health`.
2. Log in with a seed account.
3. Build a shared API client and global 401/422 handling.
4. Implement `/auth/me` and role-aware routing.
5. Integrate read-only lists first, then mutations and uploads.
6. Test each role using its own seed account.
7. Replace local seed data and passwords before stakeholder testing.
