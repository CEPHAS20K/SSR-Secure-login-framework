"use strict";

const safeNoStoreHeaders = {
  "Cache-Control": "no-store",
};

function createAdminController(options = {}) {
  const { logger = console } = options;

  function renderAdminLogin(req, res) {
    res.set(safeNoStoreHeaders);
    res.render("pages/admin/login", {
      title: "Admin Login",
      activePage: "admin",
      page: "admin-login",
      errorMessage: typeof req.query?.error === "string" ? req.query.error : "",
    });
  }

  function loginAdmin(req, res) {
    const username = String(req.body?.username || "").trim();
    if (typeof logger.warn === "function") {
      logger.warn(
        { route: "/admin/login", username: username || null },
        "Admin login attempted but admin backend is not configured"
      );
    }

    res.redirect(
      303,
      "/admin/login?error=Admin%20dashboard%20backend%20is%20not%20configured%20yet."
    );
  }

  function redirectAdminHome(req, res) {
    res.redirect(302, "/admin/login");
  }

  function redirectAdminDashboard(req, res) {
    res.redirect(
      302,
      "/admin/login?error=Admin%20dashboard%20is%20temporarily%20disabled%20until%20backend%20APIs%20are%20configured."
    );
  }

  function logoutAdmin(req, res) {
    res.redirect(302, "/admin/login");
  }

  return {
    renderAdminLogin,
    loginAdmin,
    redirectAdminHome,
    redirectAdminDashboard,
    logoutAdmin,
  };
}

module.exports = {
  createAdminController,
};
