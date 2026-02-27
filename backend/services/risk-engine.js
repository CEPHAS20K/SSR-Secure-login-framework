"use strict";

/**
 * Simple heuristic risk engine (placeholder for real fraud service).
 *
 * Signals:
 * - Bad IP allowlist/denylist via env RISK_BAD_IP_LIST (comma-separated)
 * - High-risk ASN via env RISK_HIGH_ASN_LIST (comma-separated numbers)
 * - VPN/proxy hint if X-Forwarded-For has multiple hops
 * - Geo mismatch vs last_login_geo.country (uses CF-IPCountry or X-Country header)
 * - Velocity: recent failed logins in last 5 minutes
 * - Device mismatch: untrusted fingerprint
 */

const BAD_IPS = new Set(
  (process.env.RISK_BAD_IP_LIST || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
);
const HIGH_RISK_ASN = new Set(
  (process.env.RISK_HIGH_ASN_LIST || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
);

async function assessRisk({ client, userId, ip, fingerprint, headers = {} }) {
  let score = 10;
  const reasons = [];

  // IP reputation (simple list)
  if (ip && BAD_IPS.has(ip)) {
    score += 30;
    reasons.push("IP on denylist: +30");
  }

  // ASN check (from Cloudflare or proxy header)
  const asnHeader = headers["cf-asn"] || headers["x-asn"] || "";
  if (asnHeader && HIGH_RISK_ASN.has(String(asnHeader).trim())) {
    score += 20;
    reasons.push("High-risk ASN: +20");
  }

  // VPN/proxy hint: multiple XFF hops
  const xff = headers["x-forwarded-for"];
  if (xff && String(xff).split(",").length > 1) {
    score += 10;
    reasons.push("Multiple proxy hops (XFF): +10");
  }

  // Velocity: failed logins in last 5 minutes
  const failures = await client.query(
    `SELECT COUNT(*)::int AS failures
     FROM login_attempts
     WHERE user_id=$1 AND success=false AND created_at > now() - interval '5 minutes'`,
    [userId]
  );
  const failureCount = failures.rows[0]?.failures || 0;
  if (failureCount > 0) {
    const add = Math.min(25, failureCount * 8);
    score += add;
    reasons.push(`Recent failed logins: +${add}`);
  }

  // Trusted device check
  let trustedDevice = false;
  if (fingerprint) {
    const trustedRow = await client.query(
      `SELECT trusted FROM trusted_devices WHERE user_id=$1 AND fingerprint=$2`,
      [userId, fingerprint]
    );
    trustedDevice = trustedRow.rowCount > 0 && trustedRow.rows[0].trusted === true;
    if (!trustedDevice) {
      score += 15;
      reasons.push("Untrusted device: +15");
    }
  } else {
    score += 5;
    reasons.push("No device fingerprint: +5");
  }

  // Geo anomaly
  const country = (headers["cf-ipcountry"] || headers["x-country"] || "").toUpperCase();
  if (country) {
    const geoRow = await client.query(`SELECT last_login_geo FROM users WHERE id=$1`, [userId]);
    const lastGeo = geoRow.rows[0]?.last_login_geo || {};
    if (lastGeo.country && lastGeo.country !== country) {
      score += 15;
      reasons.push("Country change: +15");
    }
  }

  // Normalize
  score = Math.min(score, 100);
  const requiresWebAuthn = score >= 85;
  const requiresOtp = score >= 55;

  return { score, reasons, trustedDevice, requiresOtp, requiresWebAuthn };
}

module.exports = {
  assessRisk,
};
