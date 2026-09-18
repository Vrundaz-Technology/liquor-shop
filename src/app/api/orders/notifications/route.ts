import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireUser } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/permissions";
import { canAccessLocation } from "@/lib/auth/location-access";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import {
  listOrderNotifications,
  resendOrderNotice,
  type OrderNotifyChannel,
} from "@/lib/db/order-notifications";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

async function loadOrderLocation(orderId: string) {
  if (!isDbConfigured()) return null;
  const rows = await prisma.$queryRawUnsafe<{ location_id: string }[]>(
    `SELECT location_id FROM orders WHERE id = ? LIMIT 1`,
    orderId,
  );
  return rows[0] ?? null;
}

export async function GET(request: Request) {
  const auth = await requirePermission("orders.view");
  if (auth.error) return auth.error;

  const orderId = new URL(request.url).searchParams.get("orderId")?.trim() || "";
  if (!orderId) {
    return NextResponse.json({ error: "Order is required." }, { status: 400 });
  }
  const order = await loadOrderLocation(orderId);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (!canAccessLocation(auth.user, order.location_id)) {
    return NextResponse.json({ error: "You do not have access to this order." }, { status: 403 });
  }

  const notifications = await listOrderNotifications(orderId);
  return NextResponse.json({ ok: true, notifications });
}

const postSchema = z.object({
  orderId: z.string().min(1),
  channel: z.enum(["email", "sms", "push", "in_app"]),
  kind: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  if (!hasPermission(auth.user, "orders.manage")) {
    return NextResponse.json({ error: "Order management is not allowed." }, { status: 403 });
  }
  const limited = rateLimit(`order-notify:${auth.user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limited.ok) {
    return tooManyRequests(limited.retryAfter, "Too many re-send attempts. Try again shortly.");
  }

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid re-send payload." }, { status: 400 });
  }

  const order = await loadOrderLocation(parsed.data.orderId);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (!canAccessLocation(auth.user, order.location_id)) {
    return NextResponse.json({ error: "You do not have access to this order." }, { status: 403 });
  }

  try {
    await resendOrderNotice({
      orderId: parsed.data.orderId,
      channel: parsed.data.channel as OrderNotifyChannel,
      kind: parsed.data.kind,
      actorUserId: auth.user.id,
      actorName: auth.user.name,
    });
    const notifications = await listOrderNotifications(parsed.data.orderId);
    return NextResponse.json({ ok: true, notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not re-send.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
