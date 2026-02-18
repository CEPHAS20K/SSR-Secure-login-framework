const crypto = require("crypto");

const users = [
  {
    id: "u_1001",
    username: "kephas",
    email: "kephas@example.com",
    createdAt: daysAgo(410),
    lastLogin: hoursAgo(2),
    geo: "Nairobi, KE",
    active: true,
    riskScore: 24,
    loginAnomalies: 0,
    stepUpRequired: false,
    forcePasswordReset: false,
    devices: [
      {
        id: "d_1001a",
        label: "MacBook Pro 14",
        platform: "macOS 14 / Chrome 122",
        trusted: true,
        lastSeen: hoursAgo(2),
        ipAddress: "102.67.12.44",
        geo: "Nairobi, KE",
      },
      {
        id: "d_1001b",
        label: "iPhone 15",
        platform: "iOS 18 / Safari",
        trusted: true,
        lastSeen: daysAgo(1),
        ipAddress: "102.67.15.88",
        geo: "Nairobi, KE",
      },
    ],
    anomalyTags: [],
  },
  {
    id: "u_1002",
    username: "jane_doe",
    email: "jane@example.com",
    createdAt: daysAgo(220),
    lastLogin: hoursAgo(12),
    geo: "Austin, US",
    active: true,
    riskScore: 78,
    loginAnomalies: 3,
    stepUpRequired: true,
    forcePasswordReset: false,
    devices: [
      {
        id: "d_1002a",
        label: "Dell XPS",
        platform: "Windows 11 / Edge",
        trusted: false,
        lastSeen: hoursAgo(12),
        ipAddress: "18.216.14.20",
        geo: "Austin, US",
      },
      {
        id: "d_1002b",
        label: "Samsung S24",
        platform: "Android 15 / Chrome",
        trusted: false,
        lastSeen: daysAgo(3),
        ipAddress: "52.117.66.7",
        geo: "Warsaw, PL",
      },
    ],
    anomalyTags: ["impossible_travel", "device_change", "failed_logins"],
  },
  {
    id: "u_1003",
    username: "michael",
    email: "michael@example.com",
    createdAt: daysAgo(530),
    lastLogin: daysAgo(4),
    geo: "Berlin, DE",
    active: false,
    riskScore: 63,
    loginAnomalies: 2,
    stepUpRequired: true,
    forcePasswordReset: true,
    devices: [
      {
        id: "d_1003a",
        label: "ThinkPad X1",
        platform: "Ubuntu 24.04 / Firefox",
        trusted: false,
        lastSeen: daysAgo(5),
        ipAddress: "91.203.11.100",
        geo: "Berlin, DE",
      },
    ],
    anomalyTags: ["velocity", "new_location"],
  },
  {
    id: "u_1004",
    username: "alice",
    email: "alice@example.com",
    createdAt: daysAgo(90),
    lastLogin: hoursAgo(6),
    geo: "Lagos, NG",
    active: true,
    riskScore: 37,
    loginAnomalies: 1,
    stepUpRequired: false,
    forcePasswordReset: false,
    devices: [
      {
        id: "d_1004a",
        label: "MacBook Air",
        platform: "macOS 14 / Brave",
        trusted: true,
        lastSeen: hoursAgo(6),
        ipAddress: "154.72.12.67",
        geo: "Lagos, NG",
      },
      {
        id: "d_1004b",
        label: "iPad Pro",
        platform: "iPadOS 18 / Safari",
        trusted: true,
        lastSeen: daysAgo(2),
        ipAddress: "154.72.12.70",
        geo: "Lagos, NG",
      },
    ],
    anomalyTags: ["new_device"],
  },
  {
    id: "u_1005",
    username: "samuel",
    email: "samuel@example.com",
    createdAt: daysAgo(150),
    lastLogin: hoursAgo(30),
    geo: "Cape Town, ZA",
    active: true,
    riskScore: 81,
    loginAnomalies: 4,
    stepUpRequired: true,
    forcePasswordReset: false,
    devices: [
      {
        id: "d_1005a",
        label: "HP Spectre",
        platform: "Windows 11 / Chrome",
        trusted: false,
        lastSeen: hoursAgo(30),
        ipAddress: "197.82.21.47",
        geo: "Cape Town, ZA",
      },
    ],
    anomalyTags: ["bot_like_velocity", "tor_exit_node", "failed_logins"],
  },
  {
    id: "u_1006",
    username: "olivia",
    email: "olivia@example.com",
    createdAt: daysAgo(300),
    lastLogin: hoursAgo(3),
    geo: "London, UK",
    active: true,
    riskScore: 19,
    loginAnomalies: 0,
    stepUpRequired: false,
    forcePasswordReset: false,
    devices: [
      {
        id: "d_1006a",
        label: "Surface Laptop",
        platform: "Windows 11 / Edge",
        trusted: true,
        lastSeen: hoursAgo(3),
        ipAddress: "51.210.10.83",
        geo: "London, UK",
      },
    ],
    anomalyTags: [],
  },
];

const riskTrendSeed = [
  { label: "Mon", score: 28, anomalies: 2 },
  { label: "Tue", score: 34, anomalies: 3 },
  { label: "Wed", score: 39, anomalies: 5 },
  { label: "Thu", score: 48, anomalies: 7 },
  { label: "Fri", score: 52, anomalies: 9 },
  { label: "Sat", score: 45, anomalies: 6 },
  { label: "Sun", score: 37, anomalies: 4 },
];

