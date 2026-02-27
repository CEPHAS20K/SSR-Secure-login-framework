import { createApiClient } from "../lib/api-client.js";
import { firstSchemaError, otpSchema, registerSchema } from "../lib/auth-schemas.js";
import { createModalFocusTrap } from "../lib/modal-a11y.js";
import { showToast } from "../lib/toast.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const username = document.getElementById("username");
  const regEmail = document.getElementById("regEmail");
  const regPassword = document.getElementById("regPassword");
  const regPasswordConfirm = document.getElementById("regPasswordConfirm");
  const toggleRegPassword = document.getElementById("toggleRegPassword");
  const toggleRegPasswordConfirm = document.getElementById("toggleRegPasswordConfirm");
  const gender = document.getElementById("gender");
  const agreeTerms = document.getElementById("agreeTerms");
  const registerBtn = document.getElementById("registerBtn");
  const otpModal = document.getElementById("registerOtpModal");
  const modalCard = otpModal ? otpModal.querySelector(".otp-card") : null;
  const otpInputs = Array.from(
    document.querySelectorAll('[data-otp-digit="true"].register-otp-digit')
  );
  const otpSubmit = document.getElementById("registerOtpSubmit");
  const resendOtp = document.getElementById("registerResendOtp");
  const otpClose = document.getElementById("registerOtpClose");
  const formShell = document.getElementById("registerFormShell");
  const capsWarning = document.getElementById("registerCapsWarning");
  const FORM_SKELETON_MIN_MS = 220;
  const OTP_COUNTDOWN_SECONDS = 5 * 60;
  let secondsLeft = OTP_COUNTDOWN_SECONDS;
  let timer = null;
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

  const getFormPayload = () => ({
    username: username.value.trim(),
    email: regEmail.value.trim(),
    password: regPassword.value,
    confirmPassword: regPasswordConfirm.value,
    gender: gender.value || "",
    agreeTerms: Boolean(agreeTerms.checked),
  });

  const markInlineError = (element, message, helperId) => {
    const helper = helperId ? document.getElementById(helperId) : null;
    if (element) {
      element.setAttribute("aria-invalid", message ? "true" : "false");
      element.classList.toggle("ring-2", Boolean(message));
      element.classList.toggle("ring-rose-400", Boolean(message));
    }
    if (helper) {
      helper.textContent = message || "";
      helper.classList.toggle("hidden", !message);
    }
  };

  const setMismatchState = () => {
    const mismatch =
      regPasswordConfirm.value.length > 0 && regPassword.value !== regPasswordConfirm.value;
    regPasswordConfirm.setCustomValidity(mismatch ? "Passwords must match." : "");
  };

  const updateRegisterButton = () => {
    const formPayload = getFormPayload();
    const coreFieldParse = registerSchema.safeParse({
      ...formPayload,
      gender: formPayload.gender || "male",
      agreeTerms: true,
    });
    registerBtn.disabled = !coreFieldParse.success;
  };

  const readOtpValue = () => otpInputs.map((el) => el.value.trim()).join("");

  const updateOtpSubmitState = () => {
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
    otpInputs.forEach((input) => {
      input.value = "";
      input.classList.remove("ring-2", "ring-rose-400");
    });
    updateOtpSubmitState();
    startTimer();
    otpInputs[0]?.focus();

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
  regPassword.addEventListener("keydown", updateCapsWarning);
  regPassword.addEventListener("keyup", updateCapsWarning);
  regPassword.addEventListener("blur", hideCapsWarning);

  const fieldBindings = [username, regEmail, regPassword, regPasswordConfirm, gender];

  fieldBindings.forEach((input) => {
    input.addEventListener("input", () => {
      setMismatchState();
      updateRegisterButton();
      if (input === gender) markInlineError(gender, "", "genderHelp");
    });
    input.addEventListener("change", () => {
      setMismatchState();
      updateRegisterButton();
      if (input === gender) markInlineError(gender, "", "genderHelp");
    });
    input.addEventListener("blur", () => {
      setMismatchState();
      updateRegisterButton();
    });
  });

  agreeTerms.addEventListener("change", () => {
    updateRegisterButton();
    markInlineError(agreeTerms, "", "termsHelp");
  });

  setMismatchState();
  updateRegisterButton();
  updateOtpSubmitState();
  updateResendState();
  setModalOpenState(false);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMismatchState();

    setRumPhase("register:validate");
    const parse = registerSchema.safeParse(getFormPayload());
    updateRegisterButton();
    if (!parse.success) {
      const firstIssuePath = parse.error?.issues?.[0]?.path?.[0];
      if (firstIssuePath === "gender") {
        markInlineError(gender, "Select your gender to continue.", "genderHelp");
        notify("Please select your gender before continuing.", "error", "Validation warning");
        return;
      }
      if (firstIssuePath === "agreeTerms") {
        markInlineError(agreeTerms, "Please accept terms to proceed.", "termsHelp");
        notify(
          "Please accept terms and privacy policy to continue.",
          "error",
          "Validation warning"
        );
        return;
      }
      notify(firstSchemaError(parse), "error", "Validation error");
      return;
    }
    markInlineError(gender, "", "genderHelp");
    markInlineError(agreeTerms, "", "termsHelp");

    setRumPhase("register:submit");
    setButtonLoading(registerBtn, true, "Verifying...");
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
      notify("Account details accepted. Verify OTP to continue.", "success", "Register");
    } catch (error) {
      if (error.code === "TIMEOUT") {
        notify("Register request timed out. Check your connection and retry.", "error", "Network");
        return;
      }
      if (error.code !== "AUTH_NOT_CONFIGURED" && error.status !== 501) {
        notify(error.message || "Unable to register right now.", "error", "Register failed");
        return;
      }
      notify("Auth backend is in setup mode. Continuing with OTP demo flow.", "info", "Demo mode");
    } finally {
      setButtonLoading(registerBtn, false);
      updateRegisterButton();
    }

    setRumPhase("register:otp-open");
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

  otpInputs.forEach((input, index) => {
    input.addEventListener("input", (event) => {
      const value = event.target.value.replace(/\D/g, "").slice(0, 1);
      event.target.value = value;
      if (value && index < otpInputs.length - 1) focusNext(index);
      updateOtpSubmitState();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !event.target.value) {
        focusPrev(index);
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
    });
  });

  otpSubmit.addEventListener("click", () => {
    if (otpSubmit.disabled) return;
    const parse = otpSchema.safeParse(readOtpValue());
    if (!parse.success) {
      notify(firstSchemaError(parse, "Invalid OTP format."), "error", "OTP");
      return;
    }
    setRumPhase("register:otp-submit");
    notify("Account verified with OTP.", "success", "OTP");
    closeOtpModal();
  });

  resendOtp.addEventListener("click", () => {
    if (secondsLeft > 0) return;
    notify("OTP resent successfully.", "info", "OTP");
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
