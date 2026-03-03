"use strict";

import { showToast } from "./toast.js";

const PROGRESS_ATTR = "data-upload-progress";

export function wireUploadProgress(form, options = {}) {
  if (!form || form.dataset.uploadProgressBound === "true") return;
  form.dataset.uploadProgressBound = "true";

  const targetSelector = options.targetSelector || form.getAttribute("data-progress-target");
  const progress = ensureProgressBar(form, targetSelector);
  const autoResetMs = Number.isFinite(options.autoResetMs) ? options.autoResetMs : 1200;

  form.addEventListener("submit", (event) => {
    if (form.dataset.uploadProgressDisabled === "true") return;
    event.preventDefault();

    const action = form.getAttribute("action") || window.location.href;
    const method = (form.getAttribute("method") || "POST").toUpperCase();
    const formData = new FormData(form);
    const xhr = new XMLHttpRequest();

    xhr.open(method, action, true);
    xhr.responseType = "json";
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

    xhr.upload.onprogress = (progressEvent) => {
      if (!progressEvent.lengthComputable) return;
      const percent = Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100));
      progress.set(percent, `${percent}%`);
    };

    xhr.onloadstart = () => {
      progress.show();
      progress.set(2, "Starting…");
      form.dispatchEvent(new CustomEvent("upload:start", { bubbles: true }));
    };

    xhr.onerror = () => {
      progress.set(0, "Failed");
      showToast("Upload failed. Please try again.", { tone: "error", title: "Upload" });
      form.dispatchEvent(
        new CustomEvent("upload:error", { bubbles: true, detail: { status: xhr.status } })
      );
    };

    xhr.onload = () => {
      const status = xhr.status;
      const ok = status >= 200 && status < 300;
      const response = xhr.response || {};
      progress.set(100, ok ? "Uploaded" : "Error");
      if (ok) {
        showToast("Upload completed.", { tone: "success", title: "Upload" });
        form.dispatchEvent(
          new CustomEvent("upload:complete", { bubbles: true, detail: { status, response } })
        );
        window.setTimeout(progress.hide, autoResetMs);
      } else {
        showToast(response.error || "Upload failed.", { tone: "error", title: "Upload" });
        form.dispatchEvent(
          new CustomEvent("upload:error", { bubbles: true, detail: { status, response } })
        );
      }
    };

    xhr.send(formData);
  });
}

export function autoWireUploadProgress(root = document) {
  const forms = Array.from(root.querySelectorAll(`form[${PROGRESS_ATTR}]`));
  forms.forEach((form) => wireUploadProgress(form));
}

function ensureProgressBar(form, targetSelector) {
  const host =
    (targetSelector && form.querySelector(targetSelector)) ||
    form.querySelector("[data-upload-progress-host]") ||
    form;

  let container = host.querySelector(".upload-progress");
  if (!container) {
    container = document.createElement("div");
    container.className =
      "upload-progress mt-3 w-full rounded-xl border border-rose-200 bg-white/80 p-2 shadow-inner";
    host.append(container);
  }

  let bar = container.querySelector(".upload-progress__bar");
  let label = container.querySelector(".upload-progress__label");
  if (!bar) {
    bar = document.createElement("div");
    bar.className =
      "upload-progress__bar h-2 rounded-lg bg-gradient-to-r from-orange-400 to-rose-600 transition-all duration-200 ease-out";
    bar.style.width = "0%";
    container.append(bar);
  }
  if (!label) {
    label = document.createElement("p");
    label.className = "upload-progress__label mt-1 text-xs font-semibold text-rose-900";
    label.textContent = "Waiting to upload…";
    container.append(label);
  }

  const set = (percent, text) => {
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    bar.style.width = `${clamped}%`;
    label.textContent = text || `${clamped}%`;
  };

  const show = () => {
    container.classList.remove("hidden");
    container.setAttribute("aria-hidden", "false");
  };

  const hide = () => {
    container.classList.add("hidden");
    container.setAttribute("aria-hidden", "true");
    set(0, "Waiting to upload…");
  };

  hide(); // start hidden

  return { set, show, hide, container };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => autoWireUploadProgress());
} else {
  autoWireUploadProgress();
}
