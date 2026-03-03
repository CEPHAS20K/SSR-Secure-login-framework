"use strict";

function registerAdminRoutes(app, options = {}) {
  const { adminController, vaultController, requireAdminAuth, requireAdminApiAuth } = options;

  if (!adminController) {
    throw new Error("registerAdminRoutes requires adminController");
  }
  if (!vaultController) {
    throw new Error("registerAdminRoutes requires vaultController");
  }

  app.get("/admin/login", adminController.renderAdminLogin);
  app.post("/admin/login", adminController.loginAdmin);

  app.get("/admin/logout", adminController.logoutAdmin);
  app.post("/admin/logout", adminController.logoutAdmin);

  app.get("/admin", requireAdminAuth, (_req, res) => res.redirect(302, "/admin/dashboard"));
  app.get("/admin/dashboard", requireAdminAuth, adminController.renderAdminDashboard);

  // Admin API (protected)
  app.get("/admin/api/dashboard", requireAdminApiAuth, adminController.getDashboardSnapshot);
  app.get("/admin/api/users", requireAdminApiAuth, adminController.listUsers);
  app.get("/admin/api/users/:userId/devices", requireAdminApiAuth, adminController.listUserDevices);
  app.get(
    "/admin/api/users/:userId/timeline",
    requireAdminApiAuth,
    adminController.getUserTimeline
  );
  app.get("/admin/api/vault/usage", requireAdminApiAuth, vaultController.getVaultUsage);
  app.post("/admin/api/vault/items", requireAdminApiAuth, vaultController.createVaultItem);

  app.post("/admin/api/users/bulk/status", requireAdminApiAuth, (req, res) =>
    adminController.stubAction(req, res, "Bulk status updated.")
  );
  app.post("/admin/api/users/bulk/force-password-reset", requireAdminApiAuth, (req, res) =>
    adminController.stubAction(req, res, "Password reset queued for selected users.")
  );
  app.post(
    "/admin/api/users/:userId/actions/force-password-reset",
    requireAdminApiAuth,
    (req, res) => adminController.stubAction(req, res, "Password reset queued.")
  );
  app.post("/admin/api/users/:userId/actions/trigger-reauth", requireAdminApiAuth, (req, res) =>
    adminController.stubAction(req, res, "Step-up authentication triggered.")
  );
  app.patch("/admin/api/users/:userId/devices/:deviceId/trust", requireAdminApiAuth, (req, res) =>
    adminController.stubAction(req, res, "Device trust updated.")
  );

  app.patch("/admin/api/alert-rules", requireAdminApiAuth, adminController.updateAlertRules);
  app.patch("/admin/api/governance", requireAdminApiAuth, adminController.updateGovernance);
  app.post("/admin/api/approvals", requireAdminApiAuth, adminController.createApproval);
  app.post(
    "/admin/api/approvals/:id/resolve",
    requireAdminApiAuth,
    adminController.resolveApproval
  );

  app.patch(
    "/admin/api/export-schedules/:id",
    requireAdminApiAuth,
    adminController.updateExportSchedule
  );
  app.post(
    "/admin/api/export-schedules/:id/run",
    requireAdminApiAuth,
    adminController.runExportSchedule
  );
  app.get("/admin/api/exports/log", requireAdminApiAuth, adminController.listExportHistory);
}

module.exports = {
  registerAdminRoutes,
};
