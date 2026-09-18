import type { Order } from "@/types";

export type ShopPaymentMethod = "cash" | "card" | "other" | "online";
export type ShopPaymentProvider =
  | "manual"
  | "pos_cash"
  | "pos_card"
  | "pos_other"
  | "online"
  | "stripe"
  | "square";

export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function remainingRefundable(total: number, refundedAmount = 0): number {
  return Math.max(0, roundCents(roundCents(total) - roundCents(refundedAmount)));
}

export function derivePaymentStatus(total: number, refundedAmount = 0): string {
  const remaining = remainingRefundable(total, refundedAmount);
  const refunded = roundCents(refundedAmount);
  if (refunded > 0 && remaining <= 0) return "refunded";
  if (refunded > 0) return "partially_refunded";
  return "paid";
}

export function paymentStatusLabel(status?: string | null): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "partially_refunded":
      return "Partially refunded";
    case "refunded":
      return "Refunded";
    case "paid":
    default:
      return "Paid";
  }
}

export function paymentMethodLabel(method?: string | null): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "card":
      return "Card";
    case "other":
      return "Other";
    case "online":
      return "Online card";
    default:
      return "Payment";
  }
}

export function providerForMethod(
  fulfillment: Order["fulfillment"] | string,
  method: ShopPaymentMethod,
): ShopPaymentProvider {
  if (fulfillment === "pos") {
    if (method === "card") return "pos_card";
    if (method === "other") return "pos_other";
    return "pos_cash";
  }
  if (method === "card" || method === "online") return "online";
  if (method === "cash") return "pos_cash";
  return "manual";
}

export function orderPaymentCopy(order: Order): string {
  const method = paymentMethodLabel(order.paymentMethod);
  const remaining = remainingRefundable(order.total, order.refundedAmount ?? 0);
  const refunded = roundCents(order.refundedAmount ?? 0);

  if (order.paymentStatus === "failed") return "Payment failed";
  if (order.paymentStatus === "unpaid" || order.paymentStatus === "pending") {
    return "Payment pending";
  }
  if (refunded > 0 && remaining <= 0) {
    return order.status === "cancelled"
      ? `Refunded in full · ${method}`
      : `Refunded in full · ${method}`;
  }
  if (refunded > 0) {
    return `Partially refunded · ${method}`;
  }
  if (order.fulfillment === "pos") return `Paid at register · ${method}`;
  if (order.status === "cancelled") return "Payment reversed / cancelled";
  if (
    order.status === "delivered" ||
    order.status === "picked_up" ||
    order.status === "completed"
  ) {
    return `Paid · ${method}`;
  }
  return `Captured · ${method}`;
}

export function orderPaymentColumnLabel(order: Order): string {
  const remaining = remainingRefundable(order.total, order.refundedAmount ?? 0);
  const refunded = roundCents(order.refundedAmount ?? 0);
  if (refunded > 0 && remaining <= 0) return "Refunded";
  if (refunded > 0) return "Partial refund";
  if (order.status === "cancelled") return "Cancelled";
  if (order.fulfillment === "pos") {
    return `POS · ${paymentMethodLabel(order.paymentMethod ?? "cash")}`;
  }
  return paymentStatusLabel(order.paymentStatus ?? "paid");
}