const auditLogs = [];
let logIdCounter = 1;
const apiRequestMetrics = [];
const approvalQueue = [];
const exportHistory = [];
const exportSchedules = [
  {
    id: "schedule_daily_users",
    name: "Daily Users Export",
    scope: "users_only",
    format: "csv",
    frequency: "daily",
    timeUtc: "08:00",
    enabled: false,
    lastRunAt: null,
    nextRunAt: null,
  },
  {
    id: "schedule_weekly_users",
    name: "Weekly Users Compliance Export",
    scope: "users_with_related",
    format: "pdf",
    frequency: "weekly",
    dayOfWeek: 1,
    timeUtc: "09:30",
    enabled: false,
    lastRunAt: null,
    nextRunAt: null,
  },
];
let approvalIdCounter = 1;
let exportIdCounter = 1;

const governanceConfig = {
  requireApproval: false,
};

const alertRules = {
  enabled: true,
  failedLogins15mThreshold: 4,
  highRiskThreshold: 75,
  uniqueCountries24hThreshold: 3,
};

seedAuditLogs();
initializeExportSchedules();

function getDashboardSnapshot(options = {}) {
  processDueScheduledExports();

  const rangeDays = clamp(Number(options.rangeDays) || 7, 1, 180);
  const growthMonths = resolveGrowthMonths(rangeDays);
  const allUsers = getUsers();
  const recentLogs = getAuditLogs({ limit: 1200 });
  const flaggedAccounts = allUsers.filter(
    (user) => user.stepUpRequired || user.riskScore >= 70 || user.loginAnomalies >= 3
  );
  const allDevices = allUsers.flatMap((user) => user.devices);
  const trustedDevices = allDevices.filter((device) => device.trusted).length;
  const untrustedDevices = allDevices.length - trustedDevices;
  const totalRisk = allUsers.reduce((sum, user) => sum + user.riskScore, 0);
  const anomalyCounts = countAnomalies(allUsers);
  const riskTrend = buildRiskTrend(recentLogs, { days: rangeDays });
  const userGrowthTrend = buildUserGrowthTrend(allUsers, { months: growthMonths });
  const trafficInsights = buildTrafficInsights(recentLogs, { days: rangeDays });
  const realtime = buildRealtimeMetrics(allUsers, recentLogs);
  const threatGeo = buildThreatGeo(recentLogs, { days: rangeDays });
  const alerts = getTriggeredAlerts({ users: allUsers, logs: recentLogs });
  const pendingApprovals = approvalQueue.filter((item) => item.status === "pending");
  const health = buildDashboardHealth({ pendingApprovals: pendingApprovals.length });

  return clone({
    generatedAt: new Date().toISOString(),
    rangeDays,
    adminProfile: {
      username: String(options.adminUsername || "admin"),
      role: normalizeAdminRole(options.adminRole),
    },
    metrics: {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((user) => user.active).length,
      flaggedUsers: flaggedAccounts.length,
      trustedDevices,
      untrustedDevices,
      averageRisk: allUsers.length ? Math.round(totalRisk / allUsers.length) : 0,
      totalAnomalies: allUsers.reduce((sum, user) => sum + user.loginAnomalies, 0),
    },
    health,
    riskTrend,
    userGrowthTrend,
    trafficTrend: trafficInsights.trend,
    traffic: trafficInsights.summary,
    realtime,
    threatGeo,
    alertRules,
    triggeredAlerts: alerts,
    governance: {
      ...governanceConfig,
      pendingApprovals: pendingApprovals.length,
      approvals: pendingApprovals.slice(0, 25),
    },
    exportCenter: {
      history: getExportHistory({ limit: 20 }),
      schedules: getExportSchedules(),
    },
    anomalies: anomalyCounts,
    flaggedAccounts: flaggedAccounts.map(toFlaggedAccountSummary),
    users: allUsers,
    auditLogs: recentLogs.slice(0, 80),
  });
}

function getUsers() {
  return clone(users);
}

function getUserById(userId) {
  const user = users.find((item) => item.id === userId);
  return user ? clone(user) : null;
}

