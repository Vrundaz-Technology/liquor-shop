import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { addColumnIfMissing } from "@/lib/db/schema-guard";

let alertsReady = false;
let cartReady = false;
let orderEtaReady = false;

export async function ensureProductAlertsSchema() {
  if (!isDbConfigured() || alertsReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS product_alerts (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL,
      product_id VARCHAR(191) NOT NULL,
      location_id VARCHAR(191) NULL,
      kind VARCHAR(32) NOT NULL,
      target_price DECIMAL(12,2) NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      notified_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX product_alerts_user_idx (user_id),
      INDEX product_alerts_product_idx (product_id),
      INDEX product_alerts_kind_idx (kind)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  alertsReady = true;
}

export async function ensureAbandonedCartSchema() {
  if (!isDbConfigured() || cartReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS abandoned_carts (
      user_id VARCHAR(191) NOT NULL PRIMARY KEY,
      items_json JSON NOT NULL,
      item_count INT NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      reminded_at DATETIME(3) NULL,
      INDEX abandoned_carts_updated_idx (updated_at)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  cartReady = true;
}

export async function ensureOrderEtaColumn() {
  if (!isDbConfigured() || orderEtaReady) return;
  await addColumnIfMissing("orders", "eta_minutes", "INT NULL");
  orderEtaReady = true;
}

export type ProductAlertKind = "back_in_stock" | "price";

export async function upsertProductAlert(input: {
  userId: string;
  productId: string;
  kind: ProductAlertKind;
  locationId?: string | null;
  targetPrice?: number | null;
}) {
  if (!isDbConfigured()) return null;
  await ensureProductAlertsSchema();
  const id = `pa_${input.userId.slice(0, 8)}_${input.productId.slice(0, 12)}_${input.kind}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO product_alerts (id, user_id, product_id, location_id, kind, target_price, active, notified_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, true, NULL, NOW(3))
     ON DUPLICATE KEY UPDATE
       location_id = VALUES(location_id),
       target_price = VALUES(target_price),
       active = true,
       notified_at = NULL`,
    id,
    input.userId,
    input.productId,
    input.locationId ?? null,
    input.kind,
    input.targetPrice ?? null,
  );
  return id;
}

export async function deactivateProductAlert(
  userId: string,
  productId: string,
  kind: ProductAlertKind,
) {
  if (!isDbConfigured()) return;
  await ensureProductAlertsSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE product_alerts SET active = false WHERE user_id = ? AND product_id = ? AND kind = ?`,
    userId,
    productId,
    kind,
  );
}

export async function listActiveAlertsForProduct(
  productId: string,
  kind: ProductAlertKind,
  locationId?: string | null,
) {
  if (!isDbConfigured()) return [];
  await ensureProductAlertsSchema();
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      user_id: string;
      product_id: string;
      location_id: string | null;
      kind: string;
      target_price: number | null;
    }[]
  >(
    locationId
      ? `SELECT id, user_id, product_id, location_id, kind, target_price
         FROM product_alerts
         WHERE active = true AND product_id = ? AND kind = ?
           AND (location_id IS NULL OR location_id = ?)
         LIMIT 200`
      : `SELECT id, user_id, product_id, location_id, kind, target_price
         FROM product_alerts
         WHERE active = true AND product_id = ? AND kind = ?
         LIMIT 200`,
    ...(locationId ? [productId, kind, locationId] : [productId, kind]),
  );
  return rows;
}

export async function markAlertNotified(alertId: string) {
  if (!isDbConfigured()) return;
  await ensureProductAlertsSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE product_alerts SET notified_at = NOW(3), active = false WHERE id = ?`,
    alertId,
  );
}

export async function syncAbandonedCart(
  userId: string,
  items: { productId: string; quantity: number }[],
) {
  if (!isDbConfigured()) return;
  await ensureAbandonedCartSchema();
  const itemCount = items.reduce((n, i) => n + Math.max(0, i.quantity), 0);
  if (itemCount <= 0) {
    await prisma.$executeRawUnsafe(`DELETE FROM abandoned_carts WHERE user_id = ?`, userId);
    return;
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO abandoned_carts (user_id, items_json, item_count, updated_at, reminded_at)
     VALUES (?, CAST(? AS JSON), ?, NOW(3), NULL)
     ON DUPLICATE KEY UPDATE
       items_json = VALUES(items_json),
       item_count = VALUES(item_count),
       updated_at = NOW(3),
       reminded_at = NULL`,
    userId,
    JSON.stringify(items),
    itemCount,
  );
}

/** Carts idle for at least `idleMinutes`, not yet reminded (or reminded > 3 days ago). */
export async function listAbandonedCartsDue(idleMinutes = 60, limit = 50) {
  if (!isDbConfigured()) return [];
  await ensureAbandonedCartSchema();
  return prisma.$queryRawUnsafe<
    { user_id: string; item_count: number; updated_at: Date; reminded_at: Date | null }[]
  >(
    `SELECT user_id, item_count, updated_at, reminded_at
     FROM abandoned_carts
     WHERE item_count > 0
       AND updated_at < DATE_SUB(NOW(3), INTERVAL ? MINUTE)
       AND (reminded_at IS NULL OR reminded_at < DATE_SUB(NOW(3), INTERVAL 3 DAY))
     ORDER BY updated_at ASC
     LIMIT ?`,
    idleMinutes,
    limit,
  );
}

export async function markAbandonedCartReminded(userId: string) {
  if (!isDbConfigured()) return;
  await ensureAbandonedCartSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE abandoned_carts SET reminded_at = NOW(3) WHERE user_id = ?`,
    userId,
  );
}
