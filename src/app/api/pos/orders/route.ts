import { NextResponse } from "next/server";
import { fetchInventoryState, placePosOrder, StockConflictError } from "@/lib/db/queries";
import { PromotionUsageLimitError } from "@/lib/commerce/promotions";
import { placePosOrderSchema } from "@/lib/db/validators";
import { requirePermission } from "@/lib/auth/require";
import { canAccessLocation } from "@/lib/auth/location-access";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { user, error } = await requirePermission("pos.sell");
    if (error) return error;

    const limited = rateLimit(`pos:${user.id}:${clientIp(request)}`, {
      limit: 40,
      windowMs: 60_000,
    });
    if (!limited.ok) {
      return tooManyRequests(limited.retryAfter, "Too many POS sales. Try again shortly.");
    }

    const parsed = placePosOrderSchema.safeParse(await request.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message;
      return NextResponse.json(
        { error: first || "Invalid POS order payload." },
        { status: 400 },
      );
    }

    if (!canAccessLocation(user, parsed.data.locationId)) {
      return NextResponse.json(
        { error: "You do not have access to sell from this store." },
        { status: 403 },
      );
    }

    const email = parsed.data.customerEmail?.trim() || undefined;
    const phone = parsed.data.customerPhone?.trim() || undefined;

    const result = await placePosOrder({
      actorUserId: user.id,
      locationId: parsed.data.locationId,
      fulfillment: parsed.data.fulfillment,
      items: parsed.data.items,
      customerName: parsed.data.customerName,
      customerEmail: email,
      customerPhone: phone,
      coupon: parsed.data.coupon,
      delivery: parsed.data.delivery,
      paymentMethod: parsed.data.paymentMethod ?? "cash",
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
    if (error instanceof PromotionUsageLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error) {
      const known = [
        "Delivery address is required",
        "Signed-in account is not available",
        "Location not found",
        "Unknown product",
        "is not available at this store",
        "Delivery is not available",
        "Pickup is not available",
        "Database is not configured",
      ];
      if (known.some((msg) => error.message.includes(msg))) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error("[POST /api/pos/orders]", error);
    return NextResponse.json({ error: "Failed to complete POS sale." }, { status: 500 });
  }
}
