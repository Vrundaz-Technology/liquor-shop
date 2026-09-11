import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireAnyPermission } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/permissions";
import {
  assignDriver,
  canDispatchDeliveries,
  findLinkedDriverId,
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

async function assertDriverOwnsOrder(userId: string, orderId: string, linkedDriverId: string) {
  const rows = await prisma.$queryRawUnsafe<{ driver_id: string | null }[]>(
    `SELECT driver_id FROM orders WHERE id = ? LIMIT 1`,
    orderId,
  );
  const order = rows[0];
  if (!order) throw new Error("Order not found.");
  if (order.driver_id !== linkedDriverId) {
    throw new Error("You can only update deliveries assigned to you.");
  }
  void userId;
}

export async function GET() {
  const { user, error } = await requirePermission("deliveries.view");
  if (error) return error;
  try {
    if (!isDbConfigured()) {
      return NextResponse.json({ drivers: seedDrivers, orders: [], linkedDriverId: null });
    }
    const dispatcher = canDispatchDeliveries(user);
    const linkedDriverId = await findLinkedDriverId(user);
    const [drivers, orders] = await Promise.all([listDrivers(), listDeliveryOrders(user)]);
    const visibleDrivers = dispatcher
      ? drivers.filter((driver) => canAccessLocation(user, driver.locationId))
      : drivers.filter((driver) => driver.id === linkedDriverId);
    return NextResponse.json({
      drivers: visibleDrivers,
      orders,
      linkedDriverId,
      canDispatch: dispatcher,
    });
  } catch (err) {
    console.error("[GET /api/deliveries]", err);
    return NextResponse.json({ error: "Failed to load deliveries." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await requireAnyPermission(["deliveries.manage", "deliveries.view"]);
  if (error) return error;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid delivery update." }, { status: 400 });
    }

    const canManage = hasPermission(user, "deliveries.manage");
    if (parsed.data.action === "assign" && !canManage) {
      return NextResponse.json(
        { error: "You do not have permission to assign drivers." },
        { status: 403 },
      );
    }

    if (isDbConfigured()) {
      if (canManage) {
        await assertOrderLocationAccess(user, parsed.data.orderId);
      } else {
        const linkedDriverId = await findLinkedDriverId(user);
        if (!linkedDriverId) {
          return NextResponse.json(
            { error: "Your account is not linked to a driver profile." },
            { status: 403 },
          );
        }
        if (parsed.data.action === "status" && parsed.data.status === "unassigned") {
          return NextResponse.json(
            { error: "Drivers cannot unassign deliveries." },
            { status: 403 },
          );
        }
        await assertDriverOwnsOrder(user.id, parsed.data.orderId, linkedDriverId);
      }
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
      : message.includes("do not have access") ||
          message.includes("only update deliveries") ||
          message.includes("not linked")
        ? 403
        : message.includes("Only delivery")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
