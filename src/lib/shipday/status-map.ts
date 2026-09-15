import type { DeliveryStatus } from "@/types";

/** Shipday order_status / orderState values we care about. */
export type ShipdayProviderStatus =
  | "NOT_ASSIGNED"
  | "NOT_ACCEPTED"
  | "NOT_STARTED_YET"
  | "STARTED"
  | "PICKED_UP"
  | "READY_TO_DELIVER"
  | "ALREADY_DELIVERED"
  | "FAILED_DELIVERY"
  | "INCOMPLETE"
  | "ASSIGNED"
  | "ACCEPTED";

export type MappedShipdayStatus = {
  deliveryStatus: DeliveryStatus;
  orderStatus: string | null;
  failed: boolean;
};

const FAILED = new Set(["FAILED_DELIVERY", "INCOMPLETE"]);

export function normalizeShipdayStatus(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

export function mapShipdayStatus(raw: string | null | undefined): MappedShipdayStatus {
  const status = normalizeShipdayStatus(raw);

  if (FAILED.has(status)) {
    return { deliveryStatus: "assigned", orderStatus: null, failed: true };
  }
  if (status === "ALREADY_DELIVERED") {
    return { deliveryStatus: "delivered", orderStatus: "delivered", failed: false };
  }
  if (status === "PICKED_UP" || status === "READY_TO_DELIVER") {
    return { deliveryStatus: "en_route", orderStatus: "out_for_delivery", failed: false };
  }
  if (status === "STARTED" || status === "ASSIGNED" || status === "ACCEPTED") {
    return { deliveryStatus: "assigned", orderStatus: null, failed: false };
  }
  return { deliveryStatus: "assigned", orderStatus: null, failed: false };
}

export function isShipdayTerminalFailure(raw: string | null | undefined) {
  return FAILED.has(normalizeShipdayStatus(raw));
}
