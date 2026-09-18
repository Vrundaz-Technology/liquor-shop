import { describe, expect, it } from "vitest";
import { shouldSendChannel } from "@/lib/notifications/preferences";

describe("order placed channels", () => {
  it("sends email and SMS for a new order unless the customer turned them off", () => {
    expect(shouldSendChannel("email", "order.confirmed", {})).toBe(true);
    expect(shouldSendChannel("sms", "order.confirmed", {})).toBe(true);
    expect(shouldSendChannel("email", "order.confirmed", { orderEmailUpdates: false })).toBe(false);
    expect(shouldSendChannel("sms", "order.confirmed", { smsUpdates: false })).toBe(false);
  });

  it("still requires SMS to be on for later status texts", () => {
    expect(shouldSendChannel("sms", "order.preparing", {})).toBe(false);
    expect(shouldSendChannel("sms", "order.preparing", { smsUpdates: true })).toBe(true);
  });
});
