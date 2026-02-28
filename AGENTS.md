# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Server-rendered authentication system built with Express 5 + Pug templates. Features login/register flows with adaptive MFA (OTP email, WebAuthn stubs), a risk engine, admin dashboard, and performance monitoring (Web Vitals RUM). Backed by PostgreSQL and Redis via Docker Compose.

## Commands

All commands run from the repository root.

### Setup & Dev

```bash
npm run setup          # Install root + backend + frontend dependencies
npm run dev            # Concurrent: backend (nodemon) + frontend (Tailwind watcher)
npm run dev:backend    # Backend only (nodemon on backend/app.js)
npm run dev:frontend   # Tailwind CSS watcher only
docker compose up -d   # Start PostgreSQL + Redis containers
```

### Build & Start

```bash
npm run build                # Build frontend CSS (Tailwind minified)
npm run start                # Start backend in dev mode (auto-starts docker compose)
npm run start:proc           # Build frontend + start backend in production mode
```

### Testing

```bash
npm run test:api             # Backend API tests (Vitest + supertest)
npm run test:e2e             # Browser E2E tests (Playwright, Chromium)
npm run test                 # API + E2E combined
npm run test:all             # API + E2E + bundle budget + Lighthouse
npm run check:bundle-size    # Static asset size budgets
npm run perf:lighthouse      # Lighthouse CI assertions
```

Run a single Vitest test file:

```bash
npm --prefix ./backend exec vitest -- run --globals tests/public-routes.test.js
```

Run a single Playwright spec:

```bash
SKIP_WEB_TESTS=false npx playwright test e2e/auth-flow.spec.js
```

Refresh visual snapshots:

```bash
npm run test:e2e -- e2e/auth-visual.spec.js --update-snapshots=all
```

E2E tests require `npx playwright install chromium` once. Tests are skipped by default unless `SKIP_WEB_TESTS=false`. The Playwright config auto-starts the backend on `127.0.0.1:4173`.

API tests skip network by default (`SKIP_NETWORK_TESTS=true`). For live tests against a running DB/Redis:

```bash
npm run test:api:live
```

### Linting & Formatting

```bash
npm run lint               # Frontend JS lint (ESLint)
npm run lint:all           # Backend + frontend lint
npm run format             # Prettier write
npm run format:check       # Prettier check
npm run check              # format:check + lint + build
```

### Custom Test Ports

```bash
TEST_PORT=3004 TEST_HOST=127.0.0.1 npm run test:api
E2E_PORT=3004 E2E_HOST=127.0.0.1 SKIP_WEB_TESTS=false npm run test:e2e
```

## Architecture

### Monorepo Layout

- `backend/` — Express 5 server (CommonJS, `require`), entry point: `backend/app.js`
- `frontend/` — Pug views (`frontend/views/`) + static assets (`frontend/public/`), Tailwind CSS build
- `e2e/` — Playwright E2E specs
- `scripts/` — Build/check utilities (bundle-size, demo-video, UML generation)
- `deploy/` — Deployment configs
- `docs/` — Architecture docs and guides

### Backend Structure

`backend/app.js` is the single entry point. It exports `createApp()` (returns Express app + config) and `startServer()`. Tests use `createApp()` directly with env overrides.

**Pattern:** Factory functions everywhere — controllers, middleware, and the app itself are created via factory functions that accept options/dependencies (logger, config, etc.), not singletons.

