"use strict";

import { showToast } from "../lib/toast.js";
import { createApiClient } from "../lib/api-client.js";

const apiClient = createApiClient();
const DEMO_USER_ID = "ffa1054f-25c3-4c7b-a063-825629903aea";
const state = {
  items: [],
  filter: "all",
  avatarUrl: "",
  noteEditor: null,
  usage: null,
  currentUser: null,
};

const notify = (message, tone = "info", title = "Status") => {
  showToast(message, { tone, title });
};

function init() {
  wireUserIdControls();
  wireFilters();
  wireScratchpad();
  wireUploadCenter();
  wireCtas();
  wireAvatar();
  wireNoteModal();
  wireCompareLab();
  initUploadQueue();
  refreshAll();
  notify("Dashboard ready. Load demo user for instant data.", "success", "Dashboard");
}

function wireUserIdControls() {
  const input = document.getElementById("userIdInput");
  const saveBtn = document.getElementById("saveUserIdBtn");
  const refreshBtn = document.getElementById("refreshUsageBtn");
  const loadDemoBtn = document.getElementById("loadDemoUserBtn");
  const exportBtn = document.getElementById("exportUsageBtn");
  // default to demo user if nothing saved
  if (!readUserId()) {
    safeWriteStorage("last_user_id", DEMO_USER_ID);
  }
  if (input) input.value = readUserId();
  const status = document.getElementById("usageStatus");
  if (status && !input) {
    status.textContent = "Auto-using demo user. Usage refreshes on load.";
  }

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

  exportBtn?.addEventListener("click", () => {
    const payload = state.usage || getDemoUsage();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vault-usage-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Usage report exported.", "success", "Dashboard");
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
    const headers = getAuthHeaders();
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
  const profileUserId = document.getElementById("profileUserId");
  const profileUsername = document.getElementById("profileUsername");
  const profileEmail = document.getElementById("profileEmail");
  const profileGender = document.getElementById("profileGender");
  const profileCreated = document.getElementById("profileCreated");
  const profileLastLogin = document.getElementById("profileLastLogin");
  const profileLastIp = document.getElementById("profileLastIp");
  const profileVerified = document.getElementById("profileVerified");
  const profileAvatarUpdated = document.getElementById("profileAvatarUpdated");
  const remainingEl = document.getElementById("usageRemaining");
  const percentEl = document.getElementById("usagePercent");
  const badgeEl = document.getElementById("usageBadge");
  const encryptedSizeEl = document.getElementById("usageEncryptedSize");
  const attachmentSizeEl = document.getElementById("usageAttachmentSize");
  const encryptedBar = document.getElementById("usageEncryptedBar");
  const attachmentBar = document.getElementById("usageAttachmentBar");
  const updatedAt = document.getElementById("usageUpdatedAt");

  const used = Number(payload.usedBytes || 0);
  const quota = Number(payload.quotaBytes || 0);
  const percent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : null;
  const humanUsed = formatBytes(used);
  const humanQuota = quota > 0 ? formatBytes(quota) : "∞";
  const remaining = quota > 0 ? Math.max(0, quota - used) : null;
  const attachmentBytes = Number(payload.attachmentBytes || 0);
  const encryptedBytes = Math.max(0, used - attachmentBytes);
  state.usage = payload;
  const user = payload.user || {};
  state.currentUser = user && Object.keys(user).length ? user : null;
  updateNavUserDisplay();

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
  if (profileUserId) {
    profileUserId.textContent = user.id || payload.userId || readUserId() || "—";
  }
  if (profileUsername) profileUsername.textContent = user.username || "—";
  if (profileEmail) profileEmail.textContent = user.email || "—";
  if (profileGender) profileGender.textContent = user.gender || "—";
  if (profileCreated) profileCreated.textContent = formatDateTime(user.createdAt);
  if (profileLastLogin) profileLastLogin.textContent = formatDateTime(user.lastLogin);
  if (profileLastIp) profileLastIp.textContent = user.lastLoginIp || "—";
  if (profileAvatarUpdated) profileAvatarUpdated.textContent = formatDateTime(user.avatarUpdatedAt);
  if (profileVerified) {
    if (user.emailVerifiedAt) {
      profileVerified.textContent = "Verified";
      profileVerified.className = "text-xs font-semibold text-emerald-700";
    } else {
      profileVerified.textContent = "Pending verification";
      profileVerified.className = "text-xs font-semibold text-rose-600";
    }
  }
  if (remainingEl) {
    remainingEl.textContent = remaining !== null ? formatBytes(remaining) : "—";
  }
  if (percentEl) {
    percentEl.textContent = percent !== null ? `${percent}%` : "—";
  }
  if (badgeEl) {
    let label = "Healthy";
    let className = "text-emerald-700";
    if (percent !== null && percent >= 90) {
      label = "Critical";
      className = "text-rose-700";
    } else if (percent !== null && percent >= 70) {
      label = "Warning";
      className = "text-orange-700";
    }
    badgeEl.textContent = label;
    badgeEl.className = `text-sm font-black ${className}`;
  }
  if (encryptedSizeEl) encryptedSizeEl.textContent = formatBytes(encryptedBytes);
  if (attachmentSizeEl) attachmentSizeEl.textContent = formatBytes(attachmentBytes);
  if (encryptedBar) {
    const encryptedPct = used > 0 ? Math.round((encryptedBytes / used) * 100) : 0;
    encryptedBar.style.width = `${encryptedPct}%`;
  }
  if (attachmentBar) {
    const attachmentPct = used > 0 ? Math.round((attachmentBytes / used) * 100) : 0;
    attachmentBar.style.width = `${attachmentPct}%`;
  }
  if (updatedAt) {
    updatedAt.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }
}

async function fetchItems() {
  const body = document.getElementById("vaultItemsBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="5" class="px-3 py-3 text-center text-rose-700">Loading...</td></tr>`;
  const userId = readUserId();
  if (!userId) {
    body.innerHTML = `<tr><td colspan="5" class="px-3 py-3 text-center text-rose-700">Add a user ID and click refresh usage.</td></tr>`;
    renderAudit([]);
    return;
  }
  try {
    const rows = await apiClient.request("/api/vault/items", {
      method: "GET",
      headers: getAuthHeaders(),
      retries: 0,
      timeoutMs: 5000,
    });
    const items = Array.isArray(rows.items) ? rows.items : [];
    state.items = items;
    renderItems();
    renderAudit(items);
  } catch (error) {
    const demo = getDemoItems();
    state.items = demo;
    renderItems();
    renderAudit(demo);
  }
}

function renderItems() {
  const body = document.getElementById("vaultItemsBody");
  const filtered = state.items.filter((item) => {
    if (state.filter === "all") return true;
    return (item.type || "other") === state.filter;
  });
  if (!body) return;
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="5" class="px-3 py-3 text-center text-rose-700">No items for this category yet.</td></tr>`;
    return;
  }
  body.innerHTML = filtered
    .slice(0, 6)
    .map((item) => {
      const size = formatBytes(
        Number(item.ciphertextBytes || 0) + Number(item.attachmentBytes || 0)
      );
      const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—";
      return `<tr>
        <td class="px-3 py-2">${escapeHtml(item.title || "Untitled")}</td>
        <td class="px-3 py-2">${escapeHtml(item.encryptionScheme || "AES-GCM")} · ${
          item.type || "other"
        }</td>
        <td class="px-3 py-2 text-right">${size}</td>
        <td class="px-3 py-2 text-right">${updated}</td>
        <td class="px-3 py-2 text-right space-x-2">
          <button class="text-rose-700 underline" data-share="${escapeHtml(
            item.id || item.title || "item"
          )}">Share</button>
          <button class="text-rose-700 underline" data-download="${escapeHtml(
            item.id || item.title || "item"
          )}">Download</button>
        </td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-share");
      const link = `https://vault.local/share/${encodeURIComponent(id)}`;
      navigator.clipboard?.writeText(link).catch(() => {});
      notify("Secure share link copied (demo)", "success", "Share");
    });
  });

  body.querySelectorAll("[data-download]").forEach((btn) => {
    btn.addEventListener("click", () => {
      notify("Download will stream encrypted payload (demo)", "info", "Download");
    });
  });
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
    user: {
      id: DEMO_USER_ID,
      username: "demo.user",
      email: "demo@vault.local",
      gender: "male",
      createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
      lastLogin: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      lastLoginIp: "127.0.0.1",
      emailVerifiedAt: new Date(Date.now() - 44 * 24 * 3600 * 1000).toISOString(),
      avatarUpdatedAt: null,
    },
  };
}

