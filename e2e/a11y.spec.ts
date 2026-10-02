import { test, expect, DEMO, dbConnected, signIn } from "./fixtures";
import { expectPageAccessible } from "./a11y";
import { DOC_TOPICS } from "../src/lib/docs/system-docs";

test.describe("accessibility", () => {
  test("skip link moves focus into main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("main#main")).toBeInViewport();
  });

  test("home meets WCAG A/AA", async ({ page }) => {
    await page.goto("/");
    await expectPageAccessible(page);
  });

  test("shop meets WCAG A/AA", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator("main#main")).toBeVisible();
    await page.locator("main article").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
    await expectPageAccessible(page);
  });

  test("cart meets WCAG A/AA", async ({ page }) => {
    await page.goto("/cart");
    await expectPageAccessible(page);
  });

  test("checkout meets WCAG A/AA", async ({ page }) => {
    await page.goto("/checkout");
    await expectPageAccessible(page);
  });

  test("login form is labeled and meets WCAG A/AA", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expectPageAccessible(page);
  });

  test("locations meets WCAG A/AA", async ({ page }) => {
    await page.goto("/locations");
    await expectPageAccessible(page);
  });

  test("events meets WCAG A/AA", async ({ page }) => {
    await page.goto("/events");
    await expectPageAccessible(page);
  });

  test("dashboard overview meets WCAG A/AA", async ({ page }) => {
    test.skip(!(await dbConnected(page)), "Database not connected — skip authenticated flows");
    await signIn(page, DEMO.ownerEmail);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: /dashboard sections/i })).toBeVisible();
    await expectPageAccessible(page);
  });

  test("CRM customers meets WCAG A/AA", async ({ page }) => {
    test.skip(!(await dbConnected(page)), "Database not connected — skip authenticated flows");
    await signIn(page, DEMO.ownerEmail);
    await page.goto("/dashboard/customers");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible({
      timeout: 30_000,
    });
    await expectPageAccessible(page);
  });

  test("documentation meets WCAG A/AA and deep-links topics", async ({ page }) => {
    test.skip(!(await dbConnected(page)), "Database not connected — skip authenticated flows");
    await signIn(page, DEMO.ownerEmail);
    await page.goto("/dashboard/docs/orders");
    const topics = page.getByRole("navigation", { name: "Documentation topics" });
    await expect(page.getByRole("heading", { level: 2, name: "Orders" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(topics.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    await expectPageAccessible(page);
    await topics.getByRole("link", { name: "Promotions" }).click();
    await expect(page).toHaveURL(/\/dashboard\/docs\/promotions$/);
    await expect(page.getByRole("heading", { level: 2, name: "Promotions" })).toBeFocused();
  });

  test("every documentation topic renders and meets WCAG A/AA", async ({ page }) => {
    test.skip(!(await dbConnected(page)), "Database not connected — skip authenticated flows");
    test.setTimeout(240_000);
    await signIn(page, DEMO.ownerEmail);
    for (const topic of DOC_TOPICS) {
      await page.goto(`/dashboard/docs/${topic.id}`);
      await expect(page.getByRole("heading", { level: 2, name: topic.title })).toBeVisible({
        timeout: 30_000,
      });
      await expectPageAccessible(page);
    }
  });

  test("orders list meets WCAG A/AA", async ({ page }) => {
    test.skip(!(await dbConnected(page)), "Database not connected — skip authenticated flows");
    await signIn(page, DEMO.ownerEmail);
    await page.goto("/dashboard/orders");
    await expect(page.locator("main#main")).toBeVisible();
    await expectPageAccessible(page);
  });

  test("customer account meets WCAG A/AA", async ({ page }) => {
    test.skip(!(await dbConnected(page)), "Database not connected — skip authenticated flows");
    await signIn(page, DEMO.customerEmail);
    await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
    await expectPageAccessible(page);
  });
});
