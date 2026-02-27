"use strict";

const { z } = require("zod");

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

    if (typeof logger.warn === "function") {
      logger.warn(
        {
          route: "/auth/register",
          email: parsedPayload.data.email,
          username: parsedPayload.data.username,
        },
        "Registration attempted but auth backend is not configured"
      );
    }

    res.status(501).json(authNotConfiguredResponse);
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
