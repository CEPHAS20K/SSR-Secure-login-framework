const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const {
  getDashboardSnapshot,
  getUsers,
  queryUsers,
  getUserById,
  queryUserDevices,
  getUserTimeline,
  getAuditLogs,
  recordAdminLoginAttempt,
  recordApiRequestMetric,
  setUserActive,
  bulkSetUsersActive,
  setDeviceTrusted,
  forcePasswordReset,
  bulkForcePasswordReset,
  triggerReauthentication,
  runIncidentLockdown,
  requestApproval,
  resolveApproval,
  getApprovals,
  getGovernanceConfig,
  setGovernanceConfig,
  setAlertRules,
  recordExportEvent,
  getExportSchedules,
  setExportSchedule,
  runScheduledExportNow,
} = require("./admin-store");

const ENV_FILE = process.env.NODE_ENV === "production" ? ".env.proc" : ".env.dev";
dotenv.config({ path: path.join(__dirname, ENV_FILE) });

const app = express();
const PORT = resolvePort(process.env.PORT, 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_ROLE = normalizeAdminRole(process.env.ADMIN_ROLE || "super_admin");
const ADMIN_COOKIE_NAME = "admin_auth";
const ADMIN_COOKIE_VALUE = "1";
const LANDING_COMMENTS_LIMIT = 120;
const landingComments = [];
let landingCommentIdCounter = 1;

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const VIEWS_DIR = path.join(FRONTEND_DIR, "views");
const PUBLIC_DIR = path.join(FRONTEND_DIR, "public");

app.set("view engine", "pug");
app.set("views", VIEWS_DIR);
app.use(express.static(PUBLIC_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(trackAdminApiMetrics);

app.get("/", (req, res) => {
  res.render("landing", {
    title: "Auth Secure",
    activePage: "landing",
    page: "landing",
    contactFlash: resolveContactFlash(req.query),
  });
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login", activePage: "login", page: "login" });
});

app.get("/register", (req, res) => {
  res.render("register", { title: "Register", activePage: "register", page: "register" });
});

app.get("/api/landing-comments", (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 8;

  res.status(200).json({
    comments: landingComments.slice(0, limit),
  });
});

app.post("/api/landing-comments", (req, res) => {
  const result = createLandingComment(req.body);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(201).json({
    message: "Comment submitted.",
    comment: result.comment,
    comments: landingComments.slice(0, 8),
  });
});

app.post("/contact", (req, res) => {
  const result = createLandingComment(req.body);
  if (result.error) {
    res.redirect(`/?contact=error&message=${encodeURIComponent(result.error)}#contact`);
    return;
  }
  res.redirect("/?contact=sent#contact");
});

app.get("/admin/login", (req, res) => {
  res.render("pages/admin/login", {
    title: "Admin Login",
    activePage: "admin",
    page: "admin-login",
    errorMessage: "",
  });
});

app.get("/admin", (req, res) => {
  if (isAdminAuthenticated(req)) {
    res.redirect("/admin/dashboard");
    return;
  }
  res.redirect("/admin/login");
});

app.post("/admin/login", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const isHttpsRequest =
      req.secure || String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";

    recordAdminLoginAttempt({
      username,
      success: true,
      ipAddress: getRequestIp(req),
      geo: "Unknown",
    });
    res.cookie(ADMIN_COOKIE_NAME, ADMIN_COOKIE_VALUE, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttpsRequest,
      path: "/",
      maxAge: 1000 * 60 * 60 * 8,
    });
    res.redirect("/admin/dashboard");
    return;
  }

  recordAdminLoginAttempt({
    username: username || "admin",
    success: false,
    ipAddress: getRequestIp(req),
    geo: "Unknown",
  });

  res.status(401).render("pages/admin/login", {
    title: "Admin Login",
    activePage: "admin",
    page: "admin-login",
    errorMessage: "Invalid admin credentials.",
  });
});

app.get("/admin/dashboard", requireAdminAuth, (req, res) => {
  res.render("pages/admin/dashboard", {
    title: "Admin Dashboard",
    activePage: "admin",
    page: "admin-dashboard",
    dashboardData: getAdminDashboardSnapshot(7),
  });
});

app.post("/admin/logout", requireAdminAuth, (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
  res.redirect("/admin/login");
});

app.get("/admin/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
  res.redirect("/admin/login");
});

app.get("/admin/api/dashboard", requireAdminAuth, (req, res) => {
  const rangeDays = Number.parseInt(req.query.rangeDays, 10) || 7;
  res.status(200).json(getAdminDashboardSnapshot(rangeDays));
});

