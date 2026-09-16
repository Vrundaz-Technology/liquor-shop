import { test, expect } from "./fixtures";

test.describe("storefront smoke", () => {
  test("home loads after age verification cookie", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: /21 or older/i })).toHaveCount(0);
    await expect(page.locator("main#main")).toBeVisible();
  });

  test("shop lists collections", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: /all collections/i })).toBeVisible();
    await expect(page.locator("main article").first()).toBeVisible({ timeout: 30_000 });
  });

  test("cart and checkout pages render", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.locator("main#main")).toBeVisible();
    await page.goto("/checkout");
    await expect(page.locator("main#main")).toBeVisible();
  });
});
