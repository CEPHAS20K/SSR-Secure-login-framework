"use strict";

const net = require("net");

function createAdminInternalAccessGuard(options = {}) {
  const { enabled = true, allowList = [], logger = console } = options;

  const normalizedAllowList = Array.isArray(allowList)
    ? allowList.map((value) => normalizeIp(value)).filter(Boolean)
    : [];

  return function requireInternalAdminAccess(req, res, next) {
    if (!enabled) {
      next();
      return;
    }

    const clientIp = normalizeIp(req.ip || req.socket?.remoteAddress || "");
    const isAllowed =
      Boolean(clientIp) && (isInternalIp(clientIp) || normalizedAllowList.includes(clientIp));

    if (isAllowed) {
      next();
      return;
    }

    if (req?.log && typeof req.log.warn === "function") {
      req.log.warn(
        {
          route: req.originalUrl || req.url,
          ip: clientIp || req.ip || null,
          forwardedFor: req.headers["x-forwarded-for"] || null,
        },
        "Blocked admin route access from non-internal IP"
      );
    } else if (typeof logger.warn === "function") {
      logger.warn(
        {
          route: req.originalUrl || req.url,
          ip: clientIp || req.ip || null,
          forwardedFor: req.headers["x-forwarded-for"] || null,
        },
        "Blocked admin route access from non-internal IP"
      );
    }

    if (req.accepts("html")) {
      res.status(404).render("404", { title: "404 Not Found", page: "error" });
      return;
    }
    if (req.accepts("json")) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.status(404).type("txt").send("Not Found");
  };
}

function normalizeIp(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  if (raw === "::1") return "::1";

  if (raw.startsWith("::ffff:")) {
    const mapped = raw.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) return mapped;
  }

  // Strip IPv6 zone index like "fe80::1%eth0"
  const zoneIndexPosition = raw.indexOf("%");
  if (zoneIndexPosition > 0) {
    return raw.slice(0, zoneIndexPosition);
  }

  return raw;
}

function isInternalIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return false;
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA fc00::/7
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true; // fe80::/10
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10
  return false;
}

module.exports = {
  createAdminInternalAccessGuard,
};
