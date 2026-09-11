import { prisma, isDbConfigured } from "@/lib/db/prisma";
import {
  addColumnIfMissing,
  addForeignKeyIfMissing,
  createIndexIfMissing,
  createUniqueIndexIfMissing,
  modifyColumnToDecimalIfNeeded,
} from "@/lib/db/schema-guard";
import type { UserProfile } from "@/types";

export const SAMS_ORG_ID = "org-sams-discount-liquor";
export const SAMS_ORG_SLUG = "sams-discount-liquor";

let orgReady = false;

async function ensureReferentialIntegrity() {
  // Prefer a known seed location when preferred branch is missing/orphaned.
  await prisma.$executeRawUnsafe(`
    UPDATE users u
    LEFT JOIN locations l ON l.id = u.preferred_branch_id
    SET u.preferred_branch_id = COALESCE(
      (SELECT id FROM locations ORDER BY id LIMIT 1),
      u.preferred_branch_id
    )
    WHERE l.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE organizations o
    LEFT JOIN users u ON u.id = o.owner_user_id
    SET o.owner_user_id = NULL
    WHERE o.owner_user_id IS NOT NULL AND u.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE orders o
    LEFT JOIN users u ON u.id = o.assigned_staff_id
    SET o.assigned_staff_id = NULL
    WHERE o.assigned_staff_id IS NOT NULL AND u.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    SET o.driver_id = NULL
    WHERE o.driver_id IS NOT NULL AND d.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE orders o
    LEFT JOIN promotions p ON p.id = o.promotion_id
    SET o.promotion_id = NULL
    WHERE o.promotion_id IS NOT NULL AND p.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE inventory_ledger il
    LEFT JOIN inventory_transfers t ON t.id = il.transfer_id
    SET il.transfer_id = NULL
    WHERE il.transfer_id IS NOT NULL AND t.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE inventory_ledger il
    LEFT JOIN orders o ON o.id = il.order_id
    SET il.order_id = NULL
    WHERE il.order_id IS NOT NULL AND o.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE loyalty_ledger ll
    LEFT JOIN orders o ON o.id = ll.order_id
    SET ll.order_id = NULL
    WHERE ll.order_id IS NOT NULL AND o.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE activity_logs a
    LEFT JOIN locations l ON l.id = a.location_id
    SET a.location_id = NULL
    WHERE a.location_id IS NOT NULL AND l.id IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE inventory_transfers t
    LEFT JOIN users u ON u.id = t.created_by_user_id
    SET t.created_by_user_id = NULL
    WHERE t.created_by_user_id IS NOT NULL AND u.id IS NULL
  `);

  // Drop duplicate transfer lines before unique (transfer_id, product_id).
  await prisma.$executeRawUnsafe(`
    DELETE l1 FROM inventory_transfer_lines l1
    INNER JOIN inventory_transfer_lines l2
      ON l1.transfer_id = l2.transfer_id
     AND l1.product_id = l2.product_id
     AND l1.id > l2.id
  `);

  // Keep one promo per org+code; null out extras so unique index can apply.
  await prisma.$executeRawUnsafe(`
    UPDATE promotions p1
    INNER JOIN promotions p2
      ON p1.organization_id <=> p2.organization_id
     AND p1.code = p2.code
     AND p1.code IS NOT NULL
     AND p1.id > p2.id
    SET p1.code = NULL
  `);
}

