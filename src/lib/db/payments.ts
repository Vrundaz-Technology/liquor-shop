import type { Prisma } from "@prisma/client";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { moneyNumber } from "@/lib/db/money";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges } from "@/lib/activity/changes";
import { reverseOrganizationCustomer } from "@/lib/db/crm";
import * as loyaltyDb from "@/lib/db/loyalty";
import {
  addColumnIfMissing,
  addForeignKeyIfMissing,
  createIndexIfMissing,
  createUniqueIndexIfMissing,
} from "@/lib/db/schema-guard";
import {
  canAccessLocation,
} from "@/lib/auth/location-access";
import { hasPermission } from "@/lib/auth/permissions";
import {
  derivePaymentStatus,
  providerForMethod,
  remainingRefundable,
  roundCents,
  type ShopPaymentMethod,
} from "@/lib/commerce/payments";
import type { Order, UserProfile } from "@/types";

type Tx = Prisma.TransactionClient;

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

let paymentsReady = false;

function isDuplicateKeyError(error: unknown): boolean {
  const err = error as { meta?: { code?: string | number }; code?: string | number; message?: string };
  const code = Number(err.meta?.code ?? err.code);
  if (code === 1062) return true;
  const msg = String(err.message ?? error ?? "");
  return msg.includes("Duplicate") || msg.includes("1062") || msg.includes("ER_DUP_ENTRY");
}

