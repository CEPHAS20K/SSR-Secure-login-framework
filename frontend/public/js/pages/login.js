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
  const resetSendCode = document.getElementById("resetSendCode");
  const capsWarning = document.getElementById("capsWarning");
  const rememberMe = document.getElementById("rememberMe");
  const formShell = document.getElementById("loginFormShell");
  const OTP_COUNTDOWN_SECONDS = 5 * 60;
  const RESET_CODE_COUNTDOWN_SECONDS = 60;
  const FORM_SKELETON_MIN_MS = 220;
  const rememberedEmail = safeReadStorage("auth_email");
  let resendSecondsLeft = OTP_COUNTDOWN_SECONDS;
  let resendTimer = null;
  let resetResendSecondsLeft = 0;
  let resetResendTimer = null;

  if (!form || !email || !password || !loginBtn || !modal || !togglePassword) return;

  const apiClient = createApiClient({
    retries: 1,
    timeoutMs: 5500,
    onUnauthorized: () => {
      window.location.href = "/login";
    },
  });

  const otpFocusTrap = createModalFocusTrap(modal, {
    onEscape: () => closeOtpModal(),
  });
  const resetFocusTrap = createModalFocusTrap(resetModal, {
    onEscape: () => closeResetModal(),
  });

  const setRumPhase = (phase) => {
    window.__rumPhase = phase || "";
  };

  const setButtonLoading = (button, isLoading, busyLabel) => {
    if (!button) return;
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

  const notify = (message, tone = "info", title = "Status") => {
    if (!message) return;
    showToast(message, { tone, title });
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
    const parse = loginSchema.safeParse({
      email: email.value.trim(),
      password: password.value,
    });
    loginBtn.disabled = !parse.success;
  };

  const readOtpValue = () => otpInputs.map((el) => el.value.trim()).join("");
  const readResetCode = () => resetCodeInputs.map((el) => el.value.trim()).join("");

  const updateOtpSubmitState = () => {
    if (!otpSubmit || otpInputs.length === 0) return;
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
    const isReady = resendSecondsLeft <= 0;
    resendOtp.disabled = !isReady;
    resendOtp.textContent = isReady ? "Resend OTP" : `Resend (${formatTime(resendSecondsLeft)})`;
    resendOtp.classList.toggle("opacity-60", !isReady);
    resendOtp.classList.toggle("cursor-not-allowed", !isReady);
  };

  const stopResendTimer = () => {
    if (!resendTimer) return;
    clearInterval(resendTimer);
    resendTimer = null;
  };

  const updateResetResendState = () => {
    if (!resetSendCode) return;
    const isReady = resetResendSecondsLeft <= 0;
    resetSendCode.disabled = !isReady;
    resetSendCode.textContent = isReady
      ? "Send code"
      : `Send code (${formatTime(resetResendSecondsLeft)})`;
    resetSendCode.classList.toggle("opacity-60", !isReady);
    resetSendCode.classList.toggle("cursor-not-allowed", !isReady);
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
    resetSendCode &&
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
    const parse = resetAccountSchema.safeParse({
      email: resetEmail.value.trim(),
      code: readResetCode(),
      newPassword: resetNewPassword.value,
      confirmPassword: resetConfirmPassword.value,
    });
    // Keep submit action available and surface validation via toast (Notyf).
    resetSubmit.disabled = false;
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
  });

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
      await apiClient.request("/auth/login", {
        method: "POST",
        data: parse.data,
        retries: 1,
        timeoutMs: 5200,
      });
      notify("Credentials accepted. Enter OTP to continue.", "success", "Login");
    } catch (error) {
      if (error.code === "TIMEOUT") {
        notify("Login timed out. Check your connection and try again.", "error", "Network");
        return;
      }
      if (error.status === 401) {
        notify("Wrong credentials.", "error", "Login failed");
        return;
      }
      if (error.code !== "AUTH_NOT_CONFIGURED" && error.status !== 501) {
        notify(error.message || "Unable to sign in right now.", "error", "Login failed");
        return;
      }
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
    notify("OTP submitted.", "success", "OTP");
    closeOtpModal();
  });

  updateResendState();
  resendOtp.addEventListener("click", () => {
    if (resendSecondsLeft > 0) return;
    notify("OTP resent successfully.", "info", "OTP");
    startResendTimer();
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

    forgotPasswordLink.addEventListener("click", (event) => {
      event.preventDefault();
      openResetModal();
    });

    if (resetClose) resetClose.addEventListener("click", closeResetModal);
    if (resetCancel) resetCancel.addEventListener("click", closeResetModal);

    resetEmail.addEventListener("input", updateResetSubmitState);
    resetNewPassword.addEventListener("input", updateResetSubmitState);
    resetConfirmPassword.addEventListener("input", updateResetSubmitState);

    resetSendCode.addEventListener("click", async () => {
      if (resetResendSecondsLeft > 0) return;
      const parse = forgotPasswordSchema.safeParse({
        email: resetEmail.value.trim(),
      });
      if (!parse.success) {
        notify(firstSchemaError(parse), "error", "Validation error");
        return;
      }

      setButtonLoading(resetSendCode, true, "Sending...");
      try {
        await apiClient.request("/auth/password/forgot", {
          method: "POST",
          data: parse.data,
          retries: 1,
          timeoutMs: 5200,
        });
        notify("Reset code sent. Check your email.", "success", "Reset");
        startResetResendTimer();
        resetCodeInputs[0]?.focus();
      } catch (error) {
        if (error.code === "TIMEOUT") {
          notify("Reset request timed out. Try again.", "error", "Network");
          return;
        }
        notify(error.message || "Unable to send reset code.", "error", "Reset");
      } finally {
        setButtonLoading(resetSendCode, false);
        updateResetResendState();
      }
    });

    resetSubmit.addEventListener("click", async () => {
      if (resetSubmit.disabled) return;
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
          notify("Reset request timed out. Try again.", "error", "Network");
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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOtpModal();
    closeResetModal();
  });
});
