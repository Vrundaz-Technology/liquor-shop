import { describe, expect, it } from "vitest";
import {
  amountUntilFreeDelivery,
  calculateShipping,
  calculateTax,
  pricingFromLocation,
} from "@/lib/fulfillment-pricing";

describe("calculateShipping", () => {
  it("is free for pickup and POS", () => {
    expect(calculateShipping(20, "pickup")).toBe(0);
    expect(calculateShipping(20, "pos")).toBe(0);
  });

  it("charges delivery fee below free minimum", () => {
    const loc = { deliveryFee: 12.5, deliveryFreeMinimum: 150, deliveryAvailable: true };
    expect(calculateShipping(100, "delivery", loc)).toBe(12.5);
  });

  it("waives fee at free minimum", () => {
    const loc = { deliveryFee: 12.5, deliveryFreeMinimum: 150, deliveryAvailable: true };
    expect(calculateShipping(150, "delivery", loc)).toBe(0);
  });

  it("returns 0 when delivery is off", () => {
    expect(
      calculateShipping(40, "delivery", { deliveryAvailable: false, deliveryFee: 10 }),
    ).toBe(0);
  });
});

describe("calculateTax", () => {
  it("rounds to cents", () => {
    expect(calculateTax(100, { taxRate: 0.08875 })).toBe(8.88);
  });
});

describe("amountUntilFreeDelivery", () => {
  it("reports remaining dollars until free delivery", () => {
    const loc = pricingFromLocation({ deliveryFreeMinimum: 150, deliveryAvailable: true });
    expect(amountUntilFreeDelivery(120, loc)).toBe(30);
    expect(amountUntilFreeDelivery(150, loc)).toBeNull();
  });
});
