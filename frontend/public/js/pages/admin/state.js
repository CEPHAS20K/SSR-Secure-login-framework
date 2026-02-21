export function parseInitialDashboardData(node) {
  if (!node) return {};
  try {
    return JSON.parse(node.textContent || "{}");
  } catch {
    return {};
  }
}

export function normalizeDashboardDataModel(data) {
  const fallback = {
    adminProfile: { username: "admin", role: "super_admin" },
    metrics: {
      totalUsers: 0,
      activeUsers: 0,
      flaggedUsers: 0,
      trustedDevices: 0,
      untrustedDevices: 0,
      averageRisk: 0,
      totalAnomalies: 0,
    },
    riskTrend: [],
    userGrowthTrend: [],
    trafficTrend: [],
    traffic: {
      totalVisits: 0,
      successfulLogins: 0,
      failedLogins: 0,
      successRate: 0,
      uniqueIps: 0,
      uniqueCountries: 0,
    },
    realtime: {
      activeSessions: 0,
      failedLogins10m: 0,
      stepUpQueue: 0,
    },
    health: {
      averageApiLatencyMs: 0,
      failedApiRequests: 0,
      recentErrors: 0,
      queueBacklog: 0,
    },
    threatGeo: [],
    alertRules: {
      enabled: true,
      failedLogins15mThreshold: 4,
      highRiskThreshold: 75,
      uniqueCountries24hThreshold: 3,
    },
    triggeredAlerts: [],
    governance: {
      requireApproval: false,
      pendingApprovals: 0,
      approvals: [],
    },
    exportCenter: {
      history: [],
      schedules: [],
    },
    anomalies: [],
    flaggedAccounts: [],
    users: [],
    auditLogs: [],
  };

  return {
    ...fallback,
    ...(data || {}),
    adminProfile: { ...fallback.adminProfile, ...((data || {}).adminProfile || {}) },
    metrics: { ...fallback.metrics, ...((data || {}).metrics || {}) },
    riskTrend: Array.isArray((data || {}).riskTrend) ? data.riskTrend : [],
    userGrowthTrend: Array.isArray((data || {}).userGrowthTrend) ? data.userGrowthTrend : [],
    trafficTrend: Array.isArray((data || {}).trafficTrend) ? data.trafficTrend : [],
    traffic: { ...fallback.traffic, ...((data || {}).traffic || {}) },
    realtime: { ...fallback.realtime, ...((data || {}).realtime || {}) },
    health: { ...fallback.health, ...((data || {}).health || {}) },
    threatGeo: Array.isArray((data || {}).threatGeo) ? data.threatGeo : [],
    alertRules: { ...fallback.alertRules, ...((data || {}).alertRules || {}) },
    triggeredAlerts: Array.isArray((data || {}).triggeredAlerts) ? data.triggeredAlerts : [],
    governance: { ...fallback.governance, ...((data || {}).governance || {}) },
    exportCenter: { ...fallback.exportCenter, ...((data || {}).exportCenter || {}) },
    anomalies: Array.isArray((data || {}).anomalies) ? data.anomalies : [],
    flaggedAccounts: Array.isArray((data || {}).flaggedAccounts) ? data.flaggedAccounts : [],
    users: Array.isArray((data || {}).users) ? data.users : [],
    auditLogs: Array.isArray((data || {}).auditLogs) ? data.auditLogs : [],
  };
}

export function createDashboardState(initialData) {
  const normalizedData = normalizeDashboardDataModel(initialData);
  const selectedUserId = normalizedData.users[0]?.id || null;

  return {
    data: normalizedData,
    selectedUserId,
    selectedLogCategory: "all",
    rangeDays: 7,
    usersQuery: "",
    usersSortBy: "lastLogin",
    usersSortDir: "desc",
    usersRows: [],
    usersTotal: 0,
    selectedUserIds: new Set(),
    usersPage: 1,
    usersPageSize: 8,
    devicesRows: [],
    devicesTotal: 0,
    devicesPage: 1,
    devicesPageSize: 5,
    devicesSortBy: "lastSeen",
    devicesSortDir: "desc",
    lookupQuery: "",
    lookupSelectedUserId: selectedUserId,
    lookupPage: 1,
    lookupPageSize: 6,
    usersExportScope: "users_only",
    pendingUsersExport: null,
    pendingScheduleId: "schedule_daily_users",
    timelineUserId: null,
    timelineCache: new Map(),
    apiCache: new Map(),
    pendingRequests: new Map(),
    usersLoading: false,
    devicesLoading: false,
    requireApproval: Boolean(normalizedData.governance?.requireApproval),
    loadingCount: 0,
    pendingAction: null,
  };
}
