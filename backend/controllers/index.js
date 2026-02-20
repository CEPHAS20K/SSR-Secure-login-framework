"use strict";

const { createPublicController } = require("./public-controller");
const { createAdminController } = require("./admin-controller");

module.exports = {
  createAdminController,
  createPublicController,
};
