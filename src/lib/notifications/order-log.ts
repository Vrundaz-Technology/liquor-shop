export type NotifyAudience = "customer" | "staff";
export type NotifyTrigger = "auto" | "manual_resend";
export type OrderNotifyChannel = "email" | "sms" | "push" | "in_app";

export type OrderNotificationLog = {
  id: string;
  orderId: string;
  kind: string;
  audience: NotifyAudience;
  channel: OrderNotifyChannel;
  destination: string | null;
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  trigger: NotifyTrigger;
  title: string | null;
  createdAt: string;
};

export type OrderNotifySummary = {
  email?: "sent" | "skipped" | "failed";
  sms?: "sent" | "skipped" | "failed";
};

export function notifyStatusLabel(entry: Pick<OrderNotificationLog, "ok" | "skipped">) {
  if (entry.ok) return "sent";
  if (entry.skipped) return "skipped";
  return "failed";
}

export function notifyReasonCopy(entry: OrderNotificationLog) {
  if (entry.ok) {
    if (entry.channel === "email") {
      return entry.destination ? `log · ${entry.destination}` : "log · 1 recipient";
    }
    if (entry.channel === "sms") {
      return entry.destination ? `to ${entry.destination}` : "sent";
    }
    if (entry.channel === "in_app") {
      return entry.destination ? `Staff inbox · ${entry.destination}` : "Staff inbox";
    }
    return "sent";
  }
  if (entry.reason === "preference") {
    if (entry.audience === "customer" && entry.channel === "email") return "Customer email disabled";
    if (entry.audience === "customer" && entry.channel === "sms") return "Customer SMS disabled";
    if (entry.audience === "customer" && entry.channel === "push") return "Customer push disabled";
    return "Notifications disabled";
  }
  if (entry.reason === "No email destination") return "No email on file";
  if (entry.reason === "No sms destination") return "No phone on the receipt";
  return entry.reason || "Not sent";
}

export function notifyKindLabel(kind: string) {
  const map: Record<string, string> = {
    "order.confirmed": "Confirmed",
    "order.preparing": "Preparing",
    "order.ready": "Ready",
    "order.ready_for_pickup": "Ready for pickup",
    "order.driver_assigned": "Driver assigned",
    "order.picked_up": "Picked up",
    "order.out_for_delivery": "Out for delivery",
    "order.arriving_soon": "Arriving soon",
    "order.delivered": "Delivered",
    "order.cancelled": "Cancelled",
    "order.new": "New order",
    "loyalty.reward": "Loyalty",
  };
  return map[kind] ?? kind.replace(/^order\./, "").replaceAll("_", " ");
}

export function latestNoticeByChannel(entries: OrderNotificationLog[]) {
  const seen = new Set<string>();
  const latest: OrderNotificationLog[] = [];
  for (const entry of entries) {
    const key = `${entry.audience}:${entry.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(entry);
  }
  const rank = ["email", "sms", "push", "in_app"];
  latest.sort((a, b) => {
    const audience = Number(a.audience === "staff") - Number(b.audience === "staff");
    if (audience) return audience;
    return rank.indexOf(a.channel) - rank.indexOf(b.channel);
  });
  return latest;
}
