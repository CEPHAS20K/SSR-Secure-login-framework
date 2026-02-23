import { createApiClient } from "../../lib/api-client.js";
import { adminLoginSchema } from "../../lib/auth-schemas.js";
import { getIssueMessageForPath } from "../../lib/auth-form-ux.js";
import { showToast } from "../../lib/toast.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("adminLoginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const submitButton = document.getElementById("adminLoginBtn");
  const usernameError = document.getElementById("adminUsernameError");
  const passwordError = document.getElementById("adminPasswordError");
  const capsWarning = document.getElementById("adminCapsWarning");
  const serverErrorInput = document.getElementById("adminServerError");
  const formShell = document.getElementById("adminLoginFormShell");
  const FORM_SKELETON_MIN_MS = 220;
  const touched = new Set();

  if (!form || !usernameInput || !passwordInput || !submitButton) return;

  const apiClient = createApiClient({
    retries: 0,
    timeoutMs: 5000,
    onUnauthorized: () => {
      window.location.href = "/admin/login";
    },
  });

  const notify = (message, tone = "info", title = "Admin") => {
    if (!message) return;
    showToast(message, { tone, title });
  };

  const setFieldState = (input, errorNode, message) => {
    if (!input || !errorNode) return;
    const hasError = Boolean(message);
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
    errorNode.textContent = message || "";
    errorNode.classList.toggle("hidden", !hasError);
    errorNode.setAttribute("aria-hidden", hasError ? "false" : "true");
  };

  const revealForm = () => {
    if (!formShell) return;
    window.setTimeout(() => {
      formShell.classList.remove("auth-form-loading");
      formShell.classList.add("auth-form-ready");
    }, FORM_SKELETON_MIN_MS);
  };
  revealForm();

  const shouldShowError = (fieldName, inputNode, showAll) => {
    if (showAll) return true;
    if (touched.has(fieldName)) return true;
    return Boolean(String(inputNode?.value || "").trim());
  };

  const updateButtonState = (options = {}) => {
    const showErrors = Boolean(options.showErrors);
    const parse = adminLoginSchema.safeParse({
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    });
    submitButton.disabled = !parse.success;

    const usernameMessage = shouldShowError("username", usernameInput, showErrors)
      ? getIssueMessageForPath(parse, "username")
      : "";
    const passwordMessage = shouldShowError("password", passwordInput, showErrors)
      ? getIssueMessageForPath(parse, "password")
      : "";

    setFieldState(usernameInput, usernameError, usernameMessage);
    setFieldState(passwordInput, passwordError, passwordMessage);
  };

  const updateCapsWarning = (event) => {
    if (!capsWarning || typeof event?.getModifierState !== "function") return;
    const active = Boolean(event.getModifierState("CapsLock"));
    capsWarning.classList.toggle("hidden", !active);
    capsWarning.setAttribute("aria-hidden", active ? "false" : "true");
  };

  const hideCapsWarning = () => {
    if (!capsWarning) return;
    capsWarning.classList.add("hidden");
    capsWarning.setAttribute("aria-hidden", "true");
  };
  passwordInput.addEventListener("keydown", updateCapsWarning);
  passwordInput.addEventListener("keyup", updateCapsWarning);
  passwordInput.addEventListener("blur", hideCapsWarning);

  usernameInput.addEventListener("input", () => {
    touched.add("username");
    updateButtonState();
  });
  passwordInput.addEventListener("input", () => {
    touched.add("password");
    updateButtonState();
  });
  usernameInput.addEventListener("blur", () => {
    touched.add("username");
    updateButtonState();
  });
  passwordInput.addEventListener("blur", () => {
    touched.add("password");
    updateButtonState();
  });
  updateButtonState();

  const serverErrorMessage = String(serverErrorInput?.value || "").trim();
  if (serverErrorMessage) {
    notify(serverErrorMessage, "error", "Admin login");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parse = adminLoginSchema.safeParse({
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    });
    if (!parse.success) {
      updateButtonState({ showErrors: true });
      notify(parse.error?.issues?.[0]?.message || "Enter both username and password.", "error");
      return;
    }

    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = "Checking...";

    try {
      await apiClient.request("/health", {
        method: "GET",
        cache: false,
      });
      form.submit();
    } catch (error) {
      notify(error.message || "Unable to verify admin endpoint right now.", "error", "Admin login");
      submitButton.textContent = originalText;
      updateButtonState();
    }
  });
});
