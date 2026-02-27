"use strict";

const { z } = require("zod");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { pool } = require("../../database/pool");
const { redis } = require("../../services/redis-client");
const {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendPasswordResetConfirmation,
} = require("../../services/mailer");
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

const forgotPasswordSchema = z.object({
  email: z
    .string({
      error: "Email is required.",
    })
    .trim()
    .email("Provide a valid email address.")
    .transform((value) => value.toLowerCase()),
});

const resetPasswordSchema = z
  .object({
    email: z
      .string({
        error: "Email is required.",
      })
      .trim()
      .email("Provide a valid email address.")
      .transform((value) => value.toLowerCase()),
    code: z
      .string({
        error: "Reset code is required.",
      })
      .trim()
      .regex(/^\d{5}$/, "Reset code must be 5 digits."),
    newPassword: z
      .string({
        error: "New password is required.",
      })
      .trim()
      .min(8, "New password must be at least 8 characters.")
      .max(128, "New password must be less than 128 characters."),
    confirmPassword: z
      .string({
        error: "Confirm password is required.",
      })
      .trim()
      .min(8, "Confirm password must be at least 8 characters.")
      .max(128, "Confirm password must be less than 128 characters."),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "New password and confirm password must match.",
      });
    }
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
  const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
  const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 5);
  const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 5);
  const AUTH_BACKEND_DISABLED =
    process.env.AUTH_BACKEND_DISABLED === "true" || process.env.NODE_ENV === "test";

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
      if (AUTH_BACKEND_DISABLED) {
        res.status(501).json(authNotConfiguredResponse);
        return;
      }
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
          res.status(423).json({
            error: "Account temporarily locked. Try again later.",
            retryAfterSeconds: locked,
          });
          return;
        }

        const userQuery = await client.query(
          `SELECT id, password_hash, last_login_ip, email_verified_at FROM users WHERE lower(email)=lower($1)`,
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
        let requiresOtp = risk.requiresOtp;
        let requiresWebAuthn = risk.requiresWebAuthn;
        const reasons = Array.isArray(risk.reasons) ? [...risk.reasons] : [];
        if (!user.email_verified_at) {
          requiresOtp = true;
          if (!reasons.includes("email_unverified")) {
            reasons.push("email_unverified");
          }
        }

        if (!requiresOtp && !requiresWebAuthn) {
          const sessionToken = await issueSession(client, user.id, fingerprint);
          res.status(200).json({
            sessionToken,
            userId: user.id,
            requiresOtp: false,
            requiresWebAuthn: false,
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
          reasons,
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
      if (AUTH_BACKEND_DISABLED) {
        res.status(501).json(authNotConfiguredResponse);
        return;
      }
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
          requiresWebAuthn: false,
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

  function requestPasswordReset(req, res) {
    (async () => {
      if (AUTH_BACKEND_DISABLED) {
        res.status(501).json(authNotConfiguredResponse);
        return;
      }
      const parsedPayload = forgotPasswordSchema.safeParse(req.body || {});
      if (!parsedPayload.success) {
        const firstIssue = parsedPayload.error.issues[0];
        res.status(400).json({ error: firstIssue?.message || "Invalid reset payload." });
        return;
      }

      const client = await pool.connect();
      try {
        const userQuery = await client.query(
          `SELECT id, email FROM users WHERE lower(email)=lower($1)`,
          [parsedPayload.data.email]
        );
        if (userQuery.rowCount === 0) {
          res.status(404).json({ error: "Email not found." });
          return;
        }

        const user = userQuery.rows[0];
        const { code, codeHash, expiresAt } = await generateResetCode();
        await client.query(
          `
            INSERT INTO password_resets (user_id, reset_token_hash, expires_at)
            VALUES ($1,$2,$3)
            ON CONFLICT (user_id) DO UPDATE
              SET reset_token_hash=EXCLUDED.reset_token_hash,
                  expires_at=EXCLUDED.expires_at,
                  created_at=now()
          `,
          [user.id, codeHash, expiresAt]
        );
        try {
          await redis.setex(`pwdreset:user:${user.id}`, Math.floor(RESET_TTL_MS / 1000), codeHash);
        } catch (error) {
          logger.warn({ err: error }, "Failed to cache reset code in redis");
        }
        try {
          await sendPasswordResetEmail(user.email, code, RESET_TTL_MS);
        } catch (error) {
          logger.warn({ err: error }, "Failed to send reset email");
          logger.info({ email: user.email, code }, "Dev reset code (email fallback)");
        }

        res.status(202).json({
          message: "Reset code sent. Check your email.",
        });
      } catch (error) {
        logger.error({ err: error }, "Password reset request failed");
        res.status(500).json({ error: "Unable to process reset request." });
      } finally {
        client.release();
      }
    })();
  }

  function resetPassword(req, res) {
    (async () => {
      if (AUTH_BACKEND_DISABLED) {
        res.status(501).json(authNotConfiguredResponse);
        return;
      }
      const parsedPayload = resetPasswordSchema.safeParse(req.body || {});
      if (!parsedPayload.success) {
        const firstIssue = parsedPayload.error.issues[0];
        res.status(400).json({ error: firstIssue?.message || "Invalid reset payload." });
        return;
      }

      const client = await pool.connect();
      try {
        const userQuery = await client.query(
          `SELECT id, email FROM users WHERE lower(email)=lower($1)`,
          [parsedPayload.data.email]
        );
        if (userQuery.rowCount === 0) {
          res.status(400).json({ error: "Invalid reset code or email." });
          return;
        }
        const user = userQuery.rows[0];

        const storedHash =
          (await redis.get(`pwdreset:user:${user.id}`)) ||
          (await (async () => {
            const row = await client.query(
              `SELECT reset_token_hash FROM password_resets WHERE user_id=$1 AND expires_at > now()`,
              [user.id]
            );
            return row.rows[0]?.reset_token_hash || null;
          })());

        if (!storedHash) {
          res.status(400).json({ error: "Reset code expired or invalid." });
          return;
        }

        const ok = await bcrypt.compare(parsedPayload.data.code, storedHash);
        if (!ok) {
          res.status(400).json({ error: "Reset code expired or invalid." });
          return;
        }

        const passwordHash = await bcrypt.hash(parsedPayload.data.newPassword, saltRounds);
        await client.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [
          user.id,
          passwordHash,
        ]);
        await client.query(`DELETE FROM password_resets WHERE user_id=$1`, [user.id]);
        await client.query(`DELETE FROM sessions WHERE user_id=$1`, [user.id]);
        await redis.del(`pwdreset:user:${user.id}`);

        try {
          await sendPasswordResetConfirmation(user.email);
        } catch (error) {
          logger.warn({ err: error }, "Failed to send reset confirmation email");
        }

        res.status(200).json({
          message: "Password updated. Please log in again.",
        });
      } catch (error) {
        logger.error({ err: error }, "Password reset failed");
        res.status(500).json({ error: "Unable to reset password." });
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

  function resendOtp(req, res) {
    (async () => {
      if (AUTH_BACKEND_DISABLED) {
        res.status(501).json(authNotConfiguredResponse);
        return;
      }
      const userId = String(req.body?.userId || "").trim();
      if (!userId) {
        res.status(400).json({ error: "userId is required." });
        return;
      }

      const client = await pool.connect();
      try {
        const userQuery = await client.query(`SELECT id, email FROM users WHERE id=$1`, [userId]);
        if (userQuery.rowCount === 0) {
          res.status(404).json({ error: "User not found." });
          return;
        }

        const cooldownKey = `otp:resend:${userId}`;
        const cooldown = await redis.ttl(cooldownKey);
        if (cooldown > 0) {
          res.status(429).json({
            error: "OTP resend cooldown active.",
            retryAfterSeconds: cooldown,
          });
          return;
        }

        const { otp, otpHash, expiresAt } = await generateOtp();
        await client.query(
          `
            INSERT INTO otp_tokens (user_id, otp_hash, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO UPDATE
              SET otp_hash=EXCLUDED.otp_hash, expires_at=EXCLUDED.expires_at, created_at=now()
          `,
          [userId, otpHash, expiresAt]
        );

        try {
          await redis.setex(`otp:user:${userId}`, Math.floor(OTP_TTL_MS / 1000), otpHash);
          await redis.setex(cooldownKey, OTP_RESEND_COOLDOWN_SECONDS, "1");
        } catch (error) {
          logger.warn({ err: error }, "Failed to cache OTP in redis");
        }

        try {
          await sendOtpEmail(userQuery.rows[0].email, otp);
        } catch (error) {
          logger.warn({ err: error }, "Failed to resend OTP email");
          logger.info({ email: userQuery.rows[0].email, otp }, "Dev OTP (email fallback)");
        }

        res.status(202).json({
          message: "OTP resent.",
          retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        });
      } catch (error) {
        logger.error({ err: error }, "OTP resend failed");
        res.status(500).json({ error: "Unable to resend OTP." });
      } finally {
        client.release();
      }
    })();
  }

  async function verifyOtp(req, res) {
    if (AUTH_BACKEND_DISABLED) {
      res.status(501).json(authNotConfiguredResponse);
      return;
    }
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
        res.status(400).json({ error: "OTP expired or invalid." });
        return;
      }

      const ok = await bcrypt.compare(otp, otpHash);
      if (!ok) {
        res.status(400).json({ error: "OTP expired or invalid." });
        return;
      }

      const sessionToken = await issueSession(client, userId, fingerprint);

      await client.query(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id=$1`,
        [userId]
      );

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

  async function generateResetCode() {
    const code = String(Math.floor(100000 + Math.random() * 900000)).slice(0, 5);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    return { code, codeHash, expiresAt };
  }

  return {
    renderLanding,
    renderLogin,
    renderRegister,
    login,
    register,
    requestPasswordReset,
    resetPassword,
    resendOtp,
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
