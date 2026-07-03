import { expect, test } from "@playwright/test";

import { mockLangGraphAPI } from "./utils/mock-api";

test.describe("Landing page", () => {
  test("renders the header and hero section", async ({ page }) => {
    await page.goto("/");

    // Header product name
    await expect(
      page.locator("header h1", { hasText: "Agent Workspace" }),
    ).toBeVisible();

    // "Open Workspace" call-to-action button in hero
    await expect(
      page.getByRole("link", { name: /open workspace/i }),
    ).toBeVisible();
  });

  test("Open Workspace link navigates to workspace", async ({ page }) => {
    mockLangGraphAPI(page);

    await page.goto("/");

    const openWorkspace = page
      .getByRole("link", { name: /open workspace/i })
      .first();
    await openWorkspace.click();

    // Should redirect to /workspace/chats/new
    await page.waitForURL("**/workspace/chats/new");
    await expect(page).toHaveURL(/\/workspace\/chats\/new/);
  });
});
