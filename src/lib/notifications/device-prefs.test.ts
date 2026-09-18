import { describe, expect, it } from "vitest";
import { parseNotificationPrefs } from "@/lib/notifications/device-prefs";
import { parseDashboardPath } from "@/lib/dashboard/routes";

describe("notification device prefs", () => {
  it("defaults to chime with sound on", () => {
    const prefs = parseNotificationPrefs(null);
    expect(prefs.enabled).toBe(true);
    expect(prefs.soundEnabled).toBe(true);
    expect(prefs.autoMarkRead).toBe(false);
    expect(prefs.soundId).toBe("chime");
  });

  it("keeps a custom clip", () => {
    const prefs = parseNotificationPrefs({
      enabled: false,
      autoMarkRead: true,
      soundEnabled: false,
      soundId: "custom-1",
      customSounds: [{ id: "custom-1", name: "Office", dataUrl: "data:audio/wav;base64,AA==" }],
    });
    expect(prefs.enabled).toBe(false);
    expect(prefs.autoMarkRead).toBe(true);
    expect(prefs.customSounds).toHaveLength(1);
    expect(prefs.soundId).toBe("custom-1");
  });
});

describe("dashboard notifications route", () => {
  it("parses /dashboard/notifications", () => {
    expect(parseDashboardPath("/dashboard/notifications").section).toBe("notifications");
  });

  it("parses a customer record path", () => {
    const route = parseDashboardPath("/dashboard/customers/cust-123");
    expect(route.section).toBe("customers");
    expect(route.customerId).toBe("cust-123");
  });
});
