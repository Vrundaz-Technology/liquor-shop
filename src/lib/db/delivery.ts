import type { DeliveryAddress, DeliveryStatus, Driver, Order, UserProfile } from "@/types";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { drivers as seedDrivers } from "@/data/drivers";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges } from "@/lib/activity/changes";
import { accessibleLocations, hasAllLocationAccess } from "@/lib/auth/location-access";
import { hasPermission } from "@/lib/auth/permissions";
import { addColumnIfMissing } from "@/lib/db/schema-guard";
import { moneyNumber } from "@/lib/db/money";
import { parseAddressSafe } from "@/lib/db/delivery-address";
import {
  canMarkInternalPickedUp,
  isDeliveryConfirmedForDispatch,
  orderStatusAfterAssign,
} from "@/lib/commerce/dispatch";
import { dispatchFieldsFromRow, ensureDispatchSchema } from "@/lib/db/dispatch-settings";

let ready = false;

export async function ensureDeliverySchema() {
  if (!isDbConfigured() || ready) return;
  // MySQL cannot index a TEXT primary key without a prefix length, so ids are
  // VARCHAR(191) here to match what Prisma's migration creates.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS drivers (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      phone VARCHAR(191) NOT NULL,
      email VARCHAR(191),
      vehicle VARCHAR(191) NOT NULL,
      location_id VARCHAR(191) NOT NULL,
      status VARCHAR(191) NOT NULL DEFAULT 'available',
      active BOOLEAN NOT NULL DEFAULT true,
      photo_url VARCHAR(512),
      user_id VARCHAR(191) NULL
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await addColumnIfMissing("drivers", "user_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "driver_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "delivery_status", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "delivery_phone", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "delivery_address", "JSON NULL");
  await ensureDispatchSchema();
  for (const driver of seedDrivers) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO drivers (id, name, phone, email, vehicle, location_id, status, active, photo_url)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         phone = VALUES(phone),
         email = VALUES(email),
         vehicle = VALUES(vehicle),
         location_id = VALUES(location_id),
         photo_url = VALUES(photo_url)`,
      driver.id,
      driver.name,
      driver.phone,
      driver.email ?? null,
      driver.vehicle,
      driver.locationId,
      driver.status,
      driver.active,
      driver.photoUrl ?? null,
    );
  }
  // Auto-link drivers to staff users by matching email when user_id is empty.
  await prisma.$executeRawUnsafe(`
    UPDATE drivers d
    INNER JOIN users u ON LOWER(u.email) = LOWER(d.email)
    SET d.user_id = u.id
    WHERE d.email IS NOT NULL AND d.email <> '' AND (d.user_id IS NULL OR d.user_id = '')
  `);
  ready = true;
}

function asDriver(row: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  vehicle: string;
  location_id: string;
  status: string;
  active: boolean;
  photo_url: string | null;
  user_id?: string | null;
}): Driver {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    vehicle: row.vehicle,
    locationId: row.location_id,
    status: row.status as Driver["status"],
    active: row.active,
    photoUrl: row.photo_url ?? undefined,
    userId: row.user_id ?? undefined,
  };
}

/** Resolve the driver profile linked to this staff user (user_id or email). */
export async function findLinkedDriverId(actor: UserProfile): Promise<string | null> {
  await ensureDeliverySchema();
  const byUser = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM drivers WHERE user_id = ? AND active = true LIMIT 1`,
    actor.id,
  );
  if (byUser[0]?.id) return byUser[0].id;
  const email = actor.email?.trim().toLowerCase();
  if (!email) return null;
  const byEmail = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM drivers WHERE LOWER(email) = ? AND active = true LIMIT 1`,
    email,
  );
  if (byEmail[0]?.id) {
    await prisma.$executeRawUnsafe(
      `UPDATE drivers SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id = '')`,
      actor.id,
      byEmail[0].id,
    );
    return byEmail[0].id;
  }
  return null;
}

export function canDispatchDeliveries(actor: UserProfile) {
  return hasPermission(actor, "deliveries.manage");
}

const parseAddress = parseAddressSafe;

export async function listDrivers(locationId?: string) {
  await ensureDeliverySchema();
  const rows = locationId
    ? await prisma.$queryRawUnsafe<Parameters<typeof asDriver>[0][]>(
        `SELECT * FROM drivers WHERE active = true AND location_id = ? ORDER BY name`,
        locationId,
      )
    : await prisma.$queryRawUnsafe<Parameters<typeof asDriver>[0][]>(
        `SELECT * FROM drivers WHERE active = true ORDER BY name`,
      );
  return rows.map(asDriver);
}

export async function saveOrderDelivery(orderId: string, delivery: DeliveryAddress) {
  if (!isDbConfigured()) return;
  await ensureDeliverySchema();
  await prisma.$executeRawUnsafe(
    `UPDATE orders
     SET delivery_address = ?,
         delivery_phone = ?,
         delivery_status = COALESCE(delivery_status, 'unassigned')
     WHERE id = ?`,
    JSON.stringify(delivery),
    delivery.phone,
    orderId,
  );
}

type DeliveryRow = {
  id: string;
  date: string;
  status: string;
  total: number;
  fulfillment: string;
  location_id: string;
  tracking: string | null;
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
  delivery_channel: string | null;
  shipday_order_id: string | null;
  provider_status: string | null;
  provider_tracking_url: string | null;
  provider_cost: unknown;
  provider_name: string | null;
  provider_courier_name: string | null;
  provider_courier_phone: string | null;
  provider_failed: number | boolean | null;
  dispatched_at: Date | string | null;
};

function mapDeliveryOrder(row: DeliveryRow, items: Order["items"]): Order {
  const driver =
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
  return {
    id: row.id,
    date: row.date,
    status: row.status as Order["status"],
    items,
    total: moneyNumber(row.total),
    fulfillment: row.fulfillment as Order["fulfillment"],
    locationId: row.location_id,
    tracking: row.tracking ?? undefined,
    deliveryStatus: (row.delivery_status as DeliveryStatus | null) ?? undefined,
    driverId: row.driver_id ?? undefined,
    driver,
    delivery: parseAddress(row.delivery_address),
    ...dispatchFieldsFromRow(row),
  };
}

const DELIVERY_ORDER_SELECT = `SELECT o.id, o.date, o.status, o.total, o.fulfillment, o.location_id, o.tracking,
              o.driver_id, o.delivery_status, o.delivery_phone, o.delivery_address,
              o.delivery_channel, o.shipday_order_id, o.provider_status, o.provider_tracking_url,
              o.provider_cost, o.provider_name, o.provider_courier_name, o.provider_courier_phone,
              o.provider_failed, o.dispatched_at,
              d.name AS driver_name, d.phone AS driver_phone, d.vehicle AS driver_vehicle,
              d.photo_url AS driver_photo, d.location_id AS driver_location, d.status AS driver_status
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id`;

export async function listDeliveryOrders(actor: UserProfile) {
  await ensureDeliverySchema();
  const allowAll = hasAllLocationAccess(actor);
  const ids = accessibleLocations(actor).map((loc) => loc.id);
  const dispatcher = canDispatchDeliveries(actor);
  const linkedDriverId = dispatcher ? null : await findLinkedDriverId(actor);

  // Drivers without dispatch rights only see their assigned runs.
  if (!dispatcher) {
    if (!linkedDriverId) return [];
    const rows = await prisma.$queryRawUnsafe<DeliveryRow[]>(
      `${DELIVERY_ORDER_SELECT}
       WHERE o.fulfillment = 'delivery' AND o.status <> 'cancelled'
         AND o.driver_id = ?
       ORDER BY o.created_at DESC
       LIMIT 80`,
      linkedDriverId,
    );
    return mapDeliveryRows(rows);
  }

  const rows = allowAll
    ? await prisma.$queryRawUnsafe<DeliveryRow[]>(
        `${DELIVERY_ORDER_SELECT}
         WHERE o.fulfillment = 'delivery' AND o.status <> 'cancelled'
         ORDER BY o.created_at DESC
         LIMIT 80`,
      )
    : ids.length
      ? await prisma.$queryRawUnsafe<DeliveryRow[]>(
          `${DELIVERY_ORDER_SELECT}
           WHERE o.fulfillment = 'delivery' AND o.status <> 'cancelled'
             AND o.location_id IN (${ids.map(() => "?").join(",")})
           ORDER BY o.created_at DESC
           LIMIT 80`,
          ...ids,
        )
      : [];

  return mapDeliveryRows(rows);
}

async function mapDeliveryRows(rows: DeliveryRow[]) {
  if (!rows.length) return [];

  const itemRows = await prisma.orderItem.findMany({
    where: { orderId: { in: rows.map((r) => r.id) } },
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

  return rows.map((row) => mapDeliveryOrder(row, itemsByOrder.get(row.id) ?? []));
}

/** Free a driver when they have no open delivery runs left. */
export async function releaseDriverIfIdle(driverId: string, exceptOrderId?: string) {
  if (!driverId) return;
  if (exceptOrderId) {
    await prisma.$executeRawUnsafe(
      `UPDATE drivers SET status = 'available'
       WHERE id = ?
         AND NOT EXISTS (
           SELECT 1 FROM orders
           WHERE driver_id = ?
             AND id <> ?
             AND fulfillment = 'delivery'
             AND status <> 'cancelled'
             AND COALESCE(delivery_status, 'unassigned') <> 'delivered'
         )`,
      driverId,
      driverId,
      exceptOrderId,
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    `UPDATE drivers SET status = 'available'
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1 FROM orders
         WHERE driver_id = ?
           AND fulfillment = 'delivery'
           AND status <> 'cancelled'
           AND COALESCE(delivery_status, 'unassigned') <> 'delivered'
       )`,
    driverId,
    driverId,
  );
}

export async function assignDriver(orderId: string, driverId: string, actorUserId?: string) {
  await ensureDeliverySchema();
  const orderRows = await prisma.$queryRawUnsafe<
    {
      id: string;
      fulfillment: string;
      location_id: string;
      status: string;
      driver_id: string | null;
      delivery_status: string | null;
      delivery_channel: string | null;
      shipday_order_id: string | null;
      provider_failed: number | boolean | null;
    }[]
  >(
    `SELECT id, fulfillment, location_id, status, driver_id, delivery_status,
            delivery_channel, shipday_order_id, provider_failed
     FROM orders WHERE id = ? LIMIT 1`,
    orderId,
  );
  const order = orderRows[0];
  if (!order) throw new Error("Order not found.");
  if (order.fulfillment !== "delivery") throw new Error("Only delivery orders can be assigned a driver.");
  if (!isDeliveryConfirmedForDispatch(order.status)) {
    throw new Error("This order can no longer be assigned.");
  }
  const shipdayLocked =
    order.delivery_channel === "shipday" &&
    Boolean(order.shipday_order_id) &&
    !(order.provider_failed === true || order.provider_failed === 1);
  if (shipdayLocked) {
    throw new Error("This order is already with Shipday.");
  }

  const driverRows = await prisma.$queryRawUnsafe<Parameters<typeof asDriver>[0][]>(
    `SELECT * FROM drivers WHERE id = ? AND active = true LIMIT 1`,
    driverId,
  );
  const driver = driverRows[0] ? asDriver(driverRows[0]) : null;
  if (!driver) throw new Error("Driver not found.");
  if (driver.locationId !== order.location_id) {
    throw new Error("Driver must belong to the same store as the order.");
  }

  let previousDriverName: string | null = null;
  if (order.driver_id) {
    const prevDriverRows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM drivers WHERE id = ? LIMIT 1`,
      order.driver_id,
    );
    previousDriverName = prevDriverRows[0]?.name ?? order.driver_id;
  }

  const nextStatus = orderStatusAfterAssign(order.status);
  await prisma.$executeRawUnsafe(
    `UPDATE orders
     SET driver_id = ?, delivery_status = 'assigned', status = ?,
         delivery_channel = 'internal', dispatched_at = COALESCE(dispatched_at, CURRENT_TIMESTAMP(3))
     WHERE id = ?`,
    driverId,
    nextStatus,
    orderId,
  );
  if (order.driver_id && order.driver_id !== driverId) {
    await releaseDriverIfIdle(order.driver_id, orderId);
  }
  await prisma.$executeRawUnsafe(
    `UPDATE drivers SET status = 'on_route' WHERE id = ?`,
    driverId,
  );
  await recordActivity({
    actorUserId,
    action: "delivery.assigned",
    entityType: "delivery",
    entityId: orderId,
    locationId: driver.locationId,
    summary: `Assigned ${driver.name} to order ${orderId}`,
    metadata: activityChanges(
      [
        {
          field: "driver",
          from: previousDriverName ?? "(unassigned)",
          to: driver.name,
        },
        {
          field: "status",
          from: order.delivery_status ?? order.status,
          to: "assigned",
        },
      ],
      { driverId, orderId },
    ),
  });

  void (async () => {
    try {
      const { notifyOrderStatus } = await import("@/lib/notifications");
      const { loadNotifyRecipient } = await import("@/lib/notifications/recipients");
      const rows = await prisma.$queryRawUnsafe<
        { user_id: string; tracking: string | null; delivery_phone: string | null }[]
      >(
        `SELECT user_id, tracking, delivery_phone FROM orders WHERE id = ? LIMIT 1`,
        orderId,
      );
      const row = rows[0];
      if (!row) return;
      const recipient = await loadNotifyRecipient(row.user_id);
      await notifyOrderStatus({
        fulfillment: "delivery",
        status: "assigned",
        orderId,
        tracking: row.tracking,
        driverName: driver.name,
        userId: row.user_id,
        email: recipient?.email,
        phone: row.delivery_phone,
        prefs: recipient?.prefs,
        skipConfirmed: true,
      });
    } catch (error) {
      console.error("[assignDriver] notify failed", error);
    }
  })();

  return driver;
}