function queryUsers(options = {}) {
  const query = String(options.query || "")
    .trim()
    .toLowerCase();
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = clamp(Number(options.pageSize) || 10, 1, 100);
  const sortBy = normalizeUserSortBy(options.sortBy);
  const sortDir = normalizeSortDir(options.sortDir);

  const filtered = users.filter((user) => {
    if (!query) return true;
    const haystack = `${user.username} ${user.email} ${user.geo}`.toLowerCase();
    return haystack.includes(query);
  });

  const sorted = filtered.slice().sort((left, right) => {
    const leftValue = getUserSortValue(left, sortBy);
    const rightValue = getUserSortValue(right, sortBy);
    const comparison = compareSortValues(leftValue, rightValue);
    return sortDir === "asc" ? comparison : -comparison;
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const items = sorted.slice(startIndex, startIndex + pageSize);

  return clone({
    items,
    page: safePage,
    pageSize,
    total,
    totalPages,
    sortBy,
    sortDir,
    query,
  });
}

function queryUserDevices(options = {}) {
  const user = users.find((item) => item.id === options.userId);
  if (!user) return null;

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = clamp(Number(options.pageSize) || 8, 1, 100);
  const sortBy = normalizeDeviceSortBy(options.sortBy);
  const sortDir = normalizeSortDir(options.sortDir);
  const devices = Array.isArray(user.devices) ? user.devices.slice() : [];

  devices.sort((left, right) => {
    const leftValue = getDeviceSortValue(left, sortBy);
    const rightValue = getDeviceSortValue(right, sortBy);
    const comparison = compareSortValues(leftValue, rightValue);
    return sortDir === "asc" ? comparison : -comparison;
  });

  const total = devices.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const items = devices.slice(startIndex, startIndex + pageSize);

  return clone({
    userId: user.id,
    username: user.username,
    items,
    page: safePage,
    pageSize,
    total,
    totalPages,
    sortBy,
    sortDir,
  });
}

function getAuditLogs(options = {}) {
  const { category, limit = 120 } = options;
  const filtered = category ? auditLogs.filter((entry) => entry.category === category) : auditLogs;

  return clone(
    filtered
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, Number(limit) || 120)
  );
}

function recordAdminLoginAttempt(options = {}) {
  const { username = "admin", success = false, ipAddress = "-", geo = "Unknown" } = options;

  return addAuditLog({
    category: "login_attempt",
    action: success ? "admin_login_success" : "admin_login_failed",
    actor: username,
    target: "admin_portal",
    status: success ? "success" : "failed",
    details: { ipAddress, geo },
  });
}

function recordApiRequestMetric(options = {}) {
  const metric = {
    timestamp: new Date().toISOString(),
    route: String(options.route || "/admin/api"),
    method: String(options.method || "GET").toUpperCase(),
    statusCode: Number(options.statusCode) || 0,
    latencyMs: Math.max(0, Number(options.latencyMs) || 0),
    success: Boolean(options.success),
  };

  apiRequestMetrics.push(metric);
  if (apiRequestMetrics.length > 400) {
    apiRequestMetrics.splice(0, apiRequestMetrics.length - 400);
  }

  return clone(metric);
}

function setUserActive(options = {}) {
  const { userId, active, actor = "admin" } = options;
  const user = users.find((item) => item.id === userId);
  if (!user) return null;

  user.active = Boolean(active);
  if (!user.active) {
    user.stepUpRequired = true;
  }

  addAuditLog({
    category: "admin_action",
    action: user.active ? "activate_account" : "deactivate_account",
    actor,
    target: user.username,
    status: "success",
    details: { userId: user.id },
  });

  return clone(user);
}

function bulkSetUsersActive(options = {}) {
  const targetIds = Array.isArray(options.userIds) ? options.userIds : [];
  const actor = String(options.actor || "admin");
  const active = Boolean(options.active);
  let updatedCount = 0;

  for (const userId of targetIds) {
    const updated = setUserActive({ userId, active, actor });
    if (updated) updatedCount += 1;
  }

  addAuditLog({
    category: "admin_action",
    action: active ? "bulk_activate_accounts" : "bulk_deactivate_accounts",
    actor,
    target: "users_batch",
    status: "success",
    details: { requested: targetIds.length, updated: updatedCount, active },
  });

  return {
    updatedCount,
    requestedCount: targetIds.length,
  };
}

function setDeviceTrusted(options = {}) {
  const { userId, deviceId, trusted, actor = "admin" } = options;
  const user = users.find((item) => item.id === userId);
  if (!user) return null;

  const device = user.devices.find((item) => item.id === deviceId);
  if (!device) return null;

  device.trusted = Boolean(trusted);
  device.lastSeen = new Date().toISOString();

  addAuditLog({
    category: "admin_action",
    action: device.trusted ? "mark_device_trusted" : "mark_device_untrusted",
    actor,
    target: `${user.username}:${device.label}`,
    status: "success",
    details: { userId: user.id, deviceId: device.id },
  });

  return clone(user);
}

function forcePasswordReset(options = {}) {
  const { userId, actor = "admin" } = options;
  const user = users.find((item) => item.id === userId);
  if (!user) return null;

  user.forcePasswordReset = true;
  user.stepUpRequired = true;

  addAuditLog({
    category: "admin_action",
    action: "force_password_reset",
    actor,
    target: user.username,
    status: "success",
    details: { userId: user.id },
  });

  return clone(user);
}

function bulkForcePasswordReset(options = {}) {
  const targetIds = Array.isArray(options.userIds) ? options.userIds : [];
  const actor = String(options.actor || "admin");
  let updatedCount = 0;

  for (const userId of targetIds) {
    const updated = forcePasswordReset({ userId, actor });
    if (updated) updatedCount += 1;
  }

  addAuditLog({
    category: "admin_action",
    action: "bulk_force_password_reset",
    actor,
    target: "users_batch",
    status: "success",
    details: { requested: targetIds.length, updated: updatedCount },
  });

  return {
    updatedCount,
    requestedCount: targetIds.length,
  };
}

function triggerReauthentication(options = {}) {
  const { userId, method, actor = "admin" } = options;
  const normalizedMethod = String(method || "").toLowerCase();
  if (!["otp", "webauthn"].includes(normalizedMethod)) return null;

  const user = users.find((item) => item.id === userId);
  if (!user) return null;

  user.stepUpRequired = true;

  if (normalizedMethod === "otp") {
    addAuditLog({
      category: "otp",
      action: "otp_sent",
      actor,
      target: user.username,
      status: "success",
      details: { userId: user.id },
    });
  }

  addAuditLog({
    category: "admin_action",
    action: normalizedMethod === "otp" ? "trigger_otp_reauth" : "trigger_webauthn_reauth",
    actor,
    target: user.username,
    status: "success",
    details: { userId: user.id, method: normalizedMethod },
  });

  return clone(user);
}

function runIncidentLockdown(options = {}) {
  const { userId, actor = "admin" } = options;
  const user = users.find((item) => item.id === userId);
  if (!user) return null;

  user.active = false;
  user.stepUpRequired = true;
  user.forcePasswordReset = true;

  for (const device of user.devices || []) {
    device.trusted = false;
    device.lastSeen = new Date().toISOString();
  }

  addAuditLog({
    category: "admin_action",
    action: "incident_lockdown",
    actor,
    target: user.username,
    status: "success",
    details: { userId: user.id, affectedDevices: (user.devices || []).length },
  });

  return clone(user);
}

function getUserTimeline(options = {}) {
  const { userId, limit = 80 } = options;
  const user = users.find((item) => item.id === userId);
  if (!user) return [];

  const logs = getAuditLogs({ limit: 600 });
  const timeline = [];

  timeline.push({
    id: `timeline_created_${user.id}`,
    timestamp: user.createdAt,
    category: "account",
    action: "account_created",
    actor: "system",
    status: "success",
    details: { message: "Account was created." },
  });

  if (user.lastLogin) {
    timeline.push({
      id: `timeline_last_login_${user.id}`,
      timestamp: user.lastLogin,
      category: "login_attempt",
      action: "last_login",
      actor: user.username,
      status: "success",
      details: { message: "Most recent successful login." },
    });
  }

  for (const entry of logs) {
    const relatedByUserId = entry.details?.userId === user.id;
    const relatedByActor = entry.actor === user.username;
    const relatedByTarget =
      typeof entry.target === "string" &&
      (entry.target === user.username || entry.target.startsWith(`${user.username}:`));

    if (!relatedByUserId && !relatedByActor && !relatedByTarget) {
      continue;
    }

    timeline.push({
      id: entry.id,
      timestamp: entry.timestamp,
      category: entry.category,
      action: entry.action,
      actor: entry.actor,
      status: entry.status,
      details: entry.details || {},
    });
  }

  return clone(
    timeline
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, Number(limit) || 80)
  );
}

