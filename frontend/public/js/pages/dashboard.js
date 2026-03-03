"use strict";

import { notify } from "../lib/toast.js";
import { createApiClient } from "../lib/api-client.js";

const apiClient = createApiClient();
const DEMO_USER_ID = "ffa1054f-25c3-4c7b-a063-825629903aea";

async function fetchUsage() {
  const statusEl = document.getElementById("usageStatus");
  try {
    const userId = readUserId();
    if (!userId) {
      setStatus("Set a user ID to fetch usage", "info");
      return;
    }
    const headers = userId ? { "x-user-id": userId } : {};
    const response = await apiClient.request("/api/vault/usage", {
      method: "GET",
      headers,
      retries: 0,
      timeoutMs: 4000,
    });
    renderUsage(response);
    setStatus("Usage loaded", "success");
  } catch (error) {
    setStatus(error.message || "Unable to load usage.", "error");
  }
  function setStatus(message, tone) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className =
      "text-xs font-semibold " +
      (tone === "error"
        ? "text-rose-700"
        : tone === "success"
          ? "text-emerald-700"
          : "text-rose-700");
  }
}

function renderUsage(payload = {}) {
  const usageEl = document.getElementById("vaultUsageSummary");
  const bar = document.getElementById("usageBar");
  const hint = document.getElementById("usageHint");
  if (!usageEl) return;
  const used = Number(payload.usedBytes || 0);
  const quota = Number(payload.quotaBytes || 0);
  const percent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : null;
  const humanUsed = formatBytes(used);
  const humanQuota = quota > 0 ? formatBytes(quota) : "∞";

  usageEl.textContent =
    percent !== null
      ? `${humanUsed} used of ${humanQuota} (${percent}%)`
      : `${humanUsed} used (no quota set)`;
  if (bar) {
    bar.style.width = `${percent !== null ? percent : Math.min(100, (used % 100000) / 1000)}%`;
  }
  if (hint) {
    hint.textContent =
      quota > 0 ? `Quota: ${humanQuota}` : "Quota: unlimited (no per-user cap configured)";
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function init() {
  wireUserIdControls();
  fetchUsage();
  notify("Signed in — dashboard placeholder loaded.", "success", "Dashboard");
}

function wireUserIdControls() {
  const input = document.getElementById("userIdInput");
  const saveBtn = document.getElementById("saveUserIdBtn");
  const refreshBtn = document.getElementById("refreshUsageBtn");
  const loadDemoBtn = document.getElementById("loadDemoUserBtn");
  if (input) input.value = readUserId();

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const value = (input?.value || "").trim();
      if (!value) {
        notify("Enter a user ID (UUID) to fetch usage.", "error", "Dashboard");
        return;
      }
      safeWriteStorage("last_user_id", value);
      notify("User ID saved for this session.", "success", "Dashboard");
      fetchUsage();
    });
  }
  if (refreshBtn) {
    refreshBtn.addEventListener("click", fetchUsage);
  }
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener("click", () => {
      if (input) input.value = DEMO_USER_ID;
      safeWriteStorage("last_user_id", DEMO_USER_ID);
      notify("Demo user selected.", "success", "Dashboard");
      fetchUsage();
    });
  }
}

function readUserId() {
  try {
    return window.localStorage.getItem("last_user_id") || "";
  } catch {
    return "";
  }
}

function safeWriteStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
