const { test, expect } = require("@playwright/test");

test.describe("Auth flow", () => {
  const strongPassword = "Str0ng!Passw0rd1";

  test("landing page renders and links to auth pages", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#hero-title")).toBeVisible();
    await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open User Login" })).toBeVisible();
  });

  test("login form enables submit and opens OTP modal", async ({ page }) => {
    await page.goto("/login");

    const loginButton = page.locator("#loginBtn");
    await expect(loginButton).toBeDisabled();

    await page.fill("#email", "tester@example.com");
    await page.fill("#password", strongPassword);

    await expect(loginButton).toBeEnabled();
    await loginButton.click();

    await expect(page.locator("#otpModal")).toBeVisible();
    await expect(page.locator("[data-otp-digit]")).toBeVisible();
  });

  test("register form enables submit and opens OTP modal", async ({ page }) => {
    await page.goto("/register");

    const registerButton = page.locator("#registerBtn");
    await expect(registerButton).toBeDisabled();

    await page.fill("#username", "test-user");
    await page.fill("#regEmail", "test-user@example.com");
    await page.fill("#regPassword", strongPassword);
    await page.fill("#regPasswordConfirm", strongPassword);
    await page.selectOption("#gender", "male");
    await page.check("#agreeTerms");

    await expect(registerButton).toBeEnabled();
    await registerButton.click();

    await expect(page.locator("#registerOtpModal")).toBeVisible();
    await expect(page.locator("[data-otp-digit]")).toBeVisible();
  });
});
