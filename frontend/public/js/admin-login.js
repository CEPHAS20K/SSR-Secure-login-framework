document.addEventListener("DOMContentLoaded", () => {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const submitButton = document.getElementById("adminLoginBtn");

  if (!usernameInput || !passwordInput || !submitButton) return;

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
