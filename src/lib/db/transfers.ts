import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureOrganizationSchema, actorOrganizationId } from "@/lib/db/organization";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges } from "@/lib/activity/changes";
import { canAccessLocation } from "@/lib/auth/location-access";
import { availableStock } from "@/lib/commerce/order-status";
import type { UserProfile } from "@/types";

export type TransferLineInput = { productId: string; quantity: number };

export async function listTransfers(actor: UserProfile, limit = 50) {
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

  const { actor, fromLocationId, toLocationId, lines, notes } = input;
  if (fromLocationId === toLocationId) {
    throw new Error("Source and destination stores must differ.");
  }
  if (!canAccessLocation(actor, fromLocationId) || !canAccessLocation(actor, toLocationId)) {
    throw new Error("You do not have access to one of these stores.");
  }
  if (!lines.length) throw new Error("Add at least one product to transfer.");

  const orgId = actorOrganizationId(actor);
  if (!orgId) throw new Error("Organization required.");

  const locs = await prisma.$queryRawUnsafe<{ id: string; organization_id: string }[]>(
    `SELECT id, organization_id FROM locations WHERE id IN (?, ?)`,
    fromLocationId,
    toLocationId,
  );
  if (locs.length !== 2 || locs.some((l) => l.organization_id !== orgId)) {
    throw new Error("Both stores must belong to your organization.");
  }

  const transferId = `xfer-${crypto.randomUUID()}`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO inventory_transfers
        (id, organization_id, from_location_id, to_location_id, status, notes, created_by_user_id, completed_at)
       VALUES (?,?,?,?, 'completed', ?, ?, NOW(3))`,
      transferId,
      orgId,
      fromLocationId,
      toLocationId,
      notes ?? null,
      actor.id,
    );

    for (const line of lines) {
      if (line.quantity <= 0) throw new Error("Transfer quantity must be positive.");
      const fromInv = await tx.locationInventory.findUnique({
        where: {
          locationId_productId: { locationId: fromLocationId, productId: line.productId },
        },
      });
      if (!fromInv) throw new Error(`Product missing at source store: ${line.productId}`);
      const avail = availableStock(fromInv.onHand, fromInv.reserved ?? 0);
      if (avail < line.quantity) {
        throw new Error(`Insufficient available stock for ${line.productId}.`);
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
        },
      });
      await tx.$executeRawUnsafe(
        `UPDATE inventory_ledger SET transfer_id = ? WHERE id = (
           SELECT id FROM (
             SELECT id FROM inventory_ledger
             WHERE location_id = ? AND product_id = ? AND reason = 'transfer_out'
             ORDER BY created_at DESC LIMIT 1
           ) t
         )`,
        transferId,
        fromLocationId,
        line.productId,
      );

      const toInv = await tx.locationInventory.findUnique({
        where: {
          locationId_productId: { locationId: toLocationId, productId: line.productId },
        },
      });
      if (!toInv) {
        await tx.locationInventory.create({
          data: {
            locationId: toLocationId,
            productId: line.productId,
            seedStock: 0,
            onHand: line.quantity,
            reserved: 0,
            basePrice: fromInv.basePrice ?? fromInv.promoPrice,
            featured: false,
            hidden: false,
          },
        });
        await tx.inventoryLedger.create({
          data: {
            locationId: toLocationId,
            productId: line.productId,
            delta: line.quantity,
            onHandAfter: line.quantity,
            reason: "transfer_in",
          },
        });
      } else {
        const toAfter = toInv.onHand + line.quantity;
        await tx.locationInventory.update({
          where: {
            locationId_productId: { locationId: toLocationId, productId: line.productId },
          },
          data: { onHand: toAfter },
        });
        await tx.inventoryLedger.create({
          data: {
            locationId: toLocationId,
            productId: line.productId,
            delta: line.quantity,
            onHandAfter: toAfter,
            reason: "transfer_in",
          },
        });
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_transfer_lines (id, transfer_id, product_id, quantity) VALUES (?,?,?,?)`,
        `xfl-${crypto.randomUUID()}`,
        transferId,
        line.productId,
        line.quantity,
      );
    }
  });

  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  let fromLabel = fromLocationId;
  let toLabel = toLocationId;
  try {
    const { getLocationById } = await import("@/data/locations");
    fromLabel = getLocationById(fromLocationId)?.shortName ?? fromLocationId;
    toLabel = getLocationById(toLocationId)?.shortName ?? toLocationId;
  } catch {
    /* keep ids */
  }

  await recordActivity({
    actorUserId: actor.id,
    action: "inventory.transfer",
    entityType: "inventory",
    entityId: transferId,
    locationId: fromLocationId,
    summary: `${actor.name} transferred ${lines.length} SKU(s) to another store`,
    metadata: activityChanges(
      [
        { field: "from location", to: fromLabel },
        { field: "to location", to: toLabel },
        { field: "SKU count", to: lines.length },
        { field: "units", to: units },
      ],
      { transferId, fromLocationId, toLocationId, itemCount: lines.length },
    ),
  });

  void (async () => {
    try {
      const { emitStaffNotification } = await import("@/lib/db/staff-notifications");
      const { getLocationById } = await import("@/data/locations");
      const from = getLocationById(fromLocationId)?.shortName ?? fromLocationId;
      const to = getLocationById(toLocationId)?.shortName ?? toLocationId;
      const qty = lines.reduce((sum, line) => sum + line.quantity, 0);
      await emitStaffNotification({
        organizationId: actorOrganizationId(actor),
        type: "transfer.created",
        title: "Stock transfer completed",
        body: `${from} → ${to} · ${lines.length} SKU(s) · ${qty} bottle(s) · by ${actor.name}`,
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

  return transferId;
}