function requestApproval(options = {}) {
  const {
    actionType,
    payload = {},
    target = "unknown",
    summary = "Approval request",
    requestedBy = "admin",
  } = options;

  const normalizedAction = String(actionType || "").trim();
  if (!normalizedAction) {
    throw new Error("actionType is required.");
  }

  const approval = {
    id: `apr_${String(approvalIdCounter).padStart(4, "0")}`,
    actionType: normalizedAction,
    payload: clone(payload || {}),
    target: String(target || "unknown"),
    summary: String(summary || "Approval request"),
    requestedBy: String(requestedBy || "admin"),
    requestedAt: new Date().toISOString(),
    status: "pending",
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
  };
  approvalIdCounter += 1;
  approvalQueue.unshift(approval);

  addAuditLog({
    category: "admin_action",
    action: "approval_requested",
    actor: approval.requestedBy,
    target: approval.target,
    status: "success",
    details: { approvalId: approval.id, actionType: approval.actionType },
  });

  return clone(approval);
}

function resolveApproval(options = {}) {
  const { approvalId, decision, actor = "admin" } = options;
  const approval = approvalQueue.find((item) => item.id === approvalId);
  if (!approval || approval.status !== "pending") {
    return { approval: null, result: null };
  }

  const normalizedDecision = String(decision || "").toLowerCase();
  if (!["approve", "reject"].includes(normalizedDecision)) {
    throw new Error("decision must be approve or reject.");
  }

  approval.status = normalizedDecision === "approve" ? "approved" : "rejected";
  approval.resolvedAt = new Date().toISOString();
  approval.resolvedBy = actor;
  approval.resolution = normalizedDecision;

  let result = null;
  if (normalizedDecision === "approve") {
    result = executeApprovalAction(approval, actor);
  }

  addAuditLog({
    category: "admin_action",
    action: normalizedDecision === "approve" ? "approval_approved" : "approval_rejected",
    actor,
    target: approval.target,
    status: "success",
    details: { approvalId: approval.id, actionType: approval.actionType },
  });

  return { approval: clone(approval), result };
}

function executeApprovalAction(approval, actor) {
  const payload = approval.payload || {};

  if (approval.actionType === "toggle_user_active") {
    return setUserActive({ userId: payload.userId, active: Boolean(payload.active), actor });
  }

  if (approval.actionType === "toggle_device_trust") {
    return setDeviceTrusted({
      userId: payload.userId,
      deviceId: payload.deviceId,
      trusted: Boolean(payload.trusted),
      actor,
    });
  }

  if (approval.actionType === "force_password_reset") {
    return forcePasswordReset({ userId: payload.userId, actor });
  }

  if (approval.actionType === "trigger_reauth") {
    return triggerReauthentication({ userId: payload.userId, method: payload.method, actor });
  }

  if (approval.actionType === "incident_lockdown") {
    return runIncidentLockdown({ userId: payload.userId, actor });
  }

  throw new Error(`Unsupported approval action: ${approval.actionType}`);
}

function getApprovals(options = {}) {
  const { status, limit = 120 } = options;
  const filtered = status ? approvalQueue.filter((item) => item.status === status) : approvalQueue;
  return clone(filtered.slice(0, Number(limit) || 120));
}

function setGovernanceConfig(options = {}) {
  if (typeof options.requireApproval === "boolean") {
    governanceConfig.requireApproval = options.requireApproval;
  }
  return clone(governanceConfig);
}

