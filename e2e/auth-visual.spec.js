const { test, expect } = require("@playwright/test");

async function stabilizeAuthPage(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      canvas[data-auth-particles] {
        display: none !important;
      }
      .auth-form-skeleton {
        display: none !important;
      }
      .auth-form-shell form {
        opacity: 1 !important;
        transform: none !important;
      }
    `,
  });
}

test.describe("Auth visual regression", () => {
  test("login page visual baseline", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 860 });
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await stabilizeAuthPage(page);
    await expect(page).toHaveScreenshot("auth-login-desktop.png", {
      fullPage: true,
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });

  test("register page visual baseline", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 960 });
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await stabilizeAuthPage(page);
    await expect(page).toHaveScreenshot("auth-register-desktop.png", {
      fullPage: true,
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });

  test("admin login page visual baseline", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 860 });
    await page.goto("/admin/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await stabilizeAuthPage(page);
    await expect(page).toHaveScreenshot("auth-admin-login-desktop.png", {
      fullPage: true,
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });
});
