import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { SAMS_ORG_ID } from "@/lib/db/organization";
import { createIndexIfMissing } from "@/lib/db/schema-guard";
import type { NotificationKind, NotificationResult } from "@/lib/notifications/types";
import type {
  NotifyAudience,
  NotifyTrigger,
  OrderNotificationLog,
  OrderNotifyChannel,
  OrderNotifySummary,
} from "@/lib/notifications/order-log";

export type {
  NotifyAudience,
  NotifyTrigger,
  OrderNotificationLog,
  OrderNotifyChannel,
  OrderNotifySummary,
} from "@/lib/notifications/order-log";
export {
  latestNoticeByChannel,
  notifyKindLabel,
  notifyReasonCopy,
  notifyStatusLabel,
} from "@/lib/notifications/order-log";

let ready = false;

export async function ensureOrderNotificationSchema() {
  if (!isDbConfigured() || ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS order_notifications (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      order_id VARCHAR(191) NOT NULL,
      organization_id VARCHAR(191) NULL,
      kind VARCHAR(64) NOT NULL,
      audience VARCHAR(16) NOT NULL,
      channel VARCHAR(16) NOT NULL,
      destination VARCHAR(255) NULL,
      ok BOOLEAN NOT NULL DEFAULT false,
      skipped BOOLEAN NOT NULL DEFAULT false,
      reason VARCHAR(255) NULL,
      trigger_source VARCHAR(16) NOT NULL DEFAULT 'auto',
      actor_user_id VARCHAR(191) NULL,
      title VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX order_notifications_order_created (order_id, created_at)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await createIndexIfMissing(
    "order_notifications",
    "order_notifications_org_created",
    "organization_id, created_at",
  );
  ready = true;
}

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

export function maskNotifyDestination(channel: OrderNotifyChannel, value?: string | null) {
  const raw = value?.trim() || "";
  if (!raw) return null;
  if (channel === "email") {
    const at = raw.indexOf("@");
    if (at < 1) return raw;
    return `${raw.slice(0, 1)}***${raw.slice(at)}`;
  }
  if (channel === "sms") {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 4) return "***";
    return `(***) ***-${digits.slice(-4)}`;
  }
  return raw.slice(0, 80);
}

async function lookupOrderOrganizationId(orderId: string) {
  const orgRows = await prisma.$queryRawUnsafe<{ organization_id: string | null }[]>(
    `SELECT organization_id FROM orders WHERE id = ? LIMIT 1`,
    orderId,
  );
  return orgRows[0]?.organization_id ?? SAMS_ORG_ID;
}

async function insertOrderNotification(input: {
  orderId: string;
  organizationId: string;
  kind: string;
  audience: NotifyAudience;
  channel: OrderNotifyChannel;
  destination?: string | null;
  ok: boolean;
  skipped?: boolean;
  reason?: string | null;
  trigger?: NotifyTrigger;
  actorUserId?: string | null;
  title?: string | null;
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO order_notifications
      (id, order_id, organization_id, kind, audience, channel, destination, ok, skipped, reason,
       trigger_source, actor_user_id, title)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    `on-${crypto.randomUUID()}`,
    input.orderId,
    input.organizationId,
    input.kind.slice(0, 64),
    input.audience,
    input.channel,
    maskNotifyDestination(input.channel, input.destination),
    input.ok,
    Boolean(input.skipped),
    input.reason?.slice(0, 255) ?? null,
    input.trigger ?? "auto",
    input.actorUserId ?? null,
    input.title?.slice(0, 255) ?? null,
  );
}

export async function recordOrderNotification(input: {
  orderId: string;
  organizationId?: string | null;
  kind: string;
  audience: NotifyAudience;
  channel: OrderNotifyChannel;
  destination?: string | null;
  ok: boolean;
  skipped?: boolean;
  reason?: string | null;
  trigger?: NotifyTrigger;
  actorUserId?: string | null;
  title?: string | null;
}) {
  if (!isDbConfigured() || !input.orderId) return;
  try {
    await ensureOrderNotificationSchema();
    const organizationId = input.organizationId?.trim() || (await lookupOrderOrganizationId(input.orderId));
    await insertOrderNotification({ ...input, organizationId });
  } catch (error) {
    console.error("[recordOrderNotification]", error);
  }
}

export async function recordCustomerOrderNotices(input: {
  orderId: string;
  kind: NotificationKind | string;
  title?: string | null;
  results: Array<NotificationResult & { destination?: string | null }>;
  trigger?: NotifyTrigger;
  actorUserId?: string | null;
}) {
  if (!isDbConfigured() || !input.orderId || !input.results.length) return;
  try {
    await ensureOrderNotificationSchema();
    const organizationId = await lookupOrderOrganizationId(input.orderId);
    await Promise.all(
      input.results.map((result) =>
        insertOrderNotification({
          orderId: input.orderId,
          organizationId,
          kind: input.kind,
          audience: "customer",
          channel: result.channel,
          destination: result.destination,
          ok: result.ok,
          skipped: result.skipped,
          reason: result.reason ?? null,
          trigger: input.trigger,
          actorUserId: input.actorUserId,
          title: input.title,
        }),
      ),
    );
  } catch (error) {
    console.error("[recordCustomerOrderNotices]", error);
  }
}

export async function listOrderNotifications(orderId: string): Promise<OrderNotificationLog[]> {
  if (!isDbConfigured() || !orderId) return [];
  await ensureOrderNotificationSchema();
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      order_id: string;
      kind: string;
      audience: string;
      channel: string;
      destination: string | null;
      ok: boolean | number;
      skipped: boolean | number;
      reason: string | null;
      trigger_source: string;
      title: string | null;
      created_at: Date | string;
    }[]
  >(
    `SELECT id, order_id, kind, audience, channel, destination, ok, skipped, reason,
            trigger_source, title, created_at
     FROM order_notifications
     WHERE order_id = ?
     ORDER BY created_at DESC
     LIMIT 80`,
    orderId,
  );
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    kind: row.kind,
    audience: row.audience === "staff" ? "staff" : "customer",
    channel: (row.channel as OrderNotifyChannel) ?? "email",
    destination: row.destination,
    ok: Boolean(row.ok),
    skipped: Boolean(row.skipped),
    reason: row.reason,
    trigger: row.trigger_source === "manual_resend" ? "manual_resend" : "auto",
    title: row.title,
    createdAt: toIso(row.created_at),
  }));
}

