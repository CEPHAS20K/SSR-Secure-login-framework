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
  const otpInput = document.getElementById("registerOtpInput");
  const otpSubmit = document.getElementById("registerOtpSubmit");
  const resendOtp = document.getElementById("registerResendOtp");

  const OTP_COUNTDOWN_SECONDS = 10 * 60;
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
  };

  const stopTimer = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
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
    otpModal.classList.remove("hidden");
    otpModal.classList.add("flex");
    otpInput.value = "";
    updateOtpSubmitState();
    startTimer();
    otpInput.focus();

    if (!window.gsap) return;
    gsap.fromTo(otpModal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "power1.out" });
  };

  const closeOtpModal = () => {
    stopTimer();
    if (otpModal.classList.contains("hidden")) return;

    if (window.gsap) {
      gsap.to(otpModal, {
        autoAlpha: 0,
        duration: 0.2,
        ease: "power1.in",
        onComplete: () => {
          otpModal.classList.add("hidden");
          otpModal.classList.remove("flex");
        },
      });
      return;
    }

    otpModal.classList.add("hidden");
    otpModal.classList.remove("flex");
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

  otpModal.addEventListener("click", (event) => {
    if (event.target !== otpModal) return;
    closeOtpModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOtpModal();
  });
});
