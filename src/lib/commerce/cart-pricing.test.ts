import { describe, expect, it } from "vitest";
import {
  loyaltyDiscountFromPoints,
  maxRedeemablePoints,
} from "@/lib/commerce/cart-pricing";

describe("loyaltyDiscountFromPoints", () => {
  it("uses exact reward dollar value when points match", () => {
    expect(
      loyaltyDiscountFromPoints({
        points: 500,
        redeemRate: 0.01,
        maxDiscount: 50,
        rewards: [{ points: 500, value: 10 }],
      }),
    ).toEqual({ points: 500, discount: 10 });
  });

  it("caps discount at maxDiscount", () => {
    expect(
      loyaltyDiscountFromPoints({
        points: 5000,
        redeemRate: 0.01,
        maxDiscount: 15,
      }),
    ).toEqual({ points: 1500, discount: 15 });
  });

  it("returns zero when points or max are empty", () => {
    expect(
      loyaltyDiscountFromPoints({ points: 0, redeemRate: 0.01, maxDiscount: 10 }),
    ).toEqual({ points: 0, discount: 0 });
  });
});

describe("maxRedeemablePoints", () => {
  it("respects balance and discount ceiling", () => {
    expect(
      maxRedeemablePoints({
        balance: 2000,
        redeemRate: 0.01,
        maxDiscount: 10,
      }),
    ).toBe(1000);
  });
});
