"use strict";

const crypto = require("crypto");

function createAdminAuth(options = {}) {
  const {
    secret = process.env.ADMIN_SESSION_SECRET || "dev-admin-secret",
    ttlHours = Number(process.env.ADMIN_SESSION_TTL_HOURS || 12),
    cookieName = "admin_session",
    secureCookies = process.env.NODE_ENV === "production",
  } = options;

  const ttlMs = Math.max(1, ttlHours) * 60 * 60 * 1000;

  function signToken(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    return `${data}.${signature}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
    const [data, signature] = token.split(".");
    if (!signature) return null;
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  }

  function issueAdminSession(res, username) {
    const now = Date.now();
    const payload = { sub: username, role: "admin", iat: now, exp: now + ttlMs };
    const token = signToken(payload);
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      maxAge: ttlMs,
      path: "/",
    });
    return payload;
  }

  function clearAdminSession(res) {
    res.clearCookie(cookieName, { path: "/" });
  }

  function getSessionFromRequest(req) {
    const token = req.cookies?.[cookieName];
    return verifyToken(token);
  }

  function requireAdminAuth(req, res, next) {
    const session = getSessionFromRequest(req);
    if (session) {
      req.admin = session;
      return next();
    }
    return res.redirect(302, "/admin/login");
  }

  function requireAdminApiAuth(req, res, next) {
    const session = getSessionFromRequest(req);
    if (session) {
      req.admin = session;
      return next();
    }
    res.status(401).json({ error: "Unauthorized" });
  }

  return {
    issueAdminSession,
    clearAdminSession,
    requireAdminAuth,
    requireAdminApiAuth,
    getSessionFromRequest,
  };
}

module.exports = {
  createAdminAuth,
};
