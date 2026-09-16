import { StubNotifier } from "@/lib/notifications/providers/stub";
import { shouldSendChannel } from "@/lib/notifications/preferences";
import {
  abandonedCartPayload,
  backInStockPayload,
  loyaltyPayload,
  notificationKindsForOrderStatus,
  orderNotificationPayload,
  priceAlertPayload,
  promoPayload,
} from "@/lib/notifications/templates";
import type {
  NotificationChannel,
  NotificationKind,
  NotificationPayload,
  NotificationResult,
  Notifier,
} from "@/lib/notifications/types";
import type { UserPreferences } from "@/types";

const CHANNELS: NotificationChannel[] = ["email", "sms", "push"];

let notifier: Notifier = new StubNotifier();

export function setNotifier(next: Notifier) {
  notifier = next;
}

export function getNotifier() {
  return notifier;
}

export async function dispatchNotification(
  payload: NotificationPayload,
  prefs?: UserPreferences | null,
  opts?: { marketingConsent?: boolean; channels?: NotificationChannel[] },
): Promise<NotificationResult[]> {
  const channels = opts?.channels ?? CHANNELS;
  const results: NotificationResult[] = [];

  for (const channel of channels) {
    if (!shouldSendChannel(channel, payload.kind, prefs, opts)) {
      results.push({ channel, ok: false, skipped: true, reason: "preference" });
      continue;
    }
    try {
      results.push(await notifier.send(channel, payload));
    } catch (error) {
      console.error(`[notify] ${channel} failed`, error);
      results.push({
        channel,
        ok: false,
        reason: error instanceof Error ? error.message : "send failed",
      });
    }
  }

  return results;
}

export async function notifyOrderStatus(input: {
  fulfillment: string;
  status: string;
  orderId: string;
  tracking?: string | null;
  storeName?: string | null;
  driverName?: string | null;
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  prefs?: UserPreferences | null;
  /** When true, skip "confirmed" (already sent at place). */
  skipConfirmed?: boolean;
}) {
  let kinds = notificationKindsForOrderStatus(input.fulfillment, input.status);
  if (input.skipConfirmed) {
    kinds = kinds.filter((k) => k !== "order.confirmed");
  }
  const results: NotificationResult[] = [];
  for (const kind of kinds) {
    const payload = orderNotificationPayload(kind, input);
    if (!payload) continue;
    results.push(...(await dispatchNotification(payload, input.prefs)));
  }
  return results;
}

export async function notifyOrderConfirmed(input: {
  orderId: string;
  tracking?: string | null;
  storeName?: string | null;
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  prefs?: UserPreferences | null;
}) {
  const payload = orderNotificationPayload("order.confirmed", input);
  if (!payload) return [];
  return dispatchNotification(payload, input.prefs);
}

export async function notifyPromo(input: {
  userId?: string | null;
  email?: string | null;
  title: string;
  body: string;
  promotionId?: string;
  prefs?: UserPreferences | null;
  marketingConsent?: boolean;
}) {
  return dispatchNotification(promoPayload(input), input.prefs, {
    marketingConsent: input.marketingConsent,
    channels: ["email", "push"],
  });
}

export async function notifyLoyalty(input: {
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  points?: number;
  tier?: string;
  message?: string;
  prefs?: UserPreferences | null;
}) {
  return dispatchNotification(loyaltyPayload(input), input.prefs);
}

export async function notifyBackInStock(input: {
  userId?: string | null;
  email?: string | null;
  productName: string;
  productId: string;
  prefs?: UserPreferences | null;
}) {
  return dispatchNotification(backInStockPayload(input), input.prefs, {
    channels: ["email", "push"],
  });
}

export async function notifyPriceAlert(input: {
  userId?: string | null;
  email?: string | null;
  productName: string;
  productId: string;
  price: number;
  prefs?: UserPreferences | null;
}) {
  return dispatchNotification(priceAlertPayload(input), input.prefs, {
    channels: ["email", "push"],
  });
}

export async function notifyAbandonedCart(input: {
  userId?: string | null;
  email?: string | null;
  itemCount: number;
  prefs?: UserPreferences | null;
}) {
  return dispatchNotification(abandonedCartPayload(input), input.prefs, {
    channels: ["email", "push", "sms"],
  });
}

export type { NotificationKind, NotificationPayload, NotificationResult };
