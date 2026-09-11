import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { mapOrder } from "@/lib/db/mappers";
import { cancelOrder, commitReservedStockForOrder } from "@/lib/db/queries";
import {
  accessibleLocations,
  canAccessLocation,
  hasAllLocationAccess,
} from "@/lib/auth/location-access";
import { hasPermission } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/db/activity";
import { ensureOrganizationSchema } from "@/lib/db/organization";
import { moneyNumber, moneyOptional } from "@/lib/db/money";
import {
  canTransitionStatus,
  migrateLegacyStatus,
} from "@/lib/commerce/order-status";
import type { DeliveryAddress, DeliveryStatus, Driver, Order, UserProfile } from "@/types";

export type StoreOrder = Order & {
  customerId: string;
  customerName: string;
  customerEmail: string;
  /** Unread `order.new` staff notification for the current actor. */
  unreadForMe?: boolean;
  notificationId?: string | null;
};

export type ListStoreOrdersFilters = {
  locationId?: string;
  status?: Order["status"] | "all";
  fulfillment?: Order["fulfillment"] | "all";
  q?: string;
  fromDate?: string;
  toDate?: string;
  unreadOnly?: boolean;
  limit?: number;
};

type OrderListRow = {
  id: string;
  user_id: string;
  date: string;
  status: string;
  total: number;
  fulfillment: string;
  location_id: string;
  tracking: string | null;
  customer_name: string;
  customer_email: string;
  organization_id: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  delivery_fee: number | null;
  payment_status: string | null;
  driver_id: string | null;
  delivery_status: string | null;
  delivery_phone: string | null;
  delivery_address: unknown;
  driver_name: string | null;
  driver_phone: string | null;
  driver_vehicle: string | null;
  driver_photo: string | null;
  driver_location: string | null;
  driver_status: string | null;
};

const STATUS_VALUES = new Set([
  "new",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "out_for_delivery",
  "delivered",
  "ready_for_pickup",
  "picked_up",
  "completed",
  "cancelled",
  // legacy
  "processing",
  "shipped",
]);
const FULFILLMENT_VALUES = new Set(["delivery", "pickup", "pos"]);

function parseAddress(value: unknown): DeliveryAddress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.line1 !== "string" || typeof row.city !== "string") return undefined;
  return {
    name: typeof row.name === "string" ? row.name : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    line1: row.line1,
    line2: typeof row.line2 === "string" ? row.line2 : undefined,
    city: row.city,
    state: typeof row.state === "string" ? row.state : "",
    zip: typeof row.zip === "string" ? row.zip : "",
    notes: typeof row.notes === "string" ? row.notes : undefined,
  };
}

