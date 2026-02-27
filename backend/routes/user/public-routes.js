"use strict";

const { rateLimit } = require("../../middleware/rate-limit");

function registerPublicRoutes(app, options = {}) {
  const { publicController } = options;

  const ipLimiter = rateLimit({ windowSec: 60, limit: 20, keyBuilder: (req) => req.ip || "ip" });
  const strictIpLimiter = rateLimit({
    windowSec: 60,
    limit: 5,
    keyBuilder: (req) => `strict:${req.ip || "ip"}`,
  });

  app.get("/", publicController.renderLanding);
  app.get("/login", publicController.renderLogin);
  app.get("/register", publicController.renderRegister);
  app.post("/auth/login", ipLimiter, strictIpLimiter, publicController.login);
  app.post("/auth/register", ipLimiter, publicController.register);
  app.post(
    "/auth/password/forgot",
    ipLimiter,
    strictIpLimiter,
    publicController.requestPasswordReset
  );
  app.post("/auth/password/reset", ipLimiter, strictIpLimiter, publicController.resetPassword);
  app.post("/auth/verify-otp", ipLimiter, strictIpLimiter, publicController.verifyOtp);
  app.post("/auth/webauthn/register/begin", publicController.beginWebAuthnRegistration);
  app.post("/auth/webauthn/register/finish", publicController.finishWebAuthnRegistration);
  app.post("/auth/webauthn/login/begin", publicController.beginWebAuthnLogin);
  app.post("/auth/webauthn/login/finish", publicController.finishWebAuthnLogin);
  app.post("/api/rum", publicController.ingestRumMetric);
  app.get("/health", publicController.health);
  app.get("/version", publicController.getVersion);
}

module.exports = {
  registerPublicRoutes,
};
