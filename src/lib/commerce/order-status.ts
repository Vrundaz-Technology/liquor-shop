/** Canonical order / fulfillment status machine (doc-aligned). */

export const DELIVERY_STATUSES = [
  "new",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export const PICKUP_STATUSES = [
  "new",
  "preparing",
  "ready_for_pickup",
  "picked_up",
  "cancelled",
] as const;

export const POS_STATUSES = ["completed", "cancelled"] as const;

export type DeliveryOrderStatus = (typeof DELIVERY_STATUSES)[number];
export type PickupOrderStatus = (typeof PICKUP_STATUSES)[number];
export type PosOrderStatus = (typeof POS_STATUSES)[number];
export type OrderStatus =
  | DeliveryOrderStatus
  | PickupOrderStatus
  | PosOrderStatus
  | "processing"
  | "shipped"
  | "ready"
  | "delivered";

const DELIVERY_TRANSITIONS: Record<string, string[]> = {
  new: ["accepted", "preparing", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["assigned", "cancelled"],
  assigned: ["picked_up", "out_for_delivery", "cancelled"],
  picked_up: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  // Legacy aliases accepted by migrateLegacyStatus writers
  processing: ["accepted", "preparing", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "cancelled"],
};

const PICKUP_TRANSITIONS: Record<string, string[]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

const POS_TRANSITIONS: Record<string, string[]> = {
  completed: ["cancelled"],
  cancelled: [],
};

/** Map legacy statuses into the doc lifecycle. */
export function migrateLegacyStatus(
  status: string,
  fulfillment: string,
  deliveryStatus?: string | null,
): string {
  if (
    DELIVERY_STATUSES.includes(status as DeliveryOrderStatus) ||
    PICKUP_STATUSES.includes(status as PickupOrderStatus) ||
    POS_STATUSES.includes(status as PosOrderStatus)
  ) {
    return status;
  }

  if (fulfillment === "pos") {
    if (status === "cancelled") return "cancelled";
    return "completed";
  }

  if (fulfillment === "pickup") {
    if (status === "cancelled") return "cancelled";
    if (status === "delivered") return "picked_up";
    if (status === "ready") return "ready_for_pickup";
    if (status === "processing" || status === "shipped") return "preparing";
    return "new";
  }

  // delivery
  if (status === "cancelled") return "cancelled";
  if (status === "delivered" || deliveryStatus === "delivered") return "delivered";
  if (deliveryStatus === "en_route") return "out_for_delivery";
  if (deliveryStatus === "picked_up") return "picked_up";
  if (deliveryStatus === "assigned" || status === "shipped") return "assigned";
  if (status === "ready") return "ready";
  if (status === "processing") return "new";
  return "new";
}

export function initialOrderStatus(fulfillment: "delivery" | "pickup" | "pos"): string {
  if (fulfillment === "pos") return "completed";
  return "new";
}

export function canTransitionStatus(
  fulfillment: string,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const map =
    fulfillment === "delivery"
      ? DELIVERY_TRANSITIONS
      : fulfillment === "pickup"
        ? PICKUP_TRANSITIONS
        : POS_TRANSITIONS;
  return (map[from] ?? []).includes(to);
}

export function isTerminalStatus(status: string): boolean {
  return (
    status === "delivered" ||
    status === "picked_up" ||
    status === "completed" ||
    status === "cancelled"
  );
}

export function isCancellableStatus(status: string): boolean {
  return !isTerminalStatus(status) || status === "completed";
}

export function availableStock(onHand: number, reserved = 0): number {
  return Math.max(0, onHand - reserved);
}
