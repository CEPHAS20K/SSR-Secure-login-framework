import { createApiClient } from "../lib/api-client.js";
import {
  firstSchemaError,
  forgotPasswordSchema,
  loginSchema,
  otpSchema,
  resetAccountSchema,
} from "../lib/auth-schemas.js";
import { bindCapsLockWarning } from "../lib/auth-form-ux.js";
import { createModalFocusTrap } from "../lib/modal-a11y.js";
import { showToast } from "../lib/toast.js";

function safeReadStorage(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeWriteStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so login UX still works.
  }
}

function safeRemoveStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures so login UX still works.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const modal = document.getElementById("otpModal");
  const modalCard = modal ? modal.querySelector(".otp-card") : null;
  const togglePassword = document.getElementById("togglePassword");
  const otpSubmit = document.getElementById("otpSubmit");
  const otpInputs = Array.from(document.querySelectorAll("[data-otp-digit]"));
  const resendOtp = document.getElementById("resendOtp");
  const resendHint = document.getElementById("resendOtpHint");
  const otpClose = document.getElementById("otpClose");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const resetModal = document.getElementById("resetModal");
  const resetModalCard = resetModal ? resetModal.querySelector(".otp-card") : null;
  const resetClose = document.getElementById("resetClose");
  const resetCancel = document.getElementById("resetCancel");
  const resetEmail = document.getElementById("resetEmail");
  const resetNewPassword = document.getElementById("resetNewPassword");
  const resetConfirmPassword = document.getElementById("resetConfirmPassword");
  const resetSubmit = document.getElementById("resetSubmit");
  const resetCodeInputs = Array.from(document.querySelectorAll("[data-reset-digit]"));
  const resetCodeBlock = document.getElementById("resetCodeBlock");
  const passkeyModal = document.getElementById("passkeyModal");
  const passkeyModalCard = passkeyModal ? passkeyModal.querySelector(".otp-card") : null;
  const passkeyBegin = document.getElementById("passkeyBegin");
  const passkeyClose = document.getElementById("passkeyClose");
  const passkeyCancel = document.getElementById("passkeyCancel");
  const capsWarning = document.getElementById("capsWarning");
  const rememberMe = document.getElementById("rememberMe");
  const trustDevice = document.getElementById("trustDevice");
  const formShell = document.getElementById("loginFormShell");
  const OTP_COUNTDOWN_SECONDS = 5 * 60;
  const RESET_CODE_COUNTDOWN_SECONDS = 60;
  const FORM_SKELETON_MIN_MS = 220;
  const rememberedEmail = safeReadStorage("auth_email");
  let resendSecondsLeft = OTP_COUNTDOWN_SECONDS;
  let resendTimer = null;
  let resetResendSecondsLeft = 0;
  let resetResendTimer = null;
  let resetCodeVisible = false;
  let pendingUserId = null;
  let otpDemoMode = false;
  let loginLockoutSecondsLeft = 0;
  let loginLockoutTimer = null;
  const LOGIN_SUCCESS_REDIRECT = "/login";

  if (!form || !email || !password || !loginBtn || !modal || !togglePassword) return;

  const apiClient = createApiClient({
    retries: 1,
    timeoutMs: 5500,
    onUnauthorized: () => {},
  });

  const otpFocusTrap = createModalFocusTrap(modal, {
    onEscape: () => closeOtpModal(),
  });
  const resetFocusTrap = createModalFocusTrap(resetModal, {
    onEscape: () => closeResetModal(),
  });
  const passkeyFocusTrap = createModalFocusTrap(passkeyModal, {
    onEscape: () => closePasskeyModal(),
  });

  const setRumPhase = (phase) => {
    window.__rumPhase = phase || "";
  };

  const setButtonLoading = (button, isLoading, busyLabel) => {
    if (!button) return;
    if (button.dataset.locked === "true" && !isLoading) {
      button.disabled = true;
      return;
    }
    const labelNode = button.querySelector(".app-btn__label") || button;
    button.dataset.loading = isLoading ? "true" : "false";
    button.disabled = isLoading;
    if (labelNode) {
      if (isLoading && busyLabel) {
        labelNode.dataset.originalText = labelNode.dataset.originalText || labelNode.textContent;
        labelNode.textContent = busyLabel;
      } else if (!isLoading && labelNode.dataset.originalText) {
        labelNode.textContent = labelNode.dataset.originalText;
      }
    }
  };

  const setResetSubmitLabel = (mode) => {
    if (!resetSubmit) return;
    const labelNode = resetSubmit.querySelector(".app-btn__label") || resetSubmit;
    if (mode === "send") {
      labelNode.textContent = "Send Reset Code";
      resetSubmit.dataset.mode = "send";
      return;
    }
    labelNode.textContent = "Submit Reset";
    resetSubmit.dataset.mode = "reset";
  };

  const clearLoginLockout = () => {
    if (!loginBtn) return;
    if (loginLockoutTimer) {
      clearInterval(loginLockoutTimer);
      loginLockoutTimer = null;
    }
    loginLockoutSecondsLeft = 0;
    loginBtn.dataset.locked = "false";
    if (loginBtn.dataset.originalText) {
      const labelNode = loginBtn.querySelector(".app-btn__label") || loginBtn;
      labelNode.textContent = loginBtn.dataset.originalText;
    }
    updateButtonState();
  };

  const updateLoginLockoutLabel = () => {
    if (!loginBtn) return;
    const labelNode = loginBtn.querySelector(".app-btn__label") || loginBtn;
    loginBtn.dataset.originalText = loginBtn.dataset.originalText || labelNode.textContent;
    labelNode.textContent = `Locked (${formatTime(loginLockoutSecondsLeft)})`;
    loginBtn.disabled = true;
  };

  const startLoginLockout = (seconds) => {
    const normalized = Math.max(1, Number(seconds) || 0);
    if (!normalized) return;
    if (loginLockoutTimer) clearInterval(loginLockoutTimer);
    loginLockoutSecondsLeft = normalized;
    loginBtn.dataset.locked = "true";
    updateLoginLockoutLabel();
    loginLockoutTimer = setInterval(() => {
      loginLockoutSecondsLeft -= 1;
      if (loginLockoutSecondsLeft <= 0) {
        clearLoginLockout();
        return;
      }
      updateLoginLockoutLabel();
    }, 1000);
  };

  const notify = (message, tone = "info", title = "Status") => {
    if (!message) return;
    showToast(message, { tone, title, forceCustom: true });
  };

  const showRetryToast = (message, title, onRetry) => {
    showToast(message, {
      tone: "error",
      title,
      actionLabel: "Retry",
      onAction: onRetry,
    });
  };

  const revealForm = () => {
    if (!formShell) return;
    window.setTimeout(() => {
      formShell.classList.remove("auth-form-loading");
      formShell.classList.add("auth-form-ready");
    }, FORM_SKELETON_MIN_MS);
  };
  revealForm();

  if (rememberedEmail) {
    email.value = rememberedEmail;
    if (rememberMe) rememberMe.checked = true;
  }

  const updateButtonState = () => {
    if (loginBtn.dataset.loading === "true") {
      loginBtn.disabled = true;
      return;
    }
    if (loginLockoutSecondsLeft > 0) {
      loginBtn.disabled = true;
      return;
    }
    const parse = loginSchema.safeParse({
      email: email.value.trim(),
      password: password.value,
    });
    loginBtn.disabled = !parse.success;
  };

  const retryFormSubmit = () => {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }
    form.dispatchEvent(new Event("submit", { cancelable: true }));
  };

  const readOtpValue = () => otpInputs.map((el) => el.value.trim()).join("");
  const readResetCode = () => resetCodeInputs.map((el) => el.value.trim()).join("");

  const updateOtpSubmitState = () => {
    if (!otpSubmit || otpInputs.length === 0) return;
    if (otpSubmit.dataset.loading === "true") {
      otpSubmit.disabled = true;
      return;
    }
    const parse = otpSchema.safeParse(readOtpValue());
    otpSubmit.disabled = !parse.success;
  };

  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const updateResendState = () => {
    if (!resendOtp) return;
    if (resendOtp.dataset.loading === "true") {
      resendOtp.disabled = true;
      return;
    }
    const isReady = resendSecondsLeft <= 0;
    resendOtp.disabled = !isReady;
    resendOtp.textContent = isReady ? "Resend OTP" : `Resend (${formatTime(resendSecondsLeft)})`;
    resendOtp.classList.toggle("opacity-60", !isReady);
    resendOtp.classList.toggle("cursor-not-allowed", !isReady);
    if (resendHint) {
      resendHint.textContent = isReady
        ? "Didn’t get a code? You can resend now."
        : `You can resend in ${formatTime(resendSecondsLeft)}.`;
    }
  };

  const stopResendTimer = () => {
    if (!resendTimer) return;
    clearInterval(resendTimer);
    resendTimer = null;
  };

  const updateResetResendState = () => {
    // No visible resend button; keep timer for toast messages.
  };

  const stopResetResendTimer = () => {
    if (!resetResendTimer) return;
    clearInterval(resetResendTimer);
    resetResendTimer = null;
  };

  const setModalOpenState = (open) => {
    modal.classList.toggle("hidden", !open);
    modal.classList.toggle("flex", open);
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    modal.style.display = open ? "flex" : "none";
  };

  const closeOtpModal = () => {
    if (modal.classList.contains("hidden") && modal.style.display !== "flex") return;

    if (window.gsap) {
      if (modalCard) {
        gsap.to(modalCard, {
          y: 12,
          scale: 0.98,
          autoAlpha: 0,
          duration: 0.2,
          ease: "power1.in",
        });
      }
      gsap.to(modal, {
        autoAlpha: 0,
        duration: 0.2,
        ease: "power1.in",
        onComplete: () => {
          stopResendTimer();
          setModalOpenState(false);
          otpFocusTrap.deactivate();
          gsap.set(modal, { clearProps: "opacity,visibility" });
          if (modalCard) gsap.set(modalCard, { clearProps: "opacity,transform" });
        },
      });
      return;
    }

    stopResendTimer();
    setModalOpenState(false);
    otpFocusTrap.deactivate();
  };

  const openOtpModal = () => {
    setModalOpenState(true);
    startResendTimer();
    otpInputs.forEach((input) => {
      input.value = "";
      input.classList.remove("ring-2", "ring-rose-400");
    });
    updateOtpSubmitState();
    const first = otpInputs[0];
    if (first) first.focus();

    if (!window.gsap) {
      otpFocusTrap.activate({ initialFocus: otpInputs[0] || modal });
      return;
    }

    gsap.fromTo(modal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "power1.out" });
    if (modalCard) {
      gsap.fromTo(
        modalCard,
        { y: 18, scale: 0.96, autoAlpha: 0 },
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () => otpFocusTrap.activate({ initialFocus: otpInputs[0] || modal }),
        }
      );
    }
  };

  const isOtpModalOpen = () =>
    modal && !modal.classList.contains("hidden") && modal.style.display === "flex";

  const startResendTimer = (duration = OTP_COUNTDOWN_SECONDS) => {
    stopResendTimer();
    resendSecondsLeft = duration;
    updateResendState();

    resendTimer = setInterval(() => {
      resendSecondsLeft -= 1;
      if (resendSecondsLeft <= 0) {
        resendSecondsLeft = 0;
        stopResendTimer();
      }
      updateResendState();
    }, 1000);
  };

  const startResetResendTimer = (duration = RESET_CODE_COUNTDOWN_SECONDS) => {
    stopResetResendTimer();
    resetResendSecondsLeft = duration;
    updateResetResendState();

    resetResendTimer = setInterval(() => {
      resetResendSecondsLeft -= 1;
      if (resetResendSecondsLeft <= 0) {
        resetResendSecondsLeft = 0;
        stopResetResendTimer();
      }
      updateResetResendState();
    }, 1000);
  };

  const isResetModalReady = Boolean(
    forgotPasswordLink &&
    resetModal &&
    resetEmail &&
    resetNewPassword &&
    resetConfirmPassword &&
    resetSubmit &&
    resetCodeInputs.length
  );

  const setResetModalOpenState = (open) => {
    if (!resetModal) return;
    resetModal.classList.toggle("hidden", !open);
    resetModal.classList.toggle("flex", open);
    resetModal.setAttribute("aria-hidden", open ? "false" : "true");
    resetModal.style.display = open ? "flex" : "none";
  };

  const updateResetSubmitState = () => {
    if (!isResetModalReady) return;
    if (resetSubmit.dataset.loading === "true") {
      resetSubmit.disabled = true;
      return;
    }
    if (!resetCodeVisible) {
      const parse = forgotPasswordSchema.safeParse({
        email: resetEmail.value.trim(),
      });
      resetSubmit.disabled = !parse.success;
      return parse;
    }
    const parse = resetAccountSchema.safeParse({
      email: resetEmail.value.trim(),
      code: readResetCode(),
      newPassword: resetNewPassword.value,
      confirmPassword: resetConfirmPassword.value,
    });
    resetSubmit.disabled = !parse.success;
    return parse;
  };

  const closeResetModal = () => {
    if (!resetModal) return;
    if (resetModal.classList.contains("hidden") && resetModal.style.display !== "flex") return;

    if (window.gsap) {
      if (resetModalCard) {
        gsap.to(resetModalCard, {
          y: 12,
          scale: 0.98,
          autoAlpha: 0,
          duration: 0.2,
          ease: "power1.in",
        });
      }
      gsap.to(resetModal, {
        autoAlpha: 0,
        duration: 0.2,
        ease: "power1.in",
        onComplete: () => {
          stopResetResendTimer();
          setResetModalOpenState(false);
          resetFocusTrap.deactivate();
          gsap.set(resetModal, { clearProps: "opacity,visibility" });
          if (resetModalCard) gsap.set(resetModalCard, { clearProps: "opacity,transform" });
        },
      });
      return;
    }

    setResetModalOpenState(false);
    stopResetResendTimer();
    resetFocusTrap.deactivate();
  };

  const setPasskeyModalOpenState = (open) => {
    if (!passkeyModal) return;
    passkeyModal.classList.toggle("hidden", !open);
    passkeyModal.classList.toggle("flex", open);
    passkeyModal.setAttribute("aria-hidden", open ? "false" : "true");
    passkeyModal.style.display = open ? "flex" : "none";
  };

  const closePasskeyModal = () => {
    if (!passkeyModal) return;
    if (passkeyModal.classList.contains("hidden") && passkeyModal.style.display !== "flex") return;

    if (window.gsap) {
      if (passkeyModalCard) {
        gsap.to(passkeyModalCard, {
          y: 12,
          scale: 0.98,
          autoAlpha: 0,
          duration: 0.2,
          ease: "power1.in",
        });
      }
      gsap.to(passkeyModal, {
        autoAlpha: 0,
        duration: 0.2,
        ease: "power1.in",
        onComplete: () => {
          setPasskeyModalOpenState(false);
          passkeyFocusTrap.deactivate();
          gsap.set(passkeyModal, { clearProps: "opacity,visibility" });
          if (passkeyModalCard) gsap.set(passkeyModalCard, { clearProps: "opacity,transform" });
        },
      });
      return;
    }

    setPasskeyModalOpenState(false);
    passkeyFocusTrap.deactivate();
  };

  const openPasskeyModal = () => {
    if (!passkeyModal) return;
    setPasskeyModalOpenState(true);

    if (!window.gsap) {
      passkeyFocusTrap.activate({ initialFocus: passkeyBegin || passkeyModal });
      return;
    }

    gsap.fromTo(
      passkeyModal,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.2, ease: "power1.out" }
    );
    if (passkeyModalCard) {
      gsap.fromTo(
        passkeyModalCard,
        { y: 18, scale: 0.96, autoAlpha: 0 },
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () =>
            passkeyFocusTrap.activate({ initialFocus: passkeyBegin || passkeyModal }),
        }
      );
    }
  };

  const openResetModal = () => {
    if (!isResetModalReady) return;
    setResetModalOpenState(true);
    resetEmail.value = email.value.trim();
    resetNewPassword.value = "";
    resetConfirmPassword.value = "";
    resetCodeInputs.forEach((input) => {
      input.value = "";
      input.classList.remove("ring-2", "ring-rose-400");
    });
    resetCodeVisible = false;
    if (resetCodeBlock) resetCodeBlock.classList.add("hidden");
    setResetSubmitLabel("send");
    resetResendSecondsLeft = 0;
    stopResetResendTimer();
    updateResetResendState();
    updateResetSubmitState();

    if (!window.gsap) {
      resetFocusTrap.activate({ initialFocus: resetEmail });
      return;
    }

    gsap.fromTo(resetModal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "power1.out" });
    if (resetModalCard) {
      gsap.fromTo(
        resetModalCard,
        { y: 18, scale: 0.96, autoAlpha: 0 },
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () => resetFocusTrap.activate({ initialFocus: resetEmail }),
        }
      );
    }
  };

  bindCapsLockWarning(password, capsWarning);

  email.addEventListener("input", updateButtonState);
  password.addEventListener("input", updateButtonState);
  email.addEventListener("blur", updateButtonState);
  password.addEventListener("blur", updateButtonState);
  updateButtonState();

  togglePassword.addEventListener("click", () => {
    const isPassword = password.type === "password";
    password.type = isPassword ? "text" : "password";
    togglePassword.textContent = isPassword ? "Hide" : "Show";
    togglePassword.setAttribute("aria-pressed", isPassword ? "true" : "false");
    togglePassword.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
  });
  togglePassword.setAttribute("aria-pressed", "false");
  togglePassword.setAttribute("aria-label", "Show password");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const parse = loginSchema.safeParse({
      email: email.value.trim(),
      password: password.value,
    });
    if (!parse.success) {
      updateButtonState();
      notify(firstSchemaError(parse), "error", "Validation error");
      return;
    }

    if (rememberMe) {
      if (rememberMe.checked) {
        safeWriteStorage("auth_email", parse.data.email);
      } else {
        safeRemoveStorage("auth_email");
      }
    }

    setRumPhase("login:submit");
    setButtonLoading(loginBtn, true, "Verifying...");

    try {
      const response = await apiClient.request("/auth/login", {
        method: "POST",
        data: parse.data,
        retries: 1,
        timeoutMs: 5200,
      });
      pendingUserId = response?.userId || null;
      otpDemoMode = false;
      const requiresOtp = Boolean(response?.requiresOtp);
      const requiresWebAuthn = Boolean(response?.requiresWebAuthn);

      if (requiresWebAuthn) {
        notify("Passkey required. Use your device passkey to continue.", "info", "Passkey");
        setRumPhase("login:passkey-open");
        openPasskeyModal();
        return;
      }
      if (requiresOtp) {
        notify("Credentials accepted. Enter OTP to continue.", "success", "Login");
        setRumPhase("login:otp-open");
        openOtpModal();
        return;
      }

      notify("Login successful. Redirecting...", "success", "Login");
      window.setTimeout(() => {
        window.location.href = LOGIN_SUCCESS_REDIRECT;
      }, 700);
      return;
    } catch (error) {
      if (error.code === "TIMEOUT") {
        showRetryToast(
          "Login timed out. Check your connection and try again.",
          "Network",
          retryFormSubmit
        );
        return;
      }
      if (error.status === 401) {
        notify("Invalid credentials.", "error", "Login failed");
        return;
      }
      if (error.status === 423) {
        const retryAfter = Number(error.retryAfterSeconds || 0);
        if (retryAfter > 0) startLoginLockout(retryAfter);
        notify("Account locked. Try again later.", "error", "Login");
        return;
      }
      if (error.code !== "AUTH_NOT_CONFIGURED" && error.status !== 501) {
        notify(error.message || "Unable to sign in right now.", "error", "Login failed");
        return;
      }
      pendingUserId = null;
      otpDemoMode = true;
      notify("Auth backend is in setup mode. Continuing with OTP demo flow.", "info", "Demo mode");
    } finally {
      setButtonLoading(loginBtn, false);
      updateButtonState();
    }

    setRumPhase("login:otp-open");
    openOtpModal();
  });

  const focusPrev = (index) => {
    if (index <= 0) return;
    otpInputs[index - 1].focus();
  };
  const focusNext = (index) => {
    if (index >= otpInputs.length - 1) return;
    otpInputs[index + 1].focus();
  };

  const tryAutoSubmitOtp = () => {
    if (!isOtpModalOpen()) return;
    const parse = otpSchema.safeParse(readOtpValue());
    if (!parse.success) return;
    otpSubmit.click();
  };

  otpInputs.forEach((input, index) => {
    input.addEventListener("input", (event) => {
      const value = event.target.value.replace(/\D/g, "").slice(0, 1);
      event.target.value = value;
      if (value && index < otpInputs.length - 1) {
        focusNext(index);
      }
      updateOtpSubmitState();
      if (value && index === otpInputs.length - 1) {
        tryAutoSubmitOtp();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !event.target.value) {
        focusPrev(index);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusPrev(index);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusNext(index);
      }
    });
    input.addEventListener("paste", (event) => {
      const data = event.clipboardData?.getData("text") || "";
      const digits = data.replace(/\D/g, "").slice(0, otpInputs.length).split("");
      otpInputs.forEach((el, i) => {
        el.value = digits[i] || "";
      });
      updateOtpSubmitState();
      const nextIndex = Math.min(digits.length, otpInputs.length - 1);
      otpInputs[nextIndex]?.focus();
      event.preventDefault();
      if (digits.length === otpInputs.length) tryAutoSubmitOtp();
    });
  });
  updateOtpSubmitState();

  const focusResetPrev = (index) => {
    if (index <= 0) return;
    resetCodeInputs[index - 1].focus();
  };
  const focusResetNext = (index) => {
    if (index >= resetCodeInputs.length - 1) return;
    resetCodeInputs[index + 1].focus();
  };

  const tryAutoSubmitReset = () => {
    if (!resetSubmit) return;
    if (!resetCodeVisible) return;
    const parse = resetAccountSchema.safeParse({
      email: resetEmail.value.trim(),
      code: readResetCode(),
      newPassword: resetNewPassword.value,
      confirmPassword: resetConfirmPassword.value,
    });
    if (!parse.success) return;
    resetSubmit.click();
  };

  resetCodeInputs.forEach((input, index) => {
    input.addEventListener("input", (event) => {
      const value = event.target.value.replace(/\D/g, "").slice(0, 1);
      event.target.value = value;
      if (value && index < resetCodeInputs.length - 1) {
        focusResetNext(index);
      }
      updateResetSubmitState();
      if (value && index === resetCodeInputs.length - 1) {
        tryAutoSubmitReset();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !event.target.value) {
        focusResetPrev(index);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusResetPrev(index);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusResetNext(index);
      }
    });
    input.addEventListener("paste", (event) => {
      const data = event.clipboardData?.getData("text") || "";
      const digits = data.replace(/\D/g, "").slice(0, resetCodeInputs.length).split("");
      resetCodeInputs.forEach((el, i) => {
        el.value = digits[i] || "";
      });
      updateResetSubmitState();
      const nextIndex = Math.min(digits.length, resetCodeInputs.length - 1);
      resetCodeInputs[nextIndex]?.focus();
      event.preventDefault();
      if (digits.length === resetCodeInputs.length) tryAutoSubmitReset();
    });
  });

  otpSubmit.addEventListener("click", () => {
    if (otpSubmit.disabled) return;
    const parse = otpSchema.safeParse(readOtpValue());
    if (!parse.success) {
      notify(firstSchemaError(parse, "Invalid OTP format."), "error", "OTP");
      return;
    }
    setRumPhase("login:otp-submit");
    setButtonLoading(otpSubmit, true, "Verifying...");
    (async () => {
      if (otpDemoMode) {
        notify("Login successful. Redirecting...", "success", "Login");
        closeOtpModal();
        window.setTimeout(() => {
          window.location.href = LOGIN_SUCCESS_REDIRECT;
        }, 700);
        setButtonLoading(otpSubmit, false);
        return;
      }
      if (!pendingUserId) {
        notify("Missing session context. Please login again.", "error", "OTP");
        setButtonLoading(otpSubmit, false);
        return;
      }
      try {
        await apiClient.request("/auth/verify-otp", {
          method: "POST",
          data: {
            userId: pendingUserId,
            otp: readOtpValue(),
            trustDevice: Boolean(trustDevice?.checked),
          },
          retries: 1,
          timeoutMs: 5200,
        });
        notify("Login successful. Redirecting...", "success", "Login");
        closeOtpModal();
        window.setTimeout(() => {
          window.location.href = LOGIN_SUCCESS_REDIRECT;
        }, 700);
      } catch (error) {
        if (error.code === "TIMEOUT") {
          showRetryToast("OTP verification timed out. Try again.", "Network", () =>
            otpSubmit.click()
          );
          return;
        }
        if (error.code === "AUTH_NOT_CONFIGURED" || error.status === 501) {
          notify("Login successful. Redirecting...", "success", "Login");
          closeOtpModal();
          window.setTimeout(() => {
            window.location.href = LOGIN_SUCCESS_REDIRECT;
          }, 700);
          return;
        }
        if (error.status === 400) {
          notify("OTP expired or invalid.", "error", "OTP");
          return;
        }
        notify(error.message || "OTP verification failed.", "error", "OTP");
      } finally {
        setButtonLoading(otpSubmit, false);
        updateOtpSubmitState();
      }
    })();
  });

  updateResendState();
  resendOtp.addEventListener("click", () => {
    if (resendSecondsLeft > 0) return;
    if (otpDemoMode) {
      notify("OTP resent successfully.", "info", "OTP");
      startResendTimer();
      return;
    }
    if (!pendingUserId) {
      notify("Missing session context. Please login again.", "error", "OTP");
      return;
    }
    setButtonLoading(resendOtp, true, "Sending...");
    (async () => {
      try {
        const response = await apiClient.request("/auth/otp/resend", {
          method: "POST",
          data: { userId: pendingUserId },
          retries: 1,
          timeoutMs: 5200,
        });
        notify("OTP resent successfully.", "info", "OTP");
        const nextCooldown = Number(response?.retryAfterSeconds || OTP_COUNTDOWN_SECONDS);
        startResendTimer(nextCooldown);
      } catch (error) {
        if (error.code === "TIMEOUT") {
          showRetryToast("OTP resend timed out.", "Network", () => resendOtp.click());
          return;
        }
        if (error.status === 429 && Number(error.retryAfterSeconds) > 0) {
          startResendTimer(Number(error.retryAfterSeconds));
          notify("Please wait before resending OTP.", "info", "OTP");
          return;
        }
        notify(error.message || "Unable to resend OTP right now.", "error", "OTP");
      } finally {
        setButtonLoading(resendOtp, false);
        updateResendState();
      }
    })();
  });

  setModalOpenState(false);
  if (otpClose) otpClose.addEventListener("click", closeOtpModal);
  modal.addEventListener("click", (event) => {
    if (modalCard && modalCard.contains(event.target)) return;
    closeOtpModal();
  });
  modal.addEventListener("mousedown", (event) => {
    if (modalCard && modalCard.contains(event.target)) return;
    closeOtpModal();
  });

  setResetModalOpenState(false);
  if (isResetModalReady) {
    updateResetSubmitState();
    updateResetResendState();
    setResetSubmitLabel("send");

    forgotPasswordLink.addEventListener("click", (event) => {
      event.preventDefault();
      openResetModal();
    });

    if (resetClose) resetClose.addEventListener("click", closeResetModal);
    if (resetCancel) resetCancel.addEventListener("click", closeResetModal);

    resetEmail.addEventListener("input", updateResetSubmitState);
    resetNewPassword.addEventListener("input", updateResetSubmitState);
    resetConfirmPassword.addEventListener("input", updateResetSubmitState);

    resetSubmit.addEventListener("click", async () => {
      if (resetSubmit.disabled) return;
      if (!resetCodeVisible) {
        if (resetResendSecondsLeft > 0) {
          notify(
            `Please wait ${formatTime(resetResendSecondsLeft)} before requesting another code.`,
            "info",
            "Reset"
          );
          return;
        }
        const parse = forgotPasswordSchema.safeParse({
          email: resetEmail.value.trim(),
        });
        if (!parse.success) {
          notify(firstSchemaError(parse), "error", "Validation error");
          return;
        }

        setButtonLoading(resetSubmit, true, "Sending code...");
        try {
          await apiClient.request("/auth/password/forgot", {
            method: "POST",
            data: parse.data,
            retries: 1,
            timeoutMs: 5200,
          });
          notify("Reset code sent. Check your email.", "success", "Reset");
          resetCodeVisible = true;
          if (resetCodeBlock) resetCodeBlock.classList.remove("hidden");
          setResetSubmitLabel("reset");
          startResetResendTimer();
          resetCodeInputs[0]?.focus();
        } catch (error) {
          if (error.code === "TIMEOUT") {
            showRetryToast("Reset request timed out. Try again.", "Network", () =>
              resetSubmit.click()
            );
            return;
          }
          notify(error.message || "Unable to send reset code.", "error", "Reset");
        } finally {
          setButtonLoading(resetSubmit, false);
          updateResetSubmitState();
        }
        return;
      }

      const parse = resetAccountSchema.safeParse({
        email: resetEmail.value.trim(),
        code: readResetCode(),
        newPassword: resetNewPassword.value,
        confirmPassword: resetConfirmPassword.value,
      });
      if (!parse.success) {
        notify(firstSchemaError(parse), "error", "Validation error");
        return;
      }

      setButtonLoading(resetSubmit, true, "Updating...");
      try {
        await apiClient.request("/auth/password/reset", {
          method: "POST",
          data: parse.data,
          retries: 1,
          timeoutMs: 5200,
        });
        notify("Password updated. Please sign in again.", "success", "Reset");
        setTimeout(() => {
          closeResetModal();
        }, 650);
      } catch (error) {
        if (error.code === "TIMEOUT") {
          showRetryToast("Reset request timed out. Try again.", "Network", () =>
            resetSubmit.click()
          );
          return;
        }
        notify(error.message || "Unable to submit reset request right now.", "error", "Reset");
      } finally {
        setButtonLoading(resetSubmit, false);
        updateResetSubmitState();
      }
    });

    resetModal.addEventListener("click", (event) => {
      if (resetModalCard && resetModalCard.contains(event.target)) return;
      closeResetModal();
    });
    resetModal.addEventListener("mousedown", (event) => {
      if (resetModalCard && resetModalCard.contains(event.target)) return;
      closeResetModal();
    });
  }

  if (passkeyBegin) {
    passkeyBegin.addEventListener("click", async () => {
      if (passkeyBegin.disabled) return;
      if (!pendingUserId) {
        notify("Missing session context. Please login again.", "error", "Passkey");
        return;
      }
      setButtonLoading(passkeyBegin, true, "Opening...");
      try {
        await apiClient.request("/auth/webauthn/login/begin", {
          method: "POST",
          data: {
            userId: pendingUserId,
          },
          retries: 1,
          timeoutMs: 5200,
        });
        notify("Passkey flow started. Follow your device prompt.", "info", "Passkey");
      } catch (error) {
        if (error.code === "TIMEOUT") {
          showRetryToast("Passkey timed out. Try again.", "Network", () => passkeyBegin.click());
          return;
        }
        if (error.code === "AUTH_NOT_CONFIGURED" || error.status === 501) {
          notify("Passkey login is not configured yet.", "error", "Passkey");
          return;
        }
        notify(error.message || "Passkey login failed.", "error", "Passkey");
      } finally {
        setButtonLoading(passkeyBegin, false);
      }
    });
  }

  if (passkeyClose) passkeyClose.addEventListener("click", closePasskeyModal);
  if (passkeyCancel) passkeyCancel.addEventListener("click", closePasskeyModal);
  if (passkeyModal) {
    passkeyModal.addEventListener("click", (event) => {
      if (passkeyModalCard && passkeyModalCard.contains(event.target)) return;
      closePasskeyModal();
    });
    passkeyModal.addEventListener("mousedown", (event) => {
      if (passkeyModalCard && passkeyModalCard.contains(event.target)) return;
      closePasskeyModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOtpModal();
    closeResetModal();
    closePasskeyModal();
  });
});
