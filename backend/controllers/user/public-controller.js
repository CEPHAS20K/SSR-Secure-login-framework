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

const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "letmein123",
  "admin123",
  "admin1234",
  "welcome123",
  "test1234",
  "test12345",
  "changeme123",
]);

function getPasswordPolicyIssues(value) {
  const password = String(value || "");
  const issues = [];
  if (password.length < 12) {
    issues.push("Password must be at least 12 characters.");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("Password must include a lowercase letter.");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("Password must include an uppercase letter.");
  }
  if (!/\d/.test(password)) {
    issues.push("Password must include a number.");
  }
  if (!/[^\w\s]/.test(password)) {
    issues.push("Password must include a symbol.");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    issues.push("Password is too common. Choose a stronger one.");
  }
  return issues;
}

function addPasswordPolicyIssues(password, context, path) {
  const issues = getPasswordPolicyIssues(password);
  issues.forEach((message) => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message,
    });
  });
}

const loginPayloadSchema = z.object({
  login: z
    .string({
      error: "Email or username is required.",
    })
    .trim()
    .min(3, "Enter a valid email or username.")
    .max(120, "Login must be less than 120 characters."),
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
      .min(12, "New password must be at least 12 characters.")
      .max(128, "New password must be less than 128 characters."),
    confirmPassword: z
      .string({
        error: "Confirm password is required.",
      })
      .trim()
      .min(12, "Confirm password must be at least 12 characters.")
      .max(128, "Confirm password must be less than 128 characters."),
  })
  .superRefine((value, context) => {
    addPasswordPolicyIssues(value.newPassword, context, "newPassword");
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
      .max(15, "Username must be less than 15 characters."),
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
      .min(12, "Password must be at least 12 characters.")
      .max(128, "Password must be less than 128 characters."),
    confirmPassword: z
      .string({
        error: "Confirm password is required.",
      })
      .trim()
      .min(12, "Confirm password must be at least 12 characters.")
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
    addPasswordPolicyIssues(value.password, context, "password");
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
const MAX_AVATAR_BYTES = Number(process.env.MAX_AVATAR_BYTES || 512 * 1024); // 512 KB default
const allowedAvatarMimeTypes = ["image/png", "image/jpeg", "image/webp"];
function sniffAvatarMime(buffer) {
  if (!buffer || buffer.length < 12) return "";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}
const avatarUploadSchema = z.object({
  userId: z
    .string({
      error: "userId is required.",
    })
    .uuid("userId must be a UUID."),
  mimeType: z.enum(allowedAvatarMimeTypes, {
    error: "Avatar must be PNG, JPEG, or WebP.",
  }),
  avatarBase64: z
    .string({
      error: "Avatar is required.",
    })
    .trim()
    .min(16, "Avatar data is required."),
});
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
  const {
    logger = console,
    appVersion = "dev",
    assetVersion = "dev",
    secureCookies = false,
    userSessionCookie = "user_session",
  } = options;
  const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
  const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  const ACCOUNT_LOCK_MINUTES = Number(process.env.ACCOUNT_LOCK_MINUTES || 5);
  const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 5);
  const MAX_USERS = Number(process.env.MAX_USERS || 0); // 0 = unlimited
  const AUTH_BACKEND_DISABLED =
    process.env.AUTH_BACKEND_DISABLED === "true" || process.env.NODE_ENV === "test";
  const sessionCookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };

  const setUserSessionCookie = (res, token) => {
    res.cookie(userSessionCookie, token, sessionCookieOptions);
  };

  const clearUserSessionCookie = (res) => {
    res.clearCookie(userSessionCookie, sessionCookieOptions);
  };

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

  function renderDashboard(req, res) {
    res.set(safeNoStoreHeaders);
    res.render("pages/user/dashboard", {
      title: "Your Vault",
      activePage: "dashboard",
      page: "dashboard",
      appVersion,
    });
  }

  async function uploadAvatar(req, res) {
    if (AUTH_BACKEND_DISABLED) {
      res.status(501).json(authNotConfiguredResponse);
      return;
    }
    const parsed = avatarUploadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      res.status(400).json({ error: firstIssue?.message || "Invalid avatar payload." });
      return;
    }
    const { userId, avatarBase64, mimeType } = parsed.data;
    const avatarBuffer = decodeBase64Payload(avatarBase64);
    if (!avatarBuffer || !avatarBuffer.length) {
      res.status(400).json({ error: "Invalid avatar encoding." });
      return;
    }
    const sniffedMime = sniffAvatarMime(avatarBuffer);
    if (!sniffedMime || sniffedMime !== mimeType) {
      res.status(400).json({ error: "Avatar content does not match declared mime type." });
      return;
    }
    if (avatarBuffer.length > MAX_AVATAR_BYTES) {
      res.status(413).json({
        error: "Avatar too large.",
        maxBytes: MAX_AVATAR_BYTES,
        receivedBytes: avatarBuffer.length,
      });
      return;
    }

    const client = await safeGetClient(res, logger);
    if (!client) return;
    try {
      const update = await client.query(
        `
        UPDATE users
        SET avatar=$2, avatar_mime=$3, avatar_updated_at=now()
        WHERE id=$1
        RETURNING avatar_updated_at
      `,
        [userId, avatarBuffer, mimeType]
      );
      if (update.rowCount === 0) {
        res.status(404).json({ error: "User not found." });
        return;
      }
      await recordAudit(client, {
        req,
        actorUserId: userId,
        action: "profile_avatar_update",
        targetType: "user",
        targetId: userId,
        status: "success",
        meta: { bytes: avatarBuffer.length, mimeType },
      });
      res.status(200).json({
        message: "Avatar updated.",
        bytes: avatarBuffer.length,
        mimeType,
        updatedAt: update.rows[0].avatar_updated_at,
      });
    } catch (error) {
      logger.error({ err: error }, "uploadAvatar failed");
      res.status(500).json({ error: "Unable to save avatar right now." });
    } finally {
      client.release();
    }
  }

  async function getAvatar(req, res) {
    const userId = String(
      req.params?.userId || req.query?.userId || req.headers?.["x-user-id"] || ""
    ).trim();
    if (!userId) {
      res.status(400).json({ error: "userId is required." });
      return;
    }

    const client = await pool.connect();
    try {
      const row = await client.query(
        `SELECT avatar, avatar_mime, avatar_updated_at FROM users WHERE id=$1`,
        [userId]
      );
      if (row.rowCount === 0) {
        res.status(404).json({ error: "User not found." });
        return;
      }
      const avatar = row.rows[0].avatar;
      if (!avatar || avatar.length === 0) {
        res.status(404).json({ error: "No avatar uploaded." });
        return;
      }
      const mime = row.rows[0].avatar_mime || "application/octet-stream";
      if (row.rows[0].avatar_updated_at) {
        res.setHeader("Last-Modified", new Date(row.rows[0].avatar_updated_at).toUTCString());
      }
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.status(200).send(avatar);
    } catch (error) {
      logger.error({ err: error }, "getAvatar failed");
      res.status(500).json({ error: "Unable to fetch avatar." });
    } finally {
      client.release();
    }
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

      const client = await safeGetClient(res, logger);
      if (!client) return;
      const ip = req.ip || req.socket?.remoteAddress || null;
      const fingerprint = req.body?.fingerprint || null;
      const loginValue = parsedPayload.data.login.toLowerCase();
      try {
        // Brute-force lock check
        const lockKey = `lock:user:${loginValue}`;
        let locked = -1;
        try {
          locked = await redis.ttl(lockKey);
        } catch (error) {
          logger.warn({ err: error }, "Redis lock check failed");
        }
        if (locked > 0) {
          res.status(423).json({
            error: "Account temporarily locked. Try again later.",
            retryAfterSeconds: locked,
          });
          return;
        }

        const userQuery = await client.query(
          `
          SELECT id, username, email, password_hash, last_login_ip, email_verified_at
          FROM users
          WHERE lower(email)=lower($1) OR lower(username)=lower($1)
          LIMIT 1
        `,
          [loginValue]
        );
        if (userQuery.rowCount === 0) {
          await recordAudit(client, {
            req,
            action: "login_failed",
            status: "failed",
            reason: "user_not_found",
            meta: { login: loginValue },
          });
          res.status(401).json({ error: "Invalid credentials." });
          return;
        }
        const user = userQuery.rows[0];
        const passwordOk = await bcrypt.compare(parsedPayload.data.password, user.password_hash);
        if (!passwordOk) {
          await client.query(
            `INSERT INTO login_attempts (user_id, ip, success, risk_score, created_at) VALUES ($1,$2,false,$3,now())`,
            [user.id, ip, null]
          );
          const failKey = `fail:user:${user.id}`;
          try {
            const fails = await redis.incr(failKey);
            await redis.expire(failKey, 15 * 60); // 15 minutes window
            if (fails >= MAX_FAILED_ATTEMPTS) {
              await redis.setex(lockKey, ACCOUNT_LOCK_MINUTES * 60, "1");
            }
          } catch (error) {
            logger.warn({ err: error }, "Redis failure tracking failed");
          }
          await recordAudit(client, {
            req,
            actorUserId: user.id,
            action: "login_failed",
            targetType: "user",
            targetId: user.id,
            status: "failed",
            reason: "invalid_password",
          });
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
        await client.query(
          `INSERT INTO login_attempts (user_id, ip, success, risk_score, created_at) VALUES ($1,$2,true,$3,now())`,
          [user.id, ip, Number.isFinite(risk.score) ? risk.score : null]
        );
        let requiresOtp = risk.requiresOtp;
        let requiresWebAuthn = risk.requiresWebAuthn;
        const reasons = Array.isArray(risk.reasons) ? [...risk.reasons] : [];
        if (!user.email_verified_at) {
          requiresOtp = true;
          if (!reasons.includes("email_unverified")) {
            reasons.push("email_unverified");
          }
        }

        const notifyEmail = user.email || (loginValue.includes("@") ? loginValue : null);

        if (!requiresOtp && !requiresWebAuthn) {
          const sessionToken = await issueSession(client, user.id, fingerprint, ip);
          setUserSessionCookie(res, sessionToken);
          await recordAudit(client, {
            req,
            actorUserId: user.id,
            action: "login_success",
            targetType: "user",
            targetId: user.id,
            status: "success",
            meta: { risk: risk.score, trusted: risk.trustedDevice },
          });
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
            if (notifyEmail) {
              await sendOtpEmail(notifyEmail, otp);
            }
          } catch (error) {
            logger.warn({ err: error }, "Failed to send OTP email");
            logger.info({ email: notifyEmail, otp }, "Dev OTP (email fallback)");
          }
        }

        await recordAudit(client, {
          req,
          actorUserId: user.id,
          action: requiresOtp ? "login_step_up_otp" : "login_step_up_webauthn",
          targetType: "user",
          targetId: user.id,
          status: "success",
          meta: { risk: risk.score, reasons },
        });
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

      const client = await safeGetClient(res, logger);
      if (!client) return;

      try {
        if (MAX_USERS > 0) {
          const totalUsers = await client.query(`SELECT COUNT(*)::int AS count FROM users`);
          if ((totalUsers.rows[0]?.count || 0) >= MAX_USERS) {
            res.status(403).json({ error: "User registration is closed (capacity reached)." });
            return;
          }
        }

        const existing = await client.query(
          `
          SELECT 1 FROM users
          WHERE lower(email) = lower($1) OR lower(username) = lower($2)
          LIMIT 1
        `,
          [parsedPayload.data.email, parsedPayload.data.username]
        );
        if (existing.rowCount > 0) {
          await recordAudit(client, {
            req,
            action: "register_failed",
            status: "failed",
            reason: "user_exists",
            meta: { email: parsedPayload.data.email, username: parsedPayload.data.username },
          });
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
        await recordAudit(client, {
          req,
          actorUserId: userId,
          action: "register",
          targetType: "user",
          targetId: userId,
          status: "success",
        });
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

      const client = await safeGetClient(res, logger);
      if (!client) return;
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

        await recordAudit(client, {
          req,
          actorUserId: user.id,
          action: "password_reset_request",
          targetType: "user",
          targetId: user.id,
          status: "success",
        });

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

      const client = await safeGetClient(res, logger);
      if (!client) return;
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
          (await safeRedisGet(`pwdreset:user:${user.id}`)) ||
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
        await safeRedisDel(`pwdreset:user:${user.id}`);

        try {
          await sendPasswordResetConfirmation(user.email);
        } catch (error) {
          logger.warn({ err: error }, "Failed to send reset confirmation email");
        }

        await recordAudit(client, {
          req,
          actorUserId: user.id,
          action: "password_reset_complete",
          targetType: "user",
          targetId: user.id,
          status: "success",
        });

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

  async function safeGetClient(res, log) {
    try {
      const client = await pool.connect();
      return client;
    } catch (error) {
      if (log?.error) log.error({ err: error }, "Database connection failed");
      res.status(503).json({ error: "Service unavailable. Try again soon." });
      return null;
    }
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

    const userAgent = req.get("user-agent") || "";
    const ipAddress = req.ip || req.socket?.remoteAddress || "";
    const normalizeOptional = (value) => {
      const text = String(value || "").trim();
      return text.length > 0 ? text : null;
    };

    if (!AUTH_BACKEND_DISABLED) {
      pool
        .query(
          `INSERT INTO rum_events (
            user_agent,
            ip,
            name,
            value,
            path,
            page,
            field_name,
            connection_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            normalizeOptional(userAgent),
            normalizeOptional(ipAddress),
            metric.name,
            metric.value,
            metric.path,
            normalizeOptional(metric.page),
            normalizeOptional(metric.fieldName),
            normalizeOptional(metric.connectionType),
          ]
        )
        .catch((error) => {
          if (logger?.warn) {
            logger.warn({ err: error }, "Failed to persist RUM metric");
          }
        });
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
          userAgent,
          ip: ipAddress,
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

        await recordAudit(client, {
          req,
          actorUserId: userId,
          action: "otp_resend",
          targetType: "user",
          targetId: userId,
          status: "success",
        });

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
        await recordAudit(client, {
          req,
          actorUserId: userId,
          action: "otp_verify_failed",
          targetType: "user",
          targetId: userId,
          status: "failed",
        });
        res.status(400).json({ error: "OTP expired or invalid." });
        return;
      }

      const sessionToken = await issueSession(
        client,
        userId,
        fingerprint,
        req.ip || req.socket?.remoteAddress || null
      );
      setUserSessionCookie(res, sessionToken);

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

      await recordAudit(client, {
        req,
        actorUserId: userId,
        action: "otp_verify",
        targetType: "user",
        targetId: userId,
        status: "success",
      });

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

  async function issueSession(client, userId, fingerprint, ip) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + SESSION_TTL_MS);
    await client.query(`DELETE FROM sessions WHERE user_id=$1`, [userId]);
    await client.query(
      `
      INSERT INTO sessions (user_id, session_token, device_fingerprint, expires_at, created_at)
      VALUES ($1,$2,$3,$4,now())
    `,
      [userId, token, fingerprint, expires]
    );
    await client.query(`UPDATE users SET last_login=now(), last_login_ip=$2 WHERE id=$1`, [
      userId,
      ip || null,
    ]);
    return token;
  }

  async function logout(req, res) {
    const token = req.cookies?.[userSessionCookie];
    const client = await safeGetClient(res, logger);
    if (!client) return;
    try {
      if (token) {
        const row = await client.query(`SELECT user_id FROM sessions WHERE session_token=$1`, [
          token,
        ]);
        const userId = row.rows[0]?.user_id || null;
        await client.query(`DELETE FROM sessions WHERE session_token=$1`, [token]);
        if (userId) {
          await recordAudit(client, {
            req,
            actorUserId: userId,
            action: "logout",
            targetType: "user",
            targetId: userId,
            status: "success",
          });
        }
      }
      clearUserSessionCookie(res);
      res.status(200).json({ message: "Logged out." });
    } catch (error) {
      logger.error({ err: error }, "Logout failed");
      res.status(500).json({ error: "Unable to log out right now." });
    } finally {
      client.release();
    }
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
    renderDashboard,
    logout,
    login,
    register,
    requestPasswordReset,
    resetPassword,
    uploadAvatar,
    getAvatar,
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

function decodeBase64Payload(value) {
  try {
    const cleaned = String(value || "").replace(/^data:[^;]+;base64,/i, "");
    return Buffer.from(cleaned, "base64");
  } catch (error) {
    return null;
  }
}

async function safeRedisGet(key) {
  try {
    return await redis.get(key);
  } catch (error) {
    return null;
  }
}

async function safeRedisDel(key) {
  try {
    return await redis.del(key);
  } catch (error) {
    return 0;
  }
}

async function recordAudit(client, options = {}) {
  const {
    req,
    actorUserId = null,
    action,
    targetType = null,
    targetId = null,
    status = "success",
    reason = null,
    meta = null,
  } = options;
  if (!client || !action) return;
  const ip =
    req?.headers?.["x-forwarded-for"]?.split(",")?.[0]?.trim() ||
    req?.ip ||
    req?.connection?.remoteAddress ||
    null;
  const userAgent = req?.headers?.["user-agent"] || null;
  try {
    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, ip, user_agent, status, reason, meta)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
      [actorUserId, action, targetType, targetId, ip, userAgent, status, reason, meta]
    );
  } catch (error) {
    // non-blocking
  }
}

module.exports = {
  createPublicController,
};
