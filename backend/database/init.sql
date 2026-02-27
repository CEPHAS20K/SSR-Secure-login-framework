
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
