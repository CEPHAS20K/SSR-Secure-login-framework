"use strict";

const { createAdminInternalAccessGuard } = require("./admin/admin-access");
const { notFoundHandler, internalServerErrorHandler } = require("./errors/error-handlers");

module.exports = {
  createAdminInternalAccessGuard,
  notFoundHandler,
  internalServerErrorHandler,
};
