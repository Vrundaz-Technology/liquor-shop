import { StubNotifier } from "@/lib/notifications/providers/stub";
import { activeNotifyEmails, activeNotifyPhones } from "@/lib/notifications/destinations";
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

async function sendOne(
  channel: NotificationChannel,
  payload: NotificationPayload,
): Promise<NotificationResult> {
  try {
    return await notifier.send(channel, payload);
  } catch (error) {
    console.error(`[notify] ${channel} failed`, error);
    return {
      channel,
      ok: false,
      reason: error instanceof Error ? error.message : "send failed",
    };
  }
}

export async function dispatchNotification(
  payload: NotificationPayload,
  prefs?: UserPreferences | null,
  opts?: {
    marketingConsent?: boolean;
    channels?: NotificationChannel[];
    force?: boolean;
    trigger?: "auto" | "manual_resend";
    actorUserId?: string | null;
  },
): Promise<NotificationResult[]> {
  const channels = opts?.channels ?? CHANNELS;
  const emails = activeNotifyEmails(prefs, payload.email);
  const phones = activeNotifyPhones(prefs, payload.phone);

  const batches = await Promise.all(
    channels.map(async (channel): Promise<NotificationResult[]> => {
      if (!opts?.force && !shouldSendChannel(channel, payload.kind, prefs, opts)) {
        return [
          {
            channel,
            ok: false,
            skipped: true,
            reason: "preference",
            destination: channel === "sms" ? payload.phone : payload.email,
          },
        ];
      }
      if (channel === "email") {
        if (!emails.length) {
          return [{ channel, ok: false, skipped: true, reason: "No email destination" }];
        }
        return Promise.all(
          emails.map(async (email) => ({
            ...(await sendOne(channel, { ...payload, email })),
            destination: email,
          })),
        );
      }
      if (channel === "sms") {
        if (!phones.length) {
          return [{ channel, ok: false, skipped: true, reason: "No sms destination" }];
        }
        return Promise.all(
          phones.map(async (phone) => ({
            ...(await sendOne(channel, { ...payload, phone })),
            destination: phone,
          })),
        );
      }
      return [
        {
          ...(await sendOne(channel, payload)),
          destination: payload.userId,
        },
      ];
    }),
  );
  const results = batches.flat();

  const orderId =
    payload.data && typeof payload.data.orderId === "string" ? payload.data.orderId : null;
  if (orderId) {
    try {
      const { recordCustomerOrderNotices } = await import("@/lib/db/order-notifications");
      await recordCustomerOrderNotices({
        orderId,
        kind: payload.kind,
        title: payload.title,
        results,
        trigger: opts?.trigger,
        actorUserId: opts?.actorUserId,
      });
    } catch (error) {
      console.error("[notify] persist failed", error);
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
  return dispatchNotification(payload, input.prefs, {
    channels: ["email", "sms"],
  });
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
