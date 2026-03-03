"use strict";

import { notify } from "../lib/toast.js";
import { createApiClient } from "../lib/api-client.js";

const apiClient = createApiClient();
const DEMO_USER_ID = "ffa1054f-25c3-4c7b-a063-825629903aea";

function init() {
  wireUserIdControls();
  refreshAll();
  notify("Dashboard ready. Load demo user for instant data.", "success", "Dashboard");
}

function wireUserIdControls() {
  const input = document.getElementById("userIdInput");
  const saveBtn = document.getElementById("saveUserIdBtn");
  const refreshBtn = document.getElementById("refreshUsageBtn");
  const loadDemoBtn = document.getElementById("loadDemoUserBtn");
  if (input) input.value = readUserId();

  saveBtn?.addEventListener("click", () => {
    const value = (input?.value || "").trim();
    if (!value) {
      notify("Enter a user ID (UUID) to fetch usage.", "error", "Dashboard");
      return;
    }
    safeWriteStorage("last_user_id", value);
    notify("User ID saved for this session.", "success", "Dashboard");
    refreshAll();
  });

  refreshBtn?.addEventListener("click", refreshAll);

  loadDemoBtn?.addEventListener("click", () => {
    if (input) input.value = DEMO_USER_ID;
    safeWriteStorage("last_user_id", DEMO_USER_ID);
    notify("Demo user selected.", "success", "Dashboard");
    refreshAll();
  });
}

async function refreshAll() {
  await Promise.all([fetchUsage(), fetchItems(), renderTrend()]);
}

