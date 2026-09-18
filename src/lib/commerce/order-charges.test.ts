import { describe, expect, it } from "vitest";
import { buildOrderCharges } from "@/lib/commerce/order-charges";
import type { Order } from "@/types";

function pickupOrder(patch: Partial<Order>): Order {
  return {
    id: "ORD-TEST",
    date: "2026-09-17",
    status: "new",
    items: [{ productId: "p1", quantity: 1, price: 24 }],
    total: 15.24,
    subtotal: 24,
    taxAmount: 1.24,
    discountAmount: 10,
    deliveryFee: 0,
    fulfillment: "pickup",
    locationId: "loc1",
    ...patch,
  };
}

describe("buildOrderCharges", () => {
  it("shows loyalty points and stored tax instead of a raw estimate", () => {
    const charges = buildOrderCharges(
      pickupOrder({ loyaltyPointsUsed: 500, loyaltyPointsEarned: 14 }),
    );
    const byKey = Object.fromEntries(charges.lines.map((line) => [line.key, line]));

    expect(byKey.subtotal.amount).toBe(24);
    expect(byKey.loyalty.label).toContain("500");
    expect(byKey.loyalty.amount).toBe(-10);
    expect(byKey.tax.amount).toBe(1.24);
    expect(byKey.tax.label).toBe("Tax");
    expect(byKey.total.amount).toBe(15.24);
    expect(charges.rewards.map((r) => r.key)).toEqual(["redeemed", "earned"]);
  });

  it("splits promo and loyalty when both were used", () => {
    const charges = buildOrderCharges(
      pickupOrder({
        discountAmount: 14,
        couponCode: "WELCOME",
        loyaltyPointsUsed: 500,
        taxAmount: 0.89,
        total: 10.89,
      }),
    );
    const byKey = Object.fromEntries(charges.lines.map((line) => [line.key, line]));
    expect(byKey.loyalty.amount).toBe(-10);
    expect(byKey.promo.label).toBe("Promo WELCOME");
    expect(byKey.promo.amount).toBe(-4);
  });
});
