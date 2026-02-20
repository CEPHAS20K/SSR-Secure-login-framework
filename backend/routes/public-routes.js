"use strict";

function registerPublicRoutes(app, options = {}) {
  const { publicController } = options;

  app.get("/", publicController.renderLanding);
  app.get("/login", publicController.renderLogin);
  app.get("/register", publicController.renderRegister);
  app.post("/auth/login", publicController.login);
  app.post("/auth/register", publicController.register);
  app.get("/health", publicController.health);
}

module.exports = {
  registerPublicRoutes,
};
