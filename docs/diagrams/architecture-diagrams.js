module.exports = {
  appName: "Secure Storage Vault",
  intro: "This document shows how the browser, SSR frontend, and Express backend work together.",
  classDiagram: `classDiagram
direction LR

class Browser {
  +Render Pug HTML
  +Run page JS modules
  +Register service worker
  +Encrypt vault data client-side
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
  +GET /admin/api/dashboard
  +GET /admin/api/users
  +GET /admin/api/vault/usage
  +POST /admin/api/vault/items
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
  +getDashboardSnapshot()
  +listUsers()
  +listUserDevices()
  +getUserTimeline()
}

class VaultController {
  +createVaultItem()
  +getVaultUsage()
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
  +vault_items
  +vault_item_versions
  +attachments
  +key_envelopes
  +audit_logs
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
AdminRoutes --> VaultController
PublicController --> Views
AdminController --> Views
PublicController --> MailerService
PublicController --> RiskEngine
PublicController --> RedisCache
PublicController --> PostgresDB
PublicController --> WebAuthnService
VaultController --> PostgresDB
VaultController --> AuditLogs : insert
AdminController --> PostgresDB
ExpressApp --> StaticAssets
ExpressApp --> Observability
ServiceWorker --> StaticAssets : cache/read`,
  sequenceDiagram: `sequenceDiagram
actor U as User
participant B as Browser
participant SW as Service Worker
participant A as Express App
participant M as Middleware Stack
participant R as Route
participant C as Public Controller
participant AC as Admin Controller
participant VC as Vault Controller
participant V as Pug View
participant D as Device Fingerprint
participant K as Risk Engine
participant P as Postgres
participant X as Redis
participant S as Mailer Service
participant W as WebAuthn Service
participant L as Audit Logs

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

== Encrypted Vault Write (Admin API) ==
U->>B: Encrypt secret client-side (AES-GCM)
B->>A: POST /admin/api/vault/items (ciphertext, nonce, authTag, bytes)
A->>M: auth + logging + rate-limit
M->>R: admin route match
R->>VC: createVaultItem()
VC->>P: sum existing vault bytes for user
alt Under quota
  VC->>P: insert vault_item + attachment_bytes
  VC->>L: append audit_logs (vault_item_create)
  VC-->>B: 201 + usage
else Over quota
  VC-->>B: 413 quota exceeded
end`,
  notes: [
    "`assetPath()` appends asset version data for cache-busting.",
    "`X-App-Version` response header exposes backend app version.",
    "Service worker supports offline fallback and cached static resources.",
    "Risk engine drives adaptive MFA (OTP/WebAuthn) based on device/IP/velocity signals.",
    "OTP values are stored hashed in Postgres and cached in Redis with TTL.",
  ],
};
