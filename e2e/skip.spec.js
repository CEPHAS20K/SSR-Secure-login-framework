import { test } from "@playwright/test";

const skip = process.env.SKIP_WEB_TESTS === "true" || process.env.SKIP_WEB_TESTS === undefined; // default skip unless explicitly disabled

test.skip(skip, "SKIP_WEB_TESTS enabled; skipping E2E.");
test("placeholder noop", async () => {
  // Intentionally empty when E2E is disabled.
});
