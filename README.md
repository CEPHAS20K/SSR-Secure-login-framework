# Auth Project (SSR + Express + Pug)

Server-rendered auth project with landing, login/register flows, admin login gate, and performance-focused frontend assets.

## Architecture Guides

- Frontend deep dive: `FRONTEND_EXPLAINED.txt`
- Backend deep dive: `BACKEND_EXPLAINED.txt`

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

## Testing

- `npm run test:api`: backend API tests (Vitest + supertest).
- `npm run test:e2e`: browser E2E tests (Playwright).
- `npm run test`: runs API + E2E tests.
- `npm run test:all`: runs API + E2E + bundle budget + Lighthouse checks.

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
```

Notes:

- Run commands from repo root (`/home/kephas/Desktop/auth`).
- `test:e2e` auto-starts backend on `127.0.0.1:4173` via Playwright config.
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

Structured logs use `pino` + `pino-http`.

Optional Sentry integration:

- Set `SENTRY_DSN` to enable error reporting.
- Optional: `SENTRY_TRACES_SAMPLE_RATE` (0.0 to 1.0).

If `SENTRY_DSN` is not set, the app runs normally without Sentry.

## Environment

Development env file: `backend/.env.dev`  
Production env file: `backend/.env.proc`

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