- `controllers/user/public-controller.js` — All public auth logic (login, register, OTP, password reset, RUM ingestion, health). Created via `createPublicController()`.
- `controllers/admin/admin-controller.js` — Admin dashboard rendering. Created via `createAdminController()`.
- `routes/user/public-routes.js` — `registerPublicRoutes(app, {publicController})` wires routes to controller methods. Per-route rate limiting is applied here using the custom Redis-backed rate limiter.
- `routes/admin/admin-routes.js` — Admin route registration.
- `middleware/rate-limit.js` — Custom Redis-backed rate limiter (fails open if Redis is down). Disabled in test via `DISABLE_RATE_LIMIT=true`.
- `middleware/admin/admin-access.js` — IP-based admin access guard.
- `database/pool.js` — Single `pg.Pool` instance from `DATABASE_URL` env var.
- `database/init.sql` — Full PostgreSQL schema (users, login_attempts, otp_tokens, sessions, trusted_devices, webauthn_credentials, password_resets, rum_events).
- `services/redis-client.js` — ioredis client; stubs to no-ops when `DISABLE_REDIS=true` or `NODE_ENV=test`.
- `services/risk-engine.js` — Heuristic risk scoring (IP denylist, ASN, proxy detection, login velocity, device trust, geo anomaly). Score ≥55 triggers OTP; ≥85 triggers WebAuthn.
- `services/mailer.js` — Nodemailer transport; falls back to JSON console transport when SMTP is not configured.

### Frontend Structure

No frontend bundler — browser-native ES modules loaded via `<script>` tags in Pug templates. Tailwind CSS is the only build step (`input.css` → `output.css`).

- `frontend/views/layouts/base.pug` — Base layout; conditionally loads GSAP, fonts, and RUM script per page.
- `frontend/views/pages/` — Page templates (user: landing/login/register, admin: login/dashboard).
- `frontend/views/components/` — Shared Pug mixins (button, navbar, footer, form controls).
- `frontend/public/js/lib/` — Shared client-side utilities (API client, form UX, Zod schemas, toast, modal a11y).
- `frontend/public/js/pages/` — Page-specific JS modules.
- `frontend/public/css/output.css` — **Generated file.** Edit `input.css`, then `npm run build:frontend`.
- `frontend/public/vendor/` — Vendored GSAP + Notyf (synced from node_modules during build/dev).

Asset versioning: `assetPath(url)` appends `?v=<ASSET_VERSION>` to all static asset URLs. Bump `ASSET_VERSION` or `APP_VERSION` on deploy.

### Validation

Zod v4 is used for server-side request validation (login, register, OTP, RUM payloads, password reset). Schemas are defined inline in the controller files. Zod is also served to the browser at `/vendor/zod` for client-side validation.

### Test Architecture

- **API tests** (`backend/tests/`): Vitest + supertest. Tests create an app instance via `createApp()` with env overrides (`AUTH_BACKEND_DISABLED=true`, `DISABLE_REDIS=true`). A `withTestClient()` helper spins up an ephemeral HTTP server on port 0.
- **E2E tests** (`e2e/`): Playwright with Chromium. Includes flow tests and visual regression tests with baseline snapshots in `e2e/auth-visual.spec.js-snapshots/`.

### Key Environment Variables

Dev env: `backend/.env.dev`. Production env: `backend/.env.proc`.

- `AUTH_BACKEND_DISABLED` — Set `true` to stub all DB-dependent auth endpoints (returns 501). Auto-set in test.
- `DISABLE_REDIS` / `DISABLE_RATE_LIMIT` — Disable Redis/rate-limiting for testing.
- `ADMIN_ENABLED` / `ADMIN_INTERNAL_ONLY` / `ADMIN_ALLOW_IPS` — Control admin route exposure.
- `SENTRY_DSN` — Optional Sentry error reporting.
- `RUM_ENABLED` — Frontend Web Vitals collection (defaults to production-only).

### Code Style

- CommonJS (`require`/`module.exports`) throughout backend. Frontend uses ES modules.
- Prettier with `@prettier/plugin-pug`: double quotes, semicolons, trailing commas (es5), 100 char print width.
- Husky + lint-staged runs Prettier on commit for `*.{js,json,md,pug,css}`.

### Docker Services

PostgreSQL 18 and Redis 8.6 run via `docker-compose.yml`. DB name: `vault`, user: `vault-user`. Schema is in `backend/database/init.sql` (must be applied manually or via deployment scripts).

### Deployment

GitHub Actions CI (`.github/workflows/`): test, perf, and deploy workflows. Deploy pushes to server via SSH and runs `scripts/deploy.sh` with PM2.
