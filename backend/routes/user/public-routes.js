"use strict";

function registerPublicRoutes(app, options = {}) {
  const { publicController } = options;

  app.get("/", publicController.renderLanding);
  app.get("/login", publicController.renderLogin);
  app.get("/register", publicController.renderRegister);
  app.post("/auth/login", publicController.login);
  app.post("/auth/register", publicController.register);
  app.post("/auth/verify-otp", publicController.verifyOtp);
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
