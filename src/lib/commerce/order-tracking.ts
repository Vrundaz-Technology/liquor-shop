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
    id: "driver_assigned",
    label: "Driver assigned",
    description: "A driver or courier is assigned at confirmation",
    statuses: ["assigned"],
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
    description: "Order is packed and waiting for pickup",
    statuses: ["ready"],
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

function deliveryDispatchStarted(order: Pick<Order, "driverId" | "deliveryStatus" | "deliveryChannel">) {
  return Boolean(
    order.driverId ||
      order.deliveryChannel === "shipday" ||
      (order.deliveryStatus && order.deliveryStatus !== "unassigned"),
  );
}

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

  if (order.fulfillment === "pickup") {
    const rank = statusRank(PICKUP_FLOW, status);
    return PICKUP_FLOW.map((step, index) => ({
      id: step.id,
      label: step.label,
      description: step.description,
      done: index <= rank,
      current: index === rank,
    }));
  }

  const dispatched = deliveryDispatchStarted(order);
  const kitchen = status;
  const enRoute =
    order.deliveryStatus === "en_route" || kitchen === "out_for_delivery" || kitchen === "shipped";
  const picked =
    order.deliveryStatus === "picked_up" || kitchen === "picked_up" || enRoute || kitchen === "delivered";
  const packed =
    kitchen === "ready" ||
    kitchen === "assigned" ||
    picked ||
    kitchen === "delivered";
  const preparingDone = packed || kitchen === "preparing";
  const delivered = kitchen === "delivered" || order.deliveryStatus === "delivered";

  const doneById: Record<string, boolean> = {
    confirmed: true,
    driver_assigned: dispatched,
    preparing: preparingDone,
    ready: packed,
    picked_up: picked,
    out_for_delivery: enRoute || delivered,
    delivered,
  };

  const shipday = order.deliveryChannel === "shipday";
  return DELIVERY_FLOW.map((step) => {
    const done = doneById[step.id] ?? false;
    return {
      id: step.id,
      label:
        step.id === "driver_assigned" && shipday
          ? "Courier dispatched"
          : step.label,
      description:
        step.id === "driver_assigned" && shipday
          ? "Sent to Shipday at confirmation"
          : step.description,
      done,
      current: false,
    };
  }).map((step, index, list) => {
    const firstOpen = list.findIndex((s) => !s.done);
    const currentIndex = firstOpen === -1 ? list.length - 1 : firstOpen;
    return { ...step, current: index === currentIndex };
  });
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

  if (status === "assigned" || status === "ready" || order.deliveryStatus === "assigned") {
    return minutes != null
      ? `Estimated delivery · ${Math.max(15, minutes - 10)}–${minutes + 5} min`
      : deliveryEtaForStore(store, deliveryAddressForEta(order.delivery));
  }

  if (minutes != null && minutes > 0) {
    return `Estimated delivery · ${minutes}–${minutes + 15} min`;
  }

  return deliveryEtaForStore(store, deliveryAddressForEta(order.delivery));
}

export function orderPlacedAt(order: Pick<Order, "date" | "createdAt">): Date | null {
  if (order.createdAt) {
    const fromCreated = new Date(order.createdAt);
    if (!Number.isNaN(fromCreated.getTime())) return fromCreated;
  }
  const raw = order.date?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const fromDate = new Date(`${raw}T12:00:00`);
    return Number.isNaN(fromDate.getTime()) ? null : fromDate;
  }
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatOrderPlaced(order: Pick<Order, "date" | "createdAt">) {
  const when = orderPlacedAt(order);
  if (!when) {
    return { label: order.date || "—", dateLabel: order.date || "—", timeLabel: null as string | null };
  }
  const dateLabel = when.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const hasTime = Boolean(order.createdAt) || !/^\d{4}-\d{2}-\d{2}$/.test(order.date.trim());
  const timeLabel = hasTime
    ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
  return {
    label: timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel,
    dateLabel,
    timeLabel,
  };
}
