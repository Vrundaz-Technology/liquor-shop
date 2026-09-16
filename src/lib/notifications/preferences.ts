import type { NotificationChannel, NotificationKind } from "@/lib/notifications/types";
import type { UserPreferences } from "@/types";

const TRANSACTIONAL_ORDER = new Set<NotificationKind>([
  "order.confirmed",
  "order.preparing",
  "order.ready",
  "order.driver_assigned",
  "order.picked_up",
  "order.out_for_delivery",
  "order.arriving_soon",
  "order.delivered",
  "order.ready_for_pickup",
  "order.cancelled",
]);

export function shouldSendChannel(
  channel: NotificationChannel,
  kind: NotificationKind,
  prefs?: UserPreferences | null,
  opts?: { marketingConsent?: boolean },
): boolean {
  const p = prefs ?? {};

  if (channel === "email") {
    if (TRANSACTIONAL_ORDER.has(kind)) {
      return p.orderEmailUpdates !== false;
    }
    if (kind === "promo.offer") {
      return Boolean(p.marketingEmails) && opts?.marketingConsent !== false;
    }
    if (kind === "loyalty.reward") return p.loyaltyAlerts !== false;
    if (kind === "stock.back_in_stock") return p.backInStockAlerts !== false;
    if (kind === "price.alert") return p.priceAlerts !== false;
    if (kind === "cart.abandoned") return p.abandonedCartReminders !== false;
    return true;
  }

  if (channel === "sms") {
    if (!p.smsUpdates) return false;
    return TRANSACTIONAL_ORDER.has(kind) || kind === "loyalty.reward" || kind === "cart.abandoned";
  }

  if (channel === "push") {
    if (!p.pushUpdates) return false;
    return true;
  }

  return false;
}
