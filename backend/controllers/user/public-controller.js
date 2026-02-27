"use strict";

const { z } = require("zod");
const bcrypt = require("bcrypt");
const { pool } = require("../../database/pool");
const { redis } = require("../../services/redis-client");
const { sendOtpEmail } = require("../../services/mailer");

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

const acceptedGenders = new Set(["male", "female", "other"]);
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
  const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
    const parsedPayload = loginPayloadSchema.safeParse(req.body || {});
    if (!parsedPayload.success) {
      const firstIssue = parsedPayload.error.issues[0];
      res.status(400).json({ error: firstIssue?.message || "Invalid login payload." });
      return;
    }

    const { email } = parsedPayload.data;
    if (typeof logger.warn === "function") {
      logger.warn(
        { route: "/auth/login", email },
        "Login attempted but auth backend is not configured"
      );
    }

    res.status(501).json(authNotConfiguredResponse);
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
        res.status(400).json({ error: "Gender must be one of: male, female, other." });
        return;
      }

      const client = await pool.connect();
      const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

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

  return {
    renderLanding,
    renderLogin,
    renderRegister,
    login,
    register,
    ingestRumMetric,
    health,
    getVersion,
  };
}

module.exports = {
  createPublicController,
};
