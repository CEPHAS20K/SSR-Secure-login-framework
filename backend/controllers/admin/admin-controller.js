"use strict";

const { pool } = require("../../database/pool");

const safeNoStoreHeaders = {
  "Cache-Control": "no-store",
};

function createAdminController(options = {}) {
  const {
    logger = console,
    adminUsername = process.env.ADMIN_USERNAME || "admin",
    adminPassword = process.env.ADMIN_PASSWORD || "admin123",
    maxUsers = Number(process.env.MAX_USERS || 0),
    perUserQuotaBytes = Number(process.env.USER_STORAGE_QUOTA_BYTES || 10 * 1024 * 1024 * 1024), // default 10 GB
    alertRulesState = createDefaultAlertRulesState(),
    governanceState = createDefaultGovernanceState(),
    exportState = createDefaultExportState(),
    auth,
    appVersion = "dev",
  } = options;

  if (!auth) {
    throw new Error("createAdminController requires auth helpers (createAdminAuth).");
  }

  async function renderAdminLogin(req, res) {
    res.set(safeNoStoreHeaders);
    if (req.admin) {
      res.redirect(302, "/admin/dashboard");
      return;
    }
    res.render("pages/admin/login", {
      title: "Admin Login",
      activePage: "admin",
      page: "admin-login",
      errorMessage: typeof req.query?.error === "string" ? req.query.error : "",
    });
  }

  async function loginAdmin(req, res) {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      res.redirect(303, "/admin/login?error=Enter%20username%20and%20password.");
      return;
    }

    const ok =
      username.toLowerCase() === String(adminUsername).toLowerCase() &&
      password === String(adminPassword);
    if (!ok) {
      if (typeof logger.warn === "function") {
        logger.warn({ route: "/admin/login", username }, "Invalid admin credentials");
      }
      res.redirect(303, "/admin/login?error=Invalid%20credentials.");
      return;
    }

    auth.issueAdminSession(res, username);
    res.redirect(303, "/admin/dashboard");
  }

  async function renderAdminDashboard(req, res) {
    res.set(safeNoStoreHeaders);
    const rangeDays = Number.parseInt(req.query?.rangeDays || "7", 10) || 7;
    let dashboardData = buildFallbackDashboard();
    try {
      dashboardData = await buildDashboardData({
        rangeDays,
        alertRulesState,
        governanceState,
        exportState,
      });
    } catch (error) {
      logger.warn({ err: error }, "Admin dashboard falling back to demo data (DB unreachable?)");
    }
    res.render("pages/admin/dashboard", {
      title: "Admin Dashboard",
      activePage: "admin",
      page: "admin-dashboard",
      dashboardData,
      appVersion,
    });
  }

  async function logoutAdmin(req, res) {
    auth.clearAdminSession(res);
    res.redirect(302, "/admin/login");
  }

  async function getDashboardSnapshot(req, res) {
    const rangeDays = Number.parseInt(req.query?.rangeDays || "7", 10) || 7;
    try {
      const snapshot = await buildDashboardData({
        rangeDays,
        alertRulesState,
        governanceState,
        exportState,
      });
      res.status(200).json(snapshot);
    } catch (error) {
      logger.warn({ err: error }, "Dashboard snapshot falling back to demo data");
      res.status(200).json(buildFallbackDashboard());
    }
  }

  async function listUsers(req, res) {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize || "8", 10) || 8));
    const sortBy = sanitizeUserSort(req.query.sortBy);
    const sortDir = sanitizeSortDir(req.query.sortDir);
    const search = String(req.query.q || "").trim();

    const client = await pool.connect().catch((error) => {
      logger.error({ err: error }, "DB connect failed for listUsers");
      return null;
    });
    if (!client) {
      res.status(200).json({
        users: [],
        pagination: { page, pageSize, total: 0 },
      });
      return;
    }
    try {
      const whereParts = [];
      const params = [];

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        params.push(`%${search.toLowerCase()}%`);
        whereParts.push(
          `(lower(u.username) LIKE $${params.length - 1} OR lower(u.email) LIKE $${params.length})`
        );
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
      const orderClause = `ORDER BY ${sortBy} ${sortDir}`;
      const offset = (page - 1) * pageSize;
      params.push(pageSize);
      params.push(offset);

      const query = `
        SELECT
          u.id,
          u.username,
          u.email,
          u.created_at,
          u.last_login,
          u.last_login_ip,
          u.last_login_geo,
          u.email_verified_at,
          u.gender,
          COALESCE((SELECT MAX(risk_score) FROM login_attempts la WHERE la.user_id = u.id), 0) AS risk_score,
          (SELECT COUNT(*) FROM login_attempts la WHERE la.user_id = u.id AND success=false AND created_at > now() - interval '24 hours') AS login_anomalies,
          (SELECT COUNT(*) FROM trusted_devices td WHERE td.user_id = u.id AND td.trusted = true) AS trusted_devices,
          (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS active_sessions,
          COUNT(*) OVER() AS total_count
        FROM users u
        ${whereClause}
        ${orderClause}
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;

      const result = await client.query(query, params);
      const total = result.rows[0]?.total_count || 0;
      res.status(200).json({
        users: result.rows.map(mapUserRow),
        pagination: {
          page,
          pageSize,
          total,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to list users");
      res.status(500).json({ error: "Unable to fetch users." });
    } finally {
      client.release();
    }
  }

  async function listUserDevices(req, res) {
    const userId = String(req.params.userId || "").trim();
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize || "5", 10) || 5));
    const client = await pool.connect().catch((error) => {
      logger.error({ err: error }, "DB connect failed for listUserDevices");
      return null;
    });
    if (!client) {
      res.status(200).json({
        devices: [],
        pagination: { page, pageSize, total: 0 },
      });
      return;
    }
    try {
      const deviceResult = await client.query(
        `
        SELECT id, fingerprint, hardware_key_id, trusted, last_seen
        FROM trusted_devices
        WHERE user_id = $1
        ORDER BY last_seen DESC
        LIMIT $2 OFFSET $3
      `,
        [userId, pageSize, (page - 1) * pageSize]
      );
      const totalRow = await client.query(
        `SELECT COUNT(*)::int AS count FROM trusted_devices WHERE user_id=$1`,
        [userId]
      );
      res.status(200).json({
        devices: deviceResult.rows.map(mapDeviceRow),
        pagination: {
          page,
          pageSize,
          total: totalRow.rows[0]?.count || 0,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to list user devices");
      res.status(500).json({ error: "Unable to fetch devices." });
    } finally {
      client.release();
    }
  }

  async function getUserTimeline(req, res) {
    const userId = String(req.params.userId || "").trim();
    const limit = Math.min(120, Math.max(1, Number.parseInt(req.query.limit || "80", 10) || 80));
    const client = await pool.connect().catch((error) => {
      logger.error({ err: error }, "DB connect failed for getUserTimeline");
      return null;
    });
    if (!client) {
      res.status(200).json({ timeline: [] });
      return;
    }
    try {
      const rows = await client.query(
        `
        SELECT la.created_at, la.success, la.ip, la.risk_score,
               u.username, u.email
        FROM login_attempts la
        LEFT JOIN users u ON u.id = la.user_id
        WHERE la.user_id = $1
        ORDER BY la.created_at DESC
        LIMIT $2
      `,
        [userId, limit]
      );
      res.status(200).json({
        timeline: rows.rows.map((row) => ({
          action: "login",
          status: row.success ? "success" : "failed",
          category: "auth",
          timestamp: row.created_at,
          actor: row.username || row.email || "unknown",
          details: {
            ip: row.ip || "unknown",
            risk: row.risk_score ?? "n/a",
          },
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch user timeline");
      res.status(500).json({ error: "Unable to fetch timeline." });
    } finally {
      client.release();
    }
  }

  async function stubAction(req, res, message = "Action recorded (demo).") {
    const rangeDays = Number.parseInt(req.query?.rangeDays || "7", 10) || 7;
    const dashboard = await buildDashboardData({
      rangeDays,
      alertRulesState,
      governanceState,
      exportState,
    });
    res.status(200).json({ message, dashboard });
  }

  async function updateAlertRules(req, res) {
    alertRulesState.enabled = Boolean(req.body?.enabled ?? alertRulesState.enabled);
    alertRulesState.failedLogins15mThreshold =
      Number.parseInt(req.body?.failedLogins15mThreshold, 10) ||
      alertRulesState.failedLogins15mThreshold;
    alertRulesState.highRiskThreshold =
      Number.parseInt(req.body?.highRiskThreshold, 10) || alertRulesState.highRiskThreshold;
    alertRulesState.uniqueCountries24hThreshold =
      Number.parseInt(req.body?.uniqueCountries24hThreshold, 10) ||
      alertRulesState.uniqueCountries24hThreshold;
    await stubAction(req, res, "Alert rules updated.");
  }

  async function updateGovernance(req, res) {
    governanceState.requireApproval = Boolean(req.body?.requireApproval);
    await stubAction(req, res, "Governance policy updated.");
  }

  async function createApproval(req, res) {
    const id = `appr_${Date.now()}`;
    governanceState.approvals.unshift({
      id,
      status: "pending",
      actionType: req.body?.actionType || "unknown",
      target: req.body?.target || "unknown",
      summary: req.body?.summary || "Pending approval",
      createdAt: new Date().toISOString(),
    });
    governanceState.pendingApprovals = governanceState.approvals.filter(
      (item) => item.status === "pending"
    ).length;
    await stubAction(req, res, "Approval request queued.");
  }

  async function resolveApproval(req, res) {
    const id = String(req.params.id || "");
    const decision = String(req.body?.decision || "approve");
    governanceState.approvals = governanceState.approvals.map((item) =>
      item.id === id ? { ...item, status: decision } : item
    );
    governanceState.pendingApprovals = governanceState.approvals.filter(
      (item) => item.status === "pending"
    ).length;
    await stubAction(req, res, "Approval processed.");
  }

  async function updateExportSchedule(req, res) {
    const id = String(req.params.id || "");
    const existing = exportState.schedules.find((s) => s.id === id);
    const updated = {
      id,
      enabled:
        req.body?.enabled !== undefined ? Boolean(req.body.enabled) : existing?.enabled || false,
      frequency: req.body?.frequency || existing?.frequency || "daily",
      timeUtc: req.body?.timeUtc || existing?.timeUtc || "08:00",
      format: req.body?.format || existing?.format || "csv",
      scope: req.body?.scope || existing?.scope || "users_only",
      updatedAt: new Date().toISOString(),
    };
    exportState.schedules = [updated, ...exportState.schedules.filter((s) => s.id !== id)];
    await stubAction(req, res, "Export schedule updated.");
  }

  async function runExportSchedule(req, res) {
    const id = String(req.params.id || "");
    exportState.history.unshift({
      id: `run_${Date.now()}`,
      scheduleId: id,
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      format: "csv",
      scope: "users_only",
    });
    await stubAction(req, res, "Export run started.");
  }

  async function listExportHistory(req, res) {
    res.status(200).json({
      history: exportState.history.slice(0, 20),
    });
  }

  return {
    renderAdminLogin,
    loginAdmin,
    renderAdminDashboard,
    logoutAdmin,
    getDashboardSnapshot,
    listUsers,
    listUserDevices,
    getUserTimeline,
    updateAlertRules,
    updateGovernance,
    createApproval,
    resolveApproval,
    updateExportSchedule,
    runExportSchedule,
    listExportHistory,
    stubAction,
  };
}

function sanitizeUserSort(value) {
  const allowed = {
    username: "u.username",
    email: "u.email",
    createdAt: "u.created_at",
    lastLogin: "u.last_login",
    riskScore: "risk_score",
  };
  return allowed[value] || "u.created_at";
}

function sanitizeSortDir(value) {
  return String(value || "").toLowerCase() === "asc" ? "ASC" : "DESC";
}

function mapUserRow(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
    lastLogin: row.last_login,
    geo: row.last_login_geo?.country || "-",
    riskScore: Number(row.risk_score || 0),
    loginAnomalies: Number(row.login_anomalies || 0),
    active: Boolean(row.email_verified_at),
    activeSessions: Number(row.active_sessions || 0),
    trustedDevices: Number(row.trusted_devices || 0),
    stepUpRequired: false,
  };
}

function mapDeviceRow(row) {
  return {
    id: row.id,
    label: row.hardware_key_id || row.fingerprint?.slice(0, 10) || "Device",
    platform: "unknown",
    lastSeen: row.last_seen,
    ipAddress: "unknown",
    geo: "-",
    trusted: row.trusted === true,
  };
}

async function buildDashboardData(options = {}) {
  const {
    rangeDays = 7,
    alertRulesState = createDefaultAlertRulesState(),
    governanceState = createDefaultGovernanceState(),
    exportState = createDefaultExportState(),
  } = options;
  const days = Math.max(1, Number(rangeDays) || 7);
  let client = null;
  try {
    client = await pool.connect();
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE last_login > now() - interval '30 days') AS active_users,
        (SELECT COUNT(*)::int FROM login_attempts WHERE success=false AND created_at > now() - interval '24 hours') AS anomalies_24h,
        (SELECT COUNT(*)::int FROM sessions WHERE expires_at > now()) AS active_sessions,
        (SELECT COUNT(*)::int FROM otp_tokens) AS step_up_queue,
        (SELECT COUNT(*)::int FROM trusted_devices WHERE trusted=true) AS trusted_devices,
        (SELECT COUNT(*)::int FROM trusted_devices WHERE trusted=false) AS untrusted_devices,
        (SELECT COALESCE(AVG(risk_score), 0)::float FROM login_attempts WHERE risk_score IS NOT NULL) AS avg_risk,
        (SELECT COALESCE(COUNT(*)::int,0) FROM login_attempts WHERE created_at > now() - interval '10 minutes' AND success=false) AS failed_logins_10m,
        (SELECT COUNT(DISTINCT ip)::int FROM login_attempts) AS unique_ips_all
    `);
    const s = stats.rows[0] || {};

    const traffic = await client.query(
      `
      SELECT
        COUNT(*)::int AS visits,
        COUNT(*) FILTER (WHERE success=true)::int AS success,
        COUNT(*) FILTER (WHERE success=false)::int AS failed,
        COUNT(DISTINCT ip)::int AS unique_ips
      FROM login_attempts
      WHERE created_at > now() - $1 * interval '1 day'
    `,
      [days]
    );
    const t = traffic.rows[0] || { visits: 0, success: 0, failed: 0, unique_ips: 0 };

    const riskTrend = await client.query(
      `
      SELECT date_trunc('day', created_at) AS day, COALESCE(AVG(risk_score),0)::float AS avg_risk, COUNT(*)::int AS events
      FROM login_attempts
      WHERE created_at > now() - $1 * interval '1 day'
      GROUP BY 1
      ORDER BY 1 ASC
    `,
      [days]
    );

    const userGrowth = await client.query(`
      SELECT date_trunc('month', created_at) AS month, COUNT(*)::int AS new_users
      FROM users
      WHERE created_at > now() - interval '6 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const trafficTrend = await client.query(
      `
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*)::int AS visits,
             COUNT(*) FILTER (WHERE success=true)::int AS success
      FROM login_attempts
      WHERE created_at > now() - $1 * interval '1 day'
      GROUP BY 1
      ORDER BY 1 ASC
    `,
      [days]
    );

    const vaultStats = await client.query(`
      SELECT
        COUNT(*)::int AS items,
        COALESCE(SUM(octet_length(ciphertext)),0)::bigint AS bytes,
        COALESCE(SUM(attachment_bytes),0)::bigint AS attachment_bytes,
        COUNT(*) FILTER (WHERE COALESCE(last_accessed_at, updated_at, created_at) < now() - interval '90 days')::int AS stale_items
      FROM vault_items
    `);
    const vaultStorageTrend = await client.query(
      `
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*)::int AS items,
             COALESCE(SUM(octet_length(ciphertext)),0)::bigint AS bytes
      FROM vault_items
      WHERE created_at > now() - $1 * interval '1 day'
      GROUP BY 1
      ORDER BY 1 ASC
    `,
      [days]
    );

    const flaggedAccounts = await client.query(`
      SELECT la.user_id, COUNT(*)::int AS failures
      FROM login_attempts la
      WHERE la.success=false AND la.created_at > now() - interval '15 minutes'
      GROUP BY la.user_id
      HAVING COUNT(*) >= 3
      ORDER BY failures DESC
      LIMIT 10
    `);

    const flaggedUsers = await client.query(
      `
      SELECT u.id, u.username, u.email,
             COALESCE((SELECT MAX(risk_score) FROM login_attempts la WHERE la.user_id=u.id),0) AS risk_score
      FROM users u
      WHERE u.id = ANY($1::uuid[])
    `,
      [flaggedAccounts.rows.map((r) => r.user_id)]
    );

    const usersResult = await client.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.created_at,
        u.last_login,
        u.last_login_geo,
        u.email_verified_at,
        COALESCE((SELECT MAX(risk_score) FROM login_attempts la WHERE la.user_id = u.id), 0) AS risk_score,
        (SELECT COUNT(*) FROM login_attempts la WHERE la.user_id = u.id AND success=false AND created_at > now() - interval '24 hours') AS login_anomalies,
        (SELECT COUNT(*) FROM trusted_devices td WHERE td.user_id = u.id AND td.trusted = true) AS trusted_devices,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS active_sessions
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT 12
    `);

    const auditLogs = await client.query(`
      SELECT la.created_at, la.success, la.ip, la.risk_score, u.username, u.email
      FROM login_attempts la
      LEFT JOIN users u ON u.id = la.user_id
      ORDER BY la.created_at DESC
      LIMIT 20
    `);

    const threatGeo = await client.query(`
      SELECT COALESCE(last_login_geo->>'country','') AS country, COUNT(*)::int AS count
      FROM users
      WHERE last_login_geo IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 8
    `);

    return {
      adminProfile: { username: "admin", role: "super_admin" },
      metrics: {
        totalUsers: Number(s.total_users || 0),
        activeUsers: Number(s.active_users || 0),
        flaggedUsers: flaggedAccounts.rowCount || 0,
        trustedDevices: Number(s.trusted_devices || 0),
        untrustedDevices: Number(s.untrusted_devices || 0),
        averageRisk: Number.isFinite(Number(s.avg_risk)) ? Number(s.avg_risk) : 0,
        totalAnomalies: Number(s.anomalies_24h || 0),
        vaultItems: Number(vaultStats.rows[0]?.items || 0),
        vaultBytes: Number(vaultStats.rows[0]?.bytes || 0),
        vaultAttachmentBytes: Number(vaultStats.rows[0]?.attachment_bytes || 0),
        vaultStaleItems: Number(vaultStats.rows[0]?.stale_items || 0),
      },
      quotas: {
        maxUsers: maxUsers > 0 ? maxUsers : null,
        perUserQuotaBytes: perUserQuotaBytes > 0 ? perUserQuotaBytes : null,
        totalQuotaBytes:
          maxUsers > 0 && perUserQuotaBytes > 0 ? maxUsers * perUserQuotaBytes : null,
      },
      vaultStorageTrend: vaultStorageTrend.rows.map((row) => ({
        date: row.day,
        items: Number(row.items || 0),
        bytes: Number(row.bytes || 0),
      })),
      riskTrend: riskTrend.rows.map((row) => ({
        date: row.day,
        average: Number(row.avg_risk || 0),
        events: Number(row.events || 0),
      })),
      userGrowthTrend: userGrowth.rows.map((row) => ({
        month: row.month,
        newUsers: Number(row.new_users || 0),
      })),
      trafficTrend: trafficTrend.rows.map((row) => ({
        date: row.day,
        visits: Number(row.visits || 0),
        success: Number(row.success || 0),
      })),
      traffic: {
        totalVisits: Number(t.visits || 0),
        successfulLogins: Number(t.success || 0),
        failedLogins: Number(t.failed || 0),
        successRate: t.visits ? Math.round((Number(t.success || 0) / Number(t.visits)) * 100) : 0,
        uniqueIps: Number(t.unique_ips || 0),
        uniqueCountries: 0,
      },
      realtime: {
        activeSessions: Number(s.active_sessions || 0),
        failedLogins10m: Number(s.failed_logins_10m || 0),
        stepUpQueue: Number(s.step_up_queue || 0),
      },
      health: {
        averageApiLatencyMs: 120,
        failedApiRequests: 0,
        recentErrors: 0,
        queueBacklog: 0,
      },
      threatGeo: threatGeo.rows
        .filter((row) => row.country)
        .map((row) => ({ country: row.country, count: Number(row.count || 0) })),
      alertRules: { ...alertRulesState },
      triggeredAlerts: [],
      governance: { ...governanceState },
      exportCenter: { ...exportState },
      anomalies: [],
      flaggedAccounts: flaggedUsers.rows.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        risk: Number(u.risk_score || 0),
        reason: "Repeated failed logins",
      })),
      users: usersResult.rows.map(mapUserRow),
      auditLogs: auditLogs.rows.map((row) => ({
        action: "login",
        status: row.success ? "success" : "failed",
        category: "auth",
        timestamp: row.created_at,
        actor: row.username || row.email || "unknown",
        details: {
          ip: row.ip || "unknown",
          risk: row.risk_score ?? "n/a",
        },
      })),
    };
  } finally {
    if (client) client.release();
  }
}

