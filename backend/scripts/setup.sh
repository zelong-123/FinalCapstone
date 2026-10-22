#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v php >/dev/null || { echo "PHP 8.2+ is required." >&2; exit 1; }
command -v composer >/dev/null || { echo "Composer 2 is required." >&2; exit 1; }

[ -f .env ] || cp .env.example .env
composer install --no-interaction --prefer-dist --optimize-autoloader

if ! grep -q '^APP_KEY=base64:' .env; then
  php artisan key:generate --force
fi

mkdir -p storage/app/private storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views bootstrap/cache
chmod -R ug+rwX storage bootstrap/cache 2>/dev/null || true

php artisan migrate --force
php artisan db:seed --force
php artisan optimize:clear

echo "Backend ready. Start it with: php artisan serve --host=127.0.0.1 --port=8080"
