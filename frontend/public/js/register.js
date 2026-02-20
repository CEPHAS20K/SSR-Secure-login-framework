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

  const isEmailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const passwordsMatch = () =>
    regPassword.value !== "" && regPassword.value === regPasswordConfirm.value;

  const setMismatchState = () => {
    const mismatch = regPasswordConfirm.value.length > 0 && !passwordsMatch();
    regPasswordConfirm.setCustomValidity(mismatch ? "Passwords must match." : "");
    if (passwordMismatch) {
      passwordMismatch.classList.toggle("hidden", !mismatch);
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

  const canSubmit = () => {
    return (
      username.value.trim().length >= 3 &&
      isEmailValid(regEmail.value) &&
      regPassword.value.length >= 8 &&
      passwordsMatch() &&
      gender.value !== "" &&
      agreeTerms.checked
    );
  };

  const updateRegisterButton = () => {
    registerBtn.disabled = !canSubmit();
  };

  const updateOtpSubmitState = () => {
    const valid = /^\d{5}$/.test(otpInput.value.trim());
    otpSubmit.disabled = !valid;
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
    otpInput.focus();

    if (!window.gsap) return;
    gsap.fromTo(otpModal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "power1.out" });
    if (modalCard) {
      gsap.fromTo(
        modalCard,
        { y: 18, scale: 0.96, autoAlpha: 0 },
        { y: 0, scale: 1, autoAlpha: 1, duration: 0.3, ease: "power2.out" }
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
          gsap.set(otpModal, { clearProps: "opacity,visibility" });
          if (modalCard) gsap.set(modalCard, { clearProps: "opacity,transform" });
        },
      });
      return;
    }

    stopTimer();
    setModalOpenState(false);
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setMismatchState();
    updateRegisterButton();

    if (registerBtn.disabled) {
      registerFlash.textContent = "Complete all fields and ensure passwords match.";
      registerFlash.className = "min-h-5 text-sm font-semibold text-rose-900";
      return;
    }

    registerFlash.textContent = "";
    openOtpModal();
  });

  otpInput.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 5);
    updateOtpSubmitState();
  });
  otpInput.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 5);
    otpInput.value = pasted;
    updateOtpSubmitState();
  });

  otpSubmit.addEventListener("click", () => {
    if (otpSubmit.disabled) return;
    registerFlash.textContent = "Account verified with OTP.";
    registerFlash.className = "min-h-5 text-sm font-semibold text-fuchsia-900";
    closeOtpModal();
  });

  resendOtp.addEventListener("click", () => {
    if (secondsLeft > 0) return;
    registerFlash.textContent = "OTP resent successfully.";
    registerFlash.className = "min-h-5 text-sm font-semibold text-rose-900";
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
