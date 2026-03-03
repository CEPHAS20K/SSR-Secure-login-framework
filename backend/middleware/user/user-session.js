"use strict";

const { pool } = require("../../database/pool");

function createUserSessionMiddleware(options = {}) {
  const {
    logger = console,
    cookieName = "user_session",
    enforceFingerprint = false,
    enforceIp = false,
    secureCookies = false,
  } = options;

  return async function userSessionMiddleware(req, res, next) {
    const token = req.cookies?.[cookieName];
    if (!token) return next();

    let client;
    try {
      client = await pool.connect();
      const row = await client.query(
        `
        SELECT s.id, s.user_id, s.device_fingerprint, s.expires_at,
               u.username, u.email, u.last_login_ip
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_token=$1
        LIMIT 1
      `,
        [token]
      );
      if (!row.rowCount) {
        clearUserCookie(res, cookieName, secureCookies);
        return next();
      }
      const session = row.rows[0];
      if (session.expires_at && new Date(session.expires_at) <= new Date()) {
        await client.query(`DELETE FROM sessions WHERE id=$1`, [session.id]);
        clearUserCookie(res, cookieName, secureCookies);
        return next();
      }

      const fingerprint = String(req.headers?.["x-device-fingerprint"] || "").trim();
      if (
        enforceFingerprint &&
        session.device_fingerprint &&
        fingerprint &&
        fingerprint !== session.device_fingerprint
      ) {
        req.sessionChallenge = "fingerprint_mismatch";
        return next();
      }
      if (enforceIp) {
        const requestIp = normalizeIp(
          req.headers?.["x-forwarded-for"]?.split(",")?.[0]?.trim() || req.ip || ""
        );
        const storedIp = session.last_login_ip ? String(session.last_login_ip) : "";
        if (requestIp && storedIp && requestIp !== storedIp) {
          req.sessionChallenge = "ip_mismatch";
          return next();
        }
      }

      req.user = {
        id: session.user_id,
        username: session.username,
        email: session.email,
        sessionId: session.id,
        sessionToken: token,
        deviceFingerprint: session.device_fingerprint || null,
      };
      return next();
    } catch (error) {
      if (logger?.warn) logger.warn({ err: error }, "User session lookup failed");
      return next();
    } finally {
      client?.release();
    }
  };
}

function createRequireUserSession(options = {}) {
  const { allowHeaderAuth = false } = options;
  return function requireUserSession(req, res, next) {
    if (req.sessionChallenge === "fingerprint_mismatch") {
      res.status(401).json({
        error: "Re-authentication required.",
        code: "FINGERPRINT_MISMATCH",
      });
      return;
    }
    if (req.sessionChallenge === "ip_mismatch") {
      res.status(401).json({
        error: "Re-authentication required.",
        code: "IP_MISMATCH",
      });
      return;
    }
    if (req.user?.id) return next();
    if (allowHeaderAuth) {
      const headerUserId = String(
        req.headers?.["x-user-id"] || req.query?.userId || req.body?.userId || ""
      ).trim();
      if (headerUserId) return next();
    }
    res.status(401).json({ error: "Authentication required." });
  };
}

function clearUserCookie(res, cookieName, secureCookies) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
  });
}

function normalizeIp(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("::ffff:")) return raw.slice(7);
  return raw;
}

module.exports = {
  createUserSessionMiddleware,
  createRequireUserSession,
};