async function ensureMoneyDecimalColumns() {
  const money12 = (nullable: boolean, def?: string) =>
    nullable
      ? "DECIMAL(12,2) NULL"
      : `DECIMAL(12,2) NOT NULL DEFAULT ${def ?? "0.00"}`;
  const rate86 = `DECIMAL(8,6) NOT NULL DEFAULT 0.088750`;
  const rate84 = (def: string) => `DECIMAL(8,4) NOT NULL DEFAULT ${def}`;

  await modifyColumnToDecimalIfNeeded("products", "price", "DECIMAL(12,2) NOT NULL", 12, 2);
  await modifyColumnToDecimalIfNeeded("products", "compare_at_price", money12(true), 12, 2);
  await modifyColumnToDecimalIfNeeded("products", "cost_price", money12(true), 12, 2);

  await modifyColumnToDecimalIfNeeded("locations", "delivery_fee", money12(false, "12.50"), 12, 2);
  await modifyColumnToDecimalIfNeeded(
    "locations",
    "delivery_free_minimum",
    money12(false, "150.00"),
    12,
    2,
  );
  await modifyColumnToDecimalIfNeeded(
    "locations",
    "minimum_order_amount",
    money12(false, "0.00"),
    12,
    2,
  );
  await modifyColumnToDecimalIfNeeded("locations", "tax_rate", rate86, 8, 6);

  await modifyColumnToDecimalIfNeeded("location_inventory", "base_price", money12(true), 12, 2);
  await modifyColumnToDecimalIfNeeded("location_inventory", "sale_price", money12(true), 12, 2);
  await modifyColumnToDecimalIfNeeded("location_inventory", "cost_price", money12(true), 12, 2);
  await modifyColumnToDecimalIfNeeded("location_inventory", "promo_price", money12(true), 12, 2);

  await modifyColumnToDecimalIfNeeded("events", "price", "DECIMAL(12,2) NOT NULL", 12, 2);

  await modifyColumnToDecimalIfNeeded("orders", "total", "DECIMAL(12,2) NOT NULL", 12, 2);
  await modifyColumnToDecimalIfNeeded("orders", "subtotal", money12(false, "0.00"), 12, 2);
  await modifyColumnToDecimalIfNeeded("orders", "tax_amount", money12(false, "0.00"), 12, 2);
  await modifyColumnToDecimalIfNeeded("orders", "discount_amount", money12(false, "0.00"), 12, 2);
  await modifyColumnToDecimalIfNeeded("orders", "delivery_fee", money12(false, "0.00"), 12, 2);

  await modifyColumnToDecimalIfNeeded("order_items", "price", "DECIMAL(12,2) NOT NULL", 12, 2);

  await modifyColumnToDecimalIfNeeded(
    "organization_customers",
    "total_spent",
    money12(false, "0.00"),
    12,
    2,
  );

  await modifyColumnToDecimalIfNeeded("promotions", "value", "DECIMAL(12,4) NOT NULL", 12, 4);
  await modifyColumnToDecimalIfNeeded("promotions", "min_subtotal", money12(true), 12, 2);

  await modifyColumnToDecimalIfNeeded(
    "loyalty_programs",
    "points_per_dollar",
    rate84("1.0000"),
    8,
    4,
  );
  await modifyColumnToDecimalIfNeeded(
    "loyalty_programs",
    "redeem_rate",
    rate84("0.0200"),
    8,
    4,
  );
}

