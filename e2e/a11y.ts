import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";
import { expect, type Page } from "@playwright/test";

/** WCAG 2.2 A/AA automated rules. Color contrast stays on so we catch unreadably dim text. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function formatViolations(violations: Result[]) {
  if (!violations.length) return "no violations";
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 10)
        .map((node) => `    - ${node.target.join(" ")}\n      ${node.failureSummary ?? node.html}`)
        .join("\n");
      const extra =
        violation.nodes.length > 10 ? `\n    … ${violation.nodes.length - 10} more nodes` : "";
      return `${violation.id} [${violation.impact ?? "unknown"}] ${violation.help} (${violation.nodes.length})\n${nodes}${extra}`;
    })
    .join("\n\n");
}

export async function expectPageAccessible(
  page: Page,
  opts?: {
    /** Extra axe excludes (CSS selectors). */
    exclude?: string[];
  },
) {
  await expect(page.locator("main#main")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(250);
  let builder = new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude(".leaflet-container")
    .exclude("model-viewer")
    .exclude("canvas")
    .exclude("nextjs-portal");
  for (const selector of opts?.exclude ?? []) {
    builder = builder.exclude(selector);
  }
  const results = await builder.analyze();
  expect(results.violations, formatViolations(results.violations)).toEqual([]);
}
