import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureOrganizationSchema, actorOrganizationId } from "@/lib/db/organization";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges } from "@/lib/activity/changes";
import { canAccessLocation } from "@/lib/auth/location-access";
import { availableStock } from "@/lib/commerce/order-status";
import { fetchInventoryState } from "@/lib/db/queries";
import type { UserProfile } from "@/types";

export type TransferLineInput = { productId: string; quantity: number };

function mergeTransferLines(lines: TransferLineInput[]): TransferLineInput[] {
  const qty = new Map<string, number>();
  for (const line of lines) {
    const productId = line.productId.trim();
    const quantity = Math.floor(line.quantity);
    if (!productId || quantity <= 0) continue;
    qty.set(productId, (qty.get(productId) ?? 0) + quantity);
  }
  return [...qty.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export async function listTransfers(actor: UserProfile, limit = 200) {
  if (!isDbConfigured()) return [];
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor);
  if (!orgId) return [];

  const transfers = await prisma.$queryRawUnsafe<
    {
      id: string;
      organization_id: string;
      from_location_id: string;
      to_location_id: string;
      status: string;
      notes: string | null;
      created_by_user_id: string | null;
      completed_at: Date | null;
      created_at: Date;
    }[]
  >(
    `SELECT * FROM inventory_transfers WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?`,
    orgId,
    limit,
  );

  const result = [];
  for (const t of transfers) {
    const lines = await prisma.$queryRawUnsafe<
      { id: string; product_id: string; quantity: number }[]
    >(`SELECT * FROM inventory_transfer_lines WHERE transfer_id = ?`, t.id);
    result.push({
      id: t.id,
      organizationId: t.organization_id,
      fromLocationId: t.from_location_id,
      toLocationId: t.to_location_id,
      status: t.status,
      notes: t.notes ?? undefined,
      createdByUserId: t.created_by_user_id ?? undefined,
      completedAt: t.completed_at?.toISOString(),
      createdAt: t.created_at.toISOString(),
      lines: lines.map((l) => ({
        id: l.id,
        productId: l.product_id,
        quantity: l.quantity,
      })),
    });
  }
  return result;
}

export async function createAndCompleteTransfer(input: {
  actor: UserProfile;
  fromLocationId: string;
  toLocationId: string;
  lines: TransferLineInput[];
  notes?: string;
}) {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureOrganizationSchema();

  const { actor, fromLocationId, toLocationId, notes } = input;
  const lines = mergeTransferLines(input.lines);
  if (fromLocationId === toLocationId) {
    throw new Error("Source and destination stores must differ.");
  }
  if (!canAccessLocation(actor, fromLocationId) || !canAccessLocation(actor, toLocationId)) {
    throw new Error("You do not have access to one of these stores.");
  }
  if (!lines.length) throw new Error("Add at least one product to transfer.");

  const orgId = actorOrganizationId(actor);
  if (!orgId) throw new Error("Organization required.");

  const locs = await prisma.$queryRawUnsafe<
    { id: string; organization_id: string; short_name: string }[]
  >(
    `SELECT id, organization_id, short_name FROM locations WHERE id IN (?, ?)`,
    fromLocationId,
    toLocationId,
  );
  if (locs.length !== 2 || locs.some((l) => l.organization_id !== orgId)) {
    throw new Error("Both stores must belong to your organization.");
  }
  const fromLabel = locs.find((l) => l.id === fromLocationId)?.short_name ?? fromLocationId;
  const toLabel = locs.find((l) => l.id === toLocationId)?.short_name ?? toLocationId;

  const productRows = await prisma.$queryRawUnsafe<{ id: string; name: string; brand: string }[]>(
    `SELECT id, name, brand FROM products WHERE id IN (${lines.map(() => "?").join(",")})`,
    ...lines.map((line) => line.productId),
  );
  const productLabel = (id: string) => {
    const row = productRows.find((p) => p.id === id);
    return row ? `${row.brand} ${row.name}`.trim() : id;
  };

  const transferId = `xfer-${crypto.randomUUID()}`;
  const restockedAtDest: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO inventory_transfers
        (id, organization_id, from_location_id, to_location_id, status, notes, created_by_user_id, completed_at)
       VALUES (?,?,?,?, 'completed', ?, ?, NOW(3))`,
      transferId,
      orgId,
      fromLocationId,
      toLocationId,
      notes?.trim() || null,
      actor.id,
    );

    for (const line of lines) {
      await tx.$executeRawUnsafe(
        `SELECT 1 FROM location_inventory WHERE location_id = ? AND product_id = ? FOR UPDATE`,
        fromLocationId,
        line.productId,
      );
      const fromInv = await tx.locationInventory.findUnique({
        where: {
          locationId_productId: { locationId: fromLocationId, productId: line.productId },
        },
      });
      if (!fromInv) {
        throw new Error(`${productLabel(line.productId)} is not stocked at ${fromLabel}.`);
      }
      const avail = availableStock(fromInv.onHand, fromInv.reserved ?? 0);
      if (avail < line.quantity) {
        throw new Error(
          `Only ${avail} available for ${productLabel(line.productId)} at ${fromLabel}.`,
        );
      }

      const fromAfter = fromInv.onHand - line.quantity;
      await tx.locationInventory.update({
        where: {
          locationId_productId: { locationId: fromLocationId, productId: line.productId },
        },
        data: { onHand: fromAfter },
      });
      await tx.inventoryLedger.create({
        data: {
          locationId: fromLocationId,
          productId: line.productId,
          delta: -line.quantity,
          onHandAfter: fromAfter,
          reason: "transfer_out",
          transferId,
        },
      });

      await tx.$executeRawUnsafe(
        `SELECT 1 FROM location_inventory WHERE location_id = ? AND product_id = ? FOR UPDATE`,
        toLocationId,
        line.productId,
      );
      const toInv = await tx.locationInventory.findUnique({
        where: {
          locationId_productId: { locationId: toLocationId, productId: line.productId },
        },
      });

      const destAvailBefore = toInv
        ? availableStock(toInv.onHand, toInv.reserved ?? 0)
        : 0;
      let toAfter = line.quantity;
      if (!toInv) {
        try {
          await tx.locationInventory.create({
            data: {
              locationId: toLocationId,
              productId: line.productId,
              seedStock: 0,
              onHand: line.quantity,
              reserved: 0,
              basePrice: fromInv.basePrice ?? fromInv.promoPrice,
              salePrice: fromInv.salePrice,
              costPrice: fromInv.costPrice,
              promoPrice: fromInv.promoPrice,
              featured: false,
              hidden: false,
              lowStockThreshold: fromInv.lowStockThreshold,
            },
          });
        } catch {
          const raced = await tx.locationInventory.findUnique({
            where: {
              locationId_productId: { locationId: toLocationId, productId: line.productId },
            },
          });
          if (!raced) throw new Error(`Could not stock ${productLabel(line.productId)} at ${toLabel}.`);
          toAfter = raced.onHand + line.quantity;
          await tx.locationInventory.update({
            where: {
              locationId_productId: { locationId: toLocationId, productId: line.productId },
            },
            data: { onHand: toAfter },
          });
        }
      } else {
        toAfter = toInv.onHand + line.quantity;
        await tx.locationInventory.update({
          where: {
            locationId_productId: { locationId: toLocationId, productId: line.productId },
          },
          data: { onHand: toAfter },
        });
      }

      await tx.inventoryLedger.create({
        data: {
          locationId: toLocationId,
          productId: line.productId,
          delta: line.quantity,
          onHandAfter: toAfter,
          reason: "transfer_in",
          transferId,
        },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_transfer_lines (id, transfer_id, product_id, quantity) VALUES (?,?,?,?)`,
        `xfl-${crypto.randomUUID()}`,
        transferId,
        line.productId,
        line.quantity,
      );

      if (destAvailBefore <= 0 && !toInv?.hidden) restockedAtDest.push(line.productId);
    }
  });

  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  await recordActivity({
    actorUserId: actor.id,
    action: "inventory.transfer",
    entityType: "inventory",
    entityId: transferId,
    locationId: fromLocationId,
    summary: `${actor.name} transferred ${units} bottle${units === 1 ? "" : "s"} from ${fromLabel} to ${toLabel}`,
    metadata: activityChanges(
      [
        { field: "from location", to: fromLabel },
        { field: "to location", to: toLabel },
        { field: "SKU count", to: lines.length },
        { field: "units", to: units },
        ...lines.map((line) => ({
          field: productLabel(line.productId),
          to: `× ${line.quantity}`,
        })),
      ],
      { transferId, fromLocationId, toLocationId, itemCount: lines.length },
    ),
  });

  void (async () => {
    try {
      const { emitStaffNotification } = await import("@/lib/db/staff-notifications");
      await emitStaffNotification({
        organizationId: orgId,
        type: "transfer.created",
        title: "Stock transfer completed",
        body: `${fromLabel} → ${toLabel} · ${lines.length} SKU(s) · ${units} bottle(s) · by ${actor.name}`,
        entityType: "transfer",
        entityId: transferId,
        locationId: fromLocationId,
        locationIds: [fromLocationId, toLocationId],
        actorUserId: actor.id,
        severity: "info",
        dedupeKey: `transfer.created:${transferId}`,
        href: "/dashboard/transfers",
        metadata: { fromLocationId, toLocationId, lines },
      });
    } catch (error) {
      console.error("[transfer staff notify]", error);
    }
  })();

  if (restockedAtDest.length) {
    void import("@/lib/notifications/stock-alerts").then(({ notifyWatchersBackInStock }) =>
      Promise.all(
        restockedAtDest.map((productId) =>
          notifyWatchersBackInStock(productId, toLocationId).catch(console.error),
        ),
      ),
    );
  }

  try {
    const inventory = await fetchInventoryState();
    return { id: transferId, inventory };
  } catch (error) {
    console.error("[transfer inventory snapshot]", error);
    return { id: transferId };
  }
}
