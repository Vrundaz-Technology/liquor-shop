import type {
  NotificationChannel,
  NotificationPayload,
  NotificationResult,
  Notifier,
} from "@/lib/notifications/types";

/** Default provider — logs payloads. Swap via NOTIFICATION_PROVIDER later. */
export class StubNotifier implements Notifier {
  async send(
    channel: NotificationChannel,
    payload: NotificationPayload,
  ): Promise<NotificationResult> {
    const to =
      channel === "email"
        ? payload.email
        : channel === "sms"
          ? payload.phone
          : payload.pushSubscriptionId ?? payload.userId;

    if (!to) {
      return { channel, ok: false, skipped: true, reason: `No ${channel} destination` };
    }

    console.info(
      `[notify:${channel}] ${payload.kind} → ${to} | ${payload.title} — ${payload.body}`,
    );
    return { channel, ok: true };
  }
}