export async function ensurePaymentSchema() {
  if (!isDbConfigured() || paymentsReady) return;

  await addColumnIfMissing("orders", "payment_method", "VARCHAR(32) NULL");
  await addColumnIfMissing("orders", "payment_provider", "VARCHAR(32) NULL");
  await addColumnIfMissing("orders", "refunded_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0.00");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS order_payments (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      order_id VARCHAR(191) NOT NULL,
      organization_id VARCHAR(191) NULL,
      location_id VARCHAR(191) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      method VARCHAR(32) NULL,
      provider_ref VARCHAR(191) NULL,
      idempotency_key VARCHAR(191) NOT NULL,
      reason VARCHAR(255) NULL,
      actor_user_id VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY order_payments_idempotency_key (idempotency_key),
      INDEX order_payments_order_idx (order_id),
      INDEX order_payments_org_created_idx (organization_id, created_at),
      INDEX order_payments_kind_status_created_idx (kind, status, created_at)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await createUniqueIndexIfMissing(
    "order_payments",
    "order_payments_idempotency_key",
    "`idempotency_key`",
  );
  await createIndexIfMissing("order_payments", "order_payments_order_idx", "`order_id`");
  await createIndexIfMissing(
    "order_payments",
    "order_payments_org_created_idx",
    "`organization_id`, `created_at`",
  );
  await addForeignKeyIfMissing(
    "order_payments",
    "order_payments_order_id_fkey",
    "order_id",
    "REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "order_payments",
    "order_payments_actor_user_id_fkey",
    "actor_user_id",
    "REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );

  try {
    await backfillPaymentLedger();
  } catch (error) {
    const msg = String((error as { message?: string }).message ?? error ?? "");
    if (!msg.includes("1213") && !msg.includes("Deadlock") && !msg.includes("1062")) {
      throw error;
    }
    console.warn("[ensurePaymentSchema] backfill retry later", msg.slice(0, 180));
  }
  paymentsReady = true;
}

async function backfillPaymentLedger() {
  await prisma.$executeRawUnsafe(`
    INSERT INTO order_payments (
      id, order_id, organization_id, location_id, provider, kind, status,
      amount, method, idempotency_key, reason, created_at
    )
    SELECT
      CONCAT('pay-chg-', o.id),
      o.id,
      o.organization_id,
      o.location_id,
      CASE
        WHEN o.fulfillment = 'pos' THEN 'pos_cash'
        ELSE 'online'
      END,
      'charge',
      'succeeded',
      o.total,
      CASE
        WHEN o.fulfillment = 'pos' THEN COALESCE(o.payment_method, 'cash')
        ELSE COALESCE(o.payment_method, 'online')
      END,
      CONCAT('charge:', o.id),
      'Backfill captured charge',
      o.created_at
    FROM orders o
    WHERE NOT EXISTS (
      SELECT 1 FROM order_payments p
      WHERE p.order_id = o.id AND p.kind = 'charge'
    )
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO order_payments (
      id, order_id, organization_id, location_id, provider, kind, status,
      amount, method, idempotency_key, reason, created_at
    )
    SELECT
      CONCAT('pay-ref-', o.id),
      o.id,
      o.organization_id,
      o.location_id,
      CASE
        WHEN o.fulfillment = 'pos' THEN 'pos_cash'
        ELSE 'online'
      END,
      'refund',
      'succeeded',
      o.total,
      CASE
        WHEN o.fulfillment = 'pos' THEN COALESCE(o.payment_method, 'cash')
        ELSE COALESCE(o.payment_method, 'online')
      END,
      CONCAT('refund:', o.id, ':cancel'),
      'Backfill cancel refund',
      o.created_at
    FROM orders o
    WHERE o.status = 'cancelled'
      AND COALESCE(o.refunded_amount, 0) <= 0
      AND NOT EXISTS (
        SELECT 1 FROM order_payments p
        WHERE p.order_id = o.id AND p.kind = 'refund'
      )
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE orders o
    SET refunded_amount = o.total,
        payment_status = 'refunded'
    WHERE o.status = 'cancelled'
      AND COALESCE(o.refunded_amount, 0) <= 0
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE orders o
    SET payment_method = CASE
          WHEN o.fulfillment = 'pos' THEN COALESCE(o.payment_method, 'cash')
          ELSE COALESCE(o.payment_method, 'online')
        END,
        payment_provider = CASE
          WHEN o.fulfillment = 'pos' THEN COALESCE(o.payment_provider, 'pos_cash')
          ELSE COALESCE(o.payment_provider, 'online')
        END
    WHERE o.payment_method IS NULL OR o.payment_provider IS NULL
  `);
}

async function insertPaymentRow(
  tx: Tx,
  row: {
    id: string;
    orderId: string;
    organizationId: string | null;
    locationId: string;
    provider: string;
    kind: "charge" | "refund";
    status: "pending" | "succeeded" | "failed";
    amount: number;
    method: string;
    providerRef?: string | null;
    idempotencyKey: string;
    reason?: string | null;
    actorUserId?: string | null;
  },
) {
  try {
    await tx.$executeRawUnsafe(
      `INSERT INTO order_payments (
         id, order_id, organization_id, location_id, provider, kind, status,
         amount, method, provider_ref, idempotency_key, reason, actor_user_id
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      row.id,
      row.orderId,
      row.organizationId,
      row.locationId,
      row.provider,
      row.kind,
      row.status,
      roundCents(row.amount).toFixed(2),
      row.method,
      row.providerRef ?? null,
      row.idempotencyKey,
      row.reason ?? null,
      row.actorUserId ?? null,
    );
    return { inserted: true as const };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return { inserted: false as const };
  }
}

export async function recordChargeTx(
  tx: Tx,
  input: {
    orderId: string;
    organizationId: string | null;
    locationId: string;
    fulfillment: string;
    total: number;
    method: ShopPaymentMethod;
    actorUserId?: string | null;
    providerRef?: string | null;
  },
) {
  const amount = roundCents(input.total);
  const method = input.method;
  const provider = providerForMethod(input.fulfillment, method);

  await tx.$executeRawUnsafe(
    `UPDATE orders
     SET payment_method = ?,
         payment_provider = ?,
         refunded_amount = COALESCE(refunded_amount, 0),
         payment_status = ?
     WHERE id = ?`,
    method,
    provider,
    "paid",
    input.orderId,
  );

  if (amount <= 0) return;

  await insertPaymentRow(tx, {
    id: `pay-${crypto.randomUUID()}`,
    orderId: input.orderId,
    organizationId: input.organizationId,
    locationId: input.locationId,
    provider,
    kind: "charge",
    status: "succeeded",
    amount,
    method,
    providerRef: input.providerRef,
    idempotencyKey: `charge:${input.orderId}`,
    reason: "Captured at sale",
    actorUserId: input.actorUserId,
  });
}

type LockedOrder = {
  id: string;
  user_id: string;
  organization_id: string | null;
  location_id: string;
  status: string;
  fulfillment: string;
  total: unknown;
  refunded_amount: unknown;
  payment_status: string | null;
  payment_method: string | null;
  payment_provider: string | null;
};

async function lockOrder(tx: Tx, orderId: string): Promise<LockedOrder | null> {
  const rows = await tx.$queryRawUnsafe<LockedOrder[]>(
    `SELECT id, user_id, organization_id, location_id, status, fulfillment,
            total, refunded_amount, payment_status, payment_method, payment_provider
     FROM orders
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    orderId,
  );
  return rows[0] ?? null;
}

export async function refundRemainingInTx(
  tx: Tx,
  input: {
    orderId: string;
    actorUserId?: string | null;
    reason: string;
    idempotencyKey: string;
  },
) {
  const order = await lockOrder(tx, input.orderId);
  if (!order) return { refunded: 0, remaining: 0, paymentStatus: "paid" };

  const total = moneyNumber(order.total);
  const already = moneyNumber(order.refunded_amount);
  const remaining = remainingRefundable(total, already);
  if (remaining <= 0) {
    return {
      refunded: 0,
      remaining: 0,
      paymentStatus: derivePaymentStatus(total, already),
    };
  }

  const method = (order.payment_method as ShopPaymentMethod | null) ?? "online";
  const provider = order.payment_provider || providerForMethod(order.fulfillment, method);
  const nextRefunded = roundCents(already + remaining);
  const paymentStatus = derivePaymentStatus(total, nextRefunded);

  const written = await insertPaymentRow(tx, {
    id: `pay-${crypto.randomUUID()}`,
    orderId: order.id,
    organizationId: order.organization_id,
    locationId: order.location_id,
    provider,
    kind: "refund",
    status: "succeeded",
    amount: remaining,
    method,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    actorUserId: input.actorUserId,
  });

  if (!written.inserted) {
    const current = await lockOrder(tx, input.orderId);
    const refundedNow = moneyNumber(current?.refunded_amount);
    return {
      refunded: 0,
      remaining: remainingRefundable(total, refundedNow),
      paymentStatus: derivePaymentStatus(total, refundedNow),
    };
  }

  await tx.$executeRawUnsafe(
    `UPDATE orders SET refunded_amount = ?, payment_status = ? WHERE id = ?`,
    nextRefunded.toFixed(2),
    paymentStatus,
    order.id,
  );

  return { refunded: remaining, remaining: 0, paymentStatus };
}

async function restockOrderItems(
  tx: Tx,
  orderId: string,
  locationId: string,
) {
  const already = await tx.inventoryLedger.findFirst({
    where: { orderId, reason: { in: ["cancel", "refund"] } },
  });
  if (already) return;

  const items = await tx.orderItem.findMany({ where: { orderId } });
  const sales = await tx.inventoryLedger.findMany({
    where: { orderId, reason: "sale" },
  });
  const reserves = await tx.inventoryLedger.findMany({
    where: { orderId, reason: "reserve" },
  });

  if (sales.length) {
    for (const item of items) {
      const existing = await tx.locationInventory.findUnique({
        where: {
          locationId_productId: { locationId, productId: item.productId },
        },
      });
      const nextQty = (existing?.onHand ?? 0) + item.quantity;
      await tx.locationInventory.upsert({
        where: { locationId_productId: { locationId, productId: item.productId } },
        create: {
          locationId,
          productId: item.productId,
          seedStock: nextQty,
          onHand: nextQty,
        },
        update: { onHand: nextQty },
      });
      await tx.inventoryLedger.create({
        data: {
          locationId,
          productId: item.productId,
          delta: item.quantity,
          onHandAfter: nextQty,
          reason: "refund",
          orderId,
        },
      });
    }
    return;
  }

  if (reserves.length) {
    for (const item of items) {
      await tx.$executeRaw`
        UPDATE location_inventory
        SET reserved = GREATEST(0, COALESCE(reserved, 0) - ${item.quantity})
        WHERE location_id = ${locationId}
          AND product_id = ${item.productId}
      `;
      const row = await tx.locationInventory.findUnique({
        where: { locationId_productId: { locationId, productId: item.productId } },
      });
      await tx.inventoryLedger.create({
        data: {
          locationId,
          productId: item.productId,
          delta: 0,
          onHandAfter: row?.onHand ?? 0,
          reason: "release",
          orderId,
        },
      });
    }
  }
}

export async function refundOrder(input: {
  orderId: string;
  actor: UserProfile;
  amount?: number;
  reason?: string;
  restock?: boolean;
  idempotencyKey?: string;
}) {
  if (!isDbConfigured()) {
    throw new PaymentError("Database is not configured.");
  }
  await ensurePaymentSchema();

  if (!hasPermission(input.actor, "orders.manage")) {
    throw new PaymentError("You do not have permission to refund orders.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (!order) throw new PaymentError("Order not found.");
    if (!canAccessLocation(input.actor, order.location_id)) {
      throw new PaymentError("You do not have access to this store's orders.");
    }

    const total = moneyNumber(order.total);
    const already = moneyNumber(order.refunded_amount);
    const remaining = remainingRefundable(total, already);
    if (remaining <= 0) {
      throw new PaymentError("Nothing left to refund on this order.");
    }

    const requested =
      input.amount == null ? remaining : roundCents(input.amount);
    if (requested <= 0) {
      throw new PaymentError("Refund amount must be greater than 0.");
    }
    if (requested > remaining) {
      throw new PaymentError(
        `Refund cannot exceed the remaining ${remaining.toFixed(2)}.`,
      );
    }

    const method = (order.payment_method as ShopPaymentMethod | null) ?? "online";
    const provider = order.payment_provider || providerForMethod(order.fulfillment, method);
    const nextRefunded = roundCents(already + requested);
    const paymentStatus = derivePaymentStatus(total, nextRefunded);
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `refund:${order.id}:${crypto.randomUUID()}`;

    const written = await insertPaymentRow(tx, {
      id: `pay-${crypto.randomUUID()}`,
      orderId: order.id,
      organizationId: order.organization_id,
      locationId: order.location_id,
      provider,
      kind: "refund",
      status: "succeeded",
      amount: requested,
      method,
      idempotencyKey,
      reason: input.reason?.trim() || "Staff refund",
      actorUserId: input.actor.id,
    });

    if (!written.inserted) {
      throw new PaymentError("This refund was already recorded.");
    }

    await tx.$executeRawUnsafe(
      `UPDATE orders SET refunded_amount = ?, payment_status = ? WHERE id = ?`,
      nextRefunded.toFixed(2),
      paymentStatus,
      order.id,
    );

    const fulfilled = ["delivered", "picked_up", "completed"].includes(order.status);
    const shouldRestock =
      input.restock === true || (input.restock !== false && !fulfilled && order.status !== "cancelled");
    if (shouldRestock && order.status !== "cancelled") {
      await restockOrderItems(tx, order.id, order.location_id);
    }

    return {
      orderId: order.id,
      userId: order.user_id,
      organizationId: order.organization_id,
      locationId: order.location_id,
      amount: requested,
      remaining: remainingRefundable(total, nextRefunded),
      paymentStatus,
      refundedAmount: nextRefunded,
      full: remainingRefundable(total, nextRefunded) <= 0,
      restocked: shouldRestock && order.status !== "cancelled",
    };
  });

  try {
    await reverseOrganizationCustomer({
      organizationId: result.organizationId ?? "org-sams-discount-liquor",
      userId: result.userId,
    });
  } catch (error) {
    console.error("[refundOrder] CRM reverse failed", error);
  }

  if (result.full) {
    try {
      await loyaltyDb.reverseLoyaltyForCancelledOrder({
        organizationId: result.organizationId ?? "org-sams-discount-liquor",
        userId: result.userId,
        orderId: result.orderId,
      });
    } catch (error) {
      console.error("[refundOrder] loyalty reverse failed", error);
    }
  }

  await recordActivity({
    actorUserId: input.actor.id,
    action: "order.refunded",
    entityType: "order",
    entityId: result.orderId,
    locationId: result.locationId,
    summary: `${input.actor.name} refunded $${result.amount.toFixed(2)} on ${result.orderId}`,
    metadata: activityChanges(
      [
        { field: "refund", to: `$${result.amount.toFixed(2)}` },
        { field: "remaining", to: `$${result.remaining.toFixed(2)}` },
        { field: "payment_status", to: result.paymentStatus },
        { field: "restocked", to: result.restocked ? "Yes" : "No" },
        { field: "reason", to: input.reason?.trim() || "Staff refund" },
      ],
      {
        amount: result.amount,
        remaining: result.remaining,
        restocked: result.restocked,
        reason: input.reason?.trim() || "Staff refund",
      },
    ),
  });

  return result;
}
