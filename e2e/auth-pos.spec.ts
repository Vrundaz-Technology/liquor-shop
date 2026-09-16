import { test, expect, DEMO, dbConnected, signIn } from "./fixtures";

test.describe("auth + dashboard smoke", () => {
  test("login page shows accessible form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("owner can open dashboard and POS", async ({ page }) => {
    test.skip(!(await dbConnected(page)), "Database not connected — skip authenticated flows");

    await signIn(page, DEMO.ownerEmail);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: /dashboard sections/i })).toBeVisible();

    await page.goto("/dashboard/pos");
    await expect(page.getByRole("searchbox", { name: "Search bottles" }).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/selling from/i).first()).toBeVisible();
  });

  test("checkout can add a bottle from shop", async ({ page }) => {
    await page.goto("/shop");
    const card = page.locator("main article").first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    const addButton = card.getByRole("button", { name: "Add to Cart" });
    if (await addButton.isDisabled().catch(() => true)) {
      test.skip(true, "First shop product is out of stock in this environment");
    }
    await addButton.click();

    await page.goto("/cart");
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.getByRole("link", { name: /checkout|continue/i }).or(page.locator("main img")).first()).toBeVisible();
  });
});