function getGovernanceConfig() {
  return clone(governanceConfig);
}

function setAlertRules(options = {}) {
  if (typeof options.enabled === "boolean") {
    alertRules.enabled = options.enabled;
  }

  if (Number.isFinite(Number(options.failedLogins15mThreshold))) {
    alertRules.failedLogins15mThreshold = Math.max(
      1,
      Math.floor(Number(options.failedLogins15mThreshold))
    );
  }

  if (Number.isFinite(Number(options.highRiskThreshold))) {
    alertRules.highRiskThreshold = Math.min(
      100,
      Math.max(1, Math.floor(Number(options.highRiskThreshold)))
    );
  }

  if (Number.isFinite(Number(options.uniqueCountries24hThreshold))) {
    alertRules.uniqueCountries24hThreshold = Math.max(
      1,
      Math.floor(Number(options.uniqueCountries24hThreshold))
    );
  }

  return clone(alertRules);
}

function getAlertRules() {
  return clone(alertRules);
}

function getTriggeredAlerts(context = {}) {
  if (!alertRules.enabled) {
    return [];
  }

  const logs = Array.isArray(context.logs) ? context.logs : getAuditLogs({ limit: 600 });
  const allUsers = Array.isArray(context.users) ? context.users : getUsers();
  const alerts = [];
  const nowTs = Date.now();

  const failed15m = logs.filter((entry) => {
    if (entry.category !== "login_attempt" || entry.status !== "failed") return false;
    const ts = Date.parse(entry.timestamp);
    return !Number.isNaN(ts) && nowTs - ts <= 15 * 60 * 1000;
  }).length;

  if (failed15m >= alertRules.failedLogins15mThreshold) {
    alerts.push({
      id: "alert_failed_logins_15m",
      severity: "high",
      title: "Failed Login Spike",
      description: `${failed15m} failed logins in the last 15 minutes.`,
    });
  }

  const highRiskCount = allUsers.filter(
    (user) => user.riskScore >= alertRules.highRiskThreshold
  ).length;
  if (highRiskCount > 0) {
    alerts.push({
      id: "alert_high_risk_users",
      severity: "medium",
      title: "High Risk Accounts",
      description: `${highRiskCount} accounts above risk score ${alertRules.highRiskThreshold}.`,
    });
  }

  const recent24hCountries = new Set();
  for (const entry of logs) {
    if (entry.category !== "login_attempt") continue;
    const ts = Date.parse(entry.timestamp);
    if (Number.isNaN(ts) || nowTs - ts > 24 * 60 * 60 * 1000) continue;
    const country = extractCountryCode(entry.details?.geo);
    if (country) recent24hCountries.add(country);
  }

  if (recent24hCountries.size >= alertRules.uniqueCountries24hThreshold) {
    alerts.push({
      id: "alert_country_spread",
      severity: "medium",
      title: "Geo Spread Alert",
      description: `${recent24hCountries.size} countries seen in login traffic in 24h.`,
    });
  }

  return alerts;
}

function recordExportEvent(options = {}) {
  const normalizedFormat = options.format === "pdf" ? "pdf" : "csv";
  const normalizedScope =
    options.scope === "users_with_related" ? "users_with_related" : "users_only";
  const records = Math.max(0, Number(options.records) || 0);
  const timestamp = new Date().toISOString();
  const source = String(options.source || "dashboard");
  const filename =
    options.filename ||
    `${source.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "export"}-${normalizedScope}-${timestamp.slice(
      0,
      10
    )}.${normalizedFormat}`;
  const checksum =
    options.checksum ||
    createChecksum({
      timestamp,
      format: normalizedFormat,
      scope: normalizedScope,
      records,
      source,
      filename,
    });

  const entry = {
    id: `exp_${String(exportIdCounter).padStart(4, "0")}`,
    timestamp,
    actor: String(options.actor || "admin"),
    format: normalizedFormat,
    scope: normalizedScope,
    records,
    source,
    filename,
    checksum,
  };
  exportIdCounter += 1;
  exportHistory.unshift(entry);

  addAuditLog({
    category: "admin_action",
    action: "export_generated",
    actor: entry.actor,
    target: "reporting",
    status: "success",
    details: {
      format: normalizedFormat,
      scope: normalizedScope,
      records,
      source,
      filename,
      checksum,
    },
  });

  return clone(entry);
}

function getExportHistory(options = {}) {
  const limit = Number(options.limit) || 20;
  return clone(exportHistory.slice(0, limit));
}

function getExportSchedules() {
  return clone(exportSchedules);
}

function setExportSchedule(options = {}) {
  const schedule = exportSchedules.find((item) => item.id === options.scheduleId);
  if (!schedule) return null;
  if (typeof options.enabled === "boolean") {
    schedule.enabled = options.enabled;
  }
  if (typeof options.timeUtc === "string" && options.timeUtc.trim()) {
    schedule.timeUtc = options.timeUtc.trim();
  }
  if (typeof options.frequency === "string") {
    const normalized = options.frequency.trim().toLowerCase();
    if (normalized === "daily" || normalized === "weekly") {
      schedule.frequency = normalized;
    }
  }
  if (typeof options.dayOfWeek === "number" && Number.isInteger(options.dayOfWeek)) {
    schedule.dayOfWeek = clamp(options.dayOfWeek, 0, 6);
  }
  if (typeof options.scope === "string") {
    schedule.scope = options.scope === "users_with_related" ? "users_with_related" : "users_only";
  }
  if (typeof options.format === "string") {
    schedule.format = options.format === "pdf" ? "pdf" : "csv";
  }
  schedule.nextRunAt = schedule.enabled ? computeNextRunAt(schedule) : null;

  addAuditLog({
    category: "admin_action",
    action: "export_schedule_updated",
    actor: String(options.actor || "admin"),
    target: schedule.name,
    status: "success",
    details: {
      scheduleId: schedule.id,
      enabled: schedule.enabled,
      frequency: schedule.frequency,
      timeUtc: schedule.timeUtc,
      scope: schedule.scope,
      format: schedule.format,
      dayOfWeek: schedule.dayOfWeek ?? null,
      nextRunAt: schedule.nextRunAt,
    },
  });

  return clone(schedule);
}

