import { loyaltyDiscountFromPoints } from "@/lib/commerce/cart-pricing";
import { remainingRefundable } from "@/lib/commerce/payments";
import {
  calculateShipping,
  calculateTax,
  type LocationPricingFields,
} from "@/lib/fulfillment-pricing";
import type { Order } from "@/types";

const DEFAULT_REDEEM_RATE = 0.02;

export type OrderChargeLine = {
  key: string;
  label: string;
  amount: number;
  kind: "debit" | "credit" | "total";
  free?: boolean;
};

export type OrderRewardFact = {
  key: string;
  label: string;
  detail: string;
};

export function buildOrderCharges(
  order: Order,
  location?: Partial<LocationPricingFields> | null,
) {
  const itemsSubtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const subtotal = order.subtotal ?? itemsSubtotal;
  const discount = Math.max(0, order.discountAmount ?? 0);
  const pointsUsed = Math.max(0, order.loyaltyPointsUsed ?? 0);
  const pointsEarned = Math.max(0, order.loyaltyPointsEarned ?? 0);
  const coupon = order.couponCode?.trim() || undefined;

  let loyaltyDiscount = 0;
  let promoDiscount = 0;
  if (discount > 0) {
    if (pointsUsed > 0 && coupon) {
      loyaltyDiscount = loyaltyDiscountFromPoints({
        points: pointsUsed,
        redeemRate: DEFAULT_REDEEM_RATE,
        maxDiscount: discount,
      }).discount;
      promoDiscount = Math.max(0, Math.round((discount - loyaltyDiscount) * 100) / 100);
    } else if (pointsUsed > 0) {
      loyaltyDiscount = discount;
    } else if (coupon) {
      promoDiscount = discount;
    }
  }

  const deliveryFee =
    order.deliveryFee ??
    (order.fulfillment === "delivery"
      ? calculateShipping(subtotal - discount, "delivery", location)
      : 0);
  const taxEstimated = order.taxAmount == null;
  const tax = order.taxAmount ?? calculateTax(subtotal - discount, location);

  const lines: OrderChargeLine[] = [
    { key: "subtotal", label: "Subtotal", amount: subtotal, kind: "debit" },
  ];

  if (promoDiscount > 0) {
    lines.push({
      key: "promo",
      label: coupon ? `Promo ${coupon}` : "Promotion",
      amount: -promoDiscount,
      kind: "credit",
    });
  }

  if (loyaltyDiscount > 0) {
    lines.push({
      key: "loyalty",
      label: pointsUsed > 0 ? `Loyalty (${pointsUsed.toLocaleString()} pts)` : "Loyalty",
      amount: -loyaltyDiscount,
      kind: "credit",
    });
  } else if (discount > 0 && promoDiscount === 0) {
    lines.push({
      key: "discount",
      label: "Discounts",
      amount: -discount,
      kind: "credit",
    });
  }

  if (order.fulfillment === "delivery") {
    lines.push({
      key: "delivery",
      label: "Delivery",
      amount: deliveryFee,
      kind: "debit",
      free: deliveryFee <= 0,
    });
  }

  lines.push({
    key: "tax",
    label: taxEstimated ? "Tax (est.)" : "Tax",
    amount: tax,
    kind: "debit",
  });

  const refunded = Math.max(0, order.refundedAmount ?? 0);
  if (refunded > 0) {
    lines.push({
      key: "refunded",
      label: remainingRefundable(order.total, refunded) <= 0 ? "Refunded" : "Refunded so far",
      amount: -refunded,
      kind: "credit",
    });
  }

  const netPaid = remainingRefundable(order.total, refunded);
  lines.push({
    key: "total",
    label: refunded > 0 ? "Net paid" : "Total paid",
    amount: netPaid,
    kind: "total",
  });

  const rewards: OrderRewardFact[] = [];
  if (pointsUsed > 0) {
    rewards.push({
      key: "redeemed",
      label: `${pointsUsed.toLocaleString()} pts redeemed`,
      detail:
        loyaltyDiscount > 0
          ? `Took ${formatMoney(loyaltyDiscount)} off this order`
          : "Applied at checkout",
    });
  }
  if (coupon) {
    rewards.push({
      key: "coupon",
      label: `Promo ${coupon}`,
      detail:
        promoDiscount > 0 ? `Took ${formatMoney(promoDiscount)} off` : "Applied at checkout",
    });
  }
  if (pointsEarned > 0) {
    rewards.push({
      key: "earned",
      label: `${pointsEarned.toLocaleString()} pts earned`,
      detail: "Added to your loyalty balance after this order",
    });
  }

  return {
    lines,
    rewards,
    location,
    subtotal,
    discount,
    loyaltyDiscount,
    promoDiscount,
    deliveryFee,
    tax,
    taxEstimated,
    pointsUsed,
    pointsEarned,
    coupon,
  };
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
