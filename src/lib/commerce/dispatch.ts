export const DISPATCH_POLICIES = ["manual", "internal_first", "shipday_always"] as const;
export type DispatchPolicy = (typeof DISPATCH_POLICIES)[number];

export type DeliveryChannel = "internal" | "shipday";

export const ALCOHOL_HANDOFF_NOTE =
  "ID check required — recipient must be 21+. Do not leave unattended. Signature required.";

export const ALCOHOL_PICKUP_NOTE =
  "Liquor order. Wait for store staff to hand off after an ID check. Do not pick up until the store confirms the order is packed.";

export function isDispatchPolicy(value: unknown): value is DispatchPolicy {
  return typeof value === "string" && (DISPATCH_POLICIES as readonly string[]).includes(value);
}

export function parseDispatchPolicy(value: unknown): DispatchPolicy {
  return isDispatchPolicy(value) ? value : "internal_first";
}

/** Dispatch (assign / send to Shipday) is allowed as soon as the order is confirmed. */
export function isDeliveryConfirmedForDispatch(status: string) {
  return !["cancelled", "delivered"].includes(status);
}

const KITCHEN_OPEN = new Set(["new", "accepted", "processing", "preparing"]);

/** Keep packing status when a driver is assigned at confirmation. */
export function orderStatusAfterAssign(currentStatus: string) {
  if (KITCHEN_OPEN.has(currentStatus)) return currentStatus;
  if (currentStatus === "ready" || currentStatus === "assigned") return "assigned";
  return currentStatus;
}

const PICKUP_READY = new Set(["ready", "assigned", "picked_up", "out_for_delivery", "shipped"]);

/** Internal drivers cannot leave until kitchen has packed. Shipday pickup is webhook-driven. */
export function canMarkInternalPickedUp(kitchenStatus: string) {
  return PICKUP_READY.has(kitchenStatus);
}

export function chooseDispatchChannel(opts: {
  policy: DispatchPolicy;
  internalEnabled: boolean;
  shipdayEnabled: boolean;
  hasAvailableDriver: boolean;
  shipdayConfigured: boolean;
}): DeliveryChannel | "none" {
  const canInternal = opts.internalEnabled && opts.hasAvailableDriver;
  const canShipday = opts.shipdayEnabled && opts.shipdayConfigured;

  if (opts.policy === "manual") return "none";

  if (opts.policy === "shipday_always") {
    if (canShipday) return "shipday";
    if (canInternal) return "internal";
    return "none";
  }

  if (canInternal) return "internal";
  if (canShipday) return "shipday";
  return "none";
}

export function formatLocationAddress(loc: {
  address: string;
  city: string;
  state: string;
  zip: string;
}) {
  return `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}, USA`;
}

export function formatDeliveryAddress(addr: {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}) {
  const street = addr.line2 ? `${addr.line1}, ${addr.line2}` : addr.line1;
  return `${street}, ${addr.city}, ${addr.state} ${addr.zip}, USA`;
}

export function formatPhoneForShipday(phone: string) {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

export function publicSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function shipdayWebhookUrl() {
  return `${publicSiteUrl()}/api/webhooks/shipday`;
}