function getDemoItems() {
  const now = Date.now();
  return [
    {
      id: "demo-passport",
      title: "Passport seed",
      encryptionScheme: "AES-GCM",
      ciphertextBytes: 4200,
      attachmentBytes: 0,
      updatedAt: new Date(now - 3600 * 1000).toISOString(),
      version: 2,
      type: "doc",
    },
    {
      id: "demo-family",
      title: "Family docs",
      encryptionScheme: "AES-GCM",
      ciphertextBytes: 128000,
      attachmentBytes: 500000,
      updatedAt: new Date(now - 86400 * 1000).toISOString(),
      version: 5,
      type: "image",
    },
    {
      id: "demo-bank",
      title: "Bank export",
      encryptionScheme: "AES-GCM",
      ciphertextBytes: 64000,
      attachmentBytes: 25000,
      updatedAt: new Date(now - 2 * 86400 * 1000).toISOString(),
      version: 1,
      type: "other",
    },
    {
      id: "demo-video",
      title: "Signing session",
      encryptionScheme: "XChaCha20",
      ciphertextBytes: 32000000,
      attachmentBytes: 1200000,
      updatedAt: new Date(now - 3 * 86400 * 1000).toISOString(),
      version: 3,
      type: "video",
    },
  ];
}

function wireFilters() {
  const chips = Array.from(document.querySelectorAll(".filter-chip"));
  const setActive = (target) => {
    chips.forEach((c) =>
      c.classList.remove("bg-rose-900", "text-rose-50", "shadow", "border-rose-900")
    );
    target.classList.add("bg-rose-900", "text-rose-50", "shadow", "border-rose-900");
  };
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filter = chip.dataset.filter || "all";
      setActive(chip);
      renderItems();
    });
  });
  const first = document.querySelector(".filter-chip[data-filter='all']");
  if (first) setActive(first);
}

