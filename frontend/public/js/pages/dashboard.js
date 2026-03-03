"use strict";

import { notify } from "../lib/toast.js";
import { createApiClient } from "../lib/api-client.js";

const apiClient = createApiClient();

async function fetchUsage() {
  try {
    const userId = window.localStorage.getItem("last_user_id");
    const headers = userId ? { "x-user-id": userId } : {};
    const response = await apiClient.request("/api/vault/usage", {
      method: "GET",
      headers,
      retries: 0,
      timeoutMs: 4000,
    });
    renderUsage(response);
  } catch (error) {
    // Optional: silent on first load
  }
}

function renderUsage(payload = {}) {
  const usageEl = document.getElementById("vaultUsageSummary");
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
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function init() {
  fetchUsage();
  notify("Signed in — dashboard placeholder loaded.", "success", "Dashboard");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
