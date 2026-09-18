import { describe, expect, it } from "vitest";
import {
  latestNoticeByChannel,
  notifyReasonCopy,
  notifyStatusLabel,
  type OrderNotificationLog,
} from "@/lib/notifications/order-log";

function entry(partial: Partial<OrderNotificationLog>): OrderNotificationLog {
  return {
    id: "1",
    orderId: "ORD-1",
    kind: "order.confirmed",
    audience: "customer",
    channel: "email",
    destination: "p***@shop.com",
    ok: true,
    skipped: false,
    reason: null,
    trigger: "auto",
    title: "Confirmed",
    createdAt: "2026-09-18T00:00:00.000Z",
    ...partial,
  };
}

describe("order notification log copy", () => {
  it("labels sent and skipped customer channels", () => {
    expect(notifyStatusLabel(entry({ ok: true, skipped: false }))).toBe("sent");
    expect(notifyStatusLabel(entry({ ok: false, skipped: true }))).toBe("skipped");
    expect(
      notifyReasonCopy(
        entry({ ok: false, skipped: true, reason: "preference", channel: "sms" }),
      ),
    ).toBe("Customer SMS disabled");
  });

  it("keeps the latest attempt per audience and channel", () => {
    const latest = latestNoticeByChannel([
      entry({ id: "new", channel: "email", ok: true }),
      entry({ id: "old", channel: "email", ok: false, skipped: true, reason: "preference" }),
      entry({ id: "sms", channel: "sms", ok: false, skipped: true, reason: "No sms destination" }),
    ]);
    expect(latest).toHaveLength(2);
    expect(latest[0]?.id).toBe("new");
    expect(latest[1]?.channel).toBe("sms");
  });
});
