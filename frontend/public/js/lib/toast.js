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
  const actionLabel = options.actionLabel ? String(options.actionLabel) : "";
  const onAction = typeof options.onAction === "function" ? options.onAction : null;

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

  const actions = document.createElement("div");
  actions.className = "flex items-center gap-2";

  if (actionLabel && onAction) {
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className =
      "rounded-md px-2 py-1 text-[11px] font-bold text-rose-900 transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-white/80";
    actionButton.textContent = actionLabel;
    actionButton.addEventListener("click", (event) => {
      event.stopPropagation();
      onAction();
      node.remove();
    });
    actions.append(actionButton);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className =
    "rounded-md px-2 py-1 text-[11px] font-bold transition hover:bg-white/55 focus:outline-none focus:ring-2 focus:ring-white/80";
  closeButton.setAttribute("aria-label", "Dismiss notification");
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    node.remove();
  });

  actions.append(closeButton);

  topRow.append(content, actions);
  node.append(topRow);

  return node;
}

export function showToast(message, options = {}) {
  if (!message) return;

  const durationMs = Number.isFinite(options.durationMs)
    ? Math.max(1200, Number(options.durationMs))
    : DEFAULT_DURATION_MS;
  const tone = resolveNotyfType(options.tone || "info");
  const title = options.title ? String(options.title) : "";
  const rawMessage = String(message);
  const hasAction = Boolean(options.actionLabel && typeof options.onAction === "function");

  const notyf = getNotyfInstance();
  if (notyf && !hasAction && options.forceCustom !== true) {
    notyf.open({
      type: tone,
      message: title ? `${title}: ${rawMessage}` : rawMessage,
      duration: options.persistent ? 0 : durationMs,
      dismissible: true,
    });
    return;
  }

  const region = getToastRegion();
  if (!region) return;

  const toast = createToastNode(rawMessage, {
    tone,
    title,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
  });
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
