# Herald Laravel Backend

Laravel 12 API for Herald. The normal Windows testing workflow is documented in `../README.md` and uses XAMPP PHP 8.2 plus XAMPP MariaDB/phpMyAdmin.

## Routes

- API base: `/api/v1`
- Health: `/api/v1/health`
- OpenAPI: `/docs/openapi.yaml`
- Built React application: `/app`

## Commands

```powershell
C:\xampp\php\php.exe artisan migrate --seed
C:\xampp\php\php.exe artisan test
C:\xampp\php\php.exe artisan route:list --path=api/v1
```

Do not expose the project root through Apache. A production web server must point to `backend/public`.
