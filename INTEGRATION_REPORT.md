# Herald 2.0 Integration and Packaging Report

## Combined application

- React 19/Vite frontend source: `frontend`
- Laravel 12 API source: `backend`
- Compiled production frontend: `backend/public/app`
- Frontend API base: same-origin `/api/v1`
- Local application URL: `http://127.0.0.1:8080/app`
- No Docker files or Docker runtime dependency

## Premium frontend

- Persistent light and dark themes
- Preserved and improved post-login loading transition
- Responsive role-based navigation and mobile drawer
- Live API health, notifications, accessible dialogs, error boundary, and safer workflow confirmations
- International browser-locale formatting
- Reduced-motion support and improved keyboard accessibility
- Stronger validation and explicit success/error feedback

## XAMPP compatibility

- Target runtime: PHP 8.2+ and MariaDB/MySQL
- Default database: `herald` on `127.0.0.1:3306`
- Default local credentials: `root` with a blank password
- Windows setup detects XAMPP, validates PHP extensions, creates the database, installs dependencies, generates the application key, migrates, seeds, and checks routes

## Validation

- React ESLint: passed
- Vite production build: passed
- Production frontend copied into Laravel public assets: passed
- PHP syntax validation for 91 PHP files: passed
- 70 API route actions mapped to implemented public controller methods: passed
- JSON and OpenAPI YAML parsing: passed
- Production asset path and file existence checks: passed
- npm dependency audit: zero known vulnerabilities at package-install time

## Runtime dependency note

Composer dependencies are intentionally not bundled. `SETUP_XAMPP.bat` installs them on the Windows test machine. After setup, run `RUN_BACKEND_TESTS.bat` to execute Laravel's automated PHPUnit suite against that runtime.