function wireScratchpad() {
  // no-op: scratchpad textarea removed
}

function wireUploadCenter() {
  const drop = document.getElementById("uploadDropZone");
  const input = document.getElementById("fileInput");
  const avatarInput = document.getElementById("avatarInput");
  const progress = document.getElementById("uploadProgress");
  const status = document.getElementById("uploadStatus");
  const categorySelect = document.getElementById("uploadCategory");
  const browseBtn = document.getElementById("uploadBrowseBtn");
  const fileName = document.getElementById("uploadFileName");
  const fileMeta = document.getElementById("uploadFileMeta");
  const percent = document.getElementById("uploadPercent");
  const clearBtn = document.getElementById("uploadClearBtn");
  const noteInput = document.getElementById("uploadNote");
  const copyNoteBtn = document.getElementById("uploadCopyNoteBtn");

  if (!drop || !input) return;

  drop.addEventListener("click", () => input.click());
  browseBtn?.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("ring-2", "ring-rose-400");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("ring-2", "ring-rose-400"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("ring-2", "ring-rose-400");
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  });

  drop.addEventListener("files-selected", (e) => {
    const files = e.detail?.files;
    if (files?.length) handleFiles(files);
  });

  drop.addEventListener("files-selected", (e) => {
    const files = e.detail?.files;
    if (files?.length) handleFiles(files);
  });

  input.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files?.length) handleFiles(files);
  });

  avatarInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) setAvatarFile(file);
  });

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    if (progress) progress.value = 0;
    if (percent) percent.textContent = "0%";
    if (status) status.textContent = "Ready for upload.";
    if (fileName) fileName.textContent = "No file selected";
    if (fileMeta) fileMeta.textContent = "—";
  });

  copyNoteBtn?.addEventListener("click", () => {
    const note = noteInput?.value?.trim();
    if (!note) {
      notify("Add a quick note first.", "info", "Note");
      return;
    }
    navigator.clipboard?.writeText(note).catch(() => {});
    notify("Note copied to clipboard.", "success", "Note");
  });

  function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    const category = categorySelect?.value || inferType(file.type, file.name);
    if (fileName) fileName.textContent = file.name;
    if (fileMeta) fileMeta.textContent = `${formatBytes(file.size)} • ${category}`;
    simulateUpload(file, category);
  }

  function simulateUpload(file, category) {
    if (progress) progress.value = 0;
    if (percent) percent.textContent = "0%";
    if (status) status.textContent = `Uploading ${file.name}...`;
    const userId = readUserId();
    if (!userId) {
      notify("Save a user ID before uploading (demo only).", "error", "Upload");
      return;
    }
    let pct = 0;
    const step = () => {
      pct += 15 + Math.random() * 20;
      const value = Math.min(100, pct);
      if (progress) progress.value = value;
      if (percent) percent.textContent = `${Math.round(value)}%`;
      if (status) status.textContent = `Uploading ${file.name} (${Math.round(value)}%)`;
      if (pct < 100) {
        setTimeout(step, 180);
      } else {
        if (status) status.textContent = `Uploaded ${file.name} (${category})`;
        if (fileMeta) fileMeta.textContent = `${formatBytes(file.size)} • ${category} • Encrypted`;
        notify("Upload complete (demo). Quota enforcement will apply.", "success", "Upload");
        const newItem = {
          id: `local-${Date.now()}`,
          title: file.name,
          encryptionScheme: "AES-GCM",
          ciphertextBytes: file.size,
          attachmentBytes: 0,
          updatedAt: new Date().toISOString(),
          type: category,
        };
        state.items = [newItem, ...state.items].slice(0, 12);
        renderItems();
        renderAudit(state.items);
        pushUploadEntry({
          name: file.name,
          type: category,
          size: file.size,
          status: "Encrypted",
        });
      }
    };
    step();
  }
}

