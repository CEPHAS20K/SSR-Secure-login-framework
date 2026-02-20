"use strict";

const { notFoundHandler, internalServerErrorHandler } = require("./error-handlers");

module.exports = {
  notFoundHandler,
  internalServerErrorHandler,
};