function buildFallbackDashboard() {
  return {
    adminProfile: { username: "admin", role: "super_admin" },
    metrics: {
      totalUsers: 0,
      activeUsers: 0,
      flaggedUsers: 0,
      trustedDevices: 0,
      untrustedDevices: 0,
      averageRisk: 0,
      totalAnomalies: 0,
      vaultItems: 0,
      vaultBytes: 0,
      vaultAttachmentBytes: 0,
      vaultStaleItems: 0,
    },
    quotas: {
      maxUsers: null,
      perUserQuotaBytes: null,
      totalQuotaBytes: null,
    },
    vaultStorageTrend: [],
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
    alertRules: createDefaultAlertRulesState(),
    triggeredAlerts: [],
    governance: createDefaultGovernanceState(),
    exportCenter: createDefaultExportState(),
    anomalies: [],
    flaggedAccounts: [],
    users: [],
    auditLogs: [],
  };
}

function createDefaultAlertRulesState() {
  return {
    enabled: true,
    failedLogins15mThreshold: 4,
    highRiskThreshold: 75,
    uniqueCountries24hThreshold: 3,
  };
}

function createDefaultGovernanceState() {
  return {
    requireApproval: false,
    pendingApprovals: 0,
    approvals: [],
  };
}

function createDefaultExportState() {
  return {
    history: [],
    schedules: [
      {
        id: "schedule_daily_users",
        enabled: false,
        frequency: "daily",
        timeUtc: "08:00",
        format: "csv",
        scope: "users_only",
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

module.exports = {
  createAdminController,
};
