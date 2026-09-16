export type NotificationChannel = "email" | "sms" | "push";

export type NotificationKind =
  | "order.confirmed"
  | "order.preparing"
  | "order.ready"
  | "order.driver_assigned"
  | "order.picked_up"
  | "order.out_for_delivery"
  | "order.arriving_soon"
  | "order.delivered"
  | "order.ready_for_pickup"
  | "order.cancelled"
  | "promo.offer"
  | "loyalty.reward"
  | "stock.back_in_stock"
  | "price.alert"
  | "cart.abandoned";

export type NotificationPayload = {
  kind: NotificationKind;
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  pushSubscriptionId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type NotificationResult = {
  channel: NotificationChannel;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
};

export interface Notifier {
  send(
    channel: NotificationChannel,
    payload: NotificationPayload,
  ): Promise<NotificationResult>;
}