export async function listStoreOrders(
  actor: UserProfile,
  filters: ListStoreOrdersFilters = {},
): Promise<StoreOrder[]> {
  if (!isDbConfigured()) return [];
  await ensureOrganizationSchema();

  const allowAll = hasAllLocationAccess(actor);
  const accessibleIds = accessibleLocations(actor).map((loc) => loc.id);
  if (!allowAll && accessibleIds.length === 0) return [];

  const limit = Math.min(Math.max(filters.limit ?? 120, 1), 300);
  const params: unknown[] = [];
  const where: string[] = [];

  if (filters.locationId && filters.locationId !== "all") {
    if (!canAccessLocation(actor, filters.locationId)) return [];
    params.push(filters.locationId);
    where.push(`o.location_id = ?`);
  } else if (!allowAll) {
    accessibleIds.forEach((id) => params.push(id));
    where.push(`o.location_id IN (${accessibleIds.map(() => "?").join(",")})`);
  }

  if (filters.status && filters.status !== "all" && STATUS_VALUES.has(filters.status)) {
    params.push(filters.status);
    where.push(`o.status = ?`);
  }

  if (
    filters.fulfillment &&
    filters.fulfillment !== "all" &&
    FULFILLMENT_VALUES.has(filters.fulfillment)
  ) {
    params.push(filters.fulfillment);
    where.push(`o.fulfillment = ?`);
  }

  const q = filters.q?.trim();
  if (q) {
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    where.push(
      `(LOWER(o.id) LIKE LOWER(?) OR LOWER(u.name) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?) OR LOWER(COALESCE(o.tracking, '')) LIKE LOWER(?))`,
    );
  }

  const fromDate = filters.fromDate?.trim();
  const toDate = filters.toDate?.trim();
  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    params.push(fromDate);
    where.push(`LEFT(o.date, 10) >= ?`);
  }
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    params.push(toDate);
    where.push(`LEFT(o.date, 10) <= ?`);
  }

  if (filters.unreadOnly) {
    params.push(actor.id);
    where.push(`EXISTS (
      SELECT 1
      FROM staff_notifications sn
      INNER JOIN staff_notification_recipients snr ON snr.notification_id = sn.id
      WHERE sn.entity_type = 'order'
        AND sn.entity_id = o.id
        AND sn.type = 'order.new'
        AND snr.user_id = ?
        AND snr.read_at IS NULL
    )`);
  }

  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await prisma.$queryRawUnsafe<OrderListRow[]>(
    `SELECT o.id, o.user_id, o.date, o.status, o.total, o.fulfillment, o.location_id, o.tracking,
            o.organization_id, o.subtotal, o.tax_amount, o.discount_amount, o.delivery_fee,
            o.payment_status, o.driver_id, o.delivery_status, o.delivery_phone, o.delivery_address,
            u.name AS customer_name, u.email AS customer_email,
            d.name AS driver_name, d.phone AS driver_phone, d.vehicle AS driver_vehicle,
            d.photo_url AS driver_photo, d.location_id AS driver_location, d.status AS driver_status
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     LEFT JOIN drivers d ON d.id = o.driver_id
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT ?`,
    ...params,
  );

  if (!rows.length) return [];

  const orderIds = rows.map((r) => r.id);
  const unreadMap = await unreadOrderNotificationMap(actor.id, orderIds);
  const itemRows = await prisma.orderItem.findMany({
    where: { orderId: { in: orderIds } },
  });
  const itemsByOrder = new Map<string, Order["items"]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      productId: item.productId,
      quantity: item.quantity,
      price: moneyNumber(item.price),
    });
    itemsByOrder.set(item.orderId, list);
  }

  return rows.map((row) => {
    const status = migrateLegacyStatus(row.status, row.fulfillment, row.delivery_status) as Order["status"];
    const driver: Driver | undefined =
      row.driver_id && row.driver_name
        ? {
            id: row.driver_id,
            name: row.driver_name,
            phone: row.driver_phone ?? "",
            vehicle: row.driver_vehicle ?? "",
            locationId: row.driver_location ?? row.location_id,
            status: (row.driver_status as Driver["status"]) ?? "on_route",
            active: true,
            photoUrl: row.driver_photo ?? undefined,
          }
        : undefined;
    const notificationId = unreadMap.get(row.id) ?? null;

    return {
      id: row.id,
      date: row.date,
      status,
      items: itemsByOrder.get(row.id) ?? [],
      total: moneyNumber(row.total),
      subtotal: moneyOptional(row.subtotal),
      taxAmount: moneyOptional(row.tax_amount),
      discountAmount: moneyOptional(row.discount_amount),
      deliveryFee: moneyOptional(row.delivery_fee),
      paymentStatus: row.payment_status ?? undefined,
      fulfillment: row.fulfillment as Order["fulfillment"],
      locationId: row.location_id,
      organizationId: row.organization_id ?? undefined,
      tracking: row.tracking ?? undefined,
      deliveryStatus: (row.delivery_status as DeliveryStatus | null) ?? undefined,
      driverId: row.driver_id ?? undefined,
      driver,
      delivery: parseAddress(row.delivery_address),
      customerId: row.user_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      unreadForMe: Boolean(notificationId),
      notificationId,
    };
  });
}

async function unreadOrderNotificationMap(userId: string, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, string>();
  try {
    const { ensureStaffNotificationSchema } = await import("@/lib/db/staff-notifications");
    await ensureStaffNotificationSchema();
  } catch {
    return new Map<string, string>();
  }
  const placeholders = orderIds.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<{ entity_id: string; notification_id: string }[]>(
    `SELECT n.entity_id, n.id AS notification_id
     FROM staff_notifications n
     INNER JOIN staff_notification_recipients r ON r.notification_id = n.id
     WHERE r.user_id = ?
       AND r.read_at IS NULL
       AND n.type = 'order.new'
       AND n.entity_type = 'order'
       AND n.entity_id IN (${placeholders})`,
    userId,
    ...orderIds,
  );
  return new Map(rows.map((row) => [row.entity_id, row.notification_id]));
}

