# Auth Project (SSR + Express + Pug)

Server-rendered auth project with landing, login/register flows, admin login gate, and performance-focused frontend assets.

## Architecture Guides

- Frontend deep dive: `docs/guides/FRONTEND_EXPLAINED.txt`
- Backend deep dive: `docs/guides/BACKEND_EXPLAINED.txt`
- Env setup guide: `docs/guides/ENV_SETUP.txt`
- Deployment guide: `docs/guides/DEPLOYMENT.md`
- Home server runbook: `docs/guides/HOME_SERVER_DOCKER_CADDY_CLOUDFLARE_RUNBOOK.txt`
- System UML: `docs/architecture.md`
- Diagram source: `docs/diagrams/architecture-diagrams.js`

<!-- BEGIN AUTO UML -->

## System UML

### Class Diagram

```mermaid
classDiagram
direction LR

class Browser {
  +Render Pug HTML
  +Run page JS modules
  +Register service worker
}

class ServiceWorker {
  +Cache static assets
  +Offline fallback
  +Versioned cache invalidation
}

class ExpressApp {
  +app.use(middleware)
  +app.use(routes)
}

class Middleware {
  +helmet()
  +compression()
  +pinoHttp()
  +error handlers
}

class PublicRoutes {
  +GET /
  +GET /login
  +GET /register
  +GET /health
  +GET /version
  +POST /auth/login
  +POST /auth/register
}

class AdminRoutes {
  +GET /admin/login
  +GET /admin/dashboard
}

class PublicController {
  +renderLanding()
  +renderLogin()
  +renderRegister()
  +health()
  +getVersion()
}

class AdminController {
  +renderAdminLogin()
  +renderDashboard()
}

class MailerService {
  +sendOtp()
}

class Observability {
  +Sentry capture
  +Pino logs
}

class Views {
  +Pug templates
  +assetPath() versioning
}

class StaticAssets {
  +CSS/JS/SVG
  +sw.js
  +manifest.webmanifest
}

Browser --> ExpressApp : HTTP requests
Browser --> ServiceWorker : register/use
ExpressApp --> Middleware
ExpressApp --> PublicRoutes
ExpressApp --> AdminRoutes
PublicRoutes --> PublicController
AdminRoutes --> AdminController
PublicController --> Views
AdminController --> Views
PublicController --> MailerService
ExpressApp --> StaticAssets
ExpressApp --> Observability
ServiceWorker --> StaticAssets : cache/read
```

### Sequence Diagram

```mermaid
sequenceDiagram
actor U as User
participant B as Browser
participant SW as Service Worker
participant A as Express App
participant M as Middleware Stack
participant R as Route
participant C as Controller
participant V as Pug View
participant S as Mailer Service

U->>B: Open /register
B->>A: GET /register
A->>M: helmet/compression/logging
M->>R: public route match
R->>C: renderRegister()
C->>V: render register.pug + appVersion
V-->>C: HTML
C-->>B: HTML response (X-App-Version)
B->>SW: register sw.js
SW->>B: cache static assets

U->>B: Submit register form
B->>A: POST /auth/register (JSON/form)
A->>M: validation/rate-limit/logging
M->>R: route match
R->>C: register handler
C->>S: send OTP email (if enabled)
S-->>C: delivery result
C-->>B: success/error JSON
```

<!-- END AUTO UML -->

## Quick Start

From project root:

```bash
npm run setup
npm run dev
```

## Main Commands

- `npm run setup`: install root, backend, and frontend dependencies.
- `npm run dev`: run backend dev server + frontend Tailwind watcher.
- `npm run dev:backend`: run backend only.
- `npm run dev:frontend`: run frontend watcher only.
- `npm run build`: build frontend CSS.
- `npm run start`: start backend in development mode.
- `npm run start:proc`: build frontend + start backend in production mode.
- `npm run demo:video`: auto-record a walkthrough video (landing/login/register/admin) to `artifacts/demo-videos/`.
- `npm run docs:generate-uml`: regenerate `docs/architecture.md` and the README UML section.

