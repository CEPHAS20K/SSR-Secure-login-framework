import { createAdminApiLayer } from "./api.js";
import {
  createDashboardState,
  normalizeDashboardDataModel,
  parseInitialDashboardData,
} from "./state.js";
import { createAdminUiHelpers } from "./ui.js";

let chartsModulePromise = null;
let chartsModuleCache = null;
let exportsModulePromise = null;
let exportsModuleCache = null;

function ensureChartsModule() {
  if (chartsModuleCache) return Promise.resolve(chartsModuleCache);
  if (!chartsModulePromise) {
    chartsModulePromise = import("./charts.js").then((moduleValue) => {
      chartsModuleCache = moduleValue;
      return moduleValue;
    });
  }
  return chartsModulePromise;
}

function ensureExportsModule() {
  if (exportsModuleCache) return Promise.resolve(exportsModuleCache);
  if (!exportsModulePromise) {
    exportsModulePromise = import("./exports.js").then((moduleValue) => {
      exportsModuleCache = moduleValue;
      return moduleValue;
    });
  }
  return exportsModulePromise;
}

function warmDashboardModules() {
  const run = () => {
    ensureChartsModule().catch(() => {});
    ensureExportsModule().catch(() => {});
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1500 });
    return;
  }
  window.setTimeout(run, 300);
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("adminDashboard");
  if (!root) return;

  const initialDataNode = document.getElementById("adminInitialData");
  const usersTableBody = document.getElementById("usersTableBody");
  const usersTableMeta = document.getElementById("usersTableMeta");
  const usersTablePrevPage = document.getElementById("usersTablePrevPage");
  const usersTableNextPage = document.getElementById("usersTableNextPage");
  const usersTablePageIndicator = document.getElementById("usersTablePageIndicator");
  const usersTableSearch = document.getElementById("usersTableSearch");
  const usersTableSelectAll = document.getElementById("usersTableSelectAll");
  const usersSelectionCount = document.getElementById("usersSelectionCount");
  const bulkActivateBtn = document.getElementById("bulkActivateBtn");
  const bulkDeactivateBtn = document.getElementById("bulkDeactivateBtn");
  const bulkForceResetBtn = document.getElementById("bulkForceResetBtn");
  const usersSortButtons = Array.from(document.querySelectorAll(".admin-users-sort"));
  const devicesTableBody = document.getElementById("devicesTableBody");
  const devicesTableMeta = document.getElementById("devicesTableMeta");
  const devicesTablePrevPage = document.getElementById("devicesTablePrevPage");
  const devicesTableNextPage = document.getElementById("devicesTableNextPage");
  const devicesTablePageIndicator = document.getElementById("devicesTablePageIndicator");
  const riskTableBody = document.getElementById("riskTableBody");
  const auditLogsBody = document.getElementById("auditLogsBody");
  const flaggedAccountsList = document.getElementById("flaggedAccountsList");
  const riskTrendChart = document.getElementById("riskTrendChart");
  const riskTrendHint = document.getElementById("riskTrendHint");
  const userGrowthChart = document.getElementById("userGrowthChart");
  const userGrowthHint = document.getElementById("userGrowthHint");
  const trafficTrendChart = document.getElementById("trafficTrendChart");
  const trafficTotalVisits = document.getElementById("trafficTotalVisits");
  const trafficSuccessRate = document.getElementById("trafficSuccessRate");
  const trafficUniqueIps = document.getElementById("trafficUniqueIps");
  const trafficUniqueCountries = document.getElementById("trafficUniqueCountries");
  const selectedUserLabel = document.getElementById("selectedUserLabel");
  const adminFlash = document.getElementById("adminFlash");
  const adminLoading = document.getElementById("adminLoading");
  const refreshBtn = document.getElementById("adminRefreshBtn");
  const API_CACHE_TTL_MS = 12000;
  const API_CACHE_MAX_ENTRIES = 120;

  const metricTotalUsers = document.getElementById("metricTotalUsers");
  const metricActiveUsers = document.getElementById("metricActiveUsers");
  const metricFlaggedUsers = document.getElementById("metricFlaggedUsers");
  const metricAvgRisk = document.getElementById("metricAvgRisk");
  const metricActiveSessions = document.getElementById("metricActiveSessions");
  const metricFailedLogins10m = document.getElementById("metricFailedLogins10m");
  const metricStepUpQueue = document.getElementById("metricStepUpQueue");
  const metricApiLatency = document.getElementById("metricApiLatency");
  const metricApiFailed = document.getElementById("metricApiFailed");
  const metricQueueBacklog = document.getElementById("metricQueueBacklog");
  const globalRangeSelect = document.getElementById("globalRangeSelect");

  const detailEmail = document.getElementById("detailEmail");
  const detailCreated = document.getElementById("detailCreated");
  const detailLastLogin = document.getElementById("detailLastLogin");
  const detailGeo = document.getElementById("detailGeo");
  const detailRisk = document.getElementById("detailRisk");

  const forceResetBtn = document.getElementById("forceResetBtn");
  const triggerOtpBtn = document.getElementById("triggerOtpBtn");
  const triggerWebauthnBtn = document.getElementById("triggerWebauthnBtn");
  const viewTimelineBtn = document.getElementById("viewTimelineBtn");
  const incidentModeBtn = document.getElementById("incidentModeBtn");

  const modal = document.getElementById("adminActionModal");
  const modalTitle = document.getElementById("adminModalTitle");
  const modalMessage = document.getElementById("adminModalMessage");
  const modalCancel = document.getElementById("adminModalCancel");
  const modalConfirm = document.getElementById("adminModalConfirm");
  const openUserLookupBtn = document.getElementById("openUserLookupBtn");
  const userLookupModal = document.getElementById("adminUserLookupModal");
  const userLookupInput = document.getElementById("userLookupInput");
  const userLookupResults = document.getElementById("userLookupResults");
  const userLookupMeta = document.getElementById("userLookupMeta");
  const userLookupPrevPage = document.getElementById("userLookupPrevPage");
  const userLookupNextPage = document.getElementById("userLookupNextPage");
  const userLookupPageIndicator = document.getElementById("userLookupPageIndicator");
  const userLookupDetails = document.getElementById("userLookupDetails");
  const userLookupCloseBtn = document.getElementById("userLookupCloseBtn");
  const userLookupCancelBtn = document.getElementById("userLookupCancelBtn");
  const userLookupExportPdfBtn = document.getElementById("userLookupExportPdfBtn");
  const userLookupExportCsvBtn = document.getElementById("userLookupExportCsvBtn");
  const usersExportModal = document.getElementById("adminUsersExportModal");
  const usersExportTitle = document.getElementById("usersExportTitle");
  const usersExportSubtitle = document.getElementById("usersExportSubtitle");
  const usersExportScope = document.getElementById("usersExportScope");
  const usersExportScopeDetails = document.getElementById("usersExportScopeDetails");
  const usersExportCancelBtn = document.getElementById("usersExportCancelBtn");
  const usersExportConfirmBtn = document.getElementById("usersExportConfirmBtn");
  const threatGeoList = document.getElementById("threatGeoList");
  const ruleFailedLoginsThreshold = document.getElementById("ruleFailedLoginsThreshold");
  const ruleHighRiskThreshold = document.getElementById("ruleHighRiskThreshold");
  const ruleCountryThreshold = document.getElementById("ruleCountryThreshold");
  const ruleEnabled = document.getElementById("ruleEnabled");
  const saveAlertRulesBtn = document.getElementById("saveAlertRulesBtn");
  const triggeredAlertsList = document.getElementById("triggeredAlertsList");
  const requireApprovalToggle = document.getElementById("requireApprovalToggle");
  const approvalQueueList = document.getElementById("approvalQueueList");
  const exportPresetSelect = document.getElementById("exportPresetSelect");
  const runPresetPdfBtn = document.getElementById("runPresetPdfBtn");
  const runPresetCsvBtn = document.getElementById("runPresetCsvBtn");
  const exportHistoryBody = document.getElementById("exportHistoryBody");
  const exportHistoryCount = document.getElementById("exportHistoryCount");
  const scheduledExportSummary = document.getElementById("scheduledExportSummary");
  const scheduledExportEnabled = document.getElementById("scheduledExportEnabled");
  const scheduledExportFrequency = document.getElementById("scheduledExportFrequency");
  const scheduledExportTime = document.getElementById("scheduledExportTime");
  const scheduledExportFormat = document.getElementById("scheduledExportFormat");
  const scheduledExportScope = document.getElementById("scheduledExportScope");
  const scheduledExportSaveBtn = document.getElementById("scheduledExportSaveBtn");
  const scheduledExportRunNowBtn = document.getElementById("scheduledExportRunNowBtn");
  const timelineModal = document.getElementById("adminTimelineModal");
  const timelineCloseBtn = document.getElementById("timelineCloseBtn");
  const timelineUserLabel = document.getElementById("timelineUserLabel");
  const timelineList = document.getElementById("timelineList");
  const timelineLoading = document.getElementById("timelineLoading");

  const logFilters = Array.from(document.querySelectorAll(".admin-log-filter"));

  const state = createDashboardState(parseInitialDashboardData(initialDataNode));
  const uiHelpers = createAdminUiHelpers({
    root,
    modal,
    modalTitle,
    modalMessage,
    adminFlash,
    adminLoading,
    state,
    setText,
  });
  const adminApi = createAdminApiLayer({
    state,
    defaultCacheTtlMs: API_CACHE_TTL_MS,
    maxCacheEntries: API_CACHE_MAX_ENTRIES,
    onLoading: uiHelpers.setLoading,
    onUnauthorized: () => {
      window.location.href = "/admin/login";
    },
  });

  state.selectedUserId = state.data.users[0]?.id || null;
  state.requireApproval = Boolean(state.data.governance?.requireApproval);
  hydrateUiPreferences();

  bindEvents();
  refreshUsersTableFromApi()
    .catch(() => {})
    .finally(() => {
      renderAll();
      refreshDevicesTableFromApi();
    });
  animateIn();
  warmDashboardModules();

  if (!state.data.users.length && !state.usersRows.length) {
    refreshDashboard();
  }

  function bindEvents() {
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        refreshDashboard();
      });
    }

    if (globalRangeSelect) {
      globalRangeSelect.addEventListener("change", () => {
        const nextRange = Number.parseInt(globalRangeSelect.value, 10);
        state.rangeDays = Number.isFinite(nextRange) ? nextRange : 7;
        refreshDashboard();
      });
    }

    if (openUserLookupBtn) {
      openUserLookupBtn.addEventListener("click", openUserLookupModal);
    }

    if (usersTablePrevPage) {
      usersTablePrevPage.addEventListener("click", () => {
        state.usersPage = Math.max(state.usersPage - 1, 1);
        refreshUsersTableFromApi();
      });
    }

    if (usersTableNextPage) {
      usersTableNextPage.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil((state.usersTotal || 0) / state.usersPageSize));
        state.usersPage = Math.min(state.usersPage + 1, totalPages);
        refreshUsersTableFromApi();
      });
    }

    if (usersTableSearch) {
      usersTableSearch.addEventListener(
        "input",
        debounce(() => {
          state.usersQuery = usersTableSearch.value.trim();
          state.usersPage = 1;
          refreshUsersTableFromApi();
        }, 240)
      );
    }

    for (const sortButton of usersSortButtons) {
      sortButton.addEventListener("click", () => {
        const sortBy = sortButton.dataset.sortBy || "lastLogin";
        if (state.usersSortBy === sortBy) {
          state.usersSortDir = state.usersSortDir === "asc" ? "desc" : "asc";
        } else {
          state.usersSortBy = sortBy;
          state.usersSortDir =
            sortBy === "username" || sortBy === "email" || sortBy === "geo" ? "asc" : "desc";
        }
        state.usersPage = 1;
        persistUiPreferences();
        refreshUsersTableFromApi();
      });
    }

    if (usersTableSelectAll) {
      usersTableSelectAll.addEventListener("change", () => {
        const nextChecked = Boolean(usersTableSelectAll.checked);
        for (const user of state.usersRows || []) {
          if (nextChecked) {
            state.selectedUserIds.add(user.id);
          } else {
            state.selectedUserIds.delete(user.id);
          }
        }
        renderUsersSelectionState();
        renderUsersTable();
      });
    }

    if (bulkActivateBtn) {
      bulkActivateBtn.addEventListener("click", () => {
        runBulkUserAction("activate");
      });
    }

    if (bulkDeactivateBtn) {
      bulkDeactivateBtn.addEventListener("click", () => {
        runBulkUserAction("deactivate");
      });
    }

    if (bulkForceResetBtn) {
      bulkForceResetBtn.addEventListener("click", () => {
        runBulkUserAction("force_reset");
      });
    }

    if (devicesTablePrevPage) {
      devicesTablePrevPage.addEventListener("click", () => {
        state.devicesPage = Math.max(state.devicesPage - 1, 1);
        refreshDevicesTableFromApi();
      });
    }

    if (devicesTableNextPage) {
      devicesTableNextPage.addEventListener("click", () => {
        const totalDevices = state.devicesTotal || 0;
        const totalPages = Math.max(1, Math.ceil(totalDevices / state.devicesPageSize));
        state.devicesPage = Math.min(state.devicesPage + 1, totalPages);
        refreshDevicesTableFromApi();
      });
    }

    if (userLookupInput) {
      userLookupInput.addEventListener("input", () => {
        state.lookupQuery = userLookupInput.value.trim().toLowerCase();
        state.lookupPage = 1;
        renderUserLookup();
      });
    }

    if (userLookupResults) {
      userLookupResults.addEventListener("click", (event) => {
        const selectBtn = event.target.closest("button[data-user-id]");
        if (!selectBtn) return;
        state.lookupSelectedUserId = selectBtn.dataset.userId || null;
        renderUserLookup();
      });
    }

    if (userLookupPrevPage) {
      userLookupPrevPage.addEventListener("click", () => {
        state.lookupPage = Math.max(state.lookupPage - 1, 1);
        renderUserLookup();
      });
    }

    if (userLookupNextPage) {
      userLookupNextPage.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(getLookupUsers().length / state.lookupPageSize));
        state.lookupPage = Math.min(state.lookupPage + 1, totalPages);
        renderUserLookup();
      });
    }

    if (userLookupExportPdfBtn) {
      userLookupExportPdfBtn.addEventListener("click", () => {
        openLookupExport("pdf");
      });
    }

    if (userLookupExportCsvBtn) {
      userLookupExportCsvBtn.addEventListener("click", () => {
        openLookupExport("csv");
      });
    }

    if (userLookupCloseBtn) {
      userLookupCloseBtn.addEventListener("click", closeUserLookupModal);
    }

    if (userLookupCancelBtn) {
      userLookupCancelBtn.addEventListener("click", closeUserLookupModal);
    }

    if (userLookupModal) {
      userLookupModal.addEventListener("click", (event) => {
        if (event.target === userLookupModal) {
          closeUserLookupModal();
        }
      });
    }

    if (usersExportScope) {
      usersExportScope.addEventListener("change", () => {
        state.usersExportScope = usersExportScope.value || "users_only";
        renderUsersExportScopeDetails();
      });
    }

    if (usersExportCancelBtn) {
      usersExportCancelBtn.addEventListener("click", closeUsersExportModal);
    }

    if (usersExportConfirmBtn) {
      usersExportConfirmBtn.addEventListener("click", runPendingUsersExport);
    }

    if (usersExportModal) {
      usersExportModal.addEventListener("click", (event) => {
        if (event.target === usersExportModal) {
          closeUsersExportModal();
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (usersExportModal && !usersExportModal.classList.contains("hidden")) {
        closeUsersExportModal();
        return;
      }

      if (userLookupModal && !userLookupModal.classList.contains("hidden")) {
        closeUserLookupModal();
        return;
      }

      if (timelineModal && !timelineModal.classList.contains("hidden")) {
        closeTimelineModal();
      }
    });

    if (usersTableBody) {
      usersTableBody.addEventListener("click", (event) => {
        const checkbox = event.target.closest("input[data-user-select-id]");
        if (checkbox) {
          const userId = checkbox.dataset.userSelectId;
          if (!userId) return;
          if (checkbox.checked) {
            state.selectedUserIds.add(userId);
          } else {
            state.selectedUserIds.delete(userId);
          }
          renderUsersSelectionState();
          return;
        }

        const actionButton = event.target.closest("button[data-action]");
        const row = event.target.closest("tr[data-user-id]");

        if (actionButton) {
          handleUserTableAction(actionButton);
          return;
        }

        if (row) {
          state.selectedUserId = row.dataset.userId;
          state.devicesPage = 1;
          refreshDevicesTableFromApi();
          renderUsersTable();
        }
      });
    }

    if (devicesTableBody) {
      devicesTableBody.addEventListener("click", (event) => {
        const actionButton = event.target.closest("button[data-action='toggle-device-trust']");
        if (!actionButton) return;

        const userId = actionButton.dataset.userId;
        const deviceId = actionButton.dataset.deviceId;
        const nextTrusted = actionButton.dataset.nextTrusted === "true";

        if (!userId || !deviceId) return;

        openModal({
          title: nextTrusted ? "Mark device trusted" : "Mark device untrusted",
          message: nextTrusted
            ? "Trust this device and lower future login friction?"
            : "Mark this device untrusted and require stricter checks?",
          onConfirm: async () => {
            await runManagedAction({
              actionType: "toggle_device_trust",
              target: `${userId}:${deviceId}`,
              summary: nextTrusted ? "Request device trust" : "Request device untrust",
              payload: { userId, deviceId, trusted: nextTrusted },
              execute: () =>
                apiRequest(
                  `/admin/api/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(deviceId)}/trust`,
                  {
                    method: "PATCH",
                    body: { trusted: nextTrusted },
                  }
                ),
              onSuccess: (response) => {
                applyDashboardData(response.dashboard);
                state.selectedUserId = userId;
              },
              successMessage: "Device trust updated.",
            });
          },
        });
      });
    }

    if (forceResetBtn) {
      forceResetBtn.addEventListener("click", () => {
        const user = getSelectedUser();
        if (!user) return;

        openModal({
          title: "Force password reset",
          message: `Require ${user.username} to reset password on next login?`,
          onConfirm: async () => {
            await runManagedAction({
              actionType: "force_password_reset",
              target: user.username,
              summary: `Force password reset for ${user.username}`,
              payload: { userId: user.id },
              execute: () =>
                apiRequest(
                  `/admin/api/users/${encodeURIComponent(user.id)}/actions/force-password-reset`,
                  {
                    method: "POST",
                  }
                ),
              onSuccess: (response) => {
                applyDashboardData(response.dashboard);
                state.selectedUserId = user.id;
              },
              successMessage: "Password reset enforced.",
            });
          },
        });
      });
    }

    if (triggerOtpBtn) {
      triggerOtpBtn.addEventListener("click", () => {
        triggerReauth("otp");
      });
    }

    if (triggerWebauthnBtn) {
      triggerWebauthnBtn.addEventListener("click", () => {
        triggerReauth("webauthn");
      });
    }

    if (viewTimelineBtn) {
      viewTimelineBtn.addEventListener("click", () => {
        openUserTimeline();
      });
    }

    if (incidentModeBtn) {
      incidentModeBtn.addEventListener("click", () => {
        triggerIncidentMode();
      });
    }

    for (const filter of logFilters) {
      filter.addEventListener("click", () => {
        state.selectedLogCategory = filter.dataset.category || "all";
        renderLogFilters();
        renderAuditLogs();
      });
    }

    if (saveAlertRulesBtn) {
      saveAlertRulesBtn.addEventListener("click", async () => {
        try {
          const response = await apiRequest("/admin/api/alert-rules", {
            method: "PATCH",
            body: {
              enabled: Boolean(ruleEnabled?.checked),
              failedLogins15mThreshold: Number(ruleFailedLoginsThreshold?.value || 0),
              highRiskThreshold: Number(ruleHighRiskThreshold?.value || 0),
              uniqueCountries24hThreshold: Number(ruleCountryThreshold?.value || 0),
            },
          });
          applyDashboardData(response.dashboard);
          showFlash(response.message || "Alert rules updated.", "success");
        } catch (error) {
          showFlash(error.message || "Failed to update alert rules.", "error");
        }
      });
    }

    if (requireApprovalToggle) {
      requireApprovalToggle.addEventListener("change", async () => {
        try {
          const response = await apiRequest("/admin/api/governance", {
            method: "PATCH",
            body: { requireApproval: Boolean(requireApprovalToggle.checked) },
          });
          applyDashboardData(response.dashboard);
          showFlash(response.message || "Approval policy updated.", "success");
        } catch (error) {
          requireApprovalToggle.checked = state.requireApproval;
          showFlash(error.message || "Failed to update approval policy.", "error");
        }
      });
    }

    if (approvalQueueList) {
      approvalQueueList.addEventListener("click", async (event) => {
        const actionBtn = event.target.closest("button[data-approval-id][data-decision]");
        if (!actionBtn) return;

        try {
          const response = await apiRequest(
            `/admin/api/approvals/${encodeURIComponent(actionBtn.dataset.approvalId)}/resolve`,
            {
              method: "POST",
              body: { decision: actionBtn.dataset.decision },
            }
          );
          applyDashboardData(response.dashboard);
          showFlash(response.message || "Approval processed.", "success");
        } catch (error) {
          showFlash(error.message || "Failed to process approval.", "error");
        }
      });
    }

    if (runPresetPdfBtn) {
      runPresetPdfBtn.addEventListener("click", () => {
        runPresetExport("pdf");
      });
    }

    if (runPresetCsvBtn) {
      runPresetCsvBtn.addEventListener("click", () => {
        runPresetExport("csv");
      });
    }

    if (exportPresetSelect) {
      exportPresetSelect.addEventListener("change", () => {
        persistUiPreferences();
      });
    }

    if (scheduledExportSaveBtn) {
      scheduledExportSaveBtn.addEventListener("click", async () => {
        await saveScheduledExportConfig();
      });
    }

    if (scheduledExportRunNowBtn) {
      scheduledExportRunNowBtn.addEventListener("click", async () => {
        try {
          const response = await apiRequest(
            `/admin/api/export-schedules/${encodeURIComponent(state.pendingScheduleId)}/run`,
            {
              method: "POST",
            }
          );
          applyDashboardData(response.dashboard);
          showFlash(response.message || "Scheduled export executed.", "success");
        } catch (error) {
          showFlash(error.message || "Failed to run scheduled export.", "error");
        }
      });
    }

    if (modalCancel) {
      modalCancel.addEventListener("click", closeModal);
    }

    if (modalConfirm) {
      modalConfirm.addEventListener("click", async () => {
        if (!state.pendingAction) return;

        const execute = state.pendingAction;
        try {
          closeModal();
          await execute();
        } catch (error) {
          showFlash(error.message || "Action failed.", "error");
        }
      });
    }

    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeModal();
        }
      });
    }

    if (timelineCloseBtn) {
      timelineCloseBtn.addEventListener("click", closeTimelineModal);
    }

    if (timelineModal) {
      timelineModal.addEventListener("click", (event) => {
        if (event.target === timelineModal) {
          closeTimelineModal();
        }
      });
    }
  }

  function handleUserTableAction(button) {
    const action = button.dataset.action;
    const userId = button.dataset.userId;
    if (!action || !userId) return;

    if (action === "select-user") {
      state.selectedUserId = userId;
      state.devicesPage = 1;
      renderUsersTable();
      refreshDevicesTableFromApi();
      return;
    }

    if (action === "toggle-active") {
      const nextActive = button.dataset.nextActive === "true";
      openModal({
        title: nextActive ? "Activate account" : "Deactivate account",
        message: nextActive
          ? "Activate this account and restore login access?"
          : "Deactivate this account and block login access?",
        onConfirm: async () => {
          await runManagedAction({
            actionType: "toggle_user_active",
            target: userId,
            summary: nextActive ? "Activate user account" : "Deactivate user account",
            payload: { userId, active: nextActive },
            execute: () =>
              apiRequest(`/admin/api/users/${encodeURIComponent(userId)}/status`, {
                method: "PATCH",
                body: { active: nextActive },
              }),
            onSuccess: (response) => {
              applyDashboardData(response.dashboard);
              state.selectedUserId = userId;
            },
            successMessage: "Account status updated.",
          });
        },
      });
    }
  }

  function triggerReauth(method) {
    const user = getSelectedUser();
    if (!user) return;

    const label = method === "otp" ? "OTP" : "WebAuthn";
    openModal({
      title: `Trigger ${label} re-authentication`,
      message: `Send a ${label} step-up challenge to ${user.username}?`,
      onConfirm: async () => {
        await runManagedAction({
          actionType: "trigger_reauth",
          target: user.username,
          summary: `Trigger ${label} step-up challenge`,
          payload: { userId: user.id, method },
          execute: () =>
            apiRequest(`/admin/api/users/${encodeURIComponent(user.id)}/actions/trigger-reauth`, {
              method: "POST",
              body: { method },
            }),
          onSuccess: (response) => {
            applyDashboardData(response.dashboard);
            state.selectedUserId = user.id;
          },
          successMessage: "Re-authentication challenge sent.",
        });
      },
    });
  }

  function renderAll() {
    if (globalRangeSelect) {
      globalRangeSelect.value = String(state.rangeDays);
    }
    renderMetrics();
    renderRealtimeMetrics();
    renderFlaggedAccounts();
    renderUsersTable();
    renderUserDetails();
    renderRiskTable();
    renderRiskChart();
    renderUserGrowthChart();
    renderTrafficOverview();
    renderThreatGeo();
    renderAlertRules();
    renderTriggeredAlerts();
    renderApprovalQueue();
    renderExportCenter();
    renderLogFilters();
    renderAuditLogs();
  }

  function openUserLookupModal() {
    if (!userLookupModal) return;

    state.lookupQuery = "";
    state.lookupSelectedUserId = state.selectedUserId || state.data.users[0]?.id || null;
    const initialLookupUsers = getLookupUsers();
    const selectedIndex = initialLookupUsers.findIndex(
      (user) => user.id === state.lookupSelectedUserId
    );
    state.lookupPage =
      selectedIndex >= 0 ? Math.floor(selectedIndex / state.lookupPageSize) + 1 : 1;
    if (userLookupInput) {
      userLookupInput.value = "";
    }
    renderUserLookup();

    userLookupModal.classList.remove("hidden");
    userLookupModal.classList.add("flex");

    if (window.gsap) {
      gsap.fromTo(
        userLookupModal.querySelector("div"),
        { y: 18, autoAlpha: 0, scale: 0.98 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.22, ease: "power2.out" }
      );
    }
  }

  function closeUserLookupModal() {
    if (!userLookupModal) return;
    userLookupModal.classList.add("hidden");
    userLookupModal.classList.remove("flex");
  }

  function renderUserLookup() {
    renderUserLookupResults();
    renderUserLookupDetails();
  }

  function renderUserLookupResults() {
    if (!userLookupResults) return;

    const users = getLookupUsers();
    const totalUsers = users.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / state.lookupPageSize));
    state.lookupPage = Math.min(Math.max(state.lookupPage, 1), totalPages);

    if (!users.length) {
      state.lookupSelectedUserId = null;
      if (userLookupMeta) {
        setText(userLookupMeta, "Showing 0 users");
      }
      if (userLookupPageIndicator) {
        setText(userLookupPageIndicator, "Page 0/0");
      }
      setLookupPaginationButtonsState({ prevDisabled: true, nextDisabled: true });
      userLookupResults.innerHTML =
        '<p class="rounded-md border border-white/45 bg-white/65 px-3 py-2 text-xs font-semibold text-rose-800">No users found for this search.</p>';
      return;
    }

    const startIndex = (state.lookupPage - 1) * state.lookupPageSize;
    const endIndex = Math.min(startIndex + state.lookupPageSize, totalUsers);
    const pageUsers = users.slice(startIndex, endIndex);

    if (!pageUsers.find((user) => user.id === state.lookupSelectedUserId)) {
      state.lookupSelectedUserId = pageUsers[0]?.id || null;
    }

    if (userLookupMeta) {
      setText(userLookupMeta, `Showing ${startIndex + 1}-${endIndex} of ${totalUsers} users`);
    }
    if (userLookupPageIndicator) {
      setText(userLookupPageIndicator, `Page ${state.lookupPage}/${totalPages}`);
    }
    setLookupPaginationButtonsState({
      prevDisabled: state.lookupPage <= 1,
      nextDisabled: state.lookupPage >= totalPages,
    });

    userLookupResults.innerHTML = pageUsers
      .map((user) => {
        const selected = user.id === state.lookupSelectedUserId;
        return (
          `<button type="button" data-user-id="${user.id}" class="w-full rounded-md border px-2.5 py-2 text-left transition ${selected ? "border-rose-300 bg-rose-100/65" : "border-white/45 bg-white/70 hover:bg-white"}">` +
          `<p class="text-sm font-black text-rose-900">${escapeHtml(user.username)}</p>` +
          `<p class="text-xs font-semibold text-rose-700">${escapeHtml(user.email)}</p>` +
          `</button>`
        );
      })
      .join("");
  }

  function renderUserLookupDetails() {
    if (!userLookupDetails) return;

    const user = getLookupSelectedUser();
    if (!user) {
      userLookupDetails.innerHTML =
        '<p class="rounded-md border border-white/50 bg-white/70 px-3 py-2 text-xs font-semibold text-rose-800">Select a user to view details.</p>';
      setLookupExportButtonsDisabled(true);
      return;
    }

    const devices = Array.isArray(user.devices) ? user.devices : [];
    const trustedCount = devices.filter((device) => device.trusted).length;
    const tags = getAnomalyTags(user);

    userLookupDetails.innerHTML =
      `<div class="space-y-2">` +
      `<div class="rounded-md border border-white/50 bg-white/70 p-2">` +
      `<p class="text-base font-black text-rose-900">${escapeHtml(user.username)}</p>` +
      `<p class="text-xs font-semibold text-rose-700">${escapeHtml(user.email)}</p>` +
      `</div>` +
      `<dl class="grid gap-1 text-xs font-semibold text-rose-900">` +
      `<div><dt class="inline text-rose-700">Status:</dt> <dd class="inline ml-1">${user.active ? "Active" : "Inactive"}</dd></div>` +
      `<div><dt class="inline text-rose-700">Risk:</dt> <dd class="inline ml-1">${user.riskScore} (${user.loginAnomalies} anomalies)</dd></div>` +
      `<div><dt class="inline text-rose-700">Step-Up:</dt> <dd class="inline ml-1">${user.stepUpRequired ? "Required" : "No"}</dd></div>` +
      `<div><dt class="inline text-rose-700">Geo:</dt> <dd class="inline ml-1">${escapeHtml(user.geo || "-")}</dd></div>` +
      `<div><dt class="inline text-rose-700">Created:</dt> <dd class="inline ml-1">${formatDate(user.createdAt)}</dd></div>` +
      `<div><dt class="inline text-rose-700">Last Login:</dt> <dd class="inline ml-1">${formatDate(user.lastLogin)}</dd></div>` +
      `<div><dt class="inline text-rose-700">Trusted Devices:</dt> <dd class="inline ml-1">${trustedCount}/${devices.length}</dd></div>` +
      `<div><dt class="inline text-rose-700">Anomaly Tags:</dt> <dd class="inline ml-1">${escapeHtml(tags.length ? tags.join(", ") : "None")}</dd></div>` +
      `</dl>` +
      `</div>`;

    setLookupExportButtonsDisabled(false);
  }

  function setLookupExportButtonsDisabled(disabled) {
    [userLookupExportPdfBtn, userLookupExportCsvBtn].forEach((button) => {
      if (!button) return;
      button.disabled = disabled;
      button.classList.toggle("opacity-50", disabled);
      button.classList.toggle("cursor-not-allowed", disabled);
    });
  }

  function renderMetrics() {
    const metrics = state.data.metrics || {};
    const health = state.data.health || {};
    setText(metricTotalUsers, metrics.totalUsers ?? 0);
    setText(metricActiveUsers, metrics.activeUsers ?? 0);
    setText(metricFlaggedUsers, metrics.flaggedUsers ?? 0);
    setText(metricAvgRisk, metrics.averageRisk ?? 0);
    setText(metricApiLatency, `${health.averageApiLatencyMs ?? 0} ms`);
    setText(metricApiFailed, health.failedApiRequests ?? 0);
    setText(metricQueueBacklog, health.queueBacklog ?? 0);
  }

  function renderRealtimeMetrics() {
    const realtime = state.data.realtime || {};
    setText(metricActiveSessions, realtime.activeSessions ?? 0);
    setText(metricFailedLogins10m, realtime.failedLogins10m ?? 0);
    setText(metricStepUpQueue, realtime.stepUpQueue ?? 0);
  }

  function renderFlaggedAccounts() {
    if (!flaggedAccountsList) return;

    const flagged = state.data.flaggedAccounts || [];
    if (!flagged.length) {
      flaggedAccountsList.innerHTML =
        '<li class="rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-rose-800">No high-risk accounts right now.</li>';
      return;
    }

    flaggedAccountsList.innerHTML = flagged
      .map(
        (account) =>
          `<li class="rounded-lg bg-white/80 px-3 py-2">` +
          `<div class="flex items-center justify-between gap-2">` +
          `<span class="font-black text-rose-900">${escapeHtml(account.username)}</span>` +
          `<span class="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-800">Risk ${account.riskScore}</span>` +
          `</div>` +
          `<p class="mt-1 text-xs text-rose-800">Anomalies: ${account.loginAnomalies} · Step-up: ${
            account.stepUpRequired ? "Yes" : "No"
          }</p>` +
          `</li>`
      )
      .join("");
  }

  function renderUsersTable() {
    if (!usersTableBody) return;
    if (state.usersLoading) {
      setUsersTableLoading(true);
      renderUsersSelectionState();
      return;
    }

    const users = state.usersRows || [];
    const totalUsers = Number(state.usersTotal) || users.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / state.usersPageSize));
    state.usersPage = Math.min(Math.max(state.usersPage, 1), totalPages);

    const startIndex = totalUsers ? (state.usersPage - 1) * state.usersPageSize : 0;
    const endIndex = totalUsers ? Math.min(startIndex + users.length, totalUsers) : 0;
    const pageUsers = users;

    for (const sortButton of usersSortButtons) {
      const buttonSortBy = sortButton.dataset.sortBy || "";
      if (buttonSortBy !== state.usersSortBy) {
        sortButton.textContent = sortButton.textContent.replace(/\s+[↑↓]$/, "");
        continue;
      }
      const arrow = state.usersSortDir === "asc" ? "↑" : "↓";
      const label = sortButton.textContent.replace(/\s+[↑↓]$/, "");
      sortButton.textContent = `${label} ${arrow}`;
    }

    if (usersTableMeta) {
      setText(
        usersTableMeta,
        totalUsers
          ? `Showing ${startIndex + 1}-${endIndex} of ${totalUsers} users`
          : "Showing 0 users"
      );
    }
    if (usersTablePageIndicator) {
      setText(
        usersTablePageIndicator,
        totalUsers ? `Page ${state.usersPage}/${totalPages}` : "Page 0/0"
      );
    }
    setUsersPaginationButtonsState({
      prevDisabled: !totalUsers || state.usersPage <= 1,
      nextDisabled: !totalUsers || state.usersPage >= totalPages,
    });

    if (!pageUsers.length) {
      usersTableBody.innerHTML =
        '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="10">No users available.</td></tr>';
      renderUsersSelectionState();
      return;
    }

    const rows = pageUsers.map((user) => {
      const trustedCount = (user.devices || []).filter((device) => device.trusted).length;
      const totalDevices = (user.devices || []).length;
      const isSelected = user.id === state.selectedUserId;
      const isChecked = state.selectedUserIds.has(user.id);

      return `
        <tr data-user-id="${user.id}" class="border-b border-white/50 ${isSelected ? "bg-rose-100/70" : "hover:bg-white/70"}">
          <td class="px-3 py-2 text-center">
            <input type="checkbox" data-user-select-id="${user.id}" ${isChecked ? "checked" : ""} />
          </td>
          <td class="px-3 py-2 font-black text-rose-900">${escapeHtml(user.username)}</td>
          <td class="px-3 py-2 text-rose-900">${escapeHtml(user.email)}</td>
          <td class="px-3 py-2 text-rose-900">${formatDate(user.createdAt)}</td>
          <td class="px-3 py-2 text-rose-900">${formatDate(user.lastLogin)}</td>
          <td class="px-3 py-2 text-rose-900">${user.riskScore}</td>
          <td class="px-3 py-2 text-rose-900">${escapeHtml(user.geo)}</td>
          <td class="px-3 py-2 text-rose-900">${trustedCount}/${totalDevices}</td>
          <td class="px-3 py-2">
            <span class="rounded-full px-2 py-1 text-xs font-black ${
              user.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }">${user.active ? "Active" : "Inactive"}</span>
          </td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-1">
              <button data-action="select-user" data-user-id="${user.id}" class="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-900 hover:bg-rose-50">View</button>
              <button data-action="toggle-active" data-user-id="${user.id}" data-next-active="${!user.active}" class="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-900 hover:bg-rose-50">${
                user.active ? "Deactivate" : "Activate"
              }</button>
            </div>
          </td>
        </tr>
      `;
    });

    usersTableBody.innerHTML = rows.join("");
    renderUsersSelectionState();
  }

  function renderUserDetails() {
    const user = getSelectedUser();

    if (!user) {
      setText(selectedUserLabel, "No user selected");
      setText(detailEmail, "-");
      setText(detailCreated, "-");
      setText(detailLastLogin, "-");
      setText(detailGeo, "-");
      setText(detailRisk, "-");
      setText(devicesTableMeta, "Showing 0 devices");
      setText(devicesTablePageIndicator, "Page 0/0");
      setDevicesPaginationButtonsState({ prevDisabled: true, nextDisabled: true });
      if (devicesTableBody) {
        devicesTableBody.innerHTML =
          '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="8">Select a user to view device sessions.</td></tr>';
      }
      setActionButtonsDisabled(true);
      return;
    }

    setText(selectedUserLabel, `Selected user: ${user.username}`);
    setText(detailEmail, user.email);
    setText(detailCreated, formatDate(user.createdAt));
    setText(detailLastLogin, formatDate(user.lastLogin));
    setText(detailGeo, user.geo);
    setText(detailRisk, `${user.riskScore} (${user.loginAnomalies} anomalies)`);
    setActionButtonsDisabled(false);
    if (state.devicesLoading) {
      setDevicesTableLoading(true);
      return;
    }

    const devices = state.devicesRows || [];
    const totalDevices = Number(state.devicesTotal) || devices.length;
    const totalPages = Math.max(1, Math.ceil(totalDevices / state.devicesPageSize));
    state.devicesPage = Math.min(Math.max(state.devicesPage, 1), totalPages);
    const startIndex = totalDevices ? (state.devicesPage - 1) * state.devicesPageSize : 0;
    const endIndex = totalDevices ? Math.min(startIndex + devices.length, totalDevices) : 0;
    const pageDevices = devices;

    setText(
      devicesTableMeta,
      totalDevices
        ? `Showing ${startIndex + 1}-${endIndex} of ${totalDevices} devices`
        : "Showing 0 devices"
    );
    setText(
      devicesTablePageIndicator,
      totalDevices ? `Page ${state.devicesPage}/${totalPages}` : "Page 0/0"
    );
    setDevicesPaginationButtonsState({
      prevDisabled: !totalDevices || state.devicesPage <= 1,
      nextDisabled: !totalDevices || state.devicesPage >= totalPages,
    });

    if (!pageDevices.length) {
      devicesTableBody.innerHTML =
        '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="8">No devices for this user.</td></tr>';
      return;
    }

    const deviceRows = pageDevices.map((device) => {
      const intelligence = getDeviceIntelligence(user, device);
      return `
        <tr class="border-b border-white/50 hover:bg-white/70">
          <td class="px-3 py-2 font-bold text-rose-900">${escapeHtml(device.label)}</td>
          <td class="px-3 py-2 text-rose-900">${escapeHtml(device.platform)}</td>
          <td class="px-3 py-2 text-rose-900">${formatDate(device.lastSeen)}</td>
          <td class="px-3 py-2 text-rose-900">${escapeHtml(device.ipAddress)} · ${escapeHtml(device.geo)}</td>
          <td class="px-3 py-2 text-rose-900">${intelligence.score}</td>
          <td class="px-3 py-2 text-rose-900">${escapeHtml(intelligence.signals.join(", ") || "Normal")}</td>
          <td class="px-3 py-2">
            <span class="rounded-full px-2 py-1 text-xs font-black ${
              device.trusted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }">${device.trusted ? "Trusted" : "Untrusted"}</span>
          </td>
          <td class="px-3 py-2">
            <button
              data-action="toggle-device-trust"
              data-user-id="${user.id}"
              data-device-id="${device.id}"
              data-next-trusted="${!device.trusted}"
              class="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-900 hover:bg-rose-50"
            >${device.trusted ? "Untrust" : "Trust"}</button>
          </td>
        </tr>
      `;
    });

    devicesTableBody.innerHTML = deviceRows.join("");
  }

  function setUsersTableLoading(isLoading) {
    if (!usersTableBody) return;
    if (!isLoading) return;
    usersTableBody.innerHTML =
      '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="10">Loading users...</td></tr>';
    if (usersTableMeta) {
      setText(usersTableMeta, "Loading users...");
    }
    if (usersTablePageIndicator) {
      setText(usersTablePageIndicator, "Page --/--");
    }
    setUsersPaginationButtonsState({ prevDisabled: true, nextDisabled: true });
  }

  function setDevicesTableLoading(isLoading) {
    if (!devicesTableBody) return;
    if (!isLoading) return;
    devicesTableBody.innerHTML =
      '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="8">Loading devices...</td></tr>';
    if (devicesTableMeta) {
      setText(devicesTableMeta, "Loading devices...");
    }
    if (devicesTablePageIndicator) {
      setText(devicesTablePageIndicator, "Page --/--");
    }
    setDevicesPaginationButtonsState({ prevDisabled: true, nextDisabled: true });
  }

  function renderRiskTable() {
    if (!riskTableBody) return;

    const rows = (state.data.flaggedAccounts || []).map((account) => {
      return `
        <tr class="border-b border-white/50 hover:bg-white/70">
          <td class="px-3 py-2 font-black text-rose-900">${escapeHtml(account.username)}</td>
          <td class="px-3 py-2 text-rose-900">${account.riskScore}</td>
          <td class="px-3 py-2 text-rose-900">${account.loginAnomalies}</td>
          <td class="px-3 py-2">
            <span class="rounded-full px-2 py-1 text-xs font-black ${
              account.stepUpRequired
                ? "bg-rose-100 text-rose-700"
                : "bg-emerald-100 text-emerald-700"
            }">${account.stepUpRequired ? "Required" : "Clear"}</span>
          </td>
        </tr>
      `;
    });

    if (!rows.length) {
      riskTableBody.innerHTML =
        '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="4">No flagged accounts currently.</td></tr>';
      return;
    }

    riskTableBody.innerHTML = rows.join("");
  }

  function renderRiskChart() {
    if (!riskTrendChart) return;
    if (!chartsModuleCache) {
      ensureChartsModule().then(() => renderRiskChart());
      return;
    }

    chartsModuleCache.renderRiskTrendChart({
      chartNode: riskTrendChart,
      hintNode: riskTrendHint,
      series: state.data.riskTrend || [],
      rangeDays: state.rangeDays,
      onDrillDown: (label) => {
        state.selectedLogCategory = "login_attempt";
        renderLogFilters();
        renderAuditLogs();
        const logsPanel = document.getElementById("logs");
        logsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
        showFlash(`Drill-down: ${label} risk events`, "info");
      },
    });
  }

  function renderUserGrowthChart() {
    if (!userGrowthChart) return;
    if (!chartsModuleCache) {
      ensureChartsModule().then(() => renderUserGrowthChart());
      return;
    }

    chartsModuleCache.renderUserGrowthTrendChart({
      chartNode: userGrowthChart,
      hintNode: userGrowthHint,
      series: state.data.userGrowthTrend || [],
    });
  }

  function renderTrafficOverview() {
    const series = getRangeTrafficTrend();
    const summary = summarizeTraffic(series, state.data.traffic || {});

    setText(trafficTotalVisits, summary.totalVisits);
    setText(trafficSuccessRate, `${summary.successRate}%`);
    setText(trafficUniqueIps, summary.uniqueIpsEstimate);
    setText(trafficUniqueCountries, summary.uniqueCountriesEstimate);

    if (!trafficTrendChart) return;
    if (!chartsModuleCache) {
      ensureChartsModule().then(() => renderTrafficOverview());
      return;
    }

    chartsModuleCache.renderTrafficTrendChart({
      chartNode: trafficTrendChart,
      series,
      onDrillDown: (label) => {
        state.selectedLogCategory = "login_attempt";
        renderLogFilters();
        renderAuditLogs();
        const logsPanel = document.getElementById("logs");
        logsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
        showFlash(`Drill-down: ${label} traffic`, "info");
      },
    });
  }

  function renderThreatGeo() {
    if (!threatGeoList) return;

    const rangeStart = Date.now() - state.rangeDays * 24 * 60 * 60 * 1000;
    const grouped = new Map();
    for (const entry of state.data.auditLogs || []) {
      if (entry.category !== "login_attempt") continue;
      const ts = Date.parse(entry.timestamp || "");
      if (Number.isNaN(ts) || ts < rangeStart) continue;
      const geo = String(entry.details?.geo || "Unknown");
      if (!grouped.has(geo)) {
        grouped.set(geo, { geo, attempts: 0, failed: 0, uniqueIps: new Set() });
      }
      const bucket = grouped.get(geo);
      bucket.attempts += 1;
      if (entry.status !== "success") {
        bucket.failed += 1;
      }
      if (entry.details?.ipAddress && entry.details.ipAddress !== "-") {
        bucket.uniqueIps.add(String(entry.details.ipAddress));
      }
    }

    const items = grouped.size
      ? Array.from(grouped.values())
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
      : state.data.threatGeo || [];
    if (!items.length) {
      threatGeoList.innerHTML =
        '<li class="rounded-md border border-white/45 bg-white/65 px-2.5 py-1.5">No threat geo spikes detected.</li>';
      return;
    }

    threatGeoList.innerHTML = items
      .slice(0, 6)
      .map((item) => {
        return (
          `<li class="rounded-md border border-white/45 bg-white/65 px-2.5 py-1.5">` +
          `<div class="flex items-center justify-between gap-2">` +
          `<span class="font-black text-rose-900">${escapeHtml(item.geo || "Unknown")}</span>` +
          `<span class="text-[11px] text-rose-700">Fail ${item.failed}/${item.attempts}</span>` +
          `</div>` +
          `<p class="mt-0.5 text-[11px] text-rose-700">Success ${item.successRate}% · IPs ${item.uniqueIps}</p>` +
          `</li>`
        );
      })
      .join("");
  }

  function renderAlertRules() {
    const rules = state.data.alertRules || {};
    if (ruleFailedLoginsThreshold) {
      ruleFailedLoginsThreshold.value = String(rules.failedLogins15mThreshold ?? 4);
    }
    if (ruleHighRiskThreshold) {
      ruleHighRiskThreshold.value = String(rules.highRiskThreshold ?? 75);
    }
    if (ruleCountryThreshold) {
      ruleCountryThreshold.value = String(rules.uniqueCountries24hThreshold ?? 3);
    }
    if (ruleEnabled) {
      ruleEnabled.checked = Boolean(rules.enabled);
    }
  }

  function renderTriggeredAlerts() {
    if (!triggeredAlertsList) return;

    const alerts = state.data.triggeredAlerts || [];
    if (!alerts.length) {
      triggeredAlertsList.innerHTML =
        '<li class="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-800">No active alerts.</li>';
      return;
    }

    triggeredAlertsList.innerHTML = alerts
      .map((alert) => {
        const tone =
          alert.severity === "high"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-amber-200 bg-amber-50 text-amber-800";
        return (
          `<li class="rounded-md border px-2.5 py-1.5 ${tone}">` +
          `<p class="font-black">${escapeHtml(alert.title || "Alert")}</p>` +
          `<p class="mt-0.5">${escapeHtml(alert.description || "-")}</p>` +
          `</li>`
        );
      })
      .join("");
  }

  function renderApprovalQueue() {
    if (!approvalQueueList) return;
    const governance = state.data.governance || {};
    const approvals = governance.approvals || [];
    state.requireApproval = Boolean(governance.requireApproval);

    if (requireApprovalToggle) {
      requireApprovalToggle.checked = state.requireApproval;
    }

    if (!approvals.length) {
      approvalQueueList.innerHTML =
        '<li class="rounded-md border border-white/45 bg-white/65 px-2.5 py-1.5">No pending approvals.</li>';
      return;
    }

    approvalQueueList.innerHTML = approvals
      .map((item) => {
        return (
          `<li class="rounded-md border border-white/45 bg-white/65 px-2.5 py-1.5">` +
          `<p class="font-black text-rose-900">${escapeHtml(item.summary || item.actionType)}</p>` +
          `<p class="mt-0.5 text-[11px] text-rose-700">${escapeHtml(item.target || "-")} · ${formatDate(
            item.requestedAt,
            true
          )}</p>` +
          `<div class="mt-2 flex gap-1">` +
          `<button type="button" data-approval-id="${item.id}" data-decision="approve" class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">Approve</button>` +
          `<button type="button" data-approval-id="${item.id}" data-decision="reject" class="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100">Reject</button>` +
          `</div>` +
          `</li>`
        );
      })
      .join("");
  }

  function renderExportCenter() {
    const center = state.data.exportCenter || {};
    const history = Array.isArray(center.history) ? center.history : [];
    const schedules = Array.isArray(center.schedules) ? center.schedules : [];
    const schedule =
      schedules.find((item) => item.id === state.pendingScheduleId) || schedules[0] || null;
    const isSuperAdmin = (state.data.adminProfile?.role || "super_admin") === "super_admin";

    if (exportHistoryCount) {
      setText(exportHistoryCount, `${history.length} exports`);
    }

    if (exportHistoryBody) {
      if (!history.length) {
        exportHistoryBody.innerHTML =
          '<tr><td class="px-2 py-2 text-xs font-semibold text-rose-800" colspan="6">No export history yet.</td></tr>';
      } else {
        exportHistoryBody.innerHTML = history
          .map((item) => {
            return (
              `<tr class="border-b border-white/50 hover:bg-white/70">` +
              `<td class="px-2 py-1.5 text-rose-900">${formatDate(item.timestamp, true)}</td>` +
              `<td class="px-2 py-1.5 text-rose-900 uppercase">${escapeHtml(item.format)}</td>` +
              `<td class="px-2 py-1.5 text-rose-900">${escapeHtml(item.scope)}</td>` +
              `<td class="px-2 py-1.5 text-rose-900">${item.records}</td>` +
              `<td class="px-2 py-1.5 text-rose-900">${escapeHtml(item.filename || "-")}</td>` +
              `<td class="px-2 py-1.5 font-mono text-rose-900">${escapeHtml(item.checksum || "-")}</td>` +
              `</tr>`
            );
          })
          .join("");
      }
    }

    if (schedule) {
      state.pendingScheduleId = schedule.id;
      if (scheduledExportSummary) {
        setText(
          scheduledExportSummary,
          `${schedule.name} · ${schedule.frequency} ${schedule.timeUtc} UTC · ${
            schedule.enabled ? "Enabled" : "Disabled"
          } · Next: ${formatDate(schedule.nextRunAt, true)}`
        );
      }
      if (scheduledExportEnabled) {
        scheduledExportEnabled.checked = Boolean(schedule.enabled);
      }
      if (scheduledExportFrequency) {
        scheduledExportFrequency.value = schedule.frequency || "daily";
      }
      if (scheduledExportTime) {
        scheduledExportTime.value = schedule.timeUtc || "08:00";
      }
      if (scheduledExportFormat) {
        scheduledExportFormat.value = schedule.format === "pdf" ? "pdf" : "csv";
      }
      if (scheduledExportScope) {
        scheduledExportScope.value =
          schedule.scope === "users_with_related" ? "users_with_related" : "users_only";
        const disableRelated = !isSuperAdmin;
        const relatedOption = scheduledExportScope.querySelector(
          "option[value='users_with_related']"
        );
        if (relatedOption) {
          relatedOption.disabled = disableRelated;
          if (disableRelated && scheduledExportScope.value === "users_with_related") {
            scheduledExportScope.value = "users_only";
          }
        }
      }
      if (scheduledExportRunNowBtn) {
        scheduledExportRunNowBtn.disabled = !schedule.enabled;
        scheduledExportRunNowBtn.classList.toggle("opacity-50", !schedule.enabled);
        scheduledExportRunNowBtn.classList.toggle("cursor-not-allowed", !schedule.enabled);
      }
    } else {
      if (scheduledExportSummary) {
        setText(scheduledExportSummary, "No schedule configured.");
      }
      if (scheduledExportEnabled) {
        scheduledExportEnabled.checked = false;
      }
      if (scheduledExportRunNowBtn) {
        scheduledExportRunNowBtn.disabled = true;
        scheduledExportRunNowBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
    }

    if (exportPresetSelect) {
      const relatedOption = exportPresetSelect.querySelector("option[value='users_with_related']");
      if (relatedOption) {
        relatedOption.disabled = !isSuperAdmin;
      }
    }
  }

  function renderLogFilters() {
    for (const button of logFilters) {
      const isSelected = (button.dataset.category || "all") === state.selectedLogCategory;
      button.classList.toggle("bg-rose-100", isSelected);
      button.classList.toggle("text-rose-900", isSelected);
    }
  }

  function renderAuditLogs() {
    if (!auditLogsBody) return;

    const category = state.selectedLogCategory;
    const rangeStart = Date.now() - state.rangeDays * 24 * 60 * 60 * 1000;
    const logs = (state.data.auditLogs || []).filter(
      (entry) =>
        (category === "all" ? true : entry.category === category) &&
        Date.parse(entry.timestamp || "") >= rangeStart
    );

    if (!logs.length) {
      auditLogsBody.innerHTML =
        '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="6">No logs for this category.</td></tr>';
      return;
    }

    auditLogsBody.innerHTML = logs
      .map((entry) => {
        return `
          <tr class="border-b border-white/50 hover:bg-white/70">
            <td class="px-3 py-2 text-rose-900">${formatDate(entry.timestamp, true)}</td>
            <td class="px-3 py-2"><span class="rounded-full bg-white px-2 py-1 text-xs font-black text-rose-800">${escapeHtml(
              entry.category
            )}</span></td>
            <td class="px-3 py-2 text-rose-900">${escapeHtml(entry.action)}</td>
            <td class="px-3 py-2 text-rose-900">${escapeHtml(entry.actor)}</td>
            <td class="px-3 py-2 text-rose-900">${escapeHtml(entry.target)}</td>
            <td class="px-3 py-2">
              <span class="rounded-full px-2 py-1 text-xs font-black ${
                entry.status === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              }">${escapeHtml(entry.status)}</span>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function getRangeTrafficTrend() {
    const series = state.data.trafficTrend || [];
    const size = Math.max(1, state.rangeDays);
    return series.slice(-size);
  }

  function summarizeTraffic(series, backendSummary = {}) {
    const safeSeries = Array.isArray(series) ? series : [];
    const totalVisits = safeSeries.reduce((sum, item) => sum + Number(item.visits || 0), 0);
    const successCount = safeSeries.reduce((sum, item) => sum + Number(item.success || 0), 0);
    const uniqueIpsEstimate = Number.isFinite(Number(backendSummary.uniqueIps))
      ? Number(backendSummary.uniqueIps)
      : Math.max(0, Math.round(totalVisits * 0.42));
    const uniqueCountriesEstimate = Number.isFinite(Number(backendSummary.uniqueCountries))
      ? Number(backendSummary.uniqueCountries)
      : Math.max(0, Math.min(99, Math.round(uniqueIpsEstimate / 2.6)));

    return {
      totalVisits,
      successRate: totalVisits ? Math.round((successCount / totalVisits) * 100) : 0,
      uniqueIpsEstimate,
      uniqueCountriesEstimate,
    };
  }

  function getDeviceIntelligence(user, device) {
    let score = 15;
    const signals = [];

    if (!device.trusted) {
      score += 28;
      signals.push("untrusted");
    }

    if (device.geo && user.geo && device.geo !== user.geo) {
      score += 24;
      signals.push("geo_mismatch");
    }

    const lastSeenTs = Date.parse(device.lastSeen || "");
    if (!Number.isNaN(lastSeenTs)) {
      const ageHours = (Date.now() - lastSeenTs) / (1000 * 60 * 60);
      if (ageHours <= 24) {
        signals.push("recent");
      } else if (ageHours > 72) {
        score += 8;
        signals.push("stale");
      }
    }

    if (user.stepUpRequired) {
      score += 15;
      signals.push("step_up_user");
    }

    return {
      score: Math.min(100, score),
      signals: signals.length ? signals : ["normal"],
    };
  }

  async function runManagedAction(options) {
    if (state.requireApproval) {
      const response = await apiRequest("/admin/api/approvals", {
        method: "POST",
        body: {
          actionType: options.actionType,
          payload: options.payload || {},
          target: options.target || "unknown",
          summary: options.summary || options.actionType,
        },
      });
      applyDashboardData(response.dashboard);
      showFlash(response.message || "Approval request queued.", "info");
      return;
    }

    const response = await options.execute();
    if (typeof options.onSuccess === "function") {
      options.onSuccess(response);
    }
    showFlash(response.message || options.successMessage || "Action completed.", "success");
  }

  async function triggerIncidentMode() {
    const user = getSelectedUser();
    if (!user) return;

    openModal({
      title: "Incident Mode Lockdown",
      message: `Deactivate ${user.username}, untrust devices, and enforce reset now?`,
      onConfirm: async () => {
        await runManagedAction({
          actionType: "incident_lockdown",
          target: user.username,
          summary: `Incident lockdown for ${user.username}`,
          payload: { userId: user.id },
          execute: () =>
            apiRequest(
              `/admin/api/users/${encodeURIComponent(user.id)}/actions/incident-lockdown`,
              {
                method: "POST",
              }
            ),
          onSuccess: (response) => {
            applyDashboardData(response.dashboard);
            state.selectedUserId = user.id;
          },
          successMessage: "Incident mode lockdown applied.",
        });
      },
    });
  }

  async function openUserTimeline() {
    const user = getSelectedUser();
    if (!user || !timelineModal) return;

    state.timelineUserId = user.id;
    setText(timelineUserLabel, `${user.username} (${user.email})`);
    if (timelineList) {
      timelineList.innerHTML = "";
    }
    if (timelineLoading) {
      timelineLoading.classList.remove("hidden");
    }

    timelineModal.classList.remove("hidden");
    timelineModal.classList.add("flex");

    const cached = state.timelineCache.get(user.id);
    if (Array.isArray(cached) && cached.length) {
      renderTimelineEntries(cached);
    }

    try {
      const response = await apiRequest(
        `/admin/api/users/${encodeURIComponent(user.id)}/timeline?limit=80`
      );
      const timeline = Array.isArray(response.timeline) ? response.timeline : [];
      state.timelineCache.set(user.id, timeline);
      renderTimelineEntries(timeline);
    } catch (error) {
      if (timelineList) {
        timelineList.innerHTML =
          '<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">Failed to load timeline.</p>';
      }
      showFlash(error.message || "Failed to load timeline.", "error");
    } finally {
      if (timelineLoading) {
        timelineLoading.classList.add("hidden");
      }
    }
  }

  function closeTimelineModal() {
    if (!timelineModal) return;
    timelineModal.classList.add("hidden");
    timelineModal.classList.remove("flex");
  }

  function renderTimelineEntries(entries) {
    if (!timelineList) return;

    if (!entries.length) {
      timelineList.innerHTML =
        '<p class="rounded-md border border-white/45 bg-white/65 px-3 py-2 text-xs font-semibold text-rose-800">No events found for this user.</p>';
      return;
    }

    timelineList.innerHTML = entries
      .map((entry) => {
        const statusTone =
          entry.status === "success"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-rose-100 text-rose-700";
        const detailParts = [];
        for (const [key, value] of Object.entries(entry.details || {})) {
          detailParts.push(`${key}: ${value}`);
        }
        return (
          `<article class="rounded-lg border border-white/45 bg-white/65 px-3 py-2">` +
          `<div class="flex items-center justify-between gap-2">` +
          `<p class="text-sm font-black text-rose-900">${escapeHtml(entry.action || "-")}</p>` +
          `<span class="rounded-full px-2 py-0.5 text-[11px] font-black ${statusTone}">${escapeHtml(
            entry.status || "-"
          )}</span>` +
          `</div>` +
          `<p class="mt-1 text-xs text-rose-700">${formatDate(entry.timestamp, true)} · ${escapeHtml(
            entry.category || "-"
          )} · ${escapeHtml(entry.actor || "-")}</p>` +
          `<p class="mt-1 text-xs text-rose-800">${escapeHtml(detailParts.join(" · ") || "No details")}</p>` +
          `</article>`
        );
      })
      .join("");
  }

  async function refreshUsersTableFromApi() {
    state.usersLoading = true;
    setUsersTableLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(state.usersPage),
        pageSize: String(state.usersPageSize),
        sortBy: state.usersSortBy,
        sortDir: state.usersSortDir,
      });
      if (state.usersQuery) {
        params.set("q", state.usersQuery);
      }

      const response = await apiRequest(`/admin/api/users?${params.toString()}`, {
        silent: true,
        cache: true,
      });
      const rows = Array.isArray(response.users) ? response.users : [];
      const pagination = response.pagination || {};

      state.usersRows = rows;
      state.usersTotal = Number(pagination.total) || rows.length;
      state.usersPage = Number(pagination.page) || state.usersPage;
      state.usersPageSize = Number(pagination.pageSize) || state.usersPageSize;

      state.usersLoading = false;
      renderUsersTable();
      renderUsersSelectionState();
    } catch (error) {
      state.usersLoading = false;
      usersTableBody.innerHTML =
        '<tr><td class="px-3 py-3 text-sm font-semibold text-rose-800" colspan="10">Failed to load users.</td></tr>';
      showFlash(error.message || "Failed to load users.", "error");
    }
  }

  async function refreshDevicesTableFromApi() {
    const user = getSelectedUser();
    if (!user) {
      state.devicesLoading = false;
      state.devicesRows = [];
      state.devicesTotal = 0;
      renderUserDetails();
      return;
    }

    state.devicesLoading = true;
    setDevicesTableLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(state.devicesPage),
        pageSize: String(state.devicesPageSize),
        sortBy: state.devicesSortBy,
        sortDir: state.devicesSortDir,
      });
      const response = await apiRequest(
        `/admin/api/users/${encodeURIComponent(user.id)}/devices?${params.toString()}`,
        {
          silent: true,
          cache: true,
        }
      );
      const rows = Array.isArray(response.devices) ? response.devices : [];
      const pagination = response.pagination || {};
      state.devicesRows = rows;
      state.devicesTotal = Number(pagination.total) || rows.length;
      state.devicesPage = Number(pagination.page) || state.devicesPage;
      state.devicesPageSize = Number(pagination.pageSize) || state.devicesPageSize;
      state.devicesLoading = false;
      renderUserDetails();
    } catch (error) {
      state.devicesLoading = false;
      state.devicesRows = [];
      state.devicesTotal = 0;
      renderUserDetails();
      showFlash(error.message || "Failed to load user devices.", "error");
    }
  }

  async function runBulkUserAction(mode) {
    const userIds = Array.from(state.selectedUserIds);
    if (!userIds.length) {
      showFlash("Select at least one user first.", "error");
      return;
    }

    const labels = {
      activate: "Activate selected users",
      deactivate: "Deactivate selected users",
      force_reset: "Force reset selected users",
    };
    const message = `${labels[mode]} (${userIds.length})?`;

    openModal({
      title: labels[mode] || "Run bulk action",
      message,
      onConfirm: async () => {
        let response = null;
        if (mode === "activate" || mode === "deactivate") {
          response = await apiRequest("/admin/api/users/bulk/status", {
            method: "POST",
            body: { userIds, active: mode === "activate" },
          });
        } else {
          response = await apiRequest("/admin/api/users/bulk/force-password-reset", {
            method: "POST",
            body: { userIds },
          });
        }

        state.selectedUserIds.clear();
        applyDashboardData(response.dashboard);
        await refreshUsersTableFromApi();
        await refreshDevicesTableFromApi();
        showFlash(response.message || "Bulk action complete.", "success");
      },
    });
  }

  async function saveScheduledExportConfig() {
    try {
      const response = await apiRequest(
        `/admin/api/export-schedules/${encodeURIComponent(state.pendingScheduleId)}`,
        {
          method: "PATCH",
          body: {
            enabled: Boolean(scheduledExportEnabled?.checked),
            frequency: scheduledExportFrequency?.value || "daily",
            timeUtc: scheduledExportTime?.value || "08:00",
            format: scheduledExportFormat?.value || "csv",
            scope: scheduledExportScope?.value || "users_only",
          },
        }
      );
      applyDashboardData(response.dashboard);
      showFlash(response.message || "Schedule updated.", "success");
    } catch (error) {
      showFlash(error.message || "Failed to update schedule.", "error");
    }
  }

  function renderUsersSelectionState() {
    const currentRows = state.usersRows || [];
    const selectedCount = Array.from(state.selectedUserIds).filter((id) =>
      currentRows.some((user) => user.id === id)
    ).length;
    setText(usersSelectionCount, `${state.selectedUserIds.size} selected`);

    if (usersTableSelectAll) {
      usersTableSelectAll.checked = currentRows.length > 0 && selectedCount === currentRows.length;
      usersTableSelectAll.indeterminate = selectedCount > 0 && selectedCount < currentRows.length;
    }

    [bulkActivateBtn, bulkDeactivateBtn, bulkForceResetBtn].forEach((button) => {
      if (!button) return;
      const disabled = state.selectedUserIds.size === 0;
      button.disabled = disabled;
      button.classList.toggle("opacity-50", disabled);
      button.classList.toggle("cursor-not-allowed", disabled);
    });
  }

  function hydrateUiPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem("admin_dashboard_prefs_v1") || "{}");
      if (saved && typeof saved === "object") {
        if (typeof saved.usersSortBy === "string") {
          state.usersSortBy = saved.usersSortBy;
        }
        if (saved.usersSortDir === "asc" || saved.usersSortDir === "desc") {
          state.usersSortDir = saved.usersSortDir;
        }
        if (typeof saved.exportPreset === "string" && exportPresetSelect) {
          exportPresetSelect.value = saved.exportPreset;
        }
      }
    } catch (error) {
      // Ignore corrupted local storage preference payloads.
    }
  }

  function persistUiPreferences() {
    try {
      localStorage.setItem(
        "admin_dashboard_prefs_v1",
        JSON.stringify({
          usersSortBy: state.usersSortBy,
          usersSortDir: state.usersSortDir,
          exportPreset: exportPresetSelect?.value || "users_only",
        })
      );
    } catch (error) {
      // Ignore storage write errors in private or restricted mode.
    }
  }

  function runPresetExport(format) {
    const users = state.data.users || [];
    if (!users.length) {
      showFlash("No users available to export.", "error");
      return;
    }

    const isSuperAdmin = (state.data.adminProfile?.role || "super_admin") === "super_admin";
    const preset =
      exportPresetSelect?.value === "users_with_related" && isSuperAdmin
        ? "users_with_related"
        : "users_only";
    openUsersExportModal({
      format,
      users,
      title: `Export All Users (${format.toUpperCase()})`,
      sourceLabel: "Export Center",
      queryLabel: `range_${state.rangeDays}d`,
      filenamePrefix: "users-dashboard-export",
      reportTitle: "Users Dashboard Report",
    });
    state.usersExportScope = preset;
    if (usersExportScope) {
      usersExportScope.value = preset;
    }
    persistUiPreferences();
    renderUsersExportScopeDetails();
  }

  function openLookupExport(format) {
    const user = getLookupSelectedUser();
    if (!user) {
      showFlash("Select a user to export.", "error");
      return;
    }

    openUsersExportModal({
      format,
      users: [user],
      title: `Export ${user.username} (${format.toUpperCase()})`,
      sourceLabel: "Sidebar user search",
      queryLabel: state.lookupQuery || "none",
      filenamePrefix: `user-${sanitizeFileToken(user.username)}-report`,
      reportTitle: `User Profile Report - ${user.username}`,
    });
  }

  function openUsersExportModal(options = {}) {
    const users = Array.isArray(options.users) ? options.users : [];
    if (!users.length) {
      showFlash("No users available to export.", "error");
      return;
    }
    if (!usersExportModal || !usersExportScope || !usersExportConfirmBtn) {
      showFlash("Export dialog is unavailable.", "error");
      return;
    }

    state.pendingUsersExport = {
      format: options.format === "csv" ? "csv" : "pdf",
      users,
      title: options.title || "Export Users",
      sourceLabel: options.sourceLabel || "Dashboard",
      queryLabel: options.queryLabel || "none",
      filenamePrefix: options.filenamePrefix || "users-report",
      reportTitle: options.reportTitle || "User Report",
    };
    state.usersExportScope = "users_only";
    usersExportScope.value = "users_only";
    const isSuperAdmin = (state.data.adminProfile?.role || "super_admin") === "super_admin";
    const relatedOption = usersExportScope.querySelector("option[value='users_with_related']");
    if (relatedOption) {
      relatedOption.disabled = !isSuperAdmin;
    }

    setText(usersExportTitle, state.pendingUsersExport.title);
    setText(
      usersExportSubtitle,
      `Records: ${users.length}. Choose the detail level for this professional export.`
    );
    setText(usersExportConfirmBtn, `Export ${state.pendingUsersExport.format.toUpperCase()}`);
    renderUsersExportScopeDetails();

    usersExportModal.classList.remove("hidden");
    usersExportModal.classList.add("flex");

    if (window.gsap) {
      gsap.fromTo(
        usersExportModal.querySelector("div"),
        { y: 18, autoAlpha: 0, scale: 0.98 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.2, ease: "power2.out" }
      );
    }
  }

  function closeUsersExportModal() {
    if (!usersExportModal) return;
    state.pendingUsersExport = null;
    usersExportModal.classList.add("hidden");
    usersExportModal.classList.remove("flex");
  }

  function renderUsersExportScopeDetails() {
    if (!usersExportScopeDetails) return;

    const isSuperAdmin = (state.data.adminProfile?.role || "super_admin") === "super_admin";
    if (!isSuperAdmin && state.usersExportScope === "users_with_related") {
      state.usersExportScope = "users_only";
      if (usersExportScope) {
        usersExportScope.value = "users_only";
      }
    }

    const includeRelated = state.usersExportScope === "users_with_related";
    const lines = includeRelated
      ? [
          "Includes profile overview fields and full related security context.",
          "Adds devices, trust status, anomaly tags, risk indicators, and step-up state.",
          "Best for investigations, compliance reviews, and incident response.",
        ]
      : [
          "Includes profile overview fields only.",
          "Smaller output size for quick reporting and routine checks.",
          "Best for simple account lists and leadership summaries.",
        ];

    usersExportScopeDetails.innerHTML = lines
      .map(
        (line) =>
          `<li class="rounded-md border border-white/45 bg-white/65 px-2.5 py-1.5">${escapeHtml(line)}</li>`
      )
      .join("");
  }

  async function runPendingUsersExport() {
    const pending = state.pendingUsersExport;
    if (!pending) return;
    const exporter = await ensureExportsModule();

    const includeRelated = state.usersExportScope === "users_with_related";
    const isSuperAdmin = (state.data.adminProfile?.role || "super_admin") === "super_admin";
    if (includeRelated && !isSuperAdmin) {
      showFlash("Only super_admin can export users with related details.", "error");
      return;
    }
    const scopeLabel = includeRelated ? "users_with_related" : "users_only";

    if (pending.format === "pdf") {
      const lines = buildUsersExportPdfLines(pending.users, {
        includeRelated,
        sourceLabel: pending.sourceLabel,
        queryLabel: pending.queryLabel,
        exporter,
      });
      exporter.downloadPdfReport({
        filename: `${pending.filenamePrefix}-${scopeLabel}-${exporter.buildDateStamp()}.pdf`,
        title: pending.reportTitle,
        lines,
      });
      try {
        const response = await apiRequest("/admin/api/exports/log", {
          method: "POST",
          body: {
            format: "pdf",
            scope: scopeLabel,
            records: pending.users.length,
            source: pending.sourceLabel,
          },
        });
        applyDashboardData(response.dashboard);
      } catch (error) {
        showFlash(error.message || "Export completed but logging failed.", "error");
      }
      showFlash("PDF exported.", "success");
      closeUsersExportModal();
      return;
    }

    const csv = buildUsersExportCsv(pending.users, {
      includeRelated,
      sourceLabel: pending.sourceLabel,
      queryLabel: pending.queryLabel,
      exporter,
    });
    exporter.downloadCsvFile({
      filename: `${pending.filenamePrefix}-${scopeLabel}-${exporter.buildDateStamp()}.csv`,
      content: csv,
    });
    try {
      const response = await apiRequest("/admin/api/exports/log", {
        method: "POST",
        body: {
          format: "csv",
          scope: scopeLabel,
          records: pending.users.length,
          source: pending.sourceLabel,
        },
      });
      applyDashboardData(response.dashboard);
    } catch (error) {
      showFlash(error.message || "Export completed but logging failed.", "error");
    }
    showFlash("CSV exported.", "success");
    closeUsersExportModal();
  }

  function buildUsersExportPdfLines(users, options = {}) {
    const exporter = options.exporter || exportsModuleCache;
    if (!exporter) return [];
    const formatDateValue = exporter?.formatDate || formatDate;
    const buildTable =
      exporter?.buildTableLines ||
      ((columns, rows) => {
        const header = columns.join(" | ");
        const separator = columns.map(() => "----").join(" | ");
        const content = rows.map((row) => row.map((cell) => String(cell ?? "-")).join(" | "));
        return [header, separator, ...content];
      });
    const includeRelated = Boolean(options.includeRelated);
    const lines = [
      `Scope: ${includeRelated ? "Users with related details" : "Users only (profile overview)"}`,
      `Source: ${options.sourceLabel || "Dashboard"}`,
      `Search: ${options.queryLabel || "none"}`,
      `Records: ${users.length}`,
      "",
    ];

    if (!includeRelated) {
      lines.push(
        ...buildTable(
          [
            "Username",
            "Email",
            "Status",
            "Risk",
            "Anomalies",
            "Step-Up",
            "Created",
            "Last Login",
            "Geo",
          ],
          users.map((user) => [
            user.username,
            user.email,
            user.active ? "Active" : "Inactive",
            user.riskScore,
            user.loginAnomalies,
            user.stepUpRequired ? "Yes" : "No",
            formatDateValue(user.createdAt),
            formatDateValue(user.lastLogin),
            user.geo,
          ])
        )
      );
      return lines;
    }

    for (const user of users) {
      const tags = getAnomalyTags(user);
      const devices = Array.isArray(user.devices) ? user.devices : [];
      lines.push(`User: ${user.username} (${user.email})`);
      lines.push(
        `Status: ${user.active ? "Active" : "Inactive"} | Risk: ${user.riskScore} | Anomalies: ${user.loginAnomalies} | Step-Up: ${
          user.stepUpRequired ? "Yes" : "No"
        }`
      );
      lines.push(
        `Geo: ${user.geo || "-"} | Created: ${formatDateValue(user.createdAt)} | Last Login: ${formatDateValue(user.lastLogin)}`
      );
      lines.push(`Anomaly Tags: ${tags.length ? tags.join(", ") : "None"}`);

      if (!devices.length) {
        lines.push("Devices: None");
      } else {
        lines.push(`Devices (${devices.length}):`);
        for (const device of devices) {
          lines.push(
            `  - ${device.label} | ${device.platform} | ${device.trusted ? "Trusted" : "Untrusted"} | ${formatDateValue(
              device.lastSeen
            )} | ${device.ipAddress} | ${device.geo}`
          );
        }
      }
      lines.push("");
    }

    return lines;
  }

  function buildUsersExportCsv(users, options = {}) {
    const exporter = options.exporter || exportsModuleCache;
    if (!exporter) return "";
    const formatDateValue = exporter?.formatDate || formatDate;
    const buildCsvDoc =
      exporter?.buildCsvDocument ||
      ((metaRows, headers, rows) => {
        const lines = [];
        for (const row of metaRows || []) {
          if (!Array.isArray(row) || !row.length) {
            lines.push("");
            continue;
          }
          lines.push(row.map((cell) => String(cell ?? "")).join(","));
        }
        lines.push((headers || []).map((cell) => String(cell ?? "")).join(","));
        for (const row of rows || []) {
          lines.push((row || []).map((cell) => String(cell ?? "")).join(","));
        }
        return lines.join("\n");
      });
    const includeRelated = Boolean(options.includeRelated);
    const scopeLabel = includeRelated
      ? "Users with related details"
      : "Users only (profile overview)";

    const metaRows = [
      ["Report", "User Export"],
      ["Source", options.sourceLabel || "Dashboard"],
      ["Search", options.queryLabel || "none"],
      ["Scope", scopeLabel],
      ["Records", users.length],
      [],
    ];

    if (!includeRelated) {
      const headers = [
        "username",
        "email",
        "status",
        "risk_score",
        "login_anomalies",
        "step_up_required",
        "created_at",
        "last_login",
        "geo",
      ];
      const rows = users.map((user) => [
        user.username,
        user.email,
        user.active ? "active" : "inactive",
        user.riskScore,
        user.loginAnomalies,
        user.stepUpRequired ? "yes" : "no",
        formatDateValue(user.createdAt),
        formatDateValue(user.lastLogin),
        user.geo,
      ]);
      return buildCsvDoc(metaRows, headers, rows);
    }

    const headers = [
      "username",
      "email",
      "status",
      "risk_score",
      "login_anomalies",
      "step_up_required",
      "created_at",
      "last_login",
      "geo",
      "anomaly_tags",
      "device_label",
      "device_platform",
      "device_trust",
      "device_last_seen",
      "device_ip",
      "device_geo",
    ];

    const rows = [];
    for (const user of users) {
      const tags = getAnomalyTags(user).join("|");
      const devices = Array.isArray(user.devices) && user.devices.length ? user.devices : [null];
      for (const device of devices) {
        rows.push([
          user.username,
          user.email,
          user.active ? "active" : "inactive",
          user.riskScore,
          user.loginAnomalies,
          user.stepUpRequired ? "yes" : "no",
          formatDateValue(user.createdAt),
          formatDateValue(user.lastLogin),
          user.geo,
          tags || "-",
          device?.label || "-",
          device?.platform || "-",
          device ? (device.trusted ? "trusted" : "untrusted") : "-",
          device ? formatDateValue(device.lastSeen) : "-",
          device?.ipAddress || "-",
          device?.geo || "-",
        ]);
      }
    }

    return buildCsvDoc(metaRows, headers, rows);
  }

  function applyDashboardData(data) {
    state.data = normalizeDashboardData(data);
    state.requireApproval = Boolean(state.data.governance?.requireApproval);

    if (!state.data.users.find((user) => user.id === state.selectedUserId)) {
      state.selectedUserId = state.data.users[0]?.id || null;
    }
    if (!state.data.users.find((user) => user.id === state.lookupSelectedUserId)) {
      state.lookupSelectedUserId = state.selectedUserId;
    }
    state.selectedUserIds = new Set(
      Array.from(state.selectedUserIds).filter((userId) =>
        state.data.users.some((user) => user.id === userId)
      )
    );

    renderAll();
    if (userLookupModal && !userLookupModal.classList.contains("hidden")) {
      renderUserLookup();
    }
    if (globalRangeSelect) {
      globalRangeSelect.value = String(state.rangeDays);
    }

    refreshUsersTableFromApi();
    refreshDevicesTableFromApi();
  }

  async function refreshDashboard() {
    try {
      const snapshot = await apiRequest(
        `/admin/api/dashboard?rangeDays=${encodeURIComponent(state.rangeDays)}`,
        { cache: false }
      );
      applyDashboardData(snapshot);
      showFlash("Dashboard refreshed.", "info");
    } catch (error) {
      showFlash(error.message || "Failed to refresh dashboard.", "error");
    }
  }

  async function apiRequest(url, options = {}) {
    return adminApi.request(url, options);
  }

  function openModal({ title, message, onConfirm }) {
    uiHelpers.openModal({ title, message, onConfirm });
  }

  function closeModal() {
    uiHelpers.closeModal();
  }

  function showFlash(message, tone = "info") {
    uiHelpers.showFlash(message, tone);
  }

  function setLoading(isLoading) {
    uiHelpers.setLoading(isLoading);
  }

  function animateIn() {
    uiHelpers.animateIn();
  }

  function getSelectedUser() {
    return getUserById(state.selectedUserId);
  }

  function getLookupSelectedUser() {
    return getUserById(state.lookupSelectedUserId);
  }

  function getUserById(userId) {
    if (!userId) return null;
    return (
      (state.data.users || []).find((user) => user.id === userId) ||
      (state.usersRows || []).find((user) => user.id === userId) ||
      null
    );
  }

  function getLookupUsers() {
    const users = state.data.users || [];
    if (!state.lookupQuery) {
      return users;
    }

    return users.filter((user) => {
      const haystack = `${user.username} ${user.email}`.toLowerCase();
      return haystack.includes(state.lookupQuery);
    });
  }

  function getAnomalyTags(user) {
    if (!user || !Array.isArray(user.anomalyTags)) {
      return [];
    }
    return user.anomalyTags.filter(Boolean);
  }

  function setLookupPaginationButtonsState({ prevDisabled, nextDisabled }) {
    if (userLookupPrevPage) {
      userLookupPrevPage.disabled = Boolean(prevDisabled);
      userLookupPrevPage.classList.toggle("opacity-50", Boolean(prevDisabled));
      userLookupPrevPage.classList.toggle("cursor-not-allowed", Boolean(prevDisabled));
    }

    if (userLookupNextPage) {
      userLookupNextPage.disabled = Boolean(nextDisabled);
      userLookupNextPage.classList.toggle("opacity-50", Boolean(nextDisabled));
      userLookupNextPage.classList.toggle("cursor-not-allowed", Boolean(nextDisabled));
    }
  }

  function setDevicesPaginationButtonsState({ prevDisabled, nextDisabled }) {
    if (devicesTablePrevPage) {
      devicesTablePrevPage.disabled = Boolean(prevDisabled);
      devicesTablePrevPage.classList.toggle("opacity-50", Boolean(prevDisabled));
      devicesTablePrevPage.classList.toggle("cursor-not-allowed", Boolean(prevDisabled));
    }

    if (devicesTableNextPage) {
      devicesTableNextPage.disabled = Boolean(nextDisabled);
      devicesTableNextPage.classList.toggle("opacity-50", Boolean(nextDisabled));
      devicesTableNextPage.classList.toggle("cursor-not-allowed", Boolean(nextDisabled));
    }
  }

  function setUsersPaginationButtonsState({ prevDisabled, nextDisabled }) {
    if (usersTablePrevPage) {
      usersTablePrevPage.disabled = Boolean(prevDisabled);
      usersTablePrevPage.classList.toggle("opacity-50", Boolean(prevDisabled));
      usersTablePrevPage.classList.toggle("cursor-not-allowed", Boolean(prevDisabled));
    }

    if (usersTableNextPage) {
      usersTableNextPage.disabled = Boolean(nextDisabled);
      usersTableNextPage.classList.toggle("opacity-50", Boolean(nextDisabled));
      usersTableNextPage.classList.toggle("cursor-not-allowed", Boolean(nextDisabled));
    }
  }

  function setActionButtonsDisabled(disabled) {
    [forceResetBtn, triggerOtpBtn, triggerWebauthnBtn, viewTimelineBtn, incidentModeBtn].forEach(
      (button) => {
        if (!button) return;
        button.disabled = disabled;
        button.classList.toggle("opacity-50", disabled);
        button.classList.toggle("cursor-not-allowed", disabled);
      }
    );
  }

  function normalizeDashboardData(data) {
    return normalizeDashboardDataModel(data);
  }

  function setText(node, value) {
    if (!node) return;
    node.textContent = String(value ?? "");
  }

  function sanitizeFileToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function debounce(fn, waitMs = 180) {
    let timerId = null;
    return (...args) => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        fn(...args);
      }, waitMs);
    };
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: includeTime ? "2-digit" : undefined,
      minute: includeTime ? "2-digit" : undefined,
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
});
