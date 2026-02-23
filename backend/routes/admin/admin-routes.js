"use strict";

function registerAdminRoutes(app, options = {}) {
  const { adminController } = options;

  app.get("/admin/login", adminController.renderAdminLogin);
  app.post("/admin/login", adminController.loginAdmin);
  app.get("/admin", adminController.redirectAdminHome);
  app.get("/admin/dashboard", adminController.redirectAdminDashboard);
  app.post("/admin/logout", adminController.logoutAdmin);
  app.get("/admin/logout", adminController.logoutAdmin);
}

module.exports = {
  registerAdminRoutes,
};
