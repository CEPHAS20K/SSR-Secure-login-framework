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
  +POST /auth/verify-otp
  +POST /auth/webauthn/register/begin
  +POST /auth/webauthn/register/finish
  +POST /auth/webauthn/login/begin
  +POST /auth/webauthn/login/finish
  +POST /api/rum
}

class AdminRoutes {
  +GET /admin/login
  +GET /admin/dashboard
}

class PublicController {
  +renderLanding()
  +renderLogin()
  +renderRegister()
  +login()
  +register()
  +verifyOtp()
  +beginWebAuthnRegistration()
  +finishWebAuthnRegistration()
  +beginWebAuthnLogin()
  +finishWebAuthnLogin()
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

class RiskEngine {
  +assessRisk()
  +adaptiveMfa()
}

class RedisCache {
  +OTP cache
  +rate-limit counters
  +login velocity
}

class PostgresDB {
  +users
  +otp_tokens
  +sessions
  +trusted_devices
  +login_attempts
}

class WebAuthnService {
  +beginChallenge()
  +verifyAssertion()
}

class DeviceFingerprint {
  +collect fingerprint
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
Browser --> DeviceFingerprint : collect signal
ExpressApp --> Middleware
ExpressApp --> PublicRoutes
ExpressApp --> AdminRoutes
PublicRoutes --> PublicController
AdminRoutes --> AdminController
PublicController --> Views
AdminController --> Views
PublicController --> MailerService
PublicController --> RiskEngine
PublicController --> RedisCache
PublicController --> PostgresDB
PublicController --> WebAuthnService
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
participant D as Device Fingerprint
participant K as Risk Engine
participant P as Postgres
participant X as Redis
participant S as Mailer Service
participant W as WebAuthn Service

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

U->>B: Submit login form
B->>D: collect fingerprint
B->>A: POST /auth/login (email/password/fingerprint)
A->>M: validation/rate-limit/logging
M->>R: route match
R->>C: login handler
C->>P: fetch user + record attempt
C->>K: assessRisk(ip/device/velocity)
K-->>C: score + step-up policy
alt Low risk
  C->>P: create session
  C-->>B: 200 session token
else OTP required
  C->>P: upsert otp_tokens
  C->>X: cache OTP hash + TTL
  C->>S: send OTP email
  S-->>C: delivery result
  C-->>B: requiresOtp
  U->>B: Enter OTP
  B->>A: POST /auth/verify-otp
  A->>C: verifyOtp
  C->>X: read OTP hash
  C->>P: verify + create session
  opt Trust device
    C->>P: upsert trusted_devices
  end
  C-->>B: 200 session token
else WebAuthn required
  C->>W: begin challenge
  W-->>C: challenge
  C-->>B: requiresWebAuthn + challenge
  B->>W: WebAuthn API (hardware key)
  B->>A: POST /auth/webauthn/login/finish
  A->>C: finishWebAuthnLogin
  C->>W: verify assertion
  C->>P: create session
  C-->>B: 200 session token
end
```

<!-- END AUTO UML -->

## Quick Start

From project root:

```bash
npm run setup
npm run dev
```

## Important Notes

- Do not commit secrets: keep `backend/.env.dev` and `backend/.env.proc` local/server-only.
- `frontend/public/css/output.css` is generated. Edit `frontend/public/css/input.css` and run `npm run build:frontend`.
- Frontend RUM is enabled by default: `frontend/public/js/web-vitals-rum.js` sends `LCP`, `CLS`, `INP`, `FIELD_ACTIVE_MS` to `POST /api/rum`.
- Admin exposure is controlled server-side: use `ADMIN_ENABLED`, `ADMIN_INTERNAL_ONLY`, and `ADMIN_ALLOW_IPS` in env.
- Static assets are versioned via `assetPath(...)?v=...`; bump `ASSET_VERSION` (or `APP_VERSION`) on deploy to force fresh client assets.

## Main Commands

- `npm run setup`: install root, backend, and frontend dependencies.
- `npm run dev`: run backend dev server + frontend Tailwind watcher.
- `npm run dev:backend`: run backend only.
- `npm run dev:frontend`: run frontend watcher only.
- `npm run build`: build frontend CSS.
- `npm run start`: start backend in development mode.
- `npm run start:proc`: build frontend + start backend in production mode.
- `npm run demo:video`: auto-record a walkthrough video (landing/login/register/admin) to `artifacts/demo-videos/`.
- `DEMO_SPEED_MULTIPLIER=2.2 npm run demo:video`: slower walkthrough recording.
- `DEMO_SPEED_MULTIPLIER=1.2 npm run demo:video`: faster walkthrough recording.
- `npm run docs:generate-uml`: regenerate `docs/architecture.md` and the README UML section.

Demo video notes:

- Default speed is `DEMO_SPEED_MULTIPLIER=1.6`.
- Install ffmpeg for automatic MP4 output: `sudo apt update && sudo apt install -y ffmpeg`

## Testing

- `npm run test:api`: backend API tests (Vitest + supertest).
- `npm run test:e2e`: browser E2E tests (Playwright).
- `npm run test`: runs API + E2E tests.
- `npm run test:all`: runs API + E2E + bundle budget + Lighthouse checks.
- `npm run lint`: frontend JavaScript lint checks.
- `npm run optimize:svg`: run SVGO (`--multipass`) on all files in `frontend/public/images` using `svgo.config.js`.

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

#### Custom ports for tests

- Backend API tests respect `TEST_HOST`/`TEST_PORT` (default `127.0.0.1:3999`):  
  `TEST_PORT=3004 TEST_HOST=127.0.0.1 SKIP_NETWORK_TESTS=false npm run test:api`
- Playwright E2E uses `E2E_HOST`/`E2E_PORT` (default `127.0.0.1:4173`):  
  `E2E_PORT=3004 E2E_HOST=127.0.0.1 SKIP_WEB_TESTS=false npm run test:e2e`
- Full suite with custom port:  
  `TEST_PORT=3004 TEST_HOST=127.0.0.1 E2E_PORT=3004 E2E_HOST=127.0.0.1 SKIP_NETWORK_TESTS=false SKIP_WEB_TESTS=false npm run test`

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
- `POST /api/rum` accepts frontend Web Vitals + field activity metrics (`LCP`, `CLS`, `INP`, `FIELD_ACTIVE_MS`) for structured logging.
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
- SMTP for OTP/email:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
  - `SMTP_SECURE` (true/false)
  - `SMTP_FROM` (default: no-reply@example.com)
  - If unset, emails fall back to console JSON transport (dev only).

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