function wireCtas() {
  document.getElementById("ctaUpload")?.addEventListener("click", () => {
    document.getElementById("fileInput")?.click();
  });
  document.getElementById("ctaNewItem")?.addEventListener("click", () => {
    document.getElementById("fileInput")?.click();
  });
  document.getElementById("ctaNewNote")?.addEventListener("click", () => {
    openNoteModal();
  });
  document.querySelectorAll("[data-open-note]").forEach((btn) => {
    btn.addEventListener("click", openNoteModal);
  });
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await fetch("/logout", { method: "POST", credentials: "include" });
      } catch (e) {
        // ignore network errors; still redirect
      } finally {
        window.location.href = "/login";
      }
    });
  });
  document.getElementById("ctaShare")?.addEventListener("click", () => {
    const userId = readUserId();
    if (!userId) {
      notify("Add a user ID to generate share links.", "error", "Share");
      return;
    }
    const link = `https://vault.local/share/user/${encodeURIComponent(userId)}`;
    navigator.clipboard?.writeText(link).catch(() => {});
    notify("User share space copied (demo)", "success", "Share");
  });

  // ensure file input change runs upload flow
  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const files = e.target.files;
      if (files?.length) {
        // call upload center handler directly
        const categorySelect = document.getElementById("uploadCategory");
        const category = categorySelect?.value || "other";
        const fakeDrop = { files };
        // reuse simulateUpload through handleFiles
        const drop = document.getElementById("uploadDropZone");
        if (drop) {
          drop.dispatchEvent(new CustomEvent("files-selected", { detail: { files, category } }));
        }
      }
    });
  }
}