export async function countUnreadNewOrders(actor: UserProfile): Promise<number> {
  if (!isDbConfigured()) return 0;
  try {
    const { ensureStaffNotificationSchema } = await import("@/lib/db/staff-notifications");
    await ensureStaffNotificationSchema();
  } catch {
    return 0;
  }
  const allowAll = hasAllLocationAccess(actor);
  const accessibleIds = accessibleLocations(actor).map((loc) => loc.id);
  if (!allowAll && accessibleIds.length === 0) return 0;

  const params: unknown[] = [actor.id];
  let locationSql = "";
  if (!allowAll) {
    accessibleIds.forEach((id) => params.push(id));
    locationSql = ` AND (n.location_id IS NULL OR n.location_id IN (${accessibleIds
      .map(() => "?")
      .join(",")}))`;
  }

  const rows = await prisma.$queryRawUnsafe<{ c: number | bigint }[]>(
    `SELECT COUNT(DISTINCT n.entity_id) AS c
     FROM staff_notifications n
     INNER JOIN staff_notification_recipients r ON r.notification_id = n.id
     WHERE r.user_id = ?
       AND r.read_at IS NULL
       AND n.type = 'order.new'
       AND n.entity_type = 'order'
       AND n.entity_id IS NOT NULL
       ${locationSql}`,
    ...params,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function staffCancelOrder(orderId: string, actor: UserProfile) {
  if (!isDbConfigured()) return null;
  if (!hasPermission(actor, "orders.manage")) {
    throw new Error("You do not have permission to manage orders.");
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: { id: true, userId: true, locationId: true, status: true },
  });
  if (!order) return null;
  if (!canAccessLocation(actor, order.locationId)) {
    throw new Error("You do not have access to this store's orders.");
  }

  return cancelOrder(orderId, actor.id, {
    asStaffForOwnerId: order.userId,
    actorName: actor.name,
  });
}

export async function staffUpdateOrderStatus(
  orderId: string,
  status: Order["status"],
  actor: UserProfile,
) {
  if (!isDbConfigured()) return null;
  await ensureOrganizationSchema();
  if (!hasPermission(actor, "orders.manage")) {
    throw new Error("You do not have permission to manage orders.");
  }
  if (!STATUS_VALUES.has(status) || status === "cancelled") {
    throw new Error("Invalid order status.");
  }

  const order = await prisma.order.findFirst({ where: { id: orderId } });
  if (!order) throw new Error("Order not found.");
  if (!canAccessLocation(actor, order.locationId)) {
    throw new Error("You do not have access to this store's orders.");
  }
  if (order.status === "cancelled") {
    throw new Error("Cancelled orders cannot change status.");
  }

  const current = migrateLegacyStatus(order.status, order.fulfillment, order.deliveryStatus);
  if (!canTransitionStatus(order.fulfillment, current, status)) {
    throw new Error(`Cannot move order from ${current} to ${status}.`);
  }

  const deliveryStatus =
    status === "assigned"
      ? "assigned"
      : status === "picked_up"
        ? "picked_up"
        : status === "out_for_delivery"
          ? "en_route"
          : status === "delivered"
            ? "delivered"
            : order.deliveryStatus;

  const leavingNew = current === "new";

  const updated = await prisma.$transaction(async (tx) => {
    if (leavingNew) {
      const sales = await tx.inventoryLedger.findMany({
        where: { orderId, reason: "sale" },
      });
      if (!sales.length) {
        const full = await tx.order.findFirst({
          where: { id: orderId },
          include: { items: true },
        });
        if (full?.items.length) {
          await commitReservedStockForOrder(
            tx,
            full.locationId,
            full.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
            orderId,
          );
        }
      }
    }

    return tx.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(deliveryStatus != null ? { deliveryStatus } : {}),
      },
      include: { items: true },
    });
  });

  await recordActivity({
    actorUserId: actor.id,
    action: "order.status",
    entityType: "order",
    entityId: orderId,
    locationId: order.locationId,
    summary: `${actor.name} set order ${orderId} to ${status}`,
    metadata: {
      status,
      previous: order.status,
      changes: [{ field: "status", from: order.status, to: status }],
    },
  });

  void (async () => {
    try {
      const mapped = mapOrder(updated);
      const { notifyOrderStatus } = await import("@/lib/notifications");
      const { loadNotifyRecipient } = await import("@/lib/notifications/recipients");
      const { getLocationById } = await import("@/data/locations");
      const { prisma: db } = await import("@/lib/db/prisma");
      const recipient = await loadNotifyRecipient(order.userId);
      const store = getLocationById(order.locationId);
      const phoneRows = await db.$queryRawUnsafe<{ delivery_phone: string | null }[]>(
        `SELECT delivery_phone FROM orders WHERE id = ? LIMIT 1`,
        orderId,
      );
      await notifyOrderStatus({
        fulfillment: order.fulfillment,
        status,
        orderId,
        tracking: mapped.tracking ?? order.tracking,
        storeName: store?.shortName,
        userId: order.userId,
        email: recipient?.email,
        phone: phoneRows[0]?.delivery_phone,
        prefs: recipient?.prefs,
        skipConfirmed: true,
      });
    } catch (error) {
      console.error("[staffUpdateOrderStatus] notify failed", error);
    }
  })();

  return mapOrder(updated);
}
