# Architecture (Frontend + Backend)

This document shows how the browser, SSR frontend, and Express backend work together.

## Class Diagram

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

## Sequence Diagram

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

## Notes

- `assetPath()` appends asset version data for cache-busting.
- `X-App-Version` response header exposes backend app version.
- Service worker supports offline fallback and cached static resources.
