import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require";
import {
  deactivateProductAlert,
  syncAbandonedCart,
  upsertProductAlert,
} from "@/lib/db/notifications-data";

const alertSchema = z.object({
  action: z.enum(["subscribe", "unsubscribe"]),
  kind: z.enum(["back_in_stock", "price"]),
  productId: z.string().min(1),
  locationId: z.string().min(1).optional().nullable(),
  targetPrice: z.number().positive().optional().nullable(),
});

const cartSchema = z.object({
  action: z.literal("sync_cart"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(99),
      }),
    )
    .max(40),
});

const bodySchema = z.union([alertSchema, cartSchema]);

export async function POST(request: Request) {
  try {
    const { user, error } = await requireUser();
    if (error) return error;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }
    const body = parsed.data;

    if (body.action === "sync_cart") {
      await syncAbandonedCart(user.id, body.items);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "subscribe") {
      const id = await upsertProductAlert({
        userId: user.id,
        productId: body.productId,
        kind: body.kind,
        locationId: body.locationId,
        targetPrice: body.targetPrice,
      });
      return NextResponse.json({ ok: true, id });
    }

    await deactivateProductAlert(user.id, body.productId, body.kind);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/notifications]", error);
    return NextResponse.json({ error: "Notification request failed." }, { status: 500 });
  }
}
