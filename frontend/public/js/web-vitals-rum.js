const ALLOWED_METRICS = new Set(["LCP", "CLS", "INP", "FIELD_ACTIVE_MS"]);

function sendMetric(payload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/rum", body);
    return;
  }
  fetch("/api/rum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function createBasePayload(name, value, extra = {}) {
  return {
    name,
    value,
    path: window.location.pathname,
    page: document.body?.dataset?.page || "",
    connectionType: navigator.connection?.effectiveType || "",
    timestamp: new Date().toISOString(),
    phase: window.__rumPhase || "",
    ...extra,
  };
}

function observeLcp() {
  let latest = null;
  const observer = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    if (!entries.length) return;
    latest = entries[entries.length - 1];
  });

  try {
    observer.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    return;
  }

  const flush = () => {
    if (!latest) return;
    sendMetric(createBasePayload("LCP", Number(latest.startTime.toFixed(2))));
    observer.disconnect();
    latest = null;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush, { once: true });
}

function observeCls() {
  let total = 0;
  let sessionValue = 0;
  let sessionEntries = [];

  const observer = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      if (
        sessionEntries.length &&
        entry.startTime - sessionEntries[sessionEntries.length - 1].startTime < 1000 &&
        entry.startTime - sessionEntries[0].startTime < 5000
      ) {
        sessionValue += entry.value;
        sessionEntries.push(entry);
      } else {
        sessionValue = entry.value;
        sessionEntries = [entry];
      }
      total = Math.max(total, sessionValue);
    }
  });

  try {
    observer.observe({ type: "layout-shift", buffered: true });
  } catch {
    return;
  }

  const flush = () => {
    sendMetric(createBasePayload("CLS", Number(total.toFixed(4))));
    observer.disconnect();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush, { once: true });
}

function observeInp() {
  let longest = 0;
  const observer = new PerformanceObserver((entryList) => {
    const entries = entryList.getEntries();
    for (const entry of entries) {
      const latency = entry.duration || 0;
      if (latency > longest) longest = latency;
    }
  });

  try {
    observer.observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch {
    return;
  }

  const flush = () => {
    if (longest <= 0) return;
    sendMetric(createBasePayload("INP", Number(longest.toFixed(2))));
    observer.disconnect();
    longest = 0;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush, { once: true });
}

function observeFieldTiming() {
  const focusedAt = new WeakMap();

  document.addEventListener("focusin", (event) => {
    const node = event.target;
    if (!(node instanceof HTMLElement)) return;
    if (!node.matches("input, select, textarea")) return;
    focusedAt.set(node, performance.now());
  });

  document.addEventListener("focusout", (event) => {
    const node = event.target;
    if (!(node instanceof HTMLElement)) return;
    if (!node.matches("input, select, textarea")) return;

    const startedAt = focusedAt.get(node);
    if (typeof startedAt !== "number") return;
    focusedAt.delete(node);

    const duration = performance.now() - startedAt;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const fieldName = node.getAttribute("name") || node.getAttribute("id") || "";
    sendMetric(
      createBasePayload("FIELD_ACTIVE_MS", Number(duration.toFixed(2)), {
        fieldName: fieldName.slice(0, 120),
      })
    );
  });
}

function initVitalsCollection() {
  observeLcp();
  observeCls();
  observeInp();
  observeFieldTiming();
}

if (typeof window !== "undefined" && typeof PerformanceObserver !== "undefined") {
  initVitalsCollection();
}

export { ALLOWED_METRICS };
