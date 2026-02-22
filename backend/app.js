const express = require("express");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const pino = require("pino");
const pinoHttp = require("pino-http");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const { createAdminController, createPublicController } = require("./controllers");
const { registerAdminRoutes, registerPublicRoutes } = require("./routes");
const {
  createAdminInternalAccessGuard,
  notFoundHandler,
  internalServerErrorHandler,
} = require("./middleware");
const { initSentry, captureSentryException } = require("./observability");

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const VIEWS_DIR = path.join(FRONTEND_DIR, "views");
const PUBLIC_DIR = path.join(FRONTEND_DIR, "public");
const ZOD_VENDOR_DIR = path.join(__dirname, "node_modules", "zod");
const OPENAPI_DOC_PATH = path.join(__dirname, "docs", "openapi.yaml");

const LONG_CACHE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);
const MID_CACHE_EXTENSIONS = new Set([".css", ".js", ".mjs"]);

let isEnvLoaded = false;

function createApp(options = {}) {
  loadEnvironment(options.envFile);

  const env = options.env || process.env;
  const config = {
    PORT: resolvePort(env.PORT, 3000),
    HOST: env.HOST || "127.0.0.1",
    IS_PRODUCTION: env.NODE_ENV === "production",
    LOG_LEVEL: env.LOG_LEVEL || (env.NODE_ENV === "production" ? "info" : "debug"),
    FORCE_NO_STORE: resolveBoolean(env.FORCE_NO_STORE, env.NODE_ENV !== "production"),
    ADMIN_ENABLED: resolveBoolean(env.ADMIN_ENABLED, true),
    ADMIN_INTERNAL_ONLY: resolveBoolean(env.ADMIN_INTERNAL_ONLY, true),
    ADMIN_ALLOW_IPS: parseList(env.ADMIN_ALLOW_IPS),
    API_DOCS_ENABLED: resolveBoolean(env.API_DOCS_ENABLED, true),
    ASSET_VERSION: "",
    APP_VERSION: "",
  };

  config.ASSET_VERSION = resolveAssetVersion({
    envVersion: env.ASSET_VERSION,
    publicDir: PUBLIC_DIR,
    isProduction: config.IS_PRODUCTION,
  });
  config.APP_VERSION = resolveAppVersion({
    envVersion: env.APP_VERSION,
    npmVersion: env.npm_package_version,
    assetVersion: config.ASSET_VERSION,
    isProduction: config.IS_PRODUCTION,
  });

  const logger =
    options.logger ||
    pino({
      level: config.LOG_LEVEL,
      redact: {
        paths: ["req.headers.cookie", "req.headers.authorization"],
        remove: true,
      },
    });

  const sentry = initSentry({ env, logger });
  const app = express();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: { error: "Too many authentication attempts. Try again in 15 minutes." },
  });

  const publicController = createPublicController({
    logger,
    appVersion: config.APP_VERSION,
    assetVersion: config.ASSET_VERSION,
  });
  const adminController = createAdminController({ logger });
  const requireInternalAdminAccess = createAdminInternalAccessGuard({
    enabled: config.ADMIN_INTERNAL_ONLY,
    allowList: config.ADMIN_ALLOW_IPS,
    logger,
  });

  app.set("view engine", "pug");
  app.set("views", VIEWS_DIR);
  app.set("view cache", config.IS_PRODUCTION && !config.FORCE_NO_STORE);
  app.locals.assetVersion = config.ASSET_VERSION;
  app.locals.appVersion = config.APP_VERSION;
  app.locals.assetPath = createAssetPathResolver(config.ASSET_VERSION);
  app.locals.adminEnabled = config.ADMIN_ENABLED;
  app.locals.logger = logger;

  if (config.IS_PRODUCTION) {
    app.set("trust proxy", 1);
  }

  app.use(
    pinoHttp({
      logger,
      customLogLevel(req, res, error) {
        if (error || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    })
  );
  app.use((req, res, next) => {
    res.setHeader("X-App-Version", config.APP_VERSION);
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(
    express.static(PUBLIC_DIR, {
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        if (!config.IS_PRODUCTION || config.FORCE_NO_STORE) {
          res.setHeader("Cache-Control", "no-store");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        if (LONG_CACHE_EXTENSIONS.has(ext)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        if (MID_CACHE_EXTENSIONS.has(ext)) {
          res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
          return;
        }
        res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
      },
    })
  );
  app.use(
    "/vendor/zod",
    express.static(ZOD_VENDOR_DIR, {
      etag: true,
      lastModified: true,
      setHeaders(res) {
        if (!config.IS_PRODUCTION || config.FORCE_NO_STORE) {
          res.setHeader("Cache-Control", "no-store");
          return;
        }
        res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      },
    })
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use("/auth", authLimiter);

  registerPublicRoutes(app, {
    publicController,
  });
  if (config.ADMIN_ENABLED) {
    app.use("/admin", requireInternalAdminAccess);
    registerAdminRoutes(app, {
      adminController,
    });
  } else {
    logger.info("Admin routes are disabled (set ADMIN_ENABLED=true to enable).");
  }

  if (config.API_DOCS_ENABLED) {
    const openApiDocument = loadOpenApiDocument(OPENAPI_DOC_PATH, { logger });
    app.get("/api-docs.json", (req, res) => {
      res.status(200).json(openApiDocument);
    });
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument, {
        explorer: true,
        customSiteTitle: "Secure Storage Vault API Docs",
      })
    );
  }

  if (!config.IS_PRODUCTION) {
    app.get("/debug-500", (req, res, next) => {
      next(new Error("Intentional test error for 500 page"));
    });
  }

  app.use(notFoundHandler);
  app.use((error, req, res, next) => {
    captureSentryException({
      sentryClient: sentry.client,
      error,
      req,
    });
    internalServerErrorHandler(error, req, res, next);
  });

  return {
    app,
    logger,
    config,
    sentry,
  };
}

function startServer(options = {}) {
  const { app, logger, config } = createApp(options);
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info({ host: config.HOST, port: config.PORT }, "Backend server running");
  });

  server.on("error", (error) => {
    logger.error({ err: error }, "Server failed to start");
    if (error.code === "EADDRINUSE" || error.code === "EPERM") {
      logger.error("Update backend/.env.dev with a different PORT, then restart npm run dev.");
    }
    process.exit(1);
  });

  return {
    app,
    server,
    logger,
    config,
  };
}

function resolvePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function resolveAssetVersion(options = {}) {
  const { envVersion, publicDir, isProduction } = options;
  if (envVersion && String(envVersion).trim()) {
    return String(envVersion).trim();
  }

  if (!isProduction) {
    return `dev-${Date.now()}`;
  }

  try {
    const latestMtime = getLatestAssetMtime(publicDir);
    if (latestMtime > 0) {
      return String(Math.trunc(latestMtime));
    }
  } catch (error) {
    return String(Date.now());
  }

  return String(Date.now());
}

function resolveAppVersion(options = {}) {
  const { envVersion, npmVersion, assetVersion, isProduction } = options;

  if (envVersion && String(envVersion).trim()) {
    return String(envVersion).trim();
  }
  if (npmVersion && String(npmVersion).trim()) {
    return String(npmVersion).trim();
  }
  if (isProduction && assetVersion && String(assetVersion).trim()) {
    return String(assetVersion).trim();
  }

  return "dev";
}

function createAssetPathResolver(version) {
  const encodedVersion = encodeURIComponent(String(version || "dev"));
  return function assetPath(assetPathValue) {
    const value = String(assetPathValue || "");
    if (!value.startsWith("/")) return value;
    return `${value}${value.includes("?") ? "&" : "?"}v=${encodedVersion}`;
  };
}

function getLatestAssetMtime(publicDir) {
  const stack = [publicDir];
  let latest = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      try {
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs > latest) {
          latest = stats.mtimeMs;
        }
      } catch (error) {
        // skip unreadable files
      }
    }
  }

  return latest;
}

function resolveBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function parseList(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadOpenApiDocument(filePath, options = {}) {
  const { logger = console } = options;
  try {
    return YAML.load(filePath);
  } catch (error) {
    if (typeof logger.error === "function") {
      logger.error({ err: error, filePath }, "Unable to load OpenAPI document");
    }

    return {
      openapi: "3.0.3",
      info: {
        title: "Secure Storage Vault API",
        version: "1.0.0",
      },
      paths: {},
    };
  }
}

function loadEnvironment(customEnvFile) {
  if (isEnvLoaded) return;
  const envFile =
    typeof customEnvFile === "string" && customEnvFile.trim()
      ? customEnvFile.trim()
      : process.env.NODE_ENV === "production"
        ? ".env.proc"
        : ".env.dev";
  dotenv.config({ path: path.join(__dirname, envFile) });
  isEnvLoaded = true;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
};