function wireCompareLab() {
  const originalInput = document.getElementById("compareOriginalFileInput");
  const compressedInput = document.getElementById("compareCompressedFileInput");
  const originalSelectBtn = document.getElementById("compareOriginalSelectBtn");
  const compressedSelectBtn = document.getElementById("compareCompressedSelectBtn");
  const decompressBtn = document.getElementById("compareDecompressBtn");
  const downloadGzBtn = document.getElementById("compareDownloadGzBtn");
  const downloadTextBtn = document.getElementById("compareDownloadTextBtn");
  const originalMeta = document.getElementById("compareOriginalMeta");
  const compressedMeta = document.getElementById("compareCompressedMeta");
  const info = document.getElementById("compareInfo");
  if (!originalInput || !compressedInput || !window.pako) return;

  const setInfo = (msg) => {
    if (info) info.textContent = msg;
  };

  const setMeta = (el, text) => {
    if (el) el.textContent = text;
  };

  let compressedBytes = null;
  let decompressedText = "";

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  originalSelectBtn?.addEventListener("click", () => originalInput.click());
  compressedSelectBtn?.addEventListener("click", () => compressedInput.click());

  originalInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const originalBytes = new TextEncoder().encode(text);
      compressedBytes = window.pako.gzip(originalBytes);
      decompressedText = text;
      setMeta(originalMeta, `${file.name} • ${originalBytes.length} bytes`);
      setMeta(compressedMeta, `Ready • ${compressedBytes.length} bytes`);
      setInfo(`Compressed ${file.name} to ${compressedBytes.length} bytes`);
    } catch (err) {
      setInfo("Compression failed");
    } finally {
      originalInput.value = "";
    }
  });

  compressedInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      compressedBytes = new Uint8Array(buffer);
      setMeta(compressedMeta, `${file.name} • ${compressedBytes.length} bytes`);
      setInfo("Loaded .gz file");
    } catch (err) {
      setInfo("Failed to load .gz file");
    } finally {
      compressedInput.value = "";
    }
  });

  decompressBtn?.addEventListener("click", () => {
    try {
      if (!compressedBytes?.length) {
        setInfo("Select a .gz file first");
        return;
      }
      const inflated = window.pako.ungzip(compressedBytes);
      decompressedText = new TextDecoder().decode(inflated);
      setMeta(originalMeta, `Recovered • ${inflated.length} bytes`);
      setInfo(`Decompressed to ${inflated.length} bytes`);
    } catch (err) {
      setInfo("Decompression failed");
    }
  });

  downloadGzBtn?.addEventListener("click", () => {
    try {
      if (!compressedBytes?.length) {
        setInfo("Select a file to compress first");
        return;
      }
      downloadBlob(new Blob([compressedBytes], { type: "application/gzip" }), "vault-compare.gz");
      setInfo("Downloaded vault-compare.gz");
    } catch (err) {
      setInfo("Download failed");
    }
  });

  downloadTextBtn?.addEventListener("click", () => {
    const text = decompressedText || "";
    if (!text.trim()) {
      setInfo("Nothing to download");
      return;
    }
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "vault-compare.txt");
    setInfo("Downloaded vault-compare.txt");
  });
}

function wireNoteModal() {
  const modal = document.getElementById("noteModal");
  const bodyInput = document.getElementById("noteModalBody");
  const status = document.getElementById("noteModalStatus");
  const fallback = document.getElementById("noteFallback");
  const saveBtn = document.getElementById("noteSaveBtn");
  const downloadBtn = document.getElementById("noteDownloadBtn");
  const closeBtn = document.getElementById("noteCloseBtn");
  if (!modal || !bodyInput) return;

  const saved = readLocal("note_modal") || "";
  bodyInput.value = saved;
  initNoteEditor(saved);
  if (fallback) {
    fallback.value = saved;
    fallback.addEventListener("input", () => {
      bodyInput.value = fallback.value || "";
      writeLocal("note_modal", bodyInput.value);
    });
  }

  saveBtn?.addEventListener("click", () => {
    syncNoteInput();
    writeLocal("note_modal", bodyInput.value);
    setStatus("Saved locally", "success");
  });

  downloadBtn?.addEventListener("click", () => {
    syncNoteInput();
    const blob = new Blob([bodyInput.value || ""], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "secure-note.html";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded .html", "success");
  });

  closeBtn?.addEventListener("click", closeNoteModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeNoteModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNoteModal();
  });

  function syncNoteInput() {
    if (bodyInput && state.noteEditor && typeof state.noteEditor.getValue === "function") {
      bodyInput.value = state.noteEditor.getValue() || "";
      if (fallback) fallback.value = bodyInput.value;
      return;
    }
    if (fallback) bodyInput.value = fallback.value || "";
  }

  function setStatus(msg, tone) {
    if (!status) return;
    status.textContent = msg;
    status.className =
      "text-xs font-semibold " +
      (tone === "success"
        ? "text-emerald-700"
        : tone === "info"
          ? "text-rose-700"
          : "text-rose-700");
  }
}

