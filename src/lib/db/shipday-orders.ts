import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { moneyNumber } from "@/lib/db/money";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges } from "@/lib/activity/changes";
import {
  ALCOHOL_HANDOFF_NOTE,
  ALCOHOL_PICKUP_NOTE,
  chooseDispatchChannel,
  formatDeliveryAddress,
  formatLocationAddress,
  formatPhoneForShipday,
} from "@/lib/commerce/dispatch";
import { parseAddressSafe } from "@/lib/db/delivery-address";
import { assignDriver, ensureDeliverySchema } from "@/lib/db/delivery";
import {
  ensureDispatchSchema,
  isShipdayConfigured,
  loadLocationDispatch,
  resolveShipdayApiKey,
} from "@/lib/db/dispatch-settings";
import { shipdayCancelOrder, shipdayInsertOrder } from "@/lib/shipday/client";
import { mapShipdayStatus } from "@/lib/shipday/status-map";

export { dispatchFieldsFromRow } from "@/lib/db/dispatch-settings";
export type { DispatchFields } from "@/lib/db/dispatch-settings";

function expectedPickupClock(minutesFromNow = 25) {
  const when = new Date(Date.now() + minutesFromNow * 60_000);
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function loadOrderForDispatch(orderId: string) {
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      status: string;
      fulfillment: string;
      location_id: string;
      organization_id: string | null;
      tracking: string | null;
      total: unknown;
      delivery_fee: unknown;
      delivery_phone: string | null;
      delivery_address: unknown;
      delivery_status: string | null;
      driver_id: string | null;
      delivery_channel: string | null;
      shipday_order_id: string | null;
      provider_failed: number | boolean | null;
      user_id: string;
    }[]
  >(
    `SELECT id, status, fulfillment, location_id, organization_id, tracking, total, delivery_fee,
            delivery_phone, delivery_address, delivery_status, driver_id, delivery_channel,
            shipday_order_id, provider_failed, user_id
     FROM orders WHERE id = ? LIMIT 1`,
    orderId,
  );
  return rows[0] ?? null;
}

