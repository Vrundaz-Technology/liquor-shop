import type { OrderStatus } from "@/types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Order confirmed",
  accepted: "Order confirmed",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Driver assigned",
  picked_up: "Picked up",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  processing: "Order confirmed",
  shipped: "Out for delivery",
};

export const ORDER_STATUS_DOT: Record<OrderStatus, string> = {
  new: "bg-amber-400",
  accepted: "bg-amber-300",
  preparing: "bg-orange-400",
  ready: "bg-emerald-400",
  assigned: "bg-sky-400",
  picked_up: "bg-sky-300",
  out_for_delivery: "bg-sky-300",
  delivered: "bg-emerald-300",
  ready_for_pickup: "bg-emerald-400",
  completed: "bg-emerald-300",
  cancelled: "bg-(--danger)",
  processing: "bg-amber-400",
  shipped: "bg-sky-400",
};

export function nextStaffStatus(
  fulfillment: string,
  status: OrderStatus,
): OrderStatus | null {
  if (fulfillment === "pickup") {
    if (status === "new" || status === "processing" || status === "accepted") {
      return "preparing";
    }
    if (status === "preparing") return "ready_for_pickup";
    if (status === "ready" || status === "ready_for_pickup") return "picked_up";
    return null;
  }
  if (fulfillment === "delivery") {
    // Kitchen pipeline only — dispatch (driver → delivered) lives in Deliveries.
    // Skip internal "accepted" so the customer timeline moves to Preparing next.
    if (status === "new" || status === "processing" || status === "accepted") {
      return "preparing";
    }
    if (status === "preparing") return "ready";
    return null;
  }
  return null;
}

/** Delivery orders that kitchen has released for driver assignment. */
export function isDeliveryReadyForDispatch(status: OrderStatus | string) {
  return [
    "ready",
    "assigned",
    "picked_up",
    "out_for_delivery",
    "delivered",
    "shipped",
  ].includes(status);
}

/** Kitchen stages before dispatch (Orders panel). */
export function isDeliveryKitchenStage(status: OrderStatus | string) {
  return ["new", "accepted", "processing", "preparing"].includes(status);
}

export function isOpenOrderStatus(status: OrderStatus) {
  return ![
    "delivered",
    "picked_up",
    "completed",
    "cancelled",
  ].includes(status);
}