function openNoteModal() {
  const modal = document.getElementById("noteModal");
  if (!modal) return;
  const bodyInput = document.getElementById("noteModalBody");
  const saved = readLocal("note_modal") || "";
  if (bodyInput) bodyInput.value = saved;
  initNoteEditor(saved);
  modal.classList.remove("hidden");
  const editable = document.querySelector("#noteEditor [contenteditable='true']");
  editable?.focus();
}

function closeNoteModal() {
  document.getElementById("noteModal")?.classList.add("hidden");
}

function initNoteEditor(initialHtml = "") {
  const container = document.getElementById("noteEditor");
  const hidden = document.getElementById("noteModalBody");
  const fallback = document.getElementById("noteFallback");
  if (!container || !hidden || typeof window === "undefined" || !window.makeRichText) return;

  if (fallback) fallback.classList.add("hidden");

  if (state.noteEditor && typeof state.noteEditor.setValue === "function") {
    state.noteEditor.setValue(initialHtml || "");
    hidden.value = initialHtml || "";
    return;
  }

  state.noteEditor = window.makeRichText({
    container,
    language: "EN",
    initialValue: initialHtml || "",
    allowedFileTypes: ["image/png", "image/jpeg", "image/webp"],
    onValueChange(html) {
      hidden.value = html || "";
      writeLocal("note_modal", hidden.value);
    },
    textAreaProps: {
      className: "rte-body",
      editorStyle: {
        minHeight: "12rem",
        padding: "12px",
        border: "1px solid #fecdd3",
        borderRadius: "12px",
        background: "#fff",
      },
    },
  });

  if (typeof state.noteEditor.getValue === "function") {
    hidden.value = state.noteEditor.getValue() || "";
  }
}

function initUploadQueue() {
  const body = document.getElementById("uploadQueueBody");
  if (!body) return;
  body.innerHTML = `<tr><td colspan="5" class="px-3 py-3 text-center text-rose-700">Pending uploads will appear here.</td></tr>`;
}

function pushUploadEntry(entry) {
  const body = document.getElementById("uploadQueueBody");
  if (!body) return;
  const rows = Array.from(body.querySelectorAll("tr[data-row]"));
  const newRow = document.createElement("tr");
  newRow.setAttribute("data-row", "true");
  newRow.innerHTML = `
    <td class="px-3 py-2">${escapeHtml(entry.name)}</td>
    <td class="px-3 py-2 capitalize">${escapeHtml(entry.type || "other")}</td>
    <td class="px-3 py-2 text-right">${formatBytes(entry.size || 0)}</td>
    <td class="px-3 py-2 text-right">${escapeHtml(entry.status || "Queued")}</td>
    <td class="px-3 py-2 text-right space-x-2">
      <button class="text-rose-700 underline" data-queue-share>Share</button>
      <button class="text-rose-700 underline" data-queue-encrypt>Encrypt</button>
      <button class="text-rose-700 underline" data-queue-delete>Delete</button>
    </td>
  `;
  if (!rows.length) body.innerHTML = "";
  body.prepend(newRow);

  newRow.querySelector("[data-queue-share]")?.addEventListener("click", () => {
    notify("Share link generated (demo).", "success", "Upload");
  });
  newRow.querySelector("[data-queue-encrypt]")?.addEventListener("click", () => {
    notify("File is already encrypted client-side (demo).", "info", "Upload");
  });
  newRow.querySelector("[data-queue-delete]")?.addEventListener("click", () => {
    newRow.remove();
    if (!body.querySelectorAll("tr[data-row]").length) initUploadQueue();
    notify("Upload entry removed (demo).", "info", "Upload");
  });
}

