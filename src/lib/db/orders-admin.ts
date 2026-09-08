import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { hydrateOrderDelivery } from "@/lib/db/delivery";
import { mapOrder } from "@/lib/db/mappers";
import { cancelOrder } from "@/lib/db/queries";
import {
  accessibleLocations,
  canAccessLocation,
  hasAllLocationAccess,
} from "@/lib/auth/location-access";
import { hasPermission } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/db/activity";
import type { Order, UserProfile } from "@/types";

export type StoreOrder = Order & {
  customerId: string;
  customerName: string;
  customerEmail: string;
};

export type ListStoreOrdersFilters = {
  locationId?: string;
  status?: Order["status"] | "all";
  fulfillment?: Order["fulfillment"] | "all";
  q?: string;
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
};

const STATUS_VALUES = new Set(["processing", "shipped", "ready", "delivered", "cancelled"]);
const FULFILLMENT_VALUES = new Set(["delivery", "pickup", "pos"]);

export async function listStoreOrders(
  actor: UserProfile,
  filters: ListStoreOrdersFilters = {},
): Promise<StoreOrder[]> {
  if (!isDbConfigured()) return [];

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
    params.push(`%${q}%`);
    where.push(
      `(LOWER(o.id) LIKE LOWER(?) OR LOWER(u.name) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?) OR LOWER(COALESCE(o.tracking, '')) LIKE LOWER(?))`,
    );
    // MySQL needs one bound value per `?`
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await prisma.$queryRawUnsafe<OrderListRow[]>(
    `SELECT o.id, o.user_id, o.date, o.status, o.total, o.fulfillment, o.location_id, o.tracking,
            u.name AS customer_name, u.email AS customer_email
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT ?`,
    ...params,
  );

  const orders: StoreOrder[] = [];
  for (const row of rows) {
    const itemRows = await prisma.orderItem.findMany({ where: { orderId: row.id } });
    const items = itemRows.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
    }));
    const base: Order = {
      id: row.id,
      date: row.date,
      status: row.status as Order["status"],
      items,
      total: row.total,
      fulfillment: row.fulfillment as Order["fulfillment"],
      locationId: row.location_id,
      tracking: row.tracking ?? undefined,
    };
    const hydrated = await hydrateOrderDelivery(base);
    orders.push({
      ...hydrated,
      customerId: row.user_id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
    });
  }
  return orders;
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
  if (order.fulfillment === "delivery") {
    throw new Error("Update delivery status from the Deliveries tab.");
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: { items: true },
  });

  await recordActivity({
    actorUserId: actor.id,
    action: "order.status",
    entityType: "order",
    entityId: orderId,
    locationId: order.locationId,
    summary: `${actor.name} set order ${orderId} to ${status}`,
    metadata: { status, previous: order.status },
  });

  return mapOrder(updated);
}
