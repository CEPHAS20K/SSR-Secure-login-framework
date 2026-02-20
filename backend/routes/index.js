"use strict";

const { registerPublicRoutes } = require("./public-routes");
const { registerAdminRoutes } = require("./admin-routes");

module.exports = {
  registerAdminRoutes,
  registerPublicRoutes,
};
