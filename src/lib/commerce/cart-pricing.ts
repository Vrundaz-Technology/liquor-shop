/** Shared cart/checkout money math for coupons + loyalty redeem. */

export type LoyaltyRewardOption = {
  points: number;
  value: number;
  label?: string;
};

/**
 * Convert points to a dollar discount.
 * If `rewards` includes an exact points match, use that reward's dollar value
 * (so "500 pts = $10" works even when rate would imply something else).
 */
export function loyaltyDiscountFromPoints(input: {
  points: number;
  redeemRate: number;
  maxDiscount: number;
  rewards?: LoyaltyRewardOption[] | null;
}) {
  const points = Math.max(0, Math.trunc(input.points));
  const rate = Math.max(0, input.redeemRate);
  if (!points || input.maxDiscount <= 0) {
    return { points: 0, discount: 0 };
  }

  const exact = input.rewards?.find((r) => r.points === points && r.value > 0);
  if (exact) {
    const discount = Math.min(input.maxDiscount, Math.round(exact.value * 100) / 100);
    return { points, discount };
  }

  if (!rate) return { points: 0, discount: 0 };
  const raw = Math.round(points * rate * 100) / 100;
  const discount = Math.min(input.maxDiscount, raw);
  const used = Math.min(points, Math.ceil(discount / rate - 1e-9));
  return { points: used, discount };
}

export function maxRedeemablePoints(input: {
  balance: number;
  redeemRate: number;
  maxDiscount: number;
  rewards?: LoyaltyRewardOption[] | null;
}) {
  const rate = Math.max(0, input.redeemRate);
  if (input.maxDiscount <= 0 || input.balance <= 0) return 0;

  let max = rate > 0 ? Math.min(input.balance, Math.floor(input.maxDiscount / rate + 1e-9)) : 0;
  for (const reward of input.rewards ?? []) {
    if (reward.points <= input.balance && reward.value <= input.maxDiscount + 1e-9) {
      max = Math.max(max, reward.points);
    }
  }
  return max;
}
