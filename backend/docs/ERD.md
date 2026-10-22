# Entity Relationship Overview

```mermaid
erDiagram
    ROLE ||--o{ USER : assigns
    USER ||--o{ API_TOKEN : owns
    USER ||--o| APPLICANT : portal_account
    USER ||--o| FRANCHISEE : portal_account

    BRAND ||--o{ FRANCHISE_INQUIRY : preferred
    USER ||--o{ FRANCHISE_INQUIRY : encodes
    FRANCHISE_INQUIRY ||--o| APPLICANT : converts_to
    BRAND ||--o{ APPLICANT : preferred
    APPLICANT ||--o{ APPLICANT_STATUS_HISTORY : has
    APPLICANT ||--o{ ACTIVITY_SCHEDULE : attends
    APPLICANT ||--o{ PAYMENT : makes
    APPLICANT ||--o{ DOCUMENT : stores_LOI
    APPLICANT ||--o| FRANCHISEE : becomes

    FRANCHISEE ||--o{ FRANCHISE_LOCATION : operates
    BRAND ||--o{ FRANCHISE_LOCATION : identifies
    BRAND ||--o{ PRODUCT : offers
    FRANCHISE_LOCATION ||--o{ INVENTORY : maintains
    PRODUCT ||--o{ INVENTORY : stocked_as
    INVENTORY ||--o{ INVENTORY_TRANSACTION : records
    FRANCHISE_LOCATION ||--o{ BRANCH_SALE : records
    USER ||--o{ BRANCH_SALE : enters
    BRANCH_SALE ||--|{ BRANCH_SALE_ITEM : contains
    INVENTORY ||--o{ BRANCH_SALE_ITEM : deducts
    PRODUCT ||--o{ BRANCH_SALE_ITEM : sold_as
    INVENTORY ||--o{ FORECAST : predicts

    FRANCHISE_LOCATION ||--o{ SUPPLY_REQUEST : receives
    USER ||--o{ SUPPLY_REQUEST : requests
    SUPPLY_REQUEST ||--|{ SUPPLY_REQUEST_ITEM : contains
    PRODUCT ||--o{ SUPPLY_REQUEST_ITEM : requested
    SUPPLY_REQUEST ||--o{ SUPPLY_REQUEST_STATUS_HISTORY : tracks
    SUPPLY_REQUEST ||--o| DELIVERY : fulfilled_by
    DELIVERY ||--o{ DOCUMENT : stores_POD

    USER ||--o{ SYSTEM_NOTIFICATION : receives
    USER ||--o{ AUDIT_LOG : performs
```

## Design notes

- Role names are fixed application enums but stored in a normalized `roles` table.
- Applicant and franchisee portal accounts are optional one-to-one links to `users`.
- Warehouses and branches share `franchise_locations`; only franchise locations require a franchisee.
- Inventory is unique by `(location_id, product_id)`.
- Branch portals are mapped by the unique nullable `franchise_locations.branch_code`.
- Branch sales use a per-location client reference for idempotency and save item-level before/after balances.
- Supply requests keep immutable status-history records and a single delivery record.
- Documents use a polymorphic relation so LOIs belong to applicants and PODs belong to deliveries.
- Forecasts preserve their input series and method metadata for auditability.
