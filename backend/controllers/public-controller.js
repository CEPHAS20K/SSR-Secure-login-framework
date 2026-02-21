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
const safeNoStoreHeaders = {
  "Cache-Control": "no-store",
};

function createPublicController(options = {}) {
  const { logger = console } = options;

  function renderLanding(req, res) {
    res.render("landing", {
      title: "Auth Secure",
      activePage: "landing",
      page: "landing",
    });
  }

  function renderLogin(req, res) {
    res.set(safeNoStoreHeaders);
    res.render("login", {
      title: "Login",
      activePage: "login",
      page: "login",
    });
  }

  function renderRegister(req, res) {
    res.set(safeNoStoreHeaders);
    res.render("register", {
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
    });
  }

  return {
    renderLanding,
    renderLogin,
    renderRegister,
    login,
    register,
    health,
  };
}

module.exports = {
  createPublicController,
};