## Testing

- `npm run test:api`: backend API tests (Vitest + supertest).
- `npm run test:e2e`: browser E2E tests (Playwright).
- `npm run test`: runs API + E2E tests.
- `npm run test:all`: runs API + E2E + bundle budget + Lighthouse checks.
- `npm run lint`: frontend JavaScript lint checks.
- `npm run optimize:svg`: minify landing/auth SVG assets (`land.svg`, `up.svg`, `off.svg`).

### Testing Guide For Next Developer

1. Install dependencies:

```bash
npm run setup
```

2. Install Playwright Chromium once (needed for E2E):

```bash
npx playwright install chromium
```

3. Run all automated tests:

```bash
npm run test:all
```

4. Run a single layer when debugging:

```bash
npm run test:api
npm run test:e2e
npm run check:bundle-size
npm run perf:lighthouse
npm run lint
```

Notes:

- Run commands from repo root (`/home/kephas/Desktop/auth`).
- `test:e2e` auto-starts backend on `127.0.0.1:4173` via Playwright config.
- Visual baselines live in `e2e/auth-visual.spec.js-snapshots/`.
- To refresh visual snapshots intentionally:

```bash
npm run test:e2e -- e2e/auth-visual.spec.js --update-snapshots=all
```

- `perf:lighthouse` is stricter and may take longer than API/E2E tests.

## Performance Budgets

- `npm run check:bundle-size`: enforces static asset size budgets.
- `npm run perf:lighthouse`: runs Lighthouse CI assertions from `lighthouserc.json`.

CI fails when performance or bundle-size budgets regress.

## Health and Observability

- `GET /health` returns:
  - `status`
  - `uptimeSeconds`
  - `timestamp`
  - `version`
- `GET /version` returns:
  - `app`
  - `version`
  - `assetVersion`
- `GET /api-docs` serves Swagger UI API documentation.
- `GET /api-docs.json` serves the raw OpenAPI JSON document.

Structured logs use `pino` + `pino-http`.

Optional Sentry integration:

- Set `SENTRY_DSN` to enable error reporting.
- Optional: `SENTRY_TRACES_SAMPLE_RATE` (0.0 to 1.0).

If `SENTRY_DSN` is not set, the app runs normally without Sentry.

## Environment

Development env file: `backend/.env.dev`  
Production env file: `backend/.env.proc`

Versioning envs:

- `APP_VERSION`: public application version shown in UI/footer and API responses.
- `ASSET_VERSION`: static asset cache-busting version appended to asset URLs.

## Docker Services (PostgreSQL + Redis)

From project root:

```bash
docker compose up -d
```

Stop services:

```bash
docker compose down
```

Connection details (default):

- PostgreSQL: `postgresql://authuser:authpass@127.0.0.1:5432/authdb`
- Redis: `redis://127.0.0.1:6379`

## Auto-Deploy From GitHub

This repo already includes `.github/workflows/deploy.yml`.
When configured, every push to `main` will SSH into your server and run `scripts/deploy.sh`.

### 1) Add GitHub Actions secrets

Required:

- `SSH_HOST`: server public IP or hostname
- `SSH_USER`: deploy user on server
- `SSH_KEY`: private key contents for that user

Optional:

- `SSH_PORT`: defaults to `22` if missing
- `SSH_PASSPHRASE`: only if your SSH key is encrypted
- `APP_DIR`: defaults to `/var/www/auth`
- `DEPLOY_BRANCH`: defaults to `main`
- `PM2_APP_NAME`: defaults to `auth-app`

### 2) Ensure server is ready

- Repo cloned on server at `APP_DIR`
- `pm2` installed globally
- Node/npm available
- `scripts/deploy.sh` executable

### 3) Deploy trigger

- Push to `main`, or
- Run workflow manually from GitHub Actions (`workflow_dispatch`)

### 4) Verify deployment

```bash
pm2 status
pm2 logs auth-app --lines 100
curl -I https://your-domain.com/health
```
