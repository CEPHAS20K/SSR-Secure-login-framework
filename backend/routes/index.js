"use strict";

const { registerPublicRoutes } = require("./user/public-routes");
const { registerAdminRoutes } = require("./admin/admin-routes");

module.exports = {
  registerAdminRoutes,
  registerPublicRoutes,
};
