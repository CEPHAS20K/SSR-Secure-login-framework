"use strict";

function initSentry(options = {}) {
  const { env = process.env, logger = console } = options;
  const dsn = typeof env.SENTRY_DSN === "string" ? env.SENTRY_DSN.trim() : "";
  if (!dsn) {
    return {
      enabled: false,
      client: null,
    };
  }

  let sentryClient = null;
  try {
    sentryClient = require("@sentry/node");
  } catch (error) {
    if (typeof logger.error === "function") {
      logger.error({ err: error }, "Sentry DSN provided but @sentry/node is not installed");
    }
    return {
      enabled: false,
      client: null,
    };
  }

  const tracesSampleRate = resolveSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, 0);
  sentryClient.init({
    dsn,
    environment: env.NODE_ENV || "development",
    tracesSampleRate,
  });

  if (typeof logger.info === "function") {
    logger.info({ sentryEnabled: true, tracesSampleRate }, "Sentry error monitoring initialized");
  }

  return {
    enabled: true,
    client: sentryClient,
  };
}

function captureSentryException(options = {}) {
  const { sentryClient, error, req } = options;
  if (!sentryClient || !error) return;

  sentryClient.withScope((scope) => {
    if (req) {
      scope.setTag("route", req.originalUrl || req.url || "unknown");
      scope.setTag("method", req.method || "unknown");
      scope.setContext("request", {
        ip: req.ip || req.socket?.remoteAddress || null,
        userAgent: req.headers?.["user-agent"] || null,
      });
    }
    sentryClient.captureException(error);
  });
}

function resolveSampleRate(value, fallback) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

module.exports = {
  initSentry,
  captureSentryException,
};
