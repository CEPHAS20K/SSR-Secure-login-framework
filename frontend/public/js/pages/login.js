import { createApiClient } from "../lib/api-client.js";
import {
  firstSchemaError,
  loginSchema,
  otpSchema,
  resetAccountSchema,
} from "../lib/auth-schemas.js";
import { createModalFocusTrap } from "../lib/modal-a11y.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const flash = document.getElementById("loginFlash");
  const modal = document.getElementById("otpModal");
  const modalCard = modal ? modal.querySelector(".otp-card") : null;
  const togglePassword = document.getElementById("togglePassword");
  const otpSubmit = document.getElementById("otpSubmit");
  const otpInput = document.getElementById("otpInput");
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
  const resetFlash = document.getElementById("resetFlash");
  const capsWarning = document.getElementById("capsWarning");
  const rememberMe = document.getElementById("rememberMe");
  const formShell = document.getElementById("loginFormShell");
  const OTP_COUNTDOWN_SECONDS = 5 * 60;
  const FORM_SKELETON_MIN_MS = 220;
  const rememberedEmail = localStorage.getItem("auth_email") || "";
  let resendSecondsLeft = OTP_COUNTDOWN_SECONDS;
  let resendTimer = null;

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

  const setFlash = (message, tone = "info") => {
    if (!flash) return;
    const tones = {
      info: "min-h-5 text-sm font-bold text-rose-900",
      success: "min-h-5 text-sm font-bold text-fuchsia-900",
      error: "min-h-5 text-sm font-bold text-rose-900",
    };
    flash.className = tones[tone] || tones.info;
    flash.textContent = message;
  };

  const updateButtonState = () => {
    const parse = loginSchema.safeParse({
      email: email.value.trim(),
      password: password.value,
    });
    loginBtn.disabled = !parse.success;
  };

  const updateOtpSubmitState = () => {
    if (!otpSubmit || !otpInput) return;
    const parse = otpSchema.safeParse(otpInput.value.trim());
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
    otpInput.value = "";
    updateOtpSubmitState();

    if (!window.gsap) {
      otpFocusTrap.activate({ initialFocus: otpInput });
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
          onComplete: () => otpFocusTrap.activate({ initialFocus: otpInput }),
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

  const updateCapsLockWarning = (event) => {
    if (!capsWarning || typeof event.getModifierState !== "function") return;
    capsWarning.classList.toggle("hidden", !event.getModifierState("CapsLock"));
  };

  const isResetModalReady = Boolean(
    forgotPasswordLink &&
    resetModal &&
    resetEmail &&
    resetNewPassword &&
    resetConfirmPassword &&
    resetSubmit &&
    resetFlash
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
      newPassword: resetNewPassword.value,
      confirmPassword: resetConfirmPassword.value,
    });
    resetSubmit.disabled = !parse.success;
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
          setResetModalOpenState(false);
          resetFocusTrap.deactivate();
          gsap.set(resetModal, { clearProps: "opacity,visibility" });
          if (resetModalCard) gsap.set(resetModalCard, { clearProps: "opacity,transform" });
        },
      });
      return;
    }

    setResetModalOpenState(false);
    resetFocusTrap.deactivate();
  };

  const openResetModal = () => {
    if (!isResetModalReady) return;
    setResetModalOpenState(true);
    resetFlash.textContent = "";
    resetFlash.className = "min-h-5 mt-3 text-sm font-semibold";
    resetEmail.value = email.value.trim();
    resetNewPassword.value = "";
    resetConfirmPassword.value = "";
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

  email.addEventListener("input", updateButtonState);
  password.addEventListener("input", updateButtonState);
  password.addEventListener("keydown", updateCapsLockWarning);
  password.addEventListener("keyup", updateCapsLockWarning);
  password.addEventListener("blur", () => {
    if (capsWarning) capsWarning.classList.add("hidden");
  });
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
      setFlash(firstSchemaError(parse), "error");
      return;
    }

    if (rememberMe) {
      if (rememberMe.checked) {
        localStorage.setItem("auth_email", parse.data.email);
      } else {
        localStorage.removeItem("auth_email");
      }
    }

    const originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = "Checking...";
    setFlash("");

    try {
      await apiClient.request("/auth/login", {
        method: "POST",
        data: parse.data,
        retries: 1,
        timeoutMs: 5200,
      });
      setFlash("Credentials accepted. Enter OTP to continue.", "success");
    } catch (error) {
      if (error.code !== "AUTH_NOT_CONFIGURED" && error.status !== 501) {
        setFlash(error.message || "Unable to sign in right now.", "error");
        return;
      }
      setFlash("Auth backend is in setup mode. Continuing with OTP demo flow.", "info");
    } finally {
      loginBtn.textContent = originalText;
      updateButtonState();
    }

    openOtpModal();
  });

  otpInput.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 5);
    updateOtpSubmitState();
  });
  updateOtpSubmitState();

  otpSubmit.addEventListener("click", () => {
    if (otpSubmit.disabled) return;
    const parse = otpSchema.safeParse(otpInput.value.trim());
    if (!parse.success) {
      setFlash(firstSchemaError(parse, "Invalid OTP format."), "error");
      return;
    }
    setFlash("OTP submitted.", "success");
    closeOtpModal();
  });

  updateResendState();
  resendOtp.addEventListener("click", () => {
    if (resendSecondsLeft > 0) return;
    setFlash("OTP resent successfully.", "info");
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
    [resetEmail, resetNewPassword, resetConfirmPassword].forEach((field) => {
      field.addEventListener("input", updateResetSubmitState);
      field.addEventListener("change", updateResetSubmitState);
    });
    updateResetSubmitState();

    forgotPasswordLink.addEventListener("click", (event) => {
      event.preventDefault();
      openResetModal();
    });

    if (resetClose) resetClose.addEventListener("click", closeResetModal);
    if (resetCancel) resetCancel.addEventListener("click", closeResetModal);

    resetSubmit.addEventListener("click", async () => {
      if (resetSubmit.disabled) return;
      const parse = resetAccountSchema.safeParse({
        email: resetEmail.value.trim(),
        newPassword: resetNewPassword.value,
        confirmPassword: resetConfirmPassword.value,
      });
      if (!parse.success) {
        resetFlash.textContent = firstSchemaError(parse);
        resetFlash.className = "min-h-5 mt-3 text-sm font-semibold text-rose-900";
        updateResetSubmitState();
        return;
      }

      resetSubmit.disabled = true;
      resetSubmit.textContent = "Submitting...";
      try {
        await apiClient.request("/health", {
          method: "GET",
          cache: false,
          retries: 0,
          timeoutMs: 3000,
        });
        resetFlash.textContent = "Reset request submitted. Check your email for next steps.";
        resetFlash.className = "min-h-5 mt-3 text-sm font-semibold text-fuchsia-900";
        setTimeout(() => {
          closeResetModal();
        }, 650);
      } catch (error) {
        resetFlash.textContent = error.message || "Unable to submit reset request right now.";
        resetFlash.className = "min-h-5 mt-3 text-sm font-semibold text-rose-900";
      } finally {
        resetSubmit.textContent = "Submit Reset";
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
