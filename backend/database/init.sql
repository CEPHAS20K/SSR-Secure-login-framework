
-- Complete PostgreSQL Schema for vault System

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================
-- USERS TABLE
-- =====================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(60) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    gender VARCHAR(10),
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ,
    last_login_ip INET,
    last_login_geo JSONB,
    avatar BYTEA,
    avatar_mime VARCHAR(60),
    avatar_updated_at TIMESTAMPTZ,
    CONSTRAINT chk_users_gender CHECK (gender IS NULL OR gender IN ('male','female'))
);

-- Case-insensitive uniqueness for email/username
CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));
CREATE UNIQUE INDEX idx_users_username_lower ON users (lower(username));
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- =====================================
-- LOGIN ATTEMPTS
-- =====================================
CREATE TABLE login_attempts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ip INET,
    success BOOLEAN,
    risk_score INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX idx_login_attempts_created_at ON login_attempts(created_at);

-- =====================================
-- OTP TOKENS
-- =====================================
CREATE TABLE otp_tokens (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_otp_expires ON otp_tokens(expires_at);

-- =====================================
-- TRUSTED DEVICES
-- =====================================
CREATE TABLE trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    hardware_key_id TEXT,
    trusted BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trusted_user ON trusted_devices(user_id);
CREATE INDEX idx_trusted_fingerprint ON trusted_devices(fingerprint);

-- =====================================
-- WEBAUTHN CREDENTIALS
-- =====================================
CREATE TABLE webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    sign_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webauthn_user ON webauthn_credentials(user_id);

-- =====================================
-- SESSIONS
-- =====================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    device_fingerprint TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- =====================================
-- PASSWORD RESET TOKENS
-- =====================================
CREATE TABLE password_resets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reset_token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_password_resets_expires ON password_resets(expires_at);

-- =====================================
-- RUM METRICS (LCP/CLS/INP/FIELD_ACTIVE_MS)
-- =====================================
CREATE TABLE rum_events (
    id BIGSERIAL PRIMARY KEY,
    user_agent TEXT,
    ip INET,
    name VARCHAR(16) NOT NULL,
    value NUMERIC(12,2) NOT NULL,
    path TEXT NOT NULL,
    page TEXT,
    field_name TEXT,
    connection_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rum_events_name ON rum_events(name);
CREATE INDEX idx_rum_events_created_at ON rum_events(created_at);
CREATE INDEX idx_rum_events_path ON rum_events(path);

-- =====================================
-- VAULT ITEMS (E2EE ciphertext only)
-- =====================================
CREATE TABLE vault_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(120),
    ciphertext BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    encryption_scheme VARCHAR(40) NOT NULL,
    version INT DEFAULT 1,
    attachment_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_accessed_at TIMESTAMPTZ
);
CREATE INDEX idx_vault_items_user ON vault_items(user_id);
CREATE INDEX idx_vault_items_created ON vault_items(created_at);
CREATE INDEX idx_vault_items_last_accessed ON vault_items(last_accessed_at);

CREATE TABLE vault_item_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_item_id UUID REFERENCES vault_items(id) ON DELETE CASCADE,
    version INT NOT NULL,
    ciphertext BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    encryption_scheme VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES users(id)
);
CREATE UNIQUE INDEX idx_vault_item_versions_unique ON vault_item_versions(vault_item_id, version);

CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_item_id UUID REFERENCES vault_items(id) ON DELETE CASCADE,
    blob_path TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    mime_type VARCHAR(120),
    ciphertext_key_wrap BYTEA,
    nonce BYTEA,
    auth_tag BYTEA,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_attachments_item ON attachments(vault_item_id);

CREATE TABLE key_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(120) NOT NULL,
    wrapped_data_key BYTEA NOT NULL,
    wrap_algo VARCHAR(40) NOT NULL,
    public_key_fingerprint VARCHAR(120),
    created_at TIMESTAMPTZ DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    UNIQUE(user_id, device_id)
);
CREATE INDEX idx_key_envelopes_user ON key_envelopes(user_id);

-- =====================================
-- AUDIT LOGS (append-only)
-- =====================================
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(64),
    target_id UUID,
    ip INET,
    user_agent TEXT,
    status VARCHAR(32),
    reason TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- =====================================
-- SEED DATA (for local testing only)
-- =====================================
INSERT INTO users (username, email, password_hash, gender, email_verified_at)
VALUES ('testuser', 'test@example.com', '$2b$10$cu3CZ8Zrnct56ydlQD.BSuRSZQGGSV5REdA0kOA1Z2LI819uV62.q', 'male', now())
ON CONFLICT DO NOTHING;

-- Test user credentials (local only):
-- username: demo
-- email: demo@vault.local
-- password: Test12345!AB
INSERT INTO users (username, email, password_hash, gender, email_verified_at)
VALUES ('demo', 'demo@vault.local', '$2b$10$nS7rifbFs5Hbd9WAi/YZwOYET8KippwJpEp2jjNI.zpPwjGr8/zT2', 'male', now())
ON CONFLICT DO NOTHING;
