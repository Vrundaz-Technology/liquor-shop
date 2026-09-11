import { migrateLegacyStatus } from "@/lib/commerce/order-status";
import {
  computeDeliveryEtaMinutes,
  deliveryAddressForEta,
  deliveryEtaForStore,
  pickupEtaForStore,
} from "@/lib/order-eta";
import { getLocationById } from "@/data/locations";
import type { Order, OrderStatus } from "@/types";

export type TrackingStepId =
  | "confirmed"
  | "preparing"
  | "ready"
  | "driver_assigned"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

export type TrackingStep = {
  id: TrackingStepId;
  label: string;
  description?: string;
  done: boolean;
  current: boolean;
};

const DELIVERY_FLOW: {
  id: TrackingStepId;
  label: string;
  description: string;
  statuses: string[];
}[] = [
  {
    id: "confirmed",
    label: "Order confirmed",
    description: "We received your order",
    statuses: ["new", "accepted", "processing"],
  },
  {
    id: "preparing",
    label: "Preparing",
    description: "Staff are packing your bottles",
    statuses: ["preparing"],
  },
  {
    id: "ready",
    label: "Ready",
    description: "Order is ready for a driver",
    statuses: ["ready"],
  },
  {
    id: "driver_assigned",
    label: "Driver assigned",
    description: "A driver is assigned to your run",
    statuses: ["assigned"],
  },
  {
    id: "picked_up",
    label: "Picked up",
    description: "Driver collected your order",
    statuses: ["picked_up"],
  },
  {
    id: "out_for_delivery",
    label: "Out for delivery",
    description: "On the way to you",
    statuses: ["out_for_delivery", "shipped"],
  },
  {
    id: "delivered",
    label: "Delivered",
    description: "Enjoy responsibly",
    statuses: ["delivered"],
  },
];

const PICKUP_FLOW: {
  id: TrackingStepId;
  label: string;
  description: string;
  statuses: string[];
}[] = [
  {
    id: "confirmed",
    label: "Order confirmed",
    description: "We received your order",
    statuses: ["new", "accepted", "processing"],
  },
  {
    id: "preparing",
    label: "Preparing",
    description: "Staff are packing your bottles",
    statuses: ["preparing"],
  },
  {
    id: "ready_for_pickup",
    label: "Ready for pickup",
    description: "Come to the store counter",
    statuses: ["ready", "ready_for_pickup"],
  },
  {
    id: "picked_up",
    label: "Picked up",
    description: "Collected at the store",
    statuses: ["picked_up", "delivered"],
  },
];

function statusRank(flow: { statuses: string[] }[], status: string): number {
  const idx = flow.findIndex((step) => step.statuses.includes(status));
  return idx >= 0 ? idx : 0;
}

export function resolveOrderStatus(order: Pick<Order, "status" | "fulfillment" | "deliveryStatus">) {
  return migrateLegacyStatus(order.status, order.fulfillment, order.deliveryStatus);
}

/** Customer-facing timeline for delivery / pickup / POS. */
export function buildTrackingSteps(order: Order): TrackingStep[] {
  const status = resolveOrderStatus(order);

  if (order.fulfillment === "pos") {
    return [
      {
        id: "confirmed",
        label: "Order confirmed",
        description: "Sale recorded at register",
        done: true,
        current: false,
      },
      {
        id: "completed",
        label: status === "cancelled" ? "Cancelled" : "Completed",
        description: status === "cancelled" ? "This sale was voided" : "Paid in store",
        done: true,
        current: true,
      },
    ];
  }

  if (status === "cancelled") {
    const base = order.fulfillment === "pickup" ? PICKUP_FLOW : DELIVERY_FLOW;
    return [
      ...base.slice(0, 1).map((step) => ({
        id: step.id,
        label: step.label,
        description: step.description,
        done: true,
        current: false,
      })),
      {
        id: "cancelled" as const,
        label: "Cancelled",
        description: "This order was cancelled",
        done: true,
        current: true,
      },
    ];
  }

  const flow = order.fulfillment === "pickup" ? PICKUP_FLOW : DELIVERY_FLOW;
  // Prefer deliveryStatus for the distinct "picked up" moment when order.status
  // has already advanced to out_for_delivery (legacy dual-field writes).
  let effective = status;
  if (
    order.fulfillment === "delivery" &&
    order.deliveryStatus === "picked_up" &&
    (status === "assigned" || status === "out_for_delivery")
  ) {
    effective = "picked_up";
  }
  if (order.fulfillment === "delivery" && order.deliveryStatus === "en_route") {
    effective = "out_for_delivery";
  }

  const rank = statusRank(flow, effective);
  return flow.map((step, index) => ({
    id: step.id,
    label: step.label,
    description: step.description,
    done: index <= rank,
    current: index === rank,
  }));
}

export function customerStatusLabel(order: Order): string {
  const steps = buildTrackingSteps(order);
  return steps.find((s) => s.current)?.label ?? ORDER_STATUS_FALLBACK[order.status] ?? order.status;
}

const ORDER_STATUS_FALLBACK: Partial<Record<OrderStatus, string>> = {
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
};

/** Attach a computed ETA when the order does not already carry one. */
export function withComputedEta(order: Order): Order {
  if (order.fulfillment !== "delivery" || order.etaMinutes != null) return order;
  const store = getLocationById(order.locationId);
  if (!store?.deliveryAvailable) return order;
  const etaMinutes = computeDeliveryEtaMinutes(store, deliveryAddressForEta(order.delivery));
  return etaMinutes != null ? { ...order, etaMinutes } : order;
}

/** ETA copy when legally/technically appropriate (not for terminal/cancelled). */
export function trackingEtaLabel(order: Order): string | null {
  if (order.fulfillment === "pos" || order.status === "cancelled") return null;
  const status = resolveOrderStatus(order);
  if (status === "delivered" || (order.fulfillment === "pickup" && status === "picked_up")) {
    return null;
  }

  const store = getLocationById(order.locationId);
  if (!store) return null;

  if (order.fulfillment === "pickup") {
    if (status === "ready_for_pickup" || status === "ready") {
      return "Ready now — pickup during store hours";
    }
    return pickupEtaForStore(store);
  }

  if (!store.deliveryAvailable) return null;

  const enriched = withComputedEta(order);
  const minutes = enriched.etaMinutes;

  if (status === "out_for_delivery" || status === "picked_up") {
    return minutes != null
      ? `Arriving in about ${Math.max(5, Math.min(minutes, 40))} min (estimate)`
      : "Arriving soon";
  }

  if (status === "assigned" || status === "ready") {
    return minutes != null
      ? `Estimated delivery · ${Math.max(15, minutes - 10)}–${minutes + 5} min`
      : deliveryEtaForStore(store, deliveryAddressForEta(order.delivery));
  }

  if (minutes != null && minutes > 0) {
    return `Estimated delivery · ${minutes}–${minutes + 15} min`;
  }

  return deliveryEtaForStore(store, deliveryAddressForEta(order.delivery));
}
