import { createApiClient } from "../../lib/api-client.js";
import { adminLoginSchema } from "../../lib/auth-schemas.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("adminLoginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const submitButton = document.getElementById("adminLoginBtn");
  const flashNode = document.getElementById("adminFlash");
  const formShell = document.getElementById("adminLoginFormShell");
  const FORM_SKELETON_MIN_MS = 800;

  if (!form || !usernameInput || !passwordInput || !submitButton) return;

  const apiClient = createApiClient({
    retries: 0,
    timeoutMs: 5000,
    onUnauthorized: () => {
      window.location.href = "/admin/login";
    },
  });

  const revealForm = () => {
    if (!formShell) return;
    window.setTimeout(() => {
      formShell.classList.remove("auth-form-loading");
      formShell.classList.add("auth-form-ready");
    }, FORM_SKELETON_MIN_MS);
  };
  revealForm();

  const setFlash = (message, tone = "info") => {
    if (!flashNode) return;
    if (!message) {
      flashNode.textContent = "";
      return;
    }
    const tones = {
      info: "mt-4 rounded-xl border border-fuchsia-200 bg-fuchsia-100/90 p-3 text-sm font-semibold text-fuchsia-900",
      error:
        "mt-4 rounded-xl border border-rose-300 bg-rose-100/90 p-3 text-sm font-semibold text-rose-900",
      success:
        "mt-4 rounded-xl border border-emerald-300 bg-emerald-100/90 p-3 text-sm font-semibold text-emerald-900",
    };
    flashNode.className = tones[tone] || tones.info;
    flashNode.textContent = message;
  };

  const updateButtonState = () => {
    const parse = adminLoginSchema.safeParse({
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    });
    submitButton.disabled = !parse.success;
  };

  usernameInput.addEventListener("input", updateButtonState);
  passwordInput.addEventListener("input", updateButtonState);
  usernameInput.addEventListener("change", updateButtonState);
  passwordInput.addEventListener("change", updateButtonState);
  updateButtonState();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parse = adminLoginSchema.safeParse({
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    });
    if (!parse.success) {
      setFlash(parse.error?.issues?.[0]?.message || "Enter both username and password.", "error");
      return;
    }

    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = "Checking...";
    setFlash("", "info");

    try {
      await apiClient.request("/health", {
        method: "GET",
        cache: false,
      });
      form.submit();
    } catch (error) {
      setFlash(error.message || "Unable to verify admin endpoint right now.", "error");
      submitButton.textContent = originalText;
      updateButtonState();
    }
  });
});
