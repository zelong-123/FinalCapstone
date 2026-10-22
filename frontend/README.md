# Herald React Frontend

This Vite React application is the frontend for the Laravel API in `../backend`.

```bash
npm ci
npm run dev
npm run lint
npm run build
```

During development, Vite proxies `/api` to `http://127.0.0.1:8080`. Production builds use the `/app/` base path and are copied into `backend/public/app` by the root `npm run build` command.