export async function findAvailableDriverId(locationId: string): Promise<string | null> {
  await ensureDeliverySchema();
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM drivers
     WHERE location_id = ? AND active = true AND status = 'available'
     ORDER BY name
     LIMIT 1`,
    locationId,
  );
  return rows[0]?.id ?? null;
}

export async function sendOrderToShipday(
  orderId: string,
  actorUserId?: string,
): Promise<{ ok: true; shipdayOrderId: string } | { ok: false; error: string }> {
  if (!isDbConfigured()) return { ok: false, error: "Database is not configured." };
  await ensureDeliverySchema();
  await ensureDispatchSchema();

  const order = await loadOrderForDispatch(orderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.fulfillment !== "delivery") {
    return { ok: false, error: "Only delivery orders can be sent to Shipday." };
  }
  if (order.status === "cancelled" || order.status === "delivered") {
    return { ok: false, error: "This order can no longer be dispatched." };
  }
  if (order.shipday_order_id && !order.provider_failed) {
    return { ok: true, shipdayOrderId: order.shipday_order_id };
  }

  const locSettings = await loadLocationDispatch(order.location_id);
  if (!locSettings.shipdayEnabled) {
    return { ok: false, error: "Shipday is not enabled for this store." };
  }

  const apiKey = await resolveShipdayApiKey(order.organization_id);
  if (!isShipdayConfigured(apiKey) || !apiKey) {
    return { ok: false, error: "Shipday API key is not configured." };
  }

  const location = await prisma.location.findUnique({ where: { id: order.location_id } });
  if (!location) return { ok: false, error: "Store not found." };

  const address = parseAddressSafe(order.delivery_address);
  if (!address) return { ok: false, error: "Delivery address is missing." };

  const items = await prisma.orderItem.findMany({
    where: { orderId },
    include: { product: { select: { name: true } } },
  });

  const customerPhone = formatPhoneForShipday(address.phone || order.delivery_phone || location.phone);
  const insert = await shipdayInsertOrder(apiKey, {
    orderNumber: order.id,
    customerName: address.name || "Customer",
    customerAddress: formatDeliveryAddress(address),
    customerPhoneNumber: customerPhone,
    restaurantName: location.name,
    restaurantAddress: formatLocationAddress(location),
    restaurantPhoneNumber: formatPhoneForShipday(location.phone),
    orderItem: items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: moneyNumber(item.price),
    })),
    totalCost: moneyNumber(order.total),
    deliveryFee: 0,
    paymentMethod: "credit_card",
    deliveryInstruction: [ALCOHOL_HANDOFF_NOTE, address.notes].filter(Boolean).join(" "),
    pickupInstruction: ALCOHOL_PICKUP_NOTE,
    expectedPickupTime: expectedPickupClock(),
  });

  if (!insert.ok) {
    await prisma.$executeRawUnsafe(
      `UPDATE orders
       SET delivery_channel = 'shipday', provider_name = 'Shipday', provider_failed = true,
           provider_status = 'INSERT_FAILED'
       WHERE id = ?`,
      orderId,
    );
    return { ok: false, error: insert.error };
  }

  await prisma.$executeRawUnsafe(
    `UPDATE orders
     SET delivery_channel = 'shipday',
         shipday_order_id = ?,
         provider_name = 'Shipday',
         provider_status = 'NOT_ASSIGNED',
         provider_failed = false,
         delivery_status = 'assigned',
         dispatched_at = COALESCE(dispatched_at, CURRENT_TIMESTAMP(3))
     WHERE id = ?`,
    insert.orderId,
    orderId,
  );

  await recordActivity({
    actorUserId,
    action: "delivery.shipday_sent",
    entityType: "delivery",
    entityId: orderId,
    locationId: order.location_id,
    summary: `Sent order ${orderId} to Shipday`,
    metadata: activityChanges(
      [{ field: "channel", from: order.delivery_channel ?? "unassigned", to: "shipday" }],
      { shipdayOrderId: insert.orderId, orderId },
    ),
  });

  return { ok: true, shipdayOrderId: insert.orderId };
}

export async function autoDispatchOnConfirmation(orderId: string, actorUserId?: string) {
  if (!isDbConfigured()) return;
  await ensureDeliverySchema();
  await ensureDispatchSchema();
  const order = await loadOrderForDispatch(orderId);
  if (!order || order.fulfillment !== "delivery") return;
  if (order.driver_id || order.shipday_order_id) return;

  const settings = await loadLocationDispatch(order.location_id);
  const availableDriverId = settings.internalDeliveryEnabled
    ? await findAvailableDriverId(order.location_id)
    : null;
  const apiKey = await resolveShipdayApiKey(order.organization_id);
  const channel = chooseDispatchChannel({
    policy: settings.dispatchPolicy,
    internalEnabled: settings.internalDeliveryEnabled,
    shipdayEnabled: settings.shipdayEnabled,
    hasAvailableDriver: Boolean(availableDriverId),
    shipdayConfigured: isShipdayConfigured(apiKey),
  });

  if (channel === "internal" && availableDriverId) {
    await assignDriver(orderId, availableDriverId, actorUserId);
    return;
  }
  if (channel === "shipday") {
    const result = await sendOrderToShipday(orderId, actorUserId);
    if (!result.ok) {
      console.error("[autoDispatchOnConfirmation] Shipday", result.error);
    }
  }
}

export async function applyShipdayWebhook(payload: unknown, organizationHint?: string | null) {
  await ensureDeliverySchema();
  await ensureDispatchSchema();
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const orderObj =
    body.order && typeof body.order === "object" ? (body.order as Record<string, unknown>) : {};
  const shipdayId = String(orderObj.id ?? body.order_id ?? "");
  const orderNumber = String(orderObj.order_number ?? orderObj.orderNumber ?? body.order_number ?? "");
  const rawStatus = String(
    body.order_status ??
      orderObj.order_status ??
      (orderObj.orderStatus && typeof orderObj.orderStatus === "object"
        ? (orderObj.orderStatus as { orderState?: string }).orderState
        : "") ??
      "",
  );

  const order = await findOrderForWebhook(shipdayId, orderNumber);
  if (!order) {
    return { ok: false as const, error: "Order not found for Shipday webhook." };
  }
  if (order.fulfillment !== "delivery") {
    return { ok: false as const, error: "Not a delivery order." };
  }
  if (order.status === "cancelled") {
    return { ok: true as const, ignored: true, orderId: order.id };
  }

  const mapped = mapShipdayStatus(rawStatus);
  const costing =
    orderObj.costing && typeof orderObj.costing === "object"
      ? (orderObj.costing as Record<string, unknown>)
      : {};
  const providerCost = Number(costing.deliveryFee ?? costing.delivery_fee ?? orderObj.delivery_fee ?? 0);
  const tracking =
    typeof orderObj.trackingLink === "string"
      ? orderObj.trackingLink
      : typeof orderObj.tracking_url === "string"
        ? orderObj.tracking_url
        : null;
  const carrier =
    orderObj.assignedCarrier && typeof orderObj.assignedCarrier === "object"
      ? (orderObj.assignedCarrier as Record<string, unknown>)
      : {};
  const courierName = typeof carrier.name === "string" ? carrier.name : null;
  const courierPhone = typeof carrier.phoneNumber === "string" ? carrier.phoneNumber : null;

  const nextOrderStatus = mapped.orderStatus ?? order.status;
  await prisma.$executeRawUnsafe(
    `UPDATE orders
     SET delivery_channel = 'shipday',
         provider_name = 'Shipday',
         provider_status = ?,
         provider_failed = ?,
         delivery_status = ?,
         status = ?,
         provider_tracking_url = COALESCE(?, provider_tracking_url),
         provider_cost = CASE WHEN ? > 0 THEN ? ELSE provider_cost END,
         provider_courier_name = COALESCE(?, provider_courier_name),
         provider_courier_phone = COALESCE(?, provider_courier_phone),
         shipday_order_id = COALESCE(shipday_order_id, ?)
     WHERE id = ?`,
    rawStatus || mapped.deliveryStatus,
    mapped.failed,
    mapped.deliveryStatus,
    nextOrderStatus,
    tracking,
    providerCost,
    providerCost,
    courierName,
    courierPhone,
    shipdayId || null,
    order.id,
  );

  void organizationHint;

  await recordActivity({
    action: mapped.failed ? "delivery.shipday_failed" : "delivery.shipday_status",
    entityType: "delivery",
    entityId: order.id,
    locationId: order.location_id,
    summary: mapped.failed
      ? `Shipday failed for ${order.id} (${rawStatus || "FAILED"})`
      : `Shipday updated ${order.id} to ${rawStatus || mapped.deliveryStatus}`,
    metadata: activityChanges(
      [{ field: "provider_status", from: order.provider_status, to: rawStatus || mapped.deliveryStatus }],
      { shipdayId, orderId: order.id },
    ),
  });

  return { ok: true as const, orderId: order.id, status: mapped.deliveryStatus };
}

async function findOrderForWebhook(shipdayId: string, orderNumber: string) {
  if (shipdayId) {
    const byShipday = await prisma.$queryRawUnsafe<
      {
        id: string;
        status: string;
        fulfillment: string;
        location_id: string;
        provider_status: string | null;
      }[]
    >(
      `SELECT id, status, fulfillment, location_id, provider_status
       FROM orders WHERE shipday_order_id = ? LIMIT 1`,
      shipdayId,
    );
    if (byShipday[0]) return byShipday[0];
  }
  if (orderNumber) {
    const byNumber = await prisma.$queryRawUnsafe<
      {
        id: string;
        status: string;
        fulfillment: string;
        location_id: string;
        provider_status: string | null;
      }[]
    >(
      `SELECT id, status, fulfillment, location_id, provider_status
       FROM orders WHERE id = ? OR tracking = ? LIMIT 1`,
      orderNumber,
      orderNumber,
    );
    return byNumber[0] ?? null;
  }
  return null;
}

export async function cancelShipdayIfNeeded(orderId: string) {
  if (!isDbConfigured()) return;
  await ensureDispatchSchema();
  const order = await loadOrderForDispatch(orderId);
  if (!order?.shipday_order_id) return;
  const apiKey = await resolveShipdayApiKey(order.organization_id);
  if (!apiKey) return;
  const result = await shipdayCancelOrder(apiKey, order.shipday_order_id);
  if (!result.ok) {
    console.error("[cancelShipdayIfNeeded]", result.error);
  }
}
