import { test as base, expect, type Page } from "@playwright/test";
import { AGE_COOKIE } from "../src/lib/age-gate";
import { DEMO_PASSWORD } from "../src/lib/auth/roles";

export const test = base.extend({
  page: async ({ page, context }, use) => {
    await context.addCookies([
      {
        name: AGE_COOKIE,
        value: "1",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await use(page);
  },
});

export { expect };

export const DEMO = {
  ownerEmail: "owner@samsdiscountliquor.com",
  customerEmail: "alex.reed@email.com",
  password: DEMO_PASSWORD,
};

export async function dbConnected(page: Page) {
  const res = await page.request.get("/api/bootstrap");
  if (!res.ok()) return false;
  const body = (await res.json()) as { dbConnected?: boolean };
  return Boolean(body.dbConnected);
}

export async function signIn(page: Page, email: string, password = DEMO.password) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
