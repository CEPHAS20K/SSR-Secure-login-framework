"use strict";

const { createAdminInternalAccessGuard } = require("./admin/admin-access");
const { createAdminAuth } = require("./admin/admin-auth");
const { notFoundHandler, internalServerErrorHandler } = require("./errors/error-handlers");

module.exports = {
  createAdminInternalAccessGuard,
  createAdminAuth,
  notFoundHandler,
  internalServerErrorHandler,
};