export async function summarizeOrderNotifications(
  orderIds: string[],
): Promise<Record<string, OrderNotifySummary>> {
  const ids = [...new Set(orderIds.filter(Boolean))].slice(0, 200);
  if (!ids.length || !isDbConfigured()) return {};
  await ensureOrderNotificationSchema();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<
    {
      order_id: string;
      channel: string;
      ok: boolean | number;
      skipped: boolean | number;
    }[]
  >(
    `SELECT order_id, channel, ok, skipped
     FROM (
       SELECT order_id, channel, ok, skipped,
              ROW_NUMBER() OVER (PARTITION BY order_id, channel ORDER BY created_at DESC) AS rn
       FROM order_notifications
       WHERE order_id IN (${placeholders})
         AND audience = 'customer'
         AND channel IN ('email', 'sms')
     ) ranked
     WHERE rn = 1`,
    ...ids,
  );
  const next: Record<string, OrderNotifySummary> = {};
  for (const row of rows) {
    const summary = next[row.order_id] ?? {};
    const channel = row.channel === "sms" ? "sms" : row.channel === "email" ? "email" : null;
    if (!channel || summary[channel]) continue;
    summary[channel] = Boolean(row.ok) ? "sent" : Boolean(row.skipped) ? "skipped" : "failed";
    next[row.order_id] = summary;
  }
  return next;
}

export async function resendOrderNotice(input: {
  orderId: string;
  channel: OrderNotifyChannel;
  kind?: string;
  actorUserId: string;
  actorName?: string;
}) {
  if (!isDbConfigured()) throw new Error("Database is not available.");
  await ensureOrderNotificationSchema();
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      user_id: string;
      status: string;
      fulfillment: string;
      tracking: string | null;
      location_id: string;
      delivery_phone: string | null;
    }[]
  >(
    `SELECT id, user_id, status, fulfillment, tracking, location_id, delivery_phone
     FROM orders WHERE id = ? LIMIT 1`,
    input.orderId,
  );
  const order = rows[0];
  if (!order) throw new Error("Order not found.");

  if (input.channel === "in_app") {
    const { emitStaffNotification } = await import("@/lib/db/staff-notifications");
    const { getLocationById } = await import("@/data/locations");
    const store = getLocationById(order.location_id);
    await emitStaffNotification({
      type: "order.new",
      title: `Order update · ${order.id}`,
      body: `${order.id} · ${store?.shortName ?? "store"} · ${order.status.replaceAll("_", " ")}`,
      entityType: "order",
      entityId: order.id,
      locationId: order.location_id,
      actorUserId: input.actorUserId,
      severity: "info",
      href: "/dashboard/orders",
    });
    return;
  }

  if (input.channel !== "email" && input.channel !== "sms" && input.channel !== "push") {
    throw new Error("That channel cannot be re-sent.");
  }

  const { loadNotifyRecipient } = await import("@/lib/notifications/recipients");
  const { dispatchNotification } = await import("@/lib/notifications");
  const { orderNotificationPayload, notificationKindsForOrderStatus } = await import(
    "@/lib/notifications/templates"
  );
  const { getLocationById } = await import("@/data/locations");
  const recipient = await loadNotifyRecipient(order.user_id);
  const store = getLocationById(order.location_id);
  const kinds = notificationKindsForOrderStatus(order.fulfillment, order.status);
  const kind: NotificationKind =
    input.channel === "email" || input.channel === "sms"
      ? "order.confirmed"
      : input.kind && kinds.includes(input.kind as NotificationKind)
        ? (input.kind as NotificationKind)
        : (kinds[0] ?? "order.confirmed");
  const payload = orderNotificationPayload(kind, {
    orderId: order.id,
    tracking: order.tracking,
    storeName: store?.shortName,
    userId: order.user_id,
    email: recipient?.email,
    phone: order.delivery_phone,
  });
  if (!payload) throw new Error("Nothing to send for this order status.");
  await dispatchNotification(payload, recipient?.prefs, {
    force: true,
    channels: [input.channel],
    trigger: "manual_resend",
    actorUserId: input.actorUserId,
  });

  const { recordActivity } = await import("@/lib/db/activity");
  await recordActivity({
    actorUserId: input.actorUserId,
    action: "order.notify_resend",
    entityType: "order",
    entityId: order.id,
    locationId: order.location_id,
    summary: `${input.actorName ?? "Staff"} re-sent ${input.channel} for ${order.id}`,
  });
}