app.get("/admin/api/users", requireAdminAuth, (req, res) => {
  const query = req.query.q ? String(req.query.q) : "";
  const page = Number.parseInt(req.query.page, 10) || 1;
  const pageSize = Number.parseInt(req.query.pageSize, 10) || 10;
  const sortBy = req.query.sortBy ? String(req.query.sortBy) : "lastLogin";
  const sortDir = req.query.sortDir ? String(req.query.sortDir) : "desc";
  const result = queryUsers({ query, page, pageSize, sortBy, sortDir });
  res.status(200).json({
    users: result.items,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
    sort: {
      by: result.sortBy,
      dir: result.sortDir,
    },
    query: result.query,
  });
});

app.get("/admin/api/users/:userId", requireAdminAuth, (req, res) => {
  const user = getUserById(req.params.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.status(200).json({ user });
});

app.get("/admin/api/users/:userId/devices", requireAdminAuth, (req, res) => {
  const page = Number.parseInt(req.query.page, 10) || 1;
  const pageSize = Number.parseInt(req.query.pageSize, 10) || 8;
  const sortBy = req.query.sortBy ? String(req.query.sortBy) : "lastSeen";
  const sortDir = req.query.sortDir ? String(req.query.sortDir) : "desc";

  const result = queryUserDevices({
    userId: req.params.userId,
    page,
    pageSize,
    sortBy,
    sortDir,
  });

  if (!result) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({
    userId: result.userId,
    username: result.username,
    devices: result.items,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
    sort: {
      by: result.sortBy,
      dir: result.sortDir,
    },
  });
});

app.get("/admin/api/users/:userId/timeline", requireAdminAuth, (req, res) => {
  const user = getUserById(req.params.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const limit = Number.parseInt(req.query.limit, 10) || 80;
  res.status(200).json({ timeline: getUserTimeline({ userId: user.id, limit }) });
});

app.patch("/admin/api/users/:userId/status", requireAdminAuth, (req, res) => {
  if (typeof req.body.active !== "boolean") {
    res.status(400).json({ error: "The active field must be a boolean." });
    return;
  }

  const user = setUserActive({
    userId: req.params.userId,
    active: req.body.active,
    actor: ADMIN_USERNAME,
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({
    message: user.active ? "Account activated." : "Account deactivated.",
    user,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.post("/admin/api/users/bulk/status", requireAdminAuth, (req, res) => {
  if (!Array.isArray(req.body.userIds) || typeof req.body.active !== "boolean") {
    res.status(400).json({ error: "userIds (array) and active (boolean) are required." });
    return;
  }

  const result = bulkSetUsersActive({
    userIds: req.body.userIds,
    active: req.body.active,
    actor: ADMIN_USERNAME,
  });

  res.status(200).json({
    message: req.body.active ? "Selected users activated." : "Selected users deactivated.",
    result,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.post("/admin/api/users/bulk/force-password-reset", requireAdminAuth, (req, res) => {
  if (!Array.isArray(req.body.userIds)) {
    res.status(400).json({ error: "userIds array is required." });
    return;
  }

  const result = bulkForcePasswordReset({
    userIds: req.body.userIds,
    actor: ADMIN_USERNAME,
  });

  res.status(200).json({
    message: "Force password reset queued for selected users.",
    result,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.patch("/admin/api/users/:userId/devices/:deviceId/trust", requireAdminAuth, (req, res) => {
  if (typeof req.body.trusted !== "boolean") {
    res.status(400).json({ error: "The trusted field must be a boolean." });
    return;
  }

  const user = setDeviceTrusted({
    userId: req.params.userId,
    deviceId: req.params.deviceId,
    trusted: req.body.trusted,
    actor: ADMIN_USERNAME,
  });

  if (!user) {
    res.status(404).json({ error: "User or device not found" });
    return;
  }

  res.status(200).json({
    message: req.body.trusted ? "Device marked as trusted." : "Device marked as untrusted.",
    user,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.post("/admin/api/users/:userId/actions/force-password-reset", requireAdminAuth, (req, res) => {
  const user = forcePasswordReset({ userId: req.params.userId, actor: ADMIN_USERNAME });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({
    message: "Password reset enforced.",
    user,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.post("/admin/api/users/:userId/actions/trigger-reauth", requireAdminAuth, (req, res) => {
  const method = String(req.body.method || "").toLowerCase();
  if (!["otp", "webauthn"].includes(method)) {
    res.status(400).json({ error: "Method must be otp or webauthn." });
    return;
  }

  const user = triggerReauthentication({
    userId: req.params.userId,
    method,
    actor: ADMIN_USERNAME,
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({
    message: method === "otp" ? "OTP challenge triggered." : "WebAuthn challenge triggered.",
    user,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.post("/admin/api/users/:userId/actions/incident-lockdown", requireAdminAuth, (req, res) => {
  const user = runIncidentLockdown({
    userId: req.params.userId,
    actor: ADMIN_USERNAME,
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({
    message: "Incident mode lockdown applied.",
    user,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.get("/admin/api/audit-logs", requireAdminAuth, (req, res) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  const limit = Number.parseInt(req.query.limit, 10) || 120;
  res.status(200).json({ logs: getAuditLogs({ category, limit }) });
});

app.get("/admin/api/approvals", requireAdminAuth, (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const limit = Number.parseInt(req.query.limit, 10) || 80;
  res.status(200).json({ approvals: getApprovals({ status, limit }) });
});

app.post("/admin/api/approvals", requireAdminAuth, (req, res) => {
  try {
    const approval = requestApproval({
      actionType: req.body.actionType,
      payload: req.body.payload || {},
      target: req.body.target || "unknown",
      summary: req.body.summary || "Approval request",
      requestedBy: ADMIN_USERNAME,
    });

    res.status(201).json({
      message: "Approval request queued.",
      approval,
      dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Invalid approval request." });
  }
});

app.post("/admin/api/approvals/:approvalId/resolve", requireAdminAuth, (req, res) => {
  const decision = String(req.body.decision || "").toLowerCase();
  if (!["approve", "reject"].includes(decision)) {
    res.status(400).json({ error: "Decision must be approve or reject." });
    return;
  }

  try {
    const outcome = resolveApproval({
      approvalId: req.params.approvalId,
      decision,
      actor: ADMIN_USERNAME,
    });
    if (!outcome.approval) {
      res.status(404).json({ error: "Approval not found." });
      return;
    }

    res.status(200).json({
      message: decision === "approve" ? "Approval executed." : "Approval rejected.",
      approval: outcome.approval,
      dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to resolve approval." });
  }
});

app.get("/admin/api/governance", requireAdminAuth, (req, res) => {
  res.status(200).json({ governance: getGovernanceConfig() });
});

app.patch("/admin/api/governance", requireAdminAuth, (req, res) => {
  const governance = setGovernanceConfig({
    requireApproval: req.body.requireApproval,
  });
  res.status(200).json({
    message: "Governance settings updated.",
    governance,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.patch("/admin/api/alert-rules", requireAdminAuth, (req, res) => {
  const rules = setAlertRules({
    enabled: req.body.enabled,
    failedLogins15mThreshold: req.body.failedLogins15mThreshold,
    highRiskThreshold: req.body.highRiskThreshold,
    uniqueCountries24hThreshold: req.body.uniqueCountries24hThreshold,
  });
  res.status(200).json({
    message: "Alert rules updated.",
    rules,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.post("/admin/api/exports/log", requireAdminAuth, (req, res) => {
  if (req.body.scope === "users_with_related" && ADMIN_ROLE !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can export users with related details." });
    return;
  }

  const entry = recordExportEvent({
    actor: ADMIN_USERNAME,
    format: req.body.format,
    scope: req.body.scope,
    records: req.body.records,
    source: req.body.source,
  });
  res.status(201).json({
    message: "Export logged.",
    entry,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.patch("/admin/api/export-schedules/:scheduleId", requireAdminAuth, (req, res) => {
  if (req.body.scope === "users_with_related" && ADMIN_ROLE !== "super_admin") {
    res.status(403).json({ error: "Only super_admin can schedule users with related exports." });
    return;
  }

  const parsedDayOfWeek = Number.parseInt(req.body.dayOfWeek, 10);
  const schedule = setExportSchedule({
    scheduleId: req.params.scheduleId,
    enabled: req.body.enabled,
    timeUtc: req.body.timeUtc,
    frequency: req.body.frequency,
    dayOfWeek: Number.isInteger(parsedDayOfWeek) ? parsedDayOfWeek : undefined,
    scope: req.body.scope,
    format: req.body.format,
    actor: ADMIN_USERNAME,
  });
  if (!schedule) {
    res.status(404).json({ error: "Schedule not found." });
    return;
  }

  res.status(200).json({
    message: "Export schedule updated.",
    schedule,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.post("/admin/api/export-schedules/:scheduleId/run", requireAdminAuth, (req, res) => {
  const targetSchedule = getExportSchedules().find((item) => item.id === req.params.scheduleId);
  if (!targetSchedule) {
    res.status(404).json({ error: "Schedule not found." });
    return;
  }

  if (ADMIN_ROLE !== "super_admin" && targetSchedule.scope === "users_with_related") {
    res.status(403).json({ error: "Only super_admin can run related-data exports." });
    return;
  }

  const schedule = runScheduledExportNow({
    scheduleId: req.params.scheduleId,
    actor: ADMIN_USERNAME,
  });
  res.status(200).json({
    message: "Scheduled export executed.",
    entry: schedule,
    dashboard: getAdminDashboardSnapshot(resolveDashboardRange(req)),
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

if (process.env.NODE_ENV !== "production") {
  app.get("/debug-500", (req, res, next) => {
    next(new Error("Intentional test error for 500 page"));
  });
}

app.use((req, res) => {
  if (req.accepts("html")) {
    res.status(404).render("404", { title: "404 Not Found", page: "error" });
    return;
  }

  if (req.accepts("json")) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.status(404).type("txt").send("Not Found");
});

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    next(error);
    return;
  }

  if (req.accepts("html")) {
    res.status(500).render("500", { title: "500 Server Error", page: "error" });
    return;
  }

  if (req.accepts("json")) {
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }

  res.status(500).type("txt").send("Internal Server Error");
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend server running at http://${HOST}:${PORT}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error.message);
  if (error.code === "EADDRINUSE" || error.code === "EPERM") {
    console.error("Update backend/.env.dev with a different PORT, then restart npm run dev.");
  }
  process.exit(1);
});

function trackAdminApiMetrics(req, res, next) {
  if (!req.path.startsWith("/admin/api/")) {
    next();
    return;
  }

  const startedAt = Date.now();
  res.on("finish", () => {
    recordApiRequestMetric({
      route: req.path,
      method: req.method,
      statusCode: res.statusCode,
      latencyMs: Date.now() - startedAt,
      success: res.statusCode >= 200 && res.statusCode < 400,
    });
  });
  next();
}

function getAdminDashboardSnapshot(rangeDays = 7) {
  return getDashboardSnapshot({
    rangeDays,
    adminUsername: ADMIN_USERNAME,
    adminRole: ADMIN_ROLE,
  });
}

function resolveDashboardRange(req) {
  const queryRange = Number.parseInt(req?.query?.rangeDays, 10);
  if (Number.isInteger(queryRange) && queryRange > 0) return queryRange;
  const bodyRange = Number.parseInt(req?.body?.rangeDays, 10);
  if (Number.isInteger(bodyRange) && bodyRange > 0) return bodyRange;
  return 7;
}

function resolvePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function requireAdminAuth(req, res, next) {
  if (isAdminAuthenticated(req)) {
    next();
    return;
  }

  if (req.path.startsWith("/admin/api/") || req.path === "/admin/api") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.redirect("/admin/login");
}

function isAdminAuthenticated(req) {
  try {
    const cookies = parseCookies(req);
    return cookies[ADMIN_COOKIE_NAME] === ADMIN_COOKIE_VALUE;
  } catch (error) {
    return false;
  }
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce((accumulator, chunk) => {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex < 0) return accumulator;

    const rawName = chunk.slice(0, separatorIndex).trim();
    const rawValue = chunk.slice(separatorIndex + 1).trim();
    if (!rawName) return accumulator;

    try {
      accumulator[rawName] = decodeURIComponent(rawValue);
    } catch (error) {
      accumulator[rawName] = rawValue;
    }
    return accumulator;
  }, {});
}

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "-";
}

function normalizeAdminRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  if (role === "super_admin" || role === "admin_analyst" || role === "auditor") {
    return role;
  }
  return "super_admin";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function createLandingComment(payload) {
  const name = String(payload?.name || "").trim();
  const email = String(payload?.email || "")
    .trim()
    .toLowerCase();
  const message = String(payload?.message || "").trim();

  if (name.length < 2) {
    return { error: "Name must be at least 2 characters." };
  }

  if (!isValidEmail(email)) {
    return { error: "Provide a valid email address." };
  }

  if (message.length < 5) {
    return { error: "Message must be at least 5 characters." };
  }

  const comment = {
    id: `cmt_${String(landingCommentIdCounter).padStart(4, "0")}`,
    name,
    email,
    message: message.slice(0, 1200),
    createdAt: new Date().toISOString(),
  };

  landingCommentIdCounter += 1;
  landingComments.unshift(comment);
  if (landingComments.length > LANDING_COMMENTS_LIMIT) {
    landingComments.splice(LANDING_COMMENTS_LIMIT);
  }

  return { comment };
}

function resolveContactFlash(query) {
  const status = String(query?.contact || "")
    .trim()
    .toLowerCase();
  if (status === "sent") {
    return {
      tone: "success",
      message: "Message sent successfully.",
    };
  }

  if (status === "error") {
    const message = String(query?.message || "").trim();
    return {
      tone: "error",
      message: message || "Unable to submit message.",
    };
  }

  return null;
}