function runScheduledExportNow(options = {}) {
  const schedule = exportSchedules.find((item) => item.id === options.scheduleId);
  if (!schedule) return null;

  const allUsers = getUsers();
  const records = schedule.scope === "users_with_related" ? allUsers.length : allUsers.length;
  const executedAt = new Date().toISOString();
  const entry = recordExportEvent({
    actor: String(options.actor || "system"),
    format: schedule.format,
    scope: schedule.scope,
    records,
    source: `schedule:${schedule.id}`,
    filename: `${schedule.id}-${executedAt.slice(0, 10)}.${schedule.format}`,
  });

  schedule.lastRunAt = executedAt;
  schedule.nextRunAt = schedule.enabled
    ? computeNextRunAt(schedule, new Date(executedAt).getTime())
    : null;
  return clone(entry);
}

function processDueScheduledExports(nowTs = Date.now()) {
  for (const schedule of exportSchedules) {
    if (!schedule.enabled) continue;
    if (!schedule.nextRunAt) {
      schedule.nextRunAt = computeNextRunAt(schedule, nowTs);
      continue;
    }
    const nextRunTs = Date.parse(schedule.nextRunAt);
    if (Number.isNaN(nextRunTs)) {
      schedule.nextRunAt = computeNextRunAt(schedule, nowTs);
      continue;
    }
    if (nextRunTs <= nowTs) {
      runScheduledExportNow({ scheduleId: schedule.id, actor: "system" });
    }
  }
}

function buildRiskTrend(logs, options = {}) {
  const days = clamp(Number(options.days) || 7, 1, 180);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const formatter =
    days > 10
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
      : new Intl.DateTimeFormat("en-US", { weekday: "short" });

  const buckets = [];
  const bucketByDay = new Map();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    const key = getDateKey(day);
    const bucket = {
      key,
      label: formatter.format(day),
      attempts: 0,
      failed: 0,
      anomalies: 0,
      score: 0,
    };
    buckets.push(bucket);
    bucketByDay.set(key, bucket);
  }

  const rangeStart = new Date(now);
  rangeStart.setDate(now.getDate() - (days - 1));
  const rangeStartTs = rangeStart.getTime();

  for (const entry of logs || []) {
    if (entry.category !== "login_attempt") continue;
    const ts = Date.parse(entry.timestamp || "");
    if (Number.isNaN(ts) || ts < rangeStartTs) continue;
    const key = getDateKey(new Date(ts));
    const bucket = bucketByDay.get(key);
    if (!bucket) continue;
    bucket.attempts += 1;
    if (entry.status !== "success") {
      bucket.failed += 1;
      bucket.anomalies += 1;
    }
  }

  return buckets.map((bucket) => {
    const failRate = bucket.attempts ? Math.round((bucket.failed / bucket.attempts) * 100) : 0;
    const score = Math.min(100, Math.round(failRate * 0.7 + bucket.anomalies * 6));
    return {
      label: bucket.label,
      score,
      anomalies: bucket.anomalies,
    };
  });
}

function buildDashboardHealth(context = {}) {
  const pendingApprovals = Number(context.pendingApprovals) || 0;
  const lastMinute = Date.now() - 60 * 1000;
  const recentErrors = auditLogs.filter((entry) => {
    if (entry.category !== "admin_action") return false;
    if (entry.status === "success") return false;
    const ts = Date.parse(entry.timestamp || "");
    return !Number.isNaN(ts) && ts >= lastMinute;
  }).length;

  const requestStats = apiRequestMetrics.slice(-120);
  const avgLatency =
    requestStats.length > 0
      ? Math.round(
          requestStats.reduce((sum, item) => sum + Number(item.latencyMs || 0), 0) /
            requestStats.length
        )
      : 0;
  const failedApiRequests = requestStats.filter((item) => !item.success).length;

  return {
    averageApiLatencyMs: avgLatency,
    failedApiRequests,
    recentErrors,
    queueBacklog: pendingApprovals,
  };
}

module.exports = {
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
  getAlertRules,
  setAlertRules,
  getTriggeredAlerts,
  recordExportEvent,
  getExportHistory,
  getExportSchedules,
  setExportSchedule,
  runScheduledExportNow,
};

function addAuditLog(entry) {
  const log = {
    id: `log_${String(logIdCounter).padStart(5, "0")}`,
    timestamp: new Date().toISOString(),
    category: entry.category,
    action: entry.action,
    actor: entry.actor,
    target: entry.target,
    status: entry.status || "success",
    details: entry.details || {},
  };
  logIdCounter += 1;
  auditLogs.push(log);
  return log;
}