function wireAvatar() {
  const pickBtn = document.getElementById("avatarPickBtn");
  const uploadBtn = document.getElementById("uploadAvatarBtn");
  const avatarInput = document.getElementById("avatarInput");
  const avatarImg = document.getElementById("userAvatar");
  const avatarFallback = document.getElementById("userAvatarFallback");
  const avatarLabel = document.getElementById("userAvatarLabel");
  const previewImg = document.getElementById("avatarPreview");
  const previewFallback = document.getElementById("avatarPreviewFallback");
  const navAvatar = document.getElementById("navUserAvatar");
  const navAvatarMobile = document.getElementById("navUserAvatarMobile");
  const navLabel = document.getElementById("navUserLabel");
  const navLabelMobile = document.getElementById("navUserLabelMobile");

  const applyAvatar = (url) => {
    state.avatarUrl = url || "";
    const has = Boolean(url);
    [avatarImg, previewImg].forEach((img) => {
      if (!img) return;
      img.src = url || "";
      img.classList.toggle("hidden", !has);
    });
    [avatarFallback, previewFallback].forEach((el) => {
      if (!el) return;
      el.classList.toggle("hidden", has);
      el.textContent = getUserInitials();
    });
    [navAvatar, navAvatarMobile].forEach((el) => {
      if (!el) return;
      el.textContent = getUserInitials();
    });
    const labelText = getUserDisplayName();
    [navLabel, navLabelMobile].forEach((el) => {
      if (!el) return;
      el.textContent = labelText;
    });
    [avatarLabel].forEach((el) => {
      if (!el) return;
      el.textContent = has ? "Custom avatar" : labelText;
    });
  };

  const saved = readLocal("avatar_url");
  if (saved) applyAvatar(saved);
  else applyAvatar("");

  const triggerPicker = () => avatarInput?.click();
  pickBtn?.addEventListener("click", triggerPicker);
  uploadBtn?.addEventListener("click", triggerPicker);
}

function setAvatarFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    if (typeof dataUrl === "string") {
      writeLocal("avatar_url", dataUrl);
      state.avatarUrl = dataUrl;
      wireAvatar(); // re-apply visuals
      notify("Avatar updated (stored locally).", "success", "Avatar");
    }
  };
  reader.readAsDataURL(file);
}

function inferType(mime, filename = "") {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.includes("pdf") || mime?.includes("word") || /\.docx?$|\.pdf$/i.test(filename))
    return "doc";
  return "other";
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

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function getDeviceFingerprint() {
  const cached = readLocal("device_fingerprint");
  if (cached) return cached;
  const parts = [
    navigator.userAgent || "",
    navigator.language || "",
    `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    navigator.platform || "",
  ];
  const raw = parts.join("|");
  const encoded = btoa(unescape(encodeURIComponent(raw))).slice(0, 120);
  writeLocal("device_fingerprint", encoded);
  return encoded;
}

function getAuthHeaders() {
  const headers = {};
  const userId = readUserId();
  if (userId) headers["x-user-id"] = userId;
  const fingerprint = getDeviceFingerprint();
  if (fingerprint) headers["x-device-fingerprint"] = fingerprint;
  return headers;
}

function getUserDisplayName(user = state.currentUser) {
  if (user?.username) return user.username;
  if (user?.email) return user.email;
  const uid = readUserId();
  if (uid) return `User ${uid.slice(0, 6)}`;
  return "User";
}

function getUserInitials(user = state.currentUser) {
  const source = user?.username || user?.email || readUserId() || "U";
  const match = String(source).match(/[A-Za-z]/);
  return (match?.[0] || "U").toUpperCase();
}

function updateNavUserDisplay() {
  const navAvatar = document.getElementById("navUserAvatar");
  const navAvatarMobile = document.getElementById("navUserAvatarMobile");
  const navLabel = document.getElementById("navUserLabel");
  const navLabelMobile = document.getElementById("navUserLabelMobile");
  const avatarFallback = document.getElementById("userAvatarFallback");
  const previewFallback = document.getElementById("avatarPreviewFallback");
  const labelText = getUserDisplayName();
  const initials = getUserInitials();

  [navAvatar, navAvatarMobile].forEach((el) => {
    if (el) el.textContent = initials;
  });
  [navLabel, navLabelMobile].forEach((el) => {
    if (el) el.textContent = labelText;
  });
  [avatarFallback, previewFallback].forEach((el) => {
    if (el && !el.classList.contains("hidden")) el.textContent = initials;
  });
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

function readLocal(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return "";
  }
}

function writeLocal(key, value) {
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
