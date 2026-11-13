import { test, expect } from "@playwright/test";

/**
 * Visual regression snapshots for key surfaces.
 *
 * These capture the rendered UI (theme tokens, layout, spacing) so a future
 * change that silently breaks the visual design is caught. Baselines live in
 * `e2e/__screenshots__/` and are committed; regenerate with
 * `pnpm exec playwright test --update-snapshots`.
 *
 * Note: when the gateway is not running, pages render their empty/error states.
 * The snapshots still exercise the theme tokens and layout, which is the main
 * regression risk from the tokenization work.
 */

test.describe("视觉回归", () => {
  test("登录页截图", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveScreenshot("login.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("主页面截图", async ({ page }) => {
    await page.goto("/");
    // Wait for the shell to settle (sidebar + hero) before capturing.
    await page.waitForSelector("nav");
    await expect(page).toHaveScreenshot("home.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});
