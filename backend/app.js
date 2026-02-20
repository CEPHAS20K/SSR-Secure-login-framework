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
const { createPublicController } = require("./controllers");
const { registerPublicRoutes } = require("./routes");
const { notFoundHandler, internalServerErrorHandler } = require("./middleware");

const ENV_FILE = process.env.NODE_ENV === "production" ? ".env.proc" : ".env.dev";
dotenv.config({ path: path.join(__dirname, ENV_FILE) });

const app = express();
const PORT = resolvePort(process.env.PORT, 3000);
const HOST = process.env.HOST || "127.0.0.1";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? "info" : "debug");
const FORCE_NO_STORE = resolveBoolean(process.env.FORCE_NO_STORE, !IS_PRODUCTION);

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const VIEWS_DIR = path.join(FRONTEND_DIR, "views");
const PUBLIC_DIR = path.join(FRONTEND_DIR, "public");
const ASSET_VERSION = resolveAssetVersion({
  envVersion: process.env.ASSET_VERSION,
  publicDir: PUBLIC_DIR,
  isProduction: IS_PRODUCTION,
});

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

const logger = pino({
  level: LOG_LEVEL,
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization"],
    remove: true,
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: "Too many authentication attempts. Try again in 15 minutes." },
});

const publicController = createPublicController({ logger });

app.set("view engine", "pug");
app.set("views", VIEWS_DIR);
app.set("view cache", IS_PRODUCTION && !FORCE_NO_STORE);
app.locals.assetVersion = ASSET_VERSION;
app.locals.assetPath = createAssetPathResolver(ASSET_VERSION);
app.locals.logger = logger;

if (IS_PRODUCTION) {
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
      if (!IS_PRODUCTION || FORCE_NO_STORE) {
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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/auth", authLimiter);

registerPublicRoutes(app, {
  publicController,
});

if (process.env.NODE_ENV !== "production") {
  app.get("/debug-500", (req, res, next) => {
    next(new Error("Intentional test error for 500 page"));
  });
}

app.use(notFoundHandler);
app.use(internalServerErrorHandler);

const server = app.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT }, "Backend server running");
});

server.on("error", (error) => {
  logger.error({ err: error }, "Server failed to start");
  if (error.code === "EADDRINUSE" || error.code === "EPERM") {
    logger.error("Update backend/.env.dev with a different PORT, then restart npm run dev.");
  }
  process.exit(1);
});

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
