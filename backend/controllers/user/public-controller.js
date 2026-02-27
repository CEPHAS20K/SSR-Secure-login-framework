"use strict";

const { z } = require("zod");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { pool } = require("../../database/pool");
const { redis } = require("../../services/redis-client");
const { sendOtpEmail } = require("../../services/mailer");
const { assessRisk } = require("../../services/risk-engine");

const loginPayloadSchema = z.object({
  email: z
    .string({
      error: "Email is required.",
    })
    .trim()
    .email("Provide a valid email address.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string({
      error: "Password is required.",
    })
    .trim()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be less than 128 characters."),
});

const registerPayloadSchema = z
  .object({
    username: z
      .string({
        error: "Username is required.",
      })
      .trim()
      .min(3, "Username must be at least 3 characters.")
      .max(60, "Username must be less than 60 characters."),
    email: z
      .string({
        error: "Email is required.",
      })
      .trim()
      .email("Provide a valid email address.")
      .transform((value) => value.toLowerCase()),
    password: z
      .string({
        error: "Password is required.",
      })
      .trim()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must be less than 128 characters."),
    confirmPassword: z
      .string({
        error: "Confirm password is required.",
      })
      .trim()
      .min(8, "Confirm password must be at least 8 characters.")
      .max(128, "Confirm password must be less than 128 characters."),
    gender: z
      .string({
        error: "Gender is required.",
      })
      .trim()
      .min(1, "Gender is required.")
      .max(24, "Gender must be less than 24 characters."),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

const authNotConfiguredResponse = {
  error: "Authentication backend is not configured yet. Connect your database and auth service.",
  code: "AUTH_NOT_CONFIGURED",
};

const acceptedGenders = new Set(["male", "female"]);
const acceptedRumMetrics = new Set(["LCP", "CLS", "INP", "FIELD_ACTIVE_MS"]);
const safeNoStoreHeaders = {
  "Cache-Control": "no-store",
};
const rumMetricSchema = z.object({
  name: z
    .string({
      error: "Metric name is required.",
    })
    .trim()
    .min(1)
    .max(16),
  value: z
    .number({
      error: "Metric value is required.",
    })
    .finite()
    .nonnegative()
    .max(600000),
  path: z
    .string({
      error: "Path is required.",
    })
    .trim()
    .min(1)
    .max(400),
  page: z.string().trim().max(80).optional().default(""),
  connectionType: z.string().trim().max(32).optional().default(""),
  fieldName: z.string().trim().max(120).optional().default(""),
  phase: z.string().trim().max(64).optional().default(""),
  timestamp: z
    .string({
      error: "Timestamp is required.",
    })
    .datetime({ offset: true }),
});

function createPublicController(options = {}) {
  const { logger = console, appVersion = "dev", assetVersion = "dev" } = options;
  const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 5);
  const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 5);

  function renderLanding(req, res) {
    res.render("pages/user/landing", {
      title: "Secure Storage Vault",
      activePage: "landing",
      page: "landing",
    });
  }

  function renderLogin(req, res) {
    res.set(safeNoStoreHeaders);
    res.render("pages/user/login", {
      title: "Login",
      activePage: "login",
      page: "login",
    });
  }

  function renderRegister(req, res) {
    res.set(safeNoStoreHeaders);
    res.render("pages/user/register", {
      title: "Register",
      activePage: "register",
      page: "register",
    });
  }

  function login(req, res) {
    (async () => {
      const parsedPayload = loginPayloadSchema.safeParse(req.body || {});
      if (!parsedPayload.success) {
        const firstIssue = parsedPayload.error.issues[0];
        res.status(400).json({ error: firstIssue?.message || "Invalid login payload." });
        return;
      }

      const client = await pool.connect();
      const ip = req.ip || req.socket?.remoteAddress || null;
      const fingerprint = req.body?.fingerprint || null;
      try {
        // Brute-force lock check
        const lockKey = `lock:user:${parsedPayload.data.email}`;
        const locked = await redis.ttl(lockKey);
        if (locked > 0) {
          res.status(423).json({ error: "Account temporarily locked. Try again later." });
          return;
        }

        const userQuery = await client.query(
          `SELECT id, password_hash, last_login_ip FROM users WHERE lower(email)=lower($1)`,
          [parsedPayload.data.email]
        );
        if (userQuery.rowCount === 0) {
          res.status(401).json({ error: "Invalid credentials." });
          return;
        }
        const user = userQuery.rows[0];
        const passwordOk = await bcrypt.compare(parsedPayload.data.password, user.password_hash);
        await client.query(
          `INSERT INTO login_attempts (user_id, ip, success, created_at) VALUES ($1,$2,$3,now())`,
          [user.id, ip, passwordOk]
        );
        if (!passwordOk) {
          const failKey = `fail:user:${user.id}`;
          const fails = await redis.incr(failKey);
          await redis.expire(failKey, 15 * 60); // 15 minutes window
          if (fails >= MAX_FAILED_ATTEMPTS) {
            await redis.setex(lockKey, ACCOUNT_LOCK_MINUTES * 60, "1");
          }
          res.status(401).json({ error: "Invalid credentials." });
          return;
        }

        const risk = await assessRisk({
          client,
          userId: user.id,
          ip,
          fingerprint,
          headers: req.headers || {},
        });
        const { requiresOtp, requiresWebAuthn } = risk;

        if (!requiresOtp && !requiresWebAuthn) {
          const sessionToken = await issueSession(client, user.id, fingerprint);
          res.status(200).json({
            sessionToken,
            userId: user.id,
            risk: risk.score,
            trusted: risk.trustedDevice,
          });
          return;
        }

        if (requiresOtp) {
          const { otp, otpHash, expiresAt } = await generateOtp();
          await client.query(
            `
            INSERT INTO otp_tokens (user_id, otp_hash, expires_at)
            VALUES ($1,$2,$3)
            ON CONFLICT (user_id) DO UPDATE
              SET otp_hash=EXCLUDED.otp_hash, expires_at=EXCLUDED.expires_at, created_at=now()
          `,
            [user.id, otpHash, expiresAt]
          );
          try {
            await redis.setex(`otp:user:${user.id}`, Math.floor(OTP_TTL_MS / 1000), otpHash);
          } catch (error) {
            logger.warn({ err: error }, "Failed to cache OTP in redis");
          }
          try {
            await sendOtpEmail(parsedPayload.data.email, otp);
          } catch (error) {
            logger.warn({ err: error }, "Failed to send OTP email");
            logger.info({ email: parsedPayload.data.email, otp }, "Dev OTP (email fallback)");
          }
        }

        res.status(200).json({
          userId: user.id,
          requiresOtp,
          requiresWebAuthn,
          risk: risk.score,
          reasons: risk.reasons,
        });
      } catch (error) {
        logger.error({ err: error }, "Login failed");
        res.status(500).json({ error: "Login failed. Try again." });
      } finally {
        client.release();
      }
    })();
  }

  function register(req, res) {
    (async () => {
      const parsedPayload = registerPayloadSchema.safeParse(req.body || {});
      if (!parsedPayload.success) {
        const firstIssue = parsedPayload.error.issues[0];
        res.status(400).json({ error: firstIssue?.message || "Invalid registration payload." });
        return;
      }

      const normalizedGender = String(parsedPayload.data.gender || "").toLowerCase();
      if (!acceptedGenders.has(normalizedGender)) {
        res.status(400).json({ error: "Gender must be one of: male, female." });
        return;
      }

      const client = await pool.connect();

      try {
        const existing = await client.query(
          `
          SELECT 1 FROM users
          WHERE lower(email) = lower($1) OR lower(username) = lower($2)
          LIMIT 1
        `,
          [parsedPayload.data.email, parsedPayload.data.username]
        );
        if (existing.rowCount > 0) {
          res.status(409).json({ error: "Username or email already exists." });
          return;
        }

        const passwordHash = await bcrypt.hash(parsedPayload.data.password, saltRounds);
        const insertUser = await client.query(
          `
            INSERT INTO users (username, email, password_hash, gender)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `,
          [parsedPayload.data.username, parsedPayload.data.email, passwordHash, normalizedGender]
        );

        const userId = insertUser.rows[0].id;
        const otp = String(Math.floor(100000 + Math.random() * 900000)).slice(0, 5);
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);

        await client.query(
          `
            INSERT INTO otp_tokens (user_id, otp_hash, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO UPDATE
              SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, created_at = now()
          `,
          [userId, otpHash, expiresAt]
        );

        // Cache OTP in Redis with TTL for fast lookup (optional)
        try {
          await redis.setex(`otp:user:${userId}`, Math.floor(OTP_TTL_MS / 1000), otpHash);
        } catch (error) {
          logger.warn({ err: error }, "Failed to cache OTP in redis");
        }

        try {
          await sendOtpEmail(parsedPayload.data.email, otp);
        } catch (error) {
          logger.warn({ err: error }, "Failed to send OTP email");
          // For dev visibility, log OTP if email fails
          logger.info({ email: parsedPayload.data.email, otp }, "Dev OTP (email fallback)");
        }

        res.status(201).json({
          userId,
          requiresOtp: true,
          message: "Registration successful. Verify OTP to continue.",
        });
      } catch (error) {
        logger.error({ err: error }, "Registration failed");
        res.status(500).json({ error: "Registration failed. Try again." });
      } finally {
        client.release();
      }
    })();
  }

  function health(req, res) {
    res.status(200).json({
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: appVersion,
    });
  }

  function getVersion(req, res) {
    res.status(200).json({
      app: "Secure Storage Vault",
      version: appVersion,
      assetVersion,
    });
  }

  function ingestRumMetric(req, res) {
    const parsedPayload = rumMetricSchema.safeParse(req.body || {});
    if (!parsedPayload.success) {
      res.status(400).json({ error: "Invalid RUM payload." });
      return;
    }

    const metric = parsedPayload.data;
    if (!acceptedRumMetrics.has(metric.name)) {
      res.status(400).json({ error: "Unsupported metric name." });
      return;
    }

    if (typeof logger.info === "function") {
      logger.info(
        {
          route: "/api/rum",
          metric: metric.name,
          value: metric.value,
          path: metric.path,
          page: metric.page,
          fieldName: metric.fieldName,
          connectionType: metric.connectionType,
          timestamp: metric.timestamp,
          userAgent: req.get("user-agent") || "",
          ip: req.ip || req.socket?.remoteAddress || "",
        },
        "Frontend web vital received"
      );
    }

    res.status(202).json({ accepted: true });
  }

  async function verifyOtp(req, res) {
    const userId = String(req.body?.userId || "").trim();
    const otp = String(req.body?.otp || "").trim();
    const fingerprint = req.body?.fingerprint || null;
    const trustDevice = Boolean(req.body?.trustDevice);
    if (!userId || !otp) {
      res.status(400).json({ error: "userId and otp are required." });
      return;
    }

    const client = await pool.connect();
    try {
      const otpHash =
        (await redis.get(`otp:user:${userId}`)) ||
        (await (async () => {
          const otpRow = await client.query(
            `SELECT otp_hash FROM otp_tokens WHERE user_id=$1 AND expires_at > now()`,
            [userId]
          );
          return otpRow.rows[0]?.otp_hash || null;
        })());

      if (!otpHash) {
        res.status(400).json({ error: "OTP expired or not found." });
        return;
      }

      const ok = await bcrypt.compare(otp, otpHash);
      if (!ok) {
        res.status(400).json({ error: "Invalid OTP." });
        return;
      }

      const sessionToken = await issueSession(client, userId, fingerprint);

      if (trustDevice && fingerprint) {
        await client.query(
          `
          INSERT INTO trusted_devices (user_id, fingerprint, trusted, last_seen)
          VALUES ($1,$2,true,now())
          ON CONFLICT (fingerprint) DO UPDATE SET trusted=true, last_seen=now(), user_id=$1
        `,
          [userId, fingerprint]
        );
      }

      await redis.del(`otp:user:${userId}`);
      await client.query(`DELETE FROM otp_tokens WHERE user_id=$1`, [userId]);

      res.status(200).json({
        sessionToken,
        userId,
        message: "OTP verified.",
      });
    } catch (error) {
      logger.error({ err: error }, "OTP verification failed");
      res.status(500).json({ error: "OTP verification failed." });
    } finally {
      client.release();
    }
  }

  async function beginWebAuthnRegistration(req, res) {
    res.status(501).json({ error: "WebAuthn registration not implemented yet." });
  }

  async function finishWebAuthnRegistration(req, res) {
    res.status(501).json({ error: "WebAuthn registration not implemented yet." });
  }

  async function beginWebAuthnLogin(req, res) {
    res.status(501).json({ error: "WebAuthn login not implemented yet." });
  }

  async function finishWebAuthnLogin(req, res) {
    res.status(501).json({ error: "WebAuthn login not implemented yet." });
  }

  async function issueSession(client, userId, fingerprint) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    await client.query(
      `
      INSERT INTO sessions (user_id, session_token, device_fingerprint, expires_at, created_at)
      VALUES ($1,$2,$3,$4,now())
    `,
      [userId, token, fingerprint, expires]
    );
    await client.query(`UPDATE users SET last_login=now(), last_login_ip=$2 WHERE id=$1`, [
      userId,
      null,
    ]);
    return token;
  }

  async function generateOtp() {
    const otp = String(Math.floor(100000 + Math.random() * 900000)).slice(0, 5);
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    return { otp, otpHash, expiresAt };
  }

  return {
    renderLanding,
    renderLogin,
    renderRegister,
    login,
    register,
    verifyOtp,
    beginWebAuthnRegistration,
    finishWebAuthnRegistration,
    beginWebAuthnLogin,
    finishWebAuthnLogin,
    ingestRumMetric,
    health,
    getVersion,
  };
}

module.exports = {
  createPublicController,
};