function toFlaggedAccountSummary(user) {
  return {
    id: user.id,
    username: user.username,
    riskScore: user.riskScore,
    loginAnomalies: user.loginAnomalies,
    stepUpRequired: user.stepUpRequired,
  };
}

function countAnomalies(allUsers) {
  const map = new Map();

  for (const user of allUsers) {
    for (const tag of user.anomalyTags || []) {
      map.set(tag, (map.get(tag) || 0) + 1);
    }
  }

  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function buildUserGrowthTrend(allUsers, options = {}) {
  const months = Math.max(3, Number(options.months) || 6);
  const now = new Date();
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const trend = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    const monthStartTs = monthStart.getTime();
    const monthEndTs = monthEnd.getTime();

    let newUsers = 0;
    let totalUsers = 0;

    for (const user of allUsers) {
      const createdAtTs = Date.parse(user.createdAt);
      if (Number.isNaN(createdAtTs)) continue;
      if (createdAtTs < monthEndTs) {
        totalUsers += 1;
      }
      if (createdAtTs >= monthStartTs && createdAtTs < monthEndTs) {
        newUsers += 1;
      }
    }

    trend.push({
      label: monthFormatter.format(monthStart),
      newUsers,
      totalUsers,
    });
  }

  return trend;
}

function buildTrafficInsights(logs, options = {}) {
  const days = Math.max(1, Number(options.days) || 7);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const dayFormatter =
    days > 10
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
      : new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const buckets = [];
  const bucketIndexByKey = new Map();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - offset);
    const key = getDateKey(day);
    const index = buckets.length;
    bucketIndexByKey.set(key, index);
    buckets.push({
      key,
      label: dayFormatter.format(day),
      visits: 0,
      success: 0,
      failed: 0,
    });
  }

  const rangeStart = new Date(now);
  rangeStart.setDate(now.getDate() - (days - 1));
  const rangeStartTs = rangeStart.getTime();

  const rangeEnd = new Date(now);
  rangeEnd.setDate(now.getDate() + 1);
  const rangeEndTs = rangeEnd.getTime();

  const uniqueIps = new Set();
  const uniqueCountries = new Set();
  const loginLogs = (logs || []).filter((entry) => entry.category === "login_attempt");

  for (const entry of loginLogs) {
    const timestamp = Date.parse(entry.timestamp);
    if (Number.isNaN(timestamp) || timestamp < rangeStartTs || timestamp >= rangeEndTs) {
      continue;
    }

    const bucketKey = getDateKey(new Date(timestamp));
    const bucketIndex = bucketIndexByKey.get(bucketKey);
    if (typeof bucketIndex !== "number") continue;

    const bucket = buckets[bucketIndex];
    bucket.visits += 1;
    if (entry.status === "success") {
      bucket.success += 1;
    } else {
      bucket.failed += 1;
    }

    const ipAddress = entry.details?.ipAddress;
    if (ipAddress && ipAddress !== "-") {
      uniqueIps.add(String(ipAddress));
    }

    const geo = entry.details?.geo;
    const country = extractCountryCode(geo);
    if (country) {
      uniqueCountries.add(country);
    }
  }

  const totalVisits = buckets.reduce((sum, bucket) => sum + bucket.visits, 0);
  const successfulLogins = buckets.reduce((sum, bucket) => sum + bucket.success, 0);
  const failedLogins = buckets.reduce((sum, bucket) => sum + bucket.failed, 0);
  const successRate = totalVisits ? Math.round((successfulLogins / totalVisits) * 100) : 0;

  return {
    trend: buckets.map(({ label, visits, success, failed }) => ({
      label,
      visits,
      success,
      failed,
    })),
    summary: {
      totalVisits,
      successfulLogins,
      failedLogins,
      successRate,
      uniqueIps: uniqueIps.size,
      uniqueCountries: uniqueCountries.size,
    },
  };
}

function buildRealtimeMetrics(allUsers, logs) {
  const nowTs = Date.now();
  let activeSessions = 0;

  for (const user of allUsers) {
    if (!user.active) continue;
    for (const device of user.devices || []) {
      const ts = Date.parse(device.lastSeen);
      if (!Number.isNaN(ts) && nowTs - ts <= 24 * 60 * 60 * 1000) {
        activeSessions += 1;
      }
    }
  }

  const failedLogins10m = (logs || []).filter((entry) => {
    if (entry.category !== "login_attempt" || entry.status !== "failed") return false;
    const ts = Date.parse(entry.timestamp);
    return !Number.isNaN(ts) && nowTs - ts <= 10 * 60 * 1000;
  }).length;

  return {
    activeSessions,
    failedLogins10m,
    stepUpQueue: allUsers.filter((user) => user.stepUpRequired).length,
  };
}

