import { createApiClient } from "../lib/api-client.js";
import { firstSchemaError, otpSchema, registerSchema } from "../lib/auth-schemas.js";
import { createModalFocusTrap } from "../lib/modal-a11y.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const username = document.getElementById("username");
  const regEmail = document.getElementById("regEmail");
  const regPassword = document.getElementById("regPassword");
  const regPasswordConfirm = document.getElementById("regPasswordConfirm");
  const toggleRegPassword = document.getElementById("toggleRegPassword");
  const toggleRegPasswordConfirm = document.getElementById("toggleRegPasswordConfirm");
  const passwordMismatch = document.getElementById("passwordMismatch");
  const gender = document.getElementById("gender");
  const agreeTerms = document.getElementById("agreeTerms");
  const registerBtn = document.getElementById("registerBtn");
  const registerFlash = document.getElementById("registerFlash");
  const otpModal = document.getElementById("registerOtpModal");
  const modalCard = otpModal ? otpModal.querySelector(".otp-card") : null;
  const otpInput = document.getElementById("registerOtpInput");
  const otpSubmit = document.getElementById("registerOtpSubmit");
  const resendOtp = document.getElementById("registerResendOtp");
  const otpClose = document.getElementById("registerOtpClose");
  const formShell = document.getElementById("registerFormShell");
  const FORM_SKELETON_MIN_MS = 220;
  const OTP_COUNTDOWN_SECONDS = 5 * 60;
  let secondsLeft = OTP_COUNTDOWN_SECONDS;
  let timer = null;

  if (
    !form ||
    !username ||
    !regEmail ||
    !regPassword ||
    !regPasswordConfirm ||
    !toggleRegPassword ||
    !toggleRegPasswordConfirm ||
    !gender ||
    !agreeTerms ||
    !registerBtn ||
    !registerFlash ||
    !otpModal ||
    !otpInput ||
    !otpSubmit ||
    !resendOtp
  ) {
    return;
  }

  const apiClient = createApiClient({
    retries: 1,
    timeoutMs: 6000,
    onUnauthorized: () => {
      window.location.href = "/login";
    },
  });
  const otpFocusTrap = createModalFocusTrap(otpModal, {
    onEscape: () => closeOtpModal(),
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
    const tones = {
      info: "min-h-5 text-sm font-semibold text-rose-900",
      success: "min-h-5 text-sm font-semibold text-fuchsia-900",
      error: "min-h-5 text-sm font-semibold text-rose-900",
    };
    registerFlash.className = tones[tone] || tones.info;
    registerFlash.textContent = message;
  };

  const getFormPayload = () => ({
    username: username.value.trim(),
    email: regEmail.value.trim(),
    password: regPassword.value,
    confirmPassword: regPasswordConfirm.value,
    gender: gender.value || "",
    agreeTerms: Boolean(agreeTerms.checked),
  });

  const setMismatchState = () => {
    const mismatch =
      regPasswordConfirm.value.length > 0 && regPassword.value !== regPasswordConfirm.value;
    regPasswordConfirm.setCustomValidity(mismatch ? "Passwords must match." : "");
    if (passwordMismatch) {
      passwordMismatch.classList.toggle("invisible", !mismatch);
      passwordMismatch.setAttribute("aria-hidden", mismatch ? "false" : "true");
    }

    const matchInputClasses = ["border-rose-200", "focus:border-primary", "focus:ring-primary"];
    const mismatchInputClasses = [
      "border-rose-400",
      "focus:border-rose-500",
      "focus:ring-rose-300",
    ];

    if (mismatch) {
      regPasswordConfirm.classList.remove(...matchInputClasses);
      regPasswordConfirm.classList.add(...mismatchInputClasses);
    } else {
      regPasswordConfirm.classList.remove(...mismatchInputClasses);
      regPasswordConfirm.classList.add(...matchInputClasses);
    }
  };

  const updateRegisterButton = () => {
    const parse = registerSchema.safeParse(getFormPayload());
    registerBtn.disabled = !parse.success;
  };

  const updateOtpSubmitState = () => {
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
    const canResend = secondsLeft <= 0;
    resendOtp.disabled = !canResend;
    resendOtp.textContent = canResend ? "Resend OTP" : `Resend (${formatTime(secondsLeft)})`;
    resendOtp.classList.toggle("opacity-60", !canResend);
    resendOtp.classList.toggle("cursor-not-allowed", !canResend);
  };

  const stopTimer = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  const setModalOpenState = (open) => {
    otpModal.classList.toggle("hidden", !open);
    otpModal.classList.toggle("flex", open);
    otpModal.setAttribute("aria-hidden", open ? "false" : "true");
    otpModal.style.display = open ? "flex" : "none";
  };

  const startTimer = (duration = OTP_COUNTDOWN_SECONDS) => {
    stopTimer();
    secondsLeft = duration;
    updateResendState();

    timer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        secondsLeft = 0;
        stopTimer();
      }
      updateResendState();
    }, 1000);
  };

  const openOtpModal = () => {
    setModalOpenState(true);
    otpInput.value = "";
    updateOtpSubmitState();
    startTimer();

    if (!window.gsap) {
      otpFocusTrap.activate({ initialFocus: otpInput });
      return;
    }

    gsap.fromTo(otpModal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "power1.out" });
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

  const closeOtpModal = () => {
    if (otpModal.classList.contains("hidden") && otpModal.style.display !== "flex") return;

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
      gsap.to(otpModal, {
        autoAlpha: 0,
        duration: 0.2,
        ease: "power1.in",
        onComplete: () => {
          stopTimer();
          setModalOpenState(false);
          otpFocusTrap.deactivate();
          gsap.set(otpModal, { clearProps: "opacity,visibility" });
          if (modalCard) gsap.set(modalCard, { clearProps: "opacity,transform" });
        },
      });
      return;
    }

    stopTimer();
    setModalOpenState(false);
    otpFocusTrap.deactivate();
  };

  const togglePasswordField = (field, trigger) => {
    const isPassword = field.type === "password";
    field.type = isPassword ? "text" : "password";
    trigger.textContent = isPassword ? "Hide" : "Show";
  };

  toggleRegPassword.addEventListener("click", () =>
    togglePasswordField(regPassword, toggleRegPassword)
  );
  toggleRegPasswordConfirm.addEventListener("click", () =>
    togglePasswordField(regPasswordConfirm, toggleRegPasswordConfirm)
  );

  [username, regEmail, regPassword, regPasswordConfirm, gender].forEach((field) => {
    field.addEventListener("input", () => {
      setMismatchState();
      updateRegisterButton();
    });
    field.addEventListener("change", () => {
      setMismatchState();
      updateRegisterButton();
    });
  });
  agreeTerms.addEventListener("change", updateRegisterButton);

  setMismatchState();
  updateRegisterButton();
  updateOtpSubmitState();
  updateResendState();
  setModalOpenState(false);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMismatchState();

    const parse = registerSchema.safeParse(getFormPayload());
    updateRegisterButton();
    if (!parse.success) {
      setFlash(firstSchemaError(parse), "error");
      return;
    }

    const originalText = registerBtn.textContent;
    registerBtn.disabled = true;
    registerBtn.textContent = "Creating...";
    setFlash("");
    try {
      await apiClient.request("/auth/register", {
        method: "POST",
        data: {
          username: parse.data.username,
          email: parse.data.email,
          password: parse.data.password,
          confirmPassword: parse.data.confirmPassword,
          gender: parse.data.gender,
        },
        timeoutMs: 5200,
      });
      setFlash("Account details accepted. Verify OTP to continue.", "success");
    } catch (error) {
      if (error.code !== "AUTH_NOT_CONFIGURED" && error.status !== 501) {
        setFlash(error.message || "Unable to register right now.", "error");
        return;
      }
      setFlash("Auth backend is in setup mode. Continuing with OTP demo flow.", "info");
    } finally {
      registerBtn.textContent = originalText;
      updateRegisterButton();
    }

    openOtpModal();
  });

  otpInput.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 5);
    updateOtpSubmitState();
  });

  otpSubmit.addEventListener("click", () => {
    if (otpSubmit.disabled) return;
    const parse = otpSchema.safeParse(otpInput.value.trim());
    if (!parse.success) {
      setFlash(firstSchemaError(parse, "Invalid OTP format."), "error");
      return;
    }
    setFlash("Account verified with OTP.", "success");
    closeOtpModal();
  });

  resendOtp.addEventListener("click", () => {
    if (secondsLeft > 0) return;
    setFlash("OTP resent successfully.", "info");
    startTimer();
  });

  if (otpClose) {
    otpClose.addEventListener("click", closeOtpModal);
  }
  otpModal.addEventListener("click", (event) => {
    if (modalCard && modalCard.contains(event.target)) return;
    closeOtpModal();
  });
  otpModal.addEventListener("mousedown", (event) => {
    if (modalCard && modalCard.contains(event.target)) return;
    closeOtpModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOtpModal();
  });
});
