const DEFAULT_DURATION_MS = 3600;
const MAX_VISIBLE_TOASTS = 4;

const TONE_STYLES = {
  info: "border-sky-200/90 bg-sky-50/95 text-sky-900",
  success: "border-emerald-200/90 bg-emerald-50/95 text-emerald-900",
  error: "border-rose-300/95 bg-rose-50/95 text-rose-900",
};

let notyfInstance = null;

function resolveNotyfType(tone) {
  if (tone === "success" || tone === "error" || tone === "info") return tone;
  return "info";
}

function getNotyfInstance() {
  if (notyfInstance) return notyfInstance;
  if (!window.Notyf) return null;

  notyfInstance = new window.Notyf({
    duration: DEFAULT_DURATION_MS,
    dismissible: true,
    ripple: true,
    position: {
      x: "center",
      y: "top",
    },
    types: [
      { type: "success", background: "#10b981", icon: false },
      { type: "error", background: "#ef4444", icon: false },
      { type: "info", background: "#0ea5e9", icon: false },
    ],
  });

  return notyfInstance;
}

function getToastRegion() {
  return document.getElementById("appToastRegion");
}

function createToastNode(message, options) {
  const tone = options.tone || "info";
  const styleClass = TONE_STYLES[tone] || TONE_STYLES.info;
  const title = options.title ? String(options.title) : "";

  const node = document.createElement("article");
  node.className = `pointer-events-auto rounded-xl border px-3 py-2 shadow-lg backdrop-blur-md ${styleClass}`;
  node.setAttribute("role", tone === "error" ? "alert" : "status");
  node.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");

  const topRow = document.createElement("div");
  topRow.className = "flex items-start justify-between gap-3";

  const content = document.createElement("div");
  content.className = "min-w-0";

  if (title) {
    const titleNode = document.createElement("p");
    titleNode.className = "text-sm font-black";
    titleNode.textContent = title;
    content.append(titleNode);
  }

  const messageNode = document.createElement("p");
  messageNode.className = "text-xs font-semibold";
  messageNode.textContent = String(message || "");
  content.append(messageNode);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className =
    "rounded-md px-2 py-1 text-[11px] font-bold transition hover:bg-white/55 focus:outline-none focus:ring-2 focus:ring-white/80";
  closeButton.setAttribute("aria-label", "Dismiss notification");
  closeButton.textContent = "Close";

  topRow.append(content, closeButton);
  node.append(topRow);

  closeButton.addEventListener("click", () => {
    node.remove();
  });

  return node;
}

export function showToast(message, options = {}) {
  if (!message) return;

  const durationMs = Number.isFinite(options.durationMs)
    ? Math.max(1200, Number(options.durationMs))
    : DEFAULT_DURATION_MS;
  const tone = resolveNotyfType(options.tone || "info");
  const titlePrefix = options.title ? `${String(options.title)}: ` : "";
  const content = `${titlePrefix}${String(message)}`;

  const notyf = getNotyfInstance();
  if (notyf) {
    notyf.open({
      type: tone,
      message: content,
      duration: options.persistent ? 0 : durationMs,
      dismissible: true,
    });
    return;
  }

  const region = getToastRegion();
  if (!region) return;

  const toast = createToastNode(content, { tone });
  region.prepend(toast);

  while (region.childElementCount > MAX_VISIBLE_TOASTS) {
    const oldest = region.lastElementChild;
    if (!oldest) break;
    oldest.remove();
  }

  if (!options.persistent) {
    window.setTimeout(() => {
      toast.remove();
    }, durationMs);
  }
}