async function ensureForeignKeys() {
  await addForeignKeyIfMissing(
    "organizations",
    "organizations_owner_user_id_fkey",
    "owner_user_id",
    "REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "locations",
    "locations_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "products",
    "products_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "users",
    "users_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "users",
    "users_preferred_branch_id_fkey",
    "preferred_branch_id",
    "REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "organization_customers",
    "organization_customers_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "organization_customers",
    "organization_customers_user_id_fkey",
    "user_id",
    "REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "promotions",
    "promotions_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "promotions",
    "promotions_location_id_fkey",
    "location_id",
    "REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "loyalty_programs",
    "loyalty_programs_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "loyalty_ledger",
    "loyalty_ledger_program_id_fkey",
    "program_id",
    "REFERENCES `loyalty_programs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "loyalty_ledger",
    "loyalty_ledger_user_id_fkey",
    "user_id",
    "REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "loyalty_ledger",
    "loyalty_ledger_order_id_fkey",
    "order_id",
    "REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_transfers",
    "inventory_transfers_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_transfers",
    "inventory_transfers_from_location_id_fkey",
    "from_location_id",
    "REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_transfers",
    "inventory_transfers_to_location_id_fkey",
    "to_location_id",
    "REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_transfers",
    "inventory_transfers_created_by_user_id_fkey",
    "created_by_user_id",
    "REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_transfer_lines",
    "inventory_transfer_lines_transfer_id_fkey",
    "transfer_id",
    "REFERENCES `inventory_transfers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_transfer_lines",
    "inventory_transfer_lines_product_id_fkey",
    "product_id",
    "REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "orders",
    "orders_organization_id_fkey",
    "organization_id",
    "REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "orders",
    "orders_assigned_staff_id_fkey",
    "assigned_staff_id",
    "REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "orders",
    "orders_promotion_id_fkey",
    "promotion_id",
    "REFERENCES `promotions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  // orders_driver_id_fkey already exists from 0_init for most installs.
  await addForeignKeyIfMissing(
    "orders",
    "orders_driver_id_fkey",
    "driver_id",
    "REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_ledger",
    "inventory_ledger_location_id_fkey",
    "location_id",
    "REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_ledger",
    "inventory_ledger_product_id_fkey",
    "product_id",
    "REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "inventory_ledger",
    "inventory_ledger_transfer_id_fkey",
    "transfer_id",
    "REFERENCES `inventory_transfers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );
  await addForeignKeyIfMissing(
    "activity_logs",
    "activity_logs_location_id_fkey",
    "location_id",
    "REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
  );

  await createUniqueIndexIfMissing(
    "inventory_transfer_lines",
    "inventory_transfer_lines_transfer_id_product_id_key",
    "`transfer_id`, `product_id`",
  );
  await createUniqueIndexIfMissing(
    "promotions",
    "promotions_organization_id_code_key",
    "`organization_id`, `code`",
  );
  await createIndexIfMissing("users", "users_preferred_branch_id_idx", "`preferred_branch_id`");
  await createIndexIfMissing("orders", "orders_assigned_staff_id_idx", "`assigned_staff_id`");
  await createIndexIfMissing("orders", "orders_promotion_id_idx", "`promotion_id`");
  await createIndexIfMissing(
    "inventory_transfers",
    "inventory_transfers_created_by_user_id_idx",
    "`created_by_user_id`",
  );
  await createIndexIfMissing("loyalty_ledger", "loyalty_ledger_order_id_idx", "`order_id`");
  await createIndexIfMissing("activity_logs", "activity_logs_location_id_idx", "`location_id`");
  await createIndexIfMissing(
    "organization_customers",
    "organization_customers_user_id_idx",
    "`user_id`",
  );
}

export async function ensureOrganizationSchema() {
  if (!isDbConfigured() || orgReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS organizations (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      slug VARCHAR(191) NOT NULL UNIQUE,
      owner_user_id VARCHAR(191) NULL,
      settings JSON NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await addColumnIfMissing("locations", "organization_id", `VARCHAR(191) NULL`);
  await addColumnIfMissing("locations", "holiday_hours", "JSON NULL");
  await addColumnIfMissing("locations", "minimum_order_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0.00");
  await addColumnIfMissing("locations", "payment_settings", "JSON NULL");

  await addColumnIfMissing("users", "organization_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("users", "birthday", "DATE NULL");
  await addColumnIfMissing("users", "referral_code", "VARCHAR(32) NULL");
  await addColumnIfMissing("users", "referred_by_user_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("users", "birthday_reward_year", "INT NULL");
  await createUniqueIndexIfMissing("users", "users_referral_code_key", "`referral_code`");

  await addColumnIfMissing("products", "organization_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("products", "cost_price", "DECIMAL(12,2) NULL");
  await addColumnIfMissing("products", "sku", "VARCHAR(191) NULL");
  await addColumnIfMissing("products", "upc", "VARCHAR(191) NULL");
  await addColumnIfMissing("products", "min_qty", "INT NOT NULL DEFAULT 1");
  await addColumnIfMissing("products", "max_qty", "INT NULL");

  await addColumnIfMissing("location_inventory", "reserved", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("location_inventory", "base_price", "DECIMAL(12,2) NULL");
  await addColumnIfMissing("location_inventory", "sale_price", "DECIMAL(12,2) NULL");
  await addColumnIfMissing("location_inventory", "cost_price", "DECIMAL(12,2) NULL");
  await addColumnIfMissing("location_inventory", "low_stock_threshold", "INT NOT NULL DEFAULT 5");

  await addColumnIfMissing("orders", "organization_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "payment_status", "VARCHAR(191) NOT NULL DEFAULT 'paid'");
  await addColumnIfMissing("orders", "subtotal", "DECIMAL(12,2) NOT NULL DEFAULT 0.00");
  await addColumnIfMissing("orders", "tax_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0.00");
  await addColumnIfMissing("orders", "discount_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0.00");
  await addColumnIfMissing("orders", "delivery_fee", "DECIMAL(12,2) NOT NULL DEFAULT 0.00");
  await addColumnIfMissing("orders", "assigned_staff_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "coupon_code", "VARCHAR(191) NULL");
  await addColumnIfMissing("orders", "promotion_id", "VARCHAR(191) NULL");

  await addColumnIfMissing("inventory_ledger", "transfer_id", "VARCHAR(191) NULL");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS organization_customers (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      organization_id VARCHAR(191) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      notes TEXT NULL,
      marketing_consent BOOLEAN NOT NULL DEFAULT false,
      segment_cache VARCHAR(191) NULL,
      total_spent DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      order_count INT NOT NULL DEFAULT 0,
      last_order_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY organization_customers_org_user (organization_id, user_id),
      INDEX organization_customers_org_idx (organization_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS promotions (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      organization_id VARCHAR(191) NULL,
      location_id VARCHAR(191) NULL,
      scope VARCHAR(191) NOT NULL,
      name VARCHAR(191) NOT NULL,
      code VARCHAR(191) NULL,
      type VARCHAR(191) NOT NULL,
      value DECIMAL(12,4) NOT NULL,
      min_subtotal DECIMAL(12,2) NULL,
      priority INT NOT NULL DEFAULT 100,
      stackable BOOLEAN NOT NULL DEFAULT false,
      active BOOLEAN NOT NULL DEFAULT true,
      starts_at DATETIME(3) NULL,
      ends_at DATETIME(3) NULL,
      rules JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX promotions_org_idx (organization_id),
      INDEX promotions_code_idx (code)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS loyalty_programs (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      organization_id VARCHAR(191) NOT NULL UNIQUE,
      name VARCHAR(191) NOT NULL,
      points_per_dollar DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
      redeem_rate DECIMAL(8,4) NOT NULL DEFAULT 0.0200,
      birthday_points INT NOT NULL DEFAULT 100,
      referral_points INT NOT NULL DEFAULT 100,
      referral_signup_points INT NOT NULL DEFAULT 50,
      tiers JSON NOT NULL,
      rewards JSON NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await addColumnIfMissing("loyalty_programs", "birthday_points", "INT NOT NULL DEFAULT 100");
  await addColumnIfMissing("loyalty_programs", "referral_points", "INT NOT NULL DEFAULT 100");
  await addColumnIfMissing(
    "loyalty_programs",
    "referral_signup_points",
    "INT NOT NULL DEFAULT 50",
  );
  await addColumnIfMissing(
    "organization_customers",
    "loyalty_points",
    "INT NOT NULL DEFAULT 0",
  );
  await addColumnIfMissing(
    "organization_customers",
    "loyalty_tier",
    "VARCHAR(64) NOT NULL DEFAULT 'Member'",
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      program_id VARCHAR(191) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      delta INT NOT NULL,
      balance_after INT NOT NULL,
      reason VARCHAR(191) NOT NULL,
      order_id VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX loyalty_ledger_program_user_idx (program_id, user_id),
      INDEX loyalty_ledger_user_idx (user_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      organization_id VARCHAR(191) NOT NULL,
      from_location_id VARCHAR(191) NOT NULL,
      to_location_id VARCHAR(191) NOT NULL,
      status VARCHAR(191) NOT NULL DEFAULT 'pending',
      notes TEXT NULL,
      created_by_user_id VARCHAR(191) NULL,
      completed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX inventory_transfers_org_idx (organization_id),
      INDEX inventory_transfers_status_idx (status)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      transfer_id VARCHAR(191) NOT NULL,
      product_id VARCHAR(191) NOT NULL,
      quantity INT NOT NULL,
      INDEX inventory_transfer_lines_transfer_idx (transfer_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  // Ensure Sam's org exists and backfill locations/users/orders
  await prisma.$executeRawUnsafe(
    `INSERT INTO organizations (id, name, slug, settings, active)
     VALUES (?, ?, ?, CAST(? AS JSON), true)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    SAMS_ORG_ID,
    "Sam's Discount Liquor",
    SAMS_ORG_SLUG,
    JSON.stringify({ brand: "sams" }),
  );

  await prisma.$executeRawUnsafe(
    `UPDATE locations SET organization_id = ? WHERE organization_id IS NULL OR organization_id = ''`,
    SAMS_ORG_ID,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE users SET organization_id = ? WHERE role IN ('owner','admin','staff') AND (organization_id IS NULL OR organization_id = '')`,
    SAMS_ORG_ID,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE orders o
     INNER JOIN locations l ON l.id = o.location_id
     SET o.organization_id = l.organization_id
     WHERE o.organization_id IS NULL`,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE products SET organization_id = ? WHERE organization_id IS NULL`,
    SAMS_ORG_ID,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE location_inventory li
     INNER JOIN products p ON p.id = li.product_id
     SET li.base_price = COALESCE(li.base_price, p.price)
     WHERE li.base_price IS NULL`,
  );

  // Migrate legacy order statuses where still old values
  await prisma.$executeRawUnsafe(`
    UPDATE orders SET status = 'completed'
    WHERE fulfillment = 'pos' AND status IN ('processing','ready','shipped','delivered')
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE orders SET status = 'picked_up'
    WHERE fulfillment = 'pickup' AND status = 'delivered'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE orders SET status = 'ready_for_pickup'
    WHERE fulfillment = 'pickup' AND status = 'ready'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE orders SET status = 'preparing'
    WHERE fulfillment = 'pickup' AND status IN ('processing','shipped')
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE orders SET status = 'out_for_delivery'
    WHERE fulfillment = 'delivery' AND (status = 'shipped' OR delivery_status IN ('en_route','picked_up'))
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE orders SET status = 'assigned'
    WHERE fulfillment = 'delivery' AND delivery_status = 'assigned' AND status <> 'delivered' AND status <> 'cancelled'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE orders SET status = 'new'
    WHERE fulfillment = 'delivery' AND status = 'processing'
  `);

  await ensureReferentialIntegrity();
  await ensureMoneyDecimalColumns();
  await ensureForeignKeys();

  orgReady = true;
}

export function actorOrganizationId(actor: UserProfile): string | null {
  return actor.organizationId ?? (actor.role === "owner" || actor.role === "admin" || actor.role === "staff"
    ? SAMS_ORG_ID
    : null);
}

export async function resolveLocationOrganizationId(locationId: string): Promise<string | null> {
  if (!isDbConfigured()) return SAMS_ORG_ID;
  await ensureOrganizationSchema();
  const rows = await prisma.$queryRawUnsafe<{ organization_id: string | null }[]>(
    `SELECT organization_id FROM locations WHERE id = ? LIMIT 1`,
    locationId,
  );
  return rows[0]?.organization_id ?? SAMS_ORG_ID;
}

export function assertSameOrganization(actor: UserProfile, organizationId: string | null | undefined) {
  const actorOrg = actorOrganizationId(actor);
  if (!organizationId || !actorOrg) return;
  if (actor.role === "owner" && actorOrg === organizationId) return;
  if (actorOrg !== organizationId) {
    throw new Error("You do not have access to this organization.");
  }
}