function buildThreatGeo(logs, options = {}) {
  const days = Math.max(1, Number(options.days) || 30);
  const nowTs = Date.now();
  const maxAge = days * 24 * 60 * 60 * 1000;
  const map = new Map();

  for (const entry of logs || []) {
    if (entry.category !== "login_attempt") continue;
    const ts = Date.parse(entry.timestamp);
    if (Number.isNaN(ts) || nowTs - ts > maxAge) continue;

    const geo = entry.details?.geo || "Unknown";
    const key = String(geo);
    if (!map.has(key)) {
      map.set(key, { geo: key, attempts: 0, failed: 0, uniqueIps: new Set() });
    }

    const bucket = map.get(key);
    bucket.attempts += 1;
    if (entry.status !== "success") {
      bucket.failed += 1;
    }

    const ipAddress = entry.details?.ipAddress;
    if (ipAddress && ipAddress !== "-") {
      bucket.uniqueIps.add(String(ipAddress));
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      geo: item.geo,
      attempts: item.attempts,
      failed: item.failed,
      successRate: item.attempts
        ? Math.round(((item.attempts - item.failed) / item.attempts) * 100)
        : 0,
      uniqueIps: item.uniqueIps.size,
    }))
    .sort((a, b) => {
      if (b.failed !== a.failed) return b.failed - a.failed;
      return b.attempts - a.attempts;
    })
    .slice(0, 8);
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractCountryCode(geo) {
  if (!geo || typeof geo !== "string") return "";
  const parts = geo.split(",");
  const token = parts[parts.length - 1]?.trim();
  if (!token || token === "Unknown") return "";
  return token.toUpperCase();
}

function seedAuditLogs() {
  addAuditLog({
    category: "login_attempt",
    action: "user_login_success",
    actor: "kephas",
    target: "user_portal",
    status: "success",
    details: { ipAddress: "102.67.12.44", geo: "Nairobi, KE" },
  });
  addAuditLog({
    category: "login_attempt",
    action: "user_login_failed",
    actor: "jane_doe",
    target: "user_portal",
    status: "failed",
    details: { ipAddress: "52.117.66.7", geo: "Warsaw, PL" },
  });
  addAuditLog({
    category: "otp",
    action: "otp_sent",
    actor: "system",
    target: "jane_doe",
    status: "success",
    details: { channel: "email" },
  });
  addAuditLog({
    category: "otp",
    action: "otp_verified",
    actor: "jane_doe",
    target: "user_portal",
    status: "success",
    details: { channel: "email" },
  });
  addAuditLog({
    category: "admin_action",
    action: "mark_device_untrusted",
    actor: "admin",
    target: "jane_doe:Dell XPS",
    status: "success",
  });
}

function initializeExportSchedules() {
  for (const schedule of exportSchedules) {
    schedule.nextRunAt = schedule.enabled ? computeNextRunAt(schedule) : null;
  }
}

function daysAgo(days) {
  const result = new Date();
  result.setDate(result.getDate() - days);
  return result.toISOString();
}

function hoursAgo(hours) {
  const result = new Date();
  result.setHours(result.getHours() - hours);
  return result.toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function normalizeSortDir(value) {
  return String(value || "").toLowerCase() === "asc" ? "asc" : "desc";
}

function normalizeUserSortBy(value) {
  const allowed = new Set([
    "username",
    "email",
    "createdAt",
    "lastLogin",
    "geo",
    "riskScore",
    "active",
    "loginAnomalies",
  ]);
  const normalized = String(value || "").trim();
  return allowed.has(normalized) ? normalized : "lastLogin";
}

function normalizeDeviceSortBy(value) {
  const allowed = new Set(["label", "platform", "lastSeen", "trusted", "geo", "ipAddress"]);
  const normalized = String(value || "").trim();
  return allowed.has(normalized) ? normalized : "lastSeen";
}

function getUserSortValue(user, sortBy) {
  if (sortBy === "createdAt" || sortBy === "lastLogin") {
    return Date.parse(user?.[sortBy] || "") || 0;
  }
  if (sortBy === "active") {
    return user?.active ? 1 : 0;
  }
  if (sortBy === "riskScore" || sortBy === "loginAnomalies") {
    return Number(user?.[sortBy] || 0);
  }
  return String(user?.[sortBy] || "").toLowerCase();
}

function getDeviceSortValue(device, sortBy) {
  if (sortBy === "lastSeen") {
    return Date.parse(device?.lastSeen || "") || 0;
  }
  if (sortBy === "trusted") {
    return device?.trusted ? 1 : 0;
  }
  return String(device?.[sortBy] || "").toLowerCase();
}

function compareSortValues(left, right) {
  if (left === right) return 0;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function resolveGrowthMonths(rangeDays) {
  if (rangeDays >= 120) return 12;
  if (rangeDays >= 60) return 9;
  if (rangeDays >= 30) return 6;
  return 3;
}

function normalizeAdminRole(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "super_admin" || normalized === "admin_analyst" || normalized === "auditor") {
    return normalized;
  }
  return "super_admin";
}

function createChecksum(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex")
    .slice(0, 16);
}

function parseUtcTimeParts(value) {
  const token = String(value || "").trim();
  const match = token.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function computeNextRunAt(schedule, fromTs = Date.now()) {
  const now = new Date(fromTs);
  const timeParts = parseUtcTimeParts(schedule.timeUtc) || { hour: 8, minute: 0 };

  if (schedule.frequency === "weekly") {
    const dayOfWeek = Number.isInteger(schedule.dayOfWeek) ? clamp(schedule.dayOfWeek, 0, 6) : 1;
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const currentDay = cursor.getUTCDay();
    const diff = (dayOfWeek - currentDay + 7) % 7;
    cursor.setUTCDate(cursor.getUTCDate() + diff);
    cursor.setUTCHours(timeParts.hour, timeParts.minute, 0, 0);
    if (cursor.getTime() <= fromTs) {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return cursor.toISOString();
  }

  const daily = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  daily.setUTCHours(timeParts.hour, timeParts.minute, 0, 0);
  if (daily.getTime() <= fromTs) {
    daily.setUTCDate(daily.getUTCDate() + 1);
  }
  return daily.toISOString();
}
