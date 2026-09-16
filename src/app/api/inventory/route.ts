import { NextResponse } from "next/server";
import {
  adjustInventory,
  deductOrderStock,
  fetchInventoryState,
  resetInventory,
  setInventoryOnHand,
  setProductVisibility,
} from "@/lib/db/queries";
import { inventoryPatchSchema } from "@/lib/db/validators";
import { requirePermission } from "@/lib/auth/require";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/auth/location-access";

export async function GET() {
  try {
    const inventory = await fetchInventoryState();
    return NextResponse.json(inventory);
  } catch (error) {
    console.error("[GET /api/inventory]", error);
    return NextResponse.json({ error: "Failed to fetch inventory." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = inventoryPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid inventory payload." }, { status: 400 });
    }
    const body = parsed.data;
    const needsRestock =
      (body.action === "adjust" && body.reason === "restock" && body.delta > 0) ||
      (body.action === "set" && body.reason === "restock");
    const permissionKey =
      body.action === "reset"
        ? ("inventory.reset" as const)
        : body.action === "visibility"
          ? ("inventory.adjust" as const)
          : needsRestock
            ? ("inventory.restock" as const)
            : ("inventory.adjust" as const);
    const allowed = await requirePermission(permissionKey);
    if (allowed.error) return allowed.error;
    const actorUserId = allowed.user.id;
    if (body.action === "reset" && !body.locationId && !hasAllLocationAccess(allowed.user)) {
      return NextResponse.json(
        { error: "You can only reset stores you are assigned to." },
        { status: 403 },
      );
    }
    if (
      "locationId" in body &&
      body.locationId &&
      !canAccessLocation(allowed.user, body.locationId)
    ) {
      return NextResponse.json({ error: "You cannot change stock for that store." }, { status: 403 });
    }

    if (body.action === "set") {
      const onHand = await setInventoryOnHand(
        body.locationId,
        body.productId,
        body.quantity,
        body.reason ?? "adjustment",
        undefined,
        actorUserId,
      );
      if (needsRestock && onHand > 0) {
        void import("@/lib/notifications/stock-alerts").then(({ notifyWatchersBackInStock }) =>
          notifyWatchersBackInStock(body.productId, body.locationId).catch(console.error),
        );
      }
      return NextResponse.json({ ok: true, onHand });
    }

    if (body.action === "adjust") {
      const ok = await adjustInventory(
        body.locationId,
        body.productId,
        body.delta,
        body.reason ?? "adjustment",
        body.orderId,
        actorUserId,
      );
      if (!ok) {
        return NextResponse.json({ error: "Insufficient stock." }, { status: 409 });
      }
      if (needsRestock && body.delta > 0) {
        void import("@/lib/notifications/stock-alerts").then(({ notifyWatchersBackInStock }) =>
          notifyWatchersBackInStock(body.productId, body.locationId).catch(console.error),
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deduct") {
      const result = await deductOrderStock(body.locationId, body.items, body.orderId);
      if (!result.ok) {
        return NextResponse.json({ ok: false, shortfalls: result.shortfalls }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "visibility") {
      const result = await setProductVisibility(
        body.locationId,
        body.productId,
        body.hidden,
        actorUserId,
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "pricing") {
      const { prisma } = await import("@/lib/db/prisma");
      const { recordActivity } = await import("@/lib/db/activity");
      const { activityChanges, onlyChanged } = await import("@/lib/activity/changes");
      const { moneyNumber } = await import("@/lib/db/money");
      const previous = await prisma.locationInventory.findUnique({
        where: {
          locationId_productId: {
            locationId: body.locationId,
            productId: body.productId,
          },
        },
        select: {
          basePrice: true,
          salePrice: true,
          costPrice: true,
          promoPrice: true,
        },
      });
      const money = (n: unknown) => {
        if (n == null) return "(none)";
        const value = moneyNumber(n);
        return value <= 0 ? "(none)" : `$${value.toFixed(2)}`;
      };
      const nextBase = body.basePrice !== undefined ? body.basePrice : previous?.basePrice;
      const nextSale = body.salePrice !== undefined ? body.salePrice : previous?.salePrice;
      const nextCost = body.costPrice !== undefined ? body.costPrice : previous?.costPrice;
      const nextPromo = body.promoPrice !== undefined ? body.promoPrice : previous?.promoPrice;
      const changes = onlyChanged([
        { field: "basePrice", from: money(previous?.basePrice), to: money(nextBase) },
        { field: "salePrice", from: money(previous?.salePrice), to: money(nextSale) },
        { field: "costPrice", from: money(previous?.costPrice), to: money(nextCost) },
        { field: "promoPrice", from: money(previous?.promoPrice), to: money(nextPromo) },
      ]);
      await prisma.locationInventory.update({
        where: {
          locationId_productId: {
            locationId: body.locationId,
            productId: body.productId,
          },
        },
        data: {
          ...(body.basePrice !== undefined ? { basePrice: body.basePrice } : {}),
          ...(body.salePrice !== undefined ? { salePrice: body.salePrice } : {}),
          ...(body.costPrice !== undefined ? { costPrice: body.costPrice } : {}),
          ...(body.promoPrice !== undefined ? { promoPrice: body.promoPrice } : {}),
        },
      });
      if (changes.length) {
        await recordActivity({
          actorUserId,
          action: "inventory.pricing",
          entityType: "inventory",
          entityId: body.productId,
          locationId: body.locationId,
          summary: `${allowed.user.name} updated location pricing for product ${body.productId}`,
          metadata: activityChanges(changes),
        });
      }
      return NextResponse.json({ ok: true });
    }

    await resetInventory(body.locationId, actorUserId);
    const inventory = await fetchInventoryState();
    return NextResponse.json({ ok: true, inventory });
  } catch (error) {
    console.error("[PATCH /api/inventory]", error);
    return NextResponse.json({ error: "Failed to update inventory." }, { status: 500 });
  }
}
