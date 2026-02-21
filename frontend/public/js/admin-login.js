document.addEventListener("DOMContentLoaded", () => {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const submitButton = document.getElementById("adminLoginBtn");
  const formShell = document.getElementById("adminLoginFormShell");
  const FORM_SKELETON_MIN_MS = 800;

  if (!usernameInput || !passwordInput || !submitButton) return;

  const revealForm = () => {
    if (!formShell) return;
    window.setTimeout(() => {
      formShell.classList.remove("auth-form-loading");
      formShell.classList.add("auth-form-ready");
    }, FORM_SKELETON_MIN_MS);
  };
  revealForm();

  const updateButtonState = () => {
    const usernameFilled = usernameInput.value.trim().length > 0;
    const passwordFilled = passwordInput.value.trim().length > 0;
    submitButton.disabled = !(usernameFilled && passwordFilled);
  };

  usernameInput.addEventListener("input", updateButtonState);
  passwordInput.addEventListener("input", updateButtonState);
  usernameInput.addEventListener("change", updateButtonState);
  passwordInput.addEventListener("change", updateButtonState);

  updateButtonState();
});
