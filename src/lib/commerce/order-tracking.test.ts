import { describe, expect, it } from "vitest";
import { buildTrackingSteps } from "@/lib/commerce/order-tracking";
import type { Order } from "@/types";

function order(partial: Partial<Order>): Order {
  return {
    id: "ORD-1",
    date: "2026-09-11",
    status: "new",
    items: [],
    total: 40,
    fulfillment: "delivery",
    locationId: "loc1",
    ...partial,
  };
}

describe("delivery tracking at confirmation", () => {
  it("shows driver assigned while kitchen is still new", () => {
    const steps = buildTrackingSteps(
      order({ deliveryStatus: "assigned", driverId: "d1", deliveryChannel: "internal" }),
    );
    const assigned = steps.find((s) => s.id === "driver_assigned");
    expect(assigned?.done).toBe(true);
    const preparing = steps.find((s) => s.id === "preparing");
    expect(preparing?.done).toBe(false);
  });

  it("labels Shipday as courier dispatched", () => {
    const steps = buildTrackingSteps(
      order({ deliveryChannel: "shipday", deliveryStatus: "assigned" }),
    );
    expect(steps.find((s) => s.id === "driver_assigned")?.label).toBe("Courier dispatched");
  });
});
