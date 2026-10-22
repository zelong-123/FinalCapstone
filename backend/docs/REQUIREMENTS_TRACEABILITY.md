# Requirements Traceability

| Requirement | Backend implementation |
|---|---|
| FR-01 Authenticate users | `AuthController`, `AuthenticateApiToken`, `api_tokens` |
| FR-02 Restrict features by role | `EnsureUserHasRole`, route middleware, ownership checks |
| FR-03 Record inquiries | `InquiryController::store`, `franchise_inquiries` |
| FR-04 Update/organize inquiry data | Inquiry list filters, update and endorsement endpoints |
| FR-05 Store and track applicants/LOI/status | Applicant endpoints, documents, status histories |
| FR-06 Monitor application progress | Applicant status and timeline relations |
| FR-07 Manage orientation/tasting/training schedules | `ActivityController`, `activity_schedules` |
| FR-08 Store activity details | Date/time, venue, participants, assignment, results |
| FR-09 Record/update inventory | `InventoryController`, `InventoryService` |
| FR-10 Classify stock status | Model-derived normal/low/critical status and analytics |
| FR-11 Submit supply requests | `SupplyRequestController::store`, request items |
| FR-12 Update fulfillment status | Role-checked state machine and delivery endpoints |
| FR-13 Record request lifecycle | Status histories, audit logs, inventory references |
| FR-14 Summarized reports | `AnalyticsController` KPI and trend endpoints |
| FR-15 Charts/graphs support | JSON time series and grouped metrics for frontend charts |
| FR-16 Analyze historical inventory | `ForecastService::monthlyDemandSeries` |
| FR-17 Forecast future requirements | Simple Moving Average and recommended reorder quantity |
| FR-18 Centralized database | MySQL schema and relational migrations |
| FR-19 Admin user/system-data management | User, brand, product, and location admin endpoints |
| FR-20 Transaction notifications | `NotificationService`, notification endpoints |

## Non-functional coverage

| Attribute | Backend support |
|---|---|
| Performance | Indexed schema, pagination, eager loading, query filters, response throttling |
| Security | Password hashing, hashed bearer tokens, token expiry, RBAC, private files, CORS, validation, HTTPS forcing in production |
| Usability | Consistent JSON envelopes, field-level errors, OpenAPI contract |
| Availability | Stateless API design, application health endpoints, production deployment guide |
| Reliability | Transactions for workflow/inventory mutations, audit/status histories, backups |
| Scalability | Central DB, queue-ready Laravel skeleton, indexed filters, standards-based web deployment |
| Maintainability | Controllers/services/enums, migrations, tests, docs, PSR-4 structure |
| Compatibility | REST/JSON over standard browsers and HTTP clients; frontend-agnostic API |
