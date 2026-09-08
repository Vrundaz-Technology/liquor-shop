import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require";
import {
  assignDriver,
  listDeliveryOrders,
  listDrivers,
  updateDeliveryStatus,
} from "@/lib/db/delivery";
import { isDbConfigured } from "@/lib/db/prisma";
import { drivers as seedDrivers } from "@/data/drivers";
import { canAccessLocation } from "@/lib/auth/location-access";
import { prisma } from "@/lib/db/prisma";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    orderId: z.string().min(1),
    driverId: z.string().min(1),
  }),
  z.object({
    action: z.literal("status"),
    orderId: z.string().min(1),
    status: z.enum(["unassigned", "assigned", "picked_up", "en_route", "delivered"]),
  }),
]);

async function assertOrderLocationAccess(
  user: { role: string; allowedLocationIds?: string[] | null },
  orderId: string,
) {
  const rows = await prisma.$queryRawUnsafe<{ location_id: string; fulfillment: string }[]>(
    `SELECT location_id, fulfillment FROM orders WHERE id = ? LIMIT 1`,
    orderId,
  );
  const order = rows[0];
  if (!order) throw new Error("Order not found.");
  if (order.fulfillment !== "delivery") throw new Error("Only delivery orders can be updated.");
  if (!canAccessLocation(user, order.location_id)) {
    throw new Error("You do not have access to this store's deliveries.");
  }
}

export async function GET() {
  const { user, error } = await requirePermission("deliveries.view");
  if (error) return error;
  try {
    if (!isDbConfigured()) {
      return NextResponse.json({ drivers: seedDrivers, orders: [] });
    }
    const [drivers, orders] = await Promise.all([listDrivers(), listDeliveryOrders(user)]);
    return NextResponse.json({
      drivers: drivers.filter((driver) => canAccessLocation(user, driver.locationId)),
      orders,
    });
  } catch (err) {
    console.error("[GET /api/deliveries]", err);
    return NextResponse.json({ error: "Failed to load deliveries." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await requirePermission("deliveries.manage");
  if (error) return error;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid delivery update." }, { status: 400 });
    }
    if (isDbConfigured()) {
      await assertOrderLocationAccess(user, parsed.data.orderId);
    }
    if (parsed.data.action === "assign") {
      const driver = await assignDriver(parsed.data.orderId, parsed.data.driverId, user.id);
      return NextResponse.json({ orderId: parsed.data.orderId, driver });
    }
    await updateDeliveryStatus(parsed.data.orderId, parsed.data.status, user.id);
    return NextResponse.json({ orderId: parsed.data.orderId, status: parsed.data.status });
  } catch (err) {
    console.error("[PATCH /api/deliveries]", err);
    const message = err instanceof Error ? err.message : "Failed to update delivery.";
    const status = message === "Order not found."
      ? 404
      : message.includes("do not have access")
        ? 403
        : message.includes("Only delivery")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
