"use strict";

const { createPublicController } = require("./user/public-controller");
const { createAdminController } = require("./admin/admin-controller");

module.exports = {
  createAdminController,
  createPublicController,
};