export async function updateDeliveryStatus(
  orderId: string,
  status: DeliveryStatus,
  actorUserId?: string,
) {
  await ensureDeliverySchema();
  const previousRows = await prisma.$queryRawUnsafe<
    {
      delivery_status: string | null;
      status: string;
      delivery_channel: string | null;
      fulfillment: string;
    }[]
  >(
    `SELECT delivery_status, status, delivery_channel, fulfillment FROM orders WHERE id = ? LIMIT 1`,
    orderId,
  );
  const previous = previousRows[0];
  if (!previous) throw new Error("Order not found.");
  if (previous.fulfillment !== "delivery") throw new Error("Only delivery orders can be updated.");
  if (previous.delivery_channel === "shipday" && status === "unassigned") {
    throw new Error("Shipday orders cannot be unassigned here. Cancel the order or wait for Shipday.");
  }
  if (
    (status === "picked_up" || status === "en_route") &&
    previous.delivery_channel !== "shipday" &&
    !canMarkInternalPickedUp(previous.status)
  ) {
    throw new Error("Pack this order in Orders before pickup.");
  }

  const previousStatus = previous.delivery_status ?? null;
  const kitchenOpen = ["new", "accepted", "processing", "preparing"].includes(previous.status);
  const orderStatus =
    status === "delivered"
      ? "delivered"
      : status === "unassigned"
        ? kitchenOpen
          ? previous.status
          : "ready"
        : status === "assigned"
          ? kitchenOpen
            ? previous.status
            : "assigned"
          : status === "picked_up"
            ? "picked_up"
            : "out_for_delivery";
  await prisma.$executeRawUnsafe(
    `UPDATE orders SET delivery_status = ?, status = ? WHERE id = ?`,
    status,
    orderStatus,
    orderId,
  );
  if (status === "delivered" || status === "unassigned") {
    const driverRows = await prisma.$queryRawUnsafe<{ driver_id: string | null }[]>(
      `SELECT driver_id FROM orders WHERE id = ? LIMIT 1`,
      orderId,
    );
    const freedId = driverRows[0]?.driver_id;
    if (freedId) await releaseDriverIfIdle(freedId, orderId);
  }
  if (status === "unassigned") {
    await prisma.$executeRawUnsafe(
      `UPDATE orders SET driver_id = NULL, delivery_channel = NULL WHERE id = ?`,
      orderId,
    );
  }
  await recordActivity({
    actorUserId,
    action: "delivery.status",
    entityType: "delivery",
    entityId: orderId,
    summary: `Updated order ${orderId} to ${status.replace("_", " ")}`,
    metadata: activityChanges(
      [{ field: "status", from: previousStatus, to: status }],
      { orderId },
    ),
  });

  void (async () => {
    try {
      const { notifyOrderStatus } = await import("@/lib/notifications");
      const { loadNotifyRecipient } = await import("@/lib/notifications/recipients");
      const rows = await prisma.$queryRawUnsafe<
        {
          user_id: string;
          tracking: string | null;
          delivery_phone: string | null;
          fulfillment: string;
        }[]
      >(
        `SELECT user_id, tracking, delivery_phone, fulfillment FROM orders WHERE id = ? LIMIT 1`,
        orderId,
      );
      const row = rows[0];
      if (!row) return;
      const recipient = await loadNotifyRecipient(row.user_id);
      await notifyOrderStatus({
        fulfillment: row.fulfillment,
        status: orderStatus,
        orderId,
        tracking: row.tracking,
        userId: row.user_id,
        email: recipient?.email,
        phone: row.delivery_phone,
        prefs: recipient?.prefs,
        skipConfirmed: true,
      });
    } catch (error) {
      console.error("[updateDeliveryStatus] notify failed", error);
    }
  })();
}

export async function hydrateOrderDelivery(order: Order): Promise<Order> {
  if (!isDbConfigured()) return order;
  await ensureDeliverySchema();
  const rows = await prisma.$queryRawUnsafe<DeliveryRow[]>(
    `${DELIVERY_ORDER_SELECT}
     WHERE o.id = ?
     LIMIT 1`,
    order.id,
  );
  const row = rows[0];
  if (!row) return order;
  return mapDeliveryOrder(row, order.items);
}
