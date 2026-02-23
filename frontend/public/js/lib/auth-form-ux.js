function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getIssueMessageForPath(parseResult, path, fallback = "") {
  if (!parseResult || parseResult.success) return "";
  const issues = Array.isArray(parseResult.error?.issues) ? parseResult.error.issues : [];
  const matched = issues.find((issue) => issue?.path?.[0] === path);
  if (matched?.message) return matched.message;
  return issues[0]?.message || fallback;
}

export function setInlineFieldState(input, errorNode, message) {
  if (!input) return;
  const hasError = Boolean(message);
  input.setAttribute("aria-invalid", hasError ? "true" : "false");

  if (!errorNode) return;
  errorNode.textContent = message || "";
  errorNode.classList.toggle("invisible", !hasError);
  errorNode.setAttribute("aria-hidden", hasError ? "false" : "true");
}

export function bindCapsLockWarning(input, warningNode) {
  if (!input || !warningNode) return () => {};

  const update = (event) => {
    if (typeof event?.getModifierState !== "function") return;
    const active = Boolean(event.getModifierState("CapsLock"));
    warningNode.classList.toggle("invisible", !active);
    warningNode.setAttribute("aria-hidden", active ? "false" : "true");
  };

  const hide = () => {
    warningNode.classList.add("invisible");
    warningNode.setAttribute("aria-hidden", "true");
  };

  input.addEventListener("keydown", update);
  input.addEventListener("keyup", update);
  input.addEventListener("blur", hide);

  return () => {
    input.removeEventListener("keydown", update);
    input.removeEventListener("keyup", update);
    input.removeEventListener("blur", hide);
  };
}

export function createPasswordStrengthMeter(options = {}) {
  const input = options.input;
  const bar = options.bar;
  const label = options.label;
  if (!input || !bar || !label) return { update: () => {} };

  const palette = [
    { className: "bg-rose-400", text: "weak" },
    { className: "bg-orange-400", text: "fair" },
    { className: "bg-amber-400", text: "good" },
    { className: "bg-emerald-500", text: "strong" },
  ];

  const update = (password = "") => {
    const value = String(password || "");
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    const level = clamp(score - 1, 0, 3);
    const percent = clamp(((score || 1) / 5) * 100, 10, 100);
    const tone = palette[level];

    bar.style.width = `${percent}%`;
    bar.classList.remove("bg-rose-400", "bg-orange-400", "bg-amber-400", "bg-emerald-500");
    bar.classList.add(tone.className);
    label.textContent = `Password strength: ${tone.text}`;
  };

  update(input.value);
  input.addEventListener("input", (event) => {
    update(event.target.value);
  });

  return { update };
}
