# Herald 2.0 — Premium XAMPP Edition

Herald combines a React 19 frontend and Laravel 12 API in one deployment-ready project. This package contains **no Docker files** and is prepared for local system testing with **XAMPP 8.2, MariaDB, and phpMyAdmin**.

## V3 branch reliability update

The branch portals now keep typed quantities stable during live synchronization, use whole-unit −1/+1 controls, require confirmation before deductions and requests, and provide a responsive mobile layout. Admin and Logistics users also receive a separate Branches command panel at `/branch-management`; the main Inventory page is reserved for warehouse stock. See `IMPORTANT_V3_UPDATE.md`.

## What is new in Herald 2.0

- Premium responsive interface for desktop, tablet, and mobile.
- Persistent light and dark themes.
- Improved login experience while preserving and upgrading the successful-login loading transition.
- Executive dashboard presentation with clearer operational metrics and live system health.
- Redesigned navigation, notifications, tables, forms, modals, empty states, loading states, and status indicators.
- Smoother route, panel, button, modal, and progress animations with reduced-motion support.
- Better accessibility: keyboard focus, skip navigation, focus-trapped dialogs, Escape handling, semantic labels, and stronger contrast.
- Safer workflows: confirmation before high-impact status changes, secure logout confirmation, duplicate supply-item prevention, stronger date/quantity validation, and explicit success/error feedback.
- More resilient API client with request timeouts, network-aware error messages, safe empty-response handling, and cancellation support.
- International browser-locale date and number formatting.
- Four separate branch portals connected to one central database.
- Atomic multi-item stock deduction with negative-stock prevention and duplicate-submit protection.
- Three-second branch synchronization and automatic main-site inventory/request refresh.
- Branch-to-main stock request workflow with existing warehouse fulfillment controls.

See `PREMIUM_UI_REPORT.md` for the complete upgrade summary.

## Fast setup on Windows

### Requirements

- XAMPP 8.2 installed, normally at `C:\xampp`
- MySQL started from the XAMPP Control Panel
- Apache started when using phpMyAdmin
- Internet access during first setup so Composer can download Laravel dependencies

Node.js is **not required for normal testing** because the compiled React application is already included under `backend/public/app`. Node.js 22+ is needed only when editing and rebuilding frontend source.

### Install

1. Extract the ZIP to a writable folder such as `F:\xampp\htdocs\herald-premium-xampp`.
2. Start **MySQL** in XAMPP Control Panel. Start **Apache** as well for phpMyAdmin.
3. Open PowerShell in the extracted folder.
4. Run `.\SETUP_XAMPP.bat`.
5. To allow the four branch laptops, run `.\ALLOW_NETWORK_ACCESS.bat` once as administrator.
6. Run `.\START_HERALD.bat`.
7. Open `http://127.0.0.1:8080/app` on the central computer and use the printed LAN IP on branch laptops.

PowerShell requires the `.\` prefix for files in the current folder:

```powershell
.\SETUP_XAMPP.bat
.\ALLOW_NETWORK_ACCESS.bat
.\START_HERALD.bat
```

The setup script detects XAMPP, verifies PHP and extensions, downloads a verified local Composer copy when necessary, creates the `herald` database, installs Laravel dependencies, generates `APP_KEY`, runs migrations, seeds test data, and validates API routes.

## Test accounts

All seeded accounts initially use this password:

```text
Password123!
```

| Role | Email |
|---|---|
| Admin | `admin@franchisetitan.local` |
| Marketing | `marketing@franchisetitan.local` |
| Sales | `sales@franchisetitan.local` |
| Logistics | `logistics@franchisetitan.local` |
| Franchisee | `franchisee@franchisetitan.local` |
| Branch 1 | `branch1@herald.local` |
| Branch 2 | `branch2@herald.local` |
| Branch 3 | `branch3@herald.local` |
| Branch 4 | `branch4@herald.local` |

Change seeded passwords before allowing other people to access the system.


## Four branch sites and shared database

After setup, the central computer hosts all five sites from one Laravel server and one MariaDB database:

- Main Herald: `http://SERVER_IP:8080/app`
- Branch 1: `http://SERVER_IP:8080/branch-1`
- Branch 2: `http://SERVER_IP:8080/branch-2`
- Branch 3: `http://SERVER_IP:8080/branch-3`
- Branch 4: `http://SERVER_IP:8080/branch-4`

Run `ALLOW_NETWORK_ACCESS.bat` once as administrator, then run `START_HERALD.bat`. The start window prints the correct LAN IP. Branch laptops only need a browser and must be on the same private network.

See `BRANCH_SETUP_GUIDE.md` for the full installation, testing, network, workflow, and troubleshooting instructions.

## phpMyAdmin

Open `http://localhost/phpmyadmin` or run `.\OPEN_PHPMYADMIN.bat`.

Default XAMPP database configuration in `backend/.env`:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=herald
DB_USERNAME=root
DB_PASSWORD=
```

If the local XAMPP root account has a password, enter it in `backend/.env` before setup.

## Frontend/backend connection

- Application: `http://127.0.0.1:8080/app`
- API: `http://127.0.0.1:8080/api/v1`
- Health endpoint: `http://127.0.0.1:8080/api/v1/health`
- OpenAPI specification: `http://127.0.0.1:8080/docs/openapi.yaml`

The compiled React application and Laravel API share one origin. The frontend calls `/api/v1`, so normal testing does not depend on a separate frontend server or cross-origin configuration.

## Useful Windows launchers

- `SETUP_XAMPP.bat` — first installation or safe update
- `START_HERALD.bat` — starts Laravel for the central computer and local network
- `ALLOW_NETWORK_ACCESS.bat` — allows trusted local-subnet access to port 8080 on Private Windows networks
- `CHECK_XAMPP.bat` — checks XAMPP, PHP, extensions, and project readiness
- `OPEN_PHPMYADMIN.bat` — opens phpMyAdmin
- `RESET_TEST_DATABASE.bat` — wipes and reseeds test data after explicit confirmation
- `VERIFY_RUNNING_HERALD.bat` — verifies the frontend, API, and database connection
- `RUN_BACKEND_TESTS.bat` — runs the Laravel automated test suite after dependencies are installed

## Frontend development

```powershell
npm --prefix frontend ci
npm --prefix frontend run dev
```

Vite runs at `http://127.0.0.1:5173` and proxies `/api` to Laravel on port 8080.

Rebuild and copy production assets:

```powershell
npm run build
```

Validate frontend quality:

```powershell
npm run lint
npm run test:frontend
```

## Production deployment

For production deployment:

1. Use PHP 8.2+ with the extensions documented in `backend/docs/DEPLOYMENT.md`.
2. Point the web-server document root to `backend/public`, never the project root.
3. Copy `backend/.env.production.example` to `backend/.env` and supply real secrets.
4. Run `composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction`.
5. Run `php artisan migrate --force` and `php artisan optimize`.
6. Enforce HTTPS, use a least-privilege database account, disable debug mode, configure queues as needed, and establish tested backups.
7. Change all seeded credentials and remove test accounts not required in production.

Detailed server guidance is in `backend/docs/DEPLOYMENT.md`.
