import { NextResponse } from "next/server";
import { cancelOrder, fetchInventoryState, placeOrder, StockConflictError } from "@/lib/db/queries";
import {
  countUnreadNewOrders,
  listStoreOrders,
  staffCancelOrder,
  staffUpdateOrderStatus,
} from "@/lib/db/orders-admin";
import { cancelOrderSchema, patchOrderSchema, placeOrderSchema } from "@/lib/db/validators";
import { getRequestUser, requirePermission, requireUser } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/permissions";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import type { Order } from "@/types";

export async function GET(request: Request) {
  try {
    const { user, error } = await requirePermission("orders.view");
    if (error) return error;

    const url = new URL(request.url);
    const locationId = url.searchParams.get("locationId") || undefined;
    const status = (url.searchParams.get("status") || "all") as Order["status"] | "all";
    const fulfillment = (url.searchParams.get("fulfillment") || "all") as
      | Order["fulfillment"]
      | "all";
    const q = url.searchParams.get("q") || undefined;
    const fromDate = url.searchParams.get("fromDate") || undefined;
    const toDate = url.searchParams.get("toDate") || undefined;
    const unreadOnly = url.searchParams.get("unread") === "1";

    const [orders, unreadOrderCount] = await Promise.all([
      listStoreOrders(user, {
        locationId,
        status,
        fulfillment,
        q,
        fromDate,
        toDate,
        unreadOnly,
      }),
      countUnreadNewOrders(user),
    ]);

    return NextResponse.json({ orders, unreadOrderCount });
  } catch (error) {
    console.error("[GET /api/orders]", error);
    return NextResponse.json({ error: "Failed to load orders." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`orders:${clientIp(request)}`, { limit: 8, windowMs: 60_000 });
    if (!limited.ok) {
      return tooManyRequests(limited.retryAfter, "Too many checkout attempts. Try again shortly.");
    }
    const parsed = placeOrderSchema.safeParse(await request.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      return NextResponse.json(
        { error: first || "Invalid order payload." },
        { status: 400 },
      );
    }
    const actor = await getRequestUser();
    // Never trust body userId — guests cannot attribute orders to arbitrary accounts.
    const { userId: _ignored, ageConfirmed: _age, ...orderInput } = parsed.data;
    void _ignored;
    void _age;
    const result = await placeOrder({
      ...orderInput,
      userId: actor?.id,
    });
    const inventory = await fetchInventoryState();
    return NextResponse.json({ ...result, inventory }, { status: 201 });
  } catch (error) {
    if (error instanceof StockConflictError) {
      return NextResponse.json(
        { error: error.message, shortfalls: error.shortfalls },
        { status: 409 },
      );
    }
    if (error instanceof Error) {
      const known = [
        "An account with this email already exists",
        "Delivery address is required",
        "Signed-in account is not available",
        "Location not found",
        "Unknown product",
        "is not available at this store",
      ];
      if (known.some((msg) => error.message.includes(msg))) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error("[POST /api/orders]", error);
    return NextResponse.json({ error: "Failed to create order." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, error } = await requireUser();
    if (error) return error;

    const body = await request.json();
    const patchParsed = patchOrderSchema.safeParse(body);
    const legacyParsed = cancelOrderSchema.safeParse(body);
    const parsed = patchParsed.success
      ? patchParsed
      : legacyParsed.success
        ? { success: true as const, data: { ...legacyParsed.data, action: "cancel" as const } }
        : patchParsed;

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid order update." }, { status: 400 });
    }

    const action = parsed.data.action ?? "cancel";

    if (action === "status") {
      if (!hasPermission(user, "orders.manage")) {
        return NextResponse.json({ error: "Order management is not allowed." }, { status: 403 });
      }
      if (!parsed.data.status) {
        return NextResponse.json({ error: "Status is required." }, { status: 400 });
      }
      try {
        const order = await staffUpdateOrderStatus(parsed.data.orderId, parsed.data.status, user);
        if (!order) {
          return NextResponse.json({ error: "Order not found." }, { status: 404 });
        }
        return NextResponse.json({ order });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update order.";
        const status = message.includes("do not have")
          ? 403
          : message.includes("not found")
            ? 404
            : message.includes("Deliveries") || message.includes("Invalid") || message.includes("Cancelled")
              ? 400
              : 500;
        return NextResponse.json({ error: message }, { status });
      }
    }

    // Cancel — staff can cancel any accessible store order; customers cancel their own.
    if (hasPermission(user, "orders.manage")) {
      try {
        const order = await staffCancelOrder(parsed.data.orderId, user);
        if (!order) {
          return NextResponse.json(
            { error: "Order not found or cannot be cancelled." },
            { status: 404 },
          );
        }
        const inventory = await fetchInventoryState();
        return NextResponse.json({ order, inventory });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to cancel order.";
        const status = message.includes("do not have") ? 403 : 500;
        return NextResponse.json({ error: message }, { status });
      }
    }

    const order = await cancelOrder(parsed.data.orderId, user.id);
    if (!order) {
      return NextResponse.json(
        { error: "Order not found or cannot be cancelled." },
        { status: 404 },
      );
    }
    const inventory = await fetchInventoryState();
    return NextResponse.json({ order, inventory });
  } catch (error) {
    console.error("[PATCH /api/orders]", error);
    return NextResponse.json({ error: "Failed to update order." }, { status: 500 });
  }
}