async function fetchUsage() {
  const statusEl = document.getElementById("usageStatus");
  setStatus("Loading...", "info");
  const userId = readUserId();
  if (!userId) {
    setStatus("Set a user ID to fetch usage", "info");
    return;
  }
  try {
    const headers = { "x-user-id": userId };
    const response = await apiClient.request("/api/vault/usage", {
      method: "GET",
      headers,
      retries: 0,
      timeoutMs: 4000,
    });
    renderUsage(response);
    setStatus("Usage loaded", "success");
  } catch (error) {
    renderUsage(getDemoUsage());
    setStatus(error.message || "Using demo data (usage).", "error");
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
  const metricUsed = document.getElementById("metricUsed");
  const metricQuota = document.getElementById("metricQuota");
  const metricItems = document.getElementById("metricItems");
  const metricAttachments = document.getElementById("metricAttachments");

  const used = Number(payload.usedBytes || 0);
  const quota = Number(payload.quotaBytes || 0);
  const percent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : null;
  const humanUsed = formatBytes(used);
  const humanQuota = quota > 0 ? formatBytes(quota) : "∞";

  if (usageEl) {
    usageEl.textContent =
      percent !== null
        ? `${humanUsed} of ${humanQuota} (${percent}%)`
        : `${humanUsed} used (no quota set)`;
  }
  if (bar) {
    bar.style.width = `${percent !== null ? percent : Math.min(100, (used % 100000) / 1000)}%`;
  }
  if (hint) {
    hint.textContent =
      quota > 0 ? `Quota: ${humanQuota}` : "Quota: unlimited (no per-user cap configured)";
  }
  metricUsed && (metricUsed.textContent = humanUsed);
  metricQuota && (metricQuota.textContent = humanQuota);
  metricItems && (metricItems.textContent = formatCount(payload.items));
  metricAttachments && (metricAttachments.textContent = formatBytes(payload.attachmentBytes || 0));
}

async function fetchItems() {
  const body = document.getElementById("vaultItemsBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="4" class="px-3 py-3 text-center text-rose-700">Loading...</td></tr>`;
  const userId = readUserId();
  if (!userId) {
    body.innerHTML = `<tr><td colspan="4" class="px-3 py-3 text-center text-rose-700">Add a user ID and click refresh usage.</td></tr>`;
    renderAudit([]);
    return;
  }
  try {
    const rows = await apiClient.request("/api/vault/items", {
      method: "GET",
      headers: { "x-user-id": userId },
      retries: 0,
      timeoutMs: 5000,
    });
    const items = Array.isArray(rows.items) ? rows.items : [];
    renderItems(items);
    renderAudit(items);
  } catch (error) {
    const demo = getDemoItems();
    renderItems(demo);
    renderAudit(demo);
  }
}

function renderItems(items = []) {
  const body = document.getElementById("vaultItemsBody");
  if (!body) return;
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="4" class="px-3 py-3 text-center text-rose-700">No items yet.</td></tr>`;
    return;
  }
  body.innerHTML = items
    .slice(0, 6)
    .map((item) => {
      const size = formatBytes(
        Number(item.ciphertextBytes || 0) + Number(item.attachmentBytes || 0)
      );
      const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—";
      return `<tr>
        <td class="px-3 py-2">${escapeHtml(item.title || "Untitled")}</td>
        <td class="px-3 py-2">${escapeHtml(item.encryptionScheme || "AES-GCM")}</td>
        <td class="px-3 py-2 text-right">${size}</td>
        <td class="px-3 py-2 text-right">${updated}</td>
      </tr>`;
    })
    .join("");
}

function renderAudit(items = []) {
  const auditList = document.getElementById("auditGlance");
  if (!auditList) return;
  if (!items.length) {
    auditList.innerHTML = `
      <li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>Reads will appear after first item load.</li>
      <li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-orange-500"></span>Updates tracked on save.</li>
      <li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-sky-500"></span>Attachments tracked on upload.</li>
    `;
    return;
  }
  const first = items[0];
  auditList.innerHTML = `
    <li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>Last read: ${first.title || "item"}.</li>
    <li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-orange-500"></span>Last version: ${first.version || 1}.</li>
    <li class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-sky-500"></span>Attachments: ${formatBytes(first.attachmentBytes || 0)}.</li>
  `;
}

async function renderTrend() {
  const svg = document.getElementById("usageTrendChart");
  const hint = document.getElementById("usageTrendHint");
  if (!svg) return;
  const userId = readUserId();
  const points = await getTrendData(userId);
  if (!points.length) {
    svg.innerHTML = `<text x="12" y="20" font-size="12" fill="#7f1d1d">No trend data</text>`;
    if (hint) hint.textContent = "Trend unavailable (demo user recommended).";
    return;
  }
  const width = 260;
  const height = 90;
  const maxY = Math.max(...points.map((p) => p.y), 1);
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * (width - 20) + 10;
      const y = height - (p.y / maxY) * (height - 20) - 10;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <path d="${path}" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" />
    ${points
      .map((p, i) => {
        const x = (i / Math.max(points.length - 1, 1)) * (width - 20) + 10;
        const y = height - (p.y / maxY) * (height - 20) - 10;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#be123c" />`;
      })
      .join("")}
  `;
  if (hint) hint.textContent = "Last 7 days (demo data if not available).";
}

async function getTrendData(userId) {
  if (!userId) return demoTrend();
  try {
    // No server trend endpoint yet; return demo until wired.
    return demoTrend();
  } catch {
    return demoTrend();
  }
}

function demoTrend() {
  return [
    { x: 0, y: 120 },
    { x: 1, y: 180 },
    { x: 2, y: 90 },
    { x: 3, y: 220 },
    { x: 4, y: 260 },
    { x: 5, y: 240 },
    { x: 6, y: 300 },
  ];
}

function getDemoUsage() {
  return {
    usedBytes: 3.1 * 1024 * 1024,
    quotaBytes: 10 * 1024 * 1024 * 1024,
    items: 4,
    attachmentBytes: 1.2 * 1024 * 1024,
  };
}

function getDemoItems() {
  const now = Date.now();
  return [
    {
      title: "Passport seed",
      encryptionScheme: "AES-GCM",
      ciphertextBytes: 4200,
      attachmentBytes: 0,
      updatedAt: new Date(now - 3600 * 1000).toISOString(),
      version: 2,
    },
    {
      title: "Family docs",
      encryptionScheme: "AES-GCM",
      ciphertextBytes: 128000,
      attachmentBytes: 500000,
      updatedAt: new Date(now - 86400 * 1000).toISOString(),
      version: 5,
    },
    {
      title: "Bank export",
      encryptionScheme: "AES-GCM",
      ciphertextBytes: 64000,
      attachmentBytes: 25000,
      updatedAt: new Date(now - 2 * 86400 * 1000).toISOString(),
      version: 1,
    },
  ];
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toString() : "—";
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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
