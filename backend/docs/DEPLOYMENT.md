# Herald Production Deployment Guide

## Server requirements

- PHP 8.2 or newer
- Ctype, cURL, DOM, Fileinfo, Filter, Hash, Mbstring, OpenSSL, PCRE, PDO, PDO MySQL, Session, Tokenizer, and XML extensions
- Composer 2
- MySQL 8+ or compatible MariaDB
- Apache, Nginx, or LiteSpeed with the document root set to `backend/public`

The project uses Laravel 12 so it remains compatible with XAMPP 8.2 for local testing. XAMPP itself is intended for local development; deploy production on a maintained server stack.

## Production environment

Copy `.env.production.example` to `.env`, then replace every placeholder. At minimum:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://herald.example.com
APP_KEY=base64:GENERATE_A_REAL_KEY
CORS_ALLOWED_ORIGINS=https://herald.example.com

DB_CONNECTION=mysql
DB_HOST=your-database-host
DB_PORT=3306
DB_DATABASE=herald
DB_USERNAME=herald_app
DB_PASSWORD=strong-secret
```

Generate the key once with:

```bash
php artisan key:generate --show
```

Store `.env` outside source control and restrict filesystem access.

## Release commands

Run from `backend`:

```bash
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan optimize
php artisan queue:restart
```

The React production build is already located at `public/app`. When frontend source changes, run `npm ci` and `npm run build` at the project root before deployment.

## Web server

The public document root must be the absolute path to `backend/public`. Apache must have `mod_rewrite` enabled and permit `.htaccess` overrides, or equivalent rewrite rules must be placed in the virtual host. Never expose `.env`, `vendor`, `storage`, database backups, or source directories.

Application paths:

- `/app` — React interface
- `/api/v1` — API
- `/api/v1/health` — health check
- `/docs/openapi.yaml` — API specification

## Queue and scheduler

Run a supervised worker:

```bash
php artisan queue:work --sleep=2 --tries=3 --timeout=90
```

Run the scheduler every minute:

```cron
* * * * * cd /absolute/path/backend && php artisan schedule:run >> /dev/null 2>&1
```

## Security and operations

- Enforce HTTPS and redirect HTTP to HTTPS.
- Replace all seeded passwords before shared access.
- Use a least-privilege application database account rather than root.
- Restrict CORS to exact trusted origins.
- Keep PHP, Laravel, Composer dependencies, the web server, and the database patched.
- Back up the database and private uploaded files; test restoration.
- Protect `storage/app/private` and serve downloads only through the authorization-checked controllers.
- Monitor the health endpoint, HTTP errors, failed jobs, queue depth, disk space, and database connectivity.
- Run `php artisan test` and frontend lint/build checks before every release.
