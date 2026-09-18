/**
 * Builds a MySQL dump phpMyAdmin can import.
 * Usage: npx tsx scripts/generate-phpmyadmin-seed.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../src/lib/auth/password";
import { DEMO_PASSWORD } from "../src/lib/auth/roles";
import { categories } from "../src/data/categories";
import { products } from "../src/data/products";
import { locations } from "../src/data/locations";
import {
  events,
  reviews,
  demoUser,
  demoOwner,
  demoAccounts,
} from "../src/data/events";
import { loyaltyTestCustomers } from "../src/data/loyalty-test-customers";
import { drivers } from "../src/data/drivers";
import type { Order, Product, StoreLocation, UserProfile } from "../src/types";

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "phpmyadmin-seed.sql");

function sqlStr(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NULL";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\u0000/g, "")}'`;
}

function sqlJson(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  return sqlStr(JSON.stringify(value));
}

function sqlDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return sqlStr(
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  );
}

function insert(table: string, columns: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  if (!rows.length) return `-- (no rows for ${table})\n`;
  const header = `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES\n`;
  const body = rows
    .map((row) => `  (${row.map((v) => (typeof v === "string" && (v === "NULL" || /^-?\d+(\.\d+)?$/.test(v)) ? v : sqlStr(v as never))).join(", ")})`)
    .join(",\n");
  return `${header}${body};\n`;
}

function row(values: Array<string | number | boolean | null | undefined>): string {
  return `  (${values
    .map((v) => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number") return String(v);
      if (typeof v === "boolean") return v ? "1" : "0";
      if (typeof v === "string" && v.startsWith("__RAW__:")) return v.slice(8);
      return sqlStr(v);
    })
    .join(", ")})`;
}

function insertRaw(table: string, columns: string[], valueRows: Array<Array<string | number | boolean | null | undefined>>): string {
  if (!valueRows.length) return `-- (no rows for ${table})\n`;
  return `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES\n${valueRows.map(row).join(",\n")};\n`;
}

function productValues(p: Product) {
  return [
    p.id,
    p.slug,
    p.name,
    p.brand,
    p.category,
    p.subcategory ?? null,
    p.description,
    p.brandStory,
    p.origin,
    p.country,
    p.abv,
    p.volumeMl,
    p.price,
    p.compareAtPrice ?? null,
    p.rating,
    p.reviewCount,
    `__RAW__:${sqlJson(p.tastingNotes)}`,
    `__RAW__:${sqlJson(p.foodPairings)}`,
    `__RAW__:${sqlJson(p.cocktails)}`,
    `__RAW__:${sqlJson(p.images)}`,
    p.color,
    p.accentColor,
    p.labelColor,
    p.bottleHeight,
    p.isPremium,
    p.isImported,
    `__RAW__:${sqlJson(p.tags)}`,
    p.nutrition ? `__RAW__:${sqlJson(p.nutrition)}` : null,
    p.glbUrl ?? null,
    p.usdzUrl ?? null,
    false,
    `__RAW__:${sqlDate("2026-01-01T00:00:00Z")}`,
    `__RAW__:${sqlDate("2026-01-01T00:00:00Z")}`,
  ];
}

function locationValues(loc: StoreLocation) {
  return [
    loc.id,
    loc.slug,
    loc.name,
    loc.shortName,
    loc.address,
    loc.city,
    loc.state,
    loc.zip,
    loc.phone,
    loc.email,
    `__RAW__:${sqlJson(loc.hours)}`,
    loc.lat,
    loc.lng,
    loc.heroImage,
    `__RAW__:${sqlJson(loc.gallery)}`,
    `__RAW__:${sqlJson(loc.staff)}`,
    `__RAW__:${sqlJson(loc.services)}`,
    loc.parking,
    loc.pickupAvailable,
    loc.deliveryAvailable,
    loc.deliveryRadiusKm,
    loc.deliveryFee,
    loc.deliveryFreeMinimum,
    loc.taxRate,
    `__RAW__:${sqlJson(loc.featuredOffers)}`,
    loc.description,
  ];
}

function userValues(profile: UserProfile, passwordHash: string) {
  return [
    profile.id,
    profile.email,
    profile.name,
    profile.role,
    passwordHash,
    profile.active,
    profile.preferredBranchId,
    profile.loyaltyPoints,
    profile.loyaltyTier,
    `__RAW__:${sqlJson(profile.addresses)}`,
    `__RAW__:${sqlJson(profile.recentlyViewed)}`,
    profile.avatarUrl ?? null,
    `__RAW__:${sqlJson(profile.permissionGrants ?? [])}`,
    `__RAW__:${sqlJson(profile.permissionRevokes ?? [])}`,
    profile.allowedLocationIds == null ? null : `__RAW__:${sqlJson(profile.allowedLocationIds)}`,
    `__RAW__:${sqlDate("2026-01-01T00:00:00Z")}`,
    `__RAW__:${sqlDate("2026-01-01T00:00:00Z")}`,
  ];
}

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const nowSeed = sqlDate("2026-01-01T00:00:00Z");

  const parts: string[] = [];
  parts.push(`-- phpMyAdmin SQL Dump
-- Sam's Discount Liquor — demo seed
-- Generated from prisma/seed.ts source data
--
-- Import: phpMyAdmin → select your database → Import → choose this file → Go
-- Requires MySQL 5.7+ / MariaDB 10.2+ (JSON columns)
-- Demo login password for all seed accounts: ${DEMO_PASSWORD}
--
-- WARNING: Deletes existing rows in these tables before inserting seed data.
-- Uses DELETE (not TRUNCATE) so MariaDB/MySQL will not fail on foreign keys.

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+00:00';

`);

  parts.push(`CREATE TABLE IF NOT EXISTS \`categories\` (
  \`slug\` VARCHAR(191) NOT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`tagline\` VARCHAR(191) NOT NULL,
  \`description\` TEXT NOT NULL,
  \`color\` VARCHAR(191) NOT NULL,
  PRIMARY KEY (\`slug\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`products\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`slug\` VARCHAR(191) NOT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`brand\` VARCHAR(191) NOT NULL,
  \`category_slug\` VARCHAR(191) NOT NULL,
  \`subcategory\` VARCHAR(191) DEFAULT NULL,
  \`description\` TEXT NOT NULL,
  \`brand_story\` TEXT NOT NULL,
  \`origin\` VARCHAR(191) NOT NULL,
  \`country\` VARCHAR(191) NOT NULL,
  \`abv\` DOUBLE NOT NULL,
  \`volume_ml\` INT NOT NULL,
  \`price\` DOUBLE NOT NULL,
  \`compare_at_price\` DOUBLE DEFAULT NULL,
  \`rating\` DOUBLE NOT NULL,
  \`review_count\` INT NOT NULL,
  \`tasting_notes\` JSON NOT NULL,
  \`food_pairings\` JSON NOT NULL,
  \`cocktails\` JSON NOT NULL,
  \`images\` JSON NOT NULL,
  \`color\` VARCHAR(191) NOT NULL,
  \`accent_color\` VARCHAR(191) NOT NULL,
  \`label_color\` VARCHAR(191) NOT NULL,
  \`bottle_height\` DOUBLE NOT NULL,
  \`is_premium\` TINYINT(1) NOT NULL,
  \`is_imported\` TINYINT(1) NOT NULL,
  \`tags\` JSON NOT NULL,
  \`nutrition\` JSON DEFAULT NULL,
  \`glb_url\` VARCHAR(191) DEFAULT NULL,
  \`usdz_url\` VARCHAR(191) DEFAULT NULL,
  \`is_custom\` TINYINT(1) NOT NULL DEFAULT 0,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`products_slug_key\` (\`slug\`),
  KEY \`products_category_slug_idx\` (\`category_slug\`),
  KEY \`products_brand_idx\` (\`brand\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`locations\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`slug\` VARCHAR(191) NOT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`short_name\` VARCHAR(191) NOT NULL,
  \`address\` VARCHAR(191) NOT NULL,
  \`city\` VARCHAR(191) NOT NULL,
  \`state\` VARCHAR(191) NOT NULL,
  \`zip\` VARCHAR(191) NOT NULL,
  \`phone\` VARCHAR(191) NOT NULL,
  \`email\` VARCHAR(191) NOT NULL,
  \`hours\` JSON NOT NULL,
  \`lat\` DOUBLE NOT NULL,
  \`lng\` DOUBLE NOT NULL,
  \`hero_image\` VARCHAR(191) NOT NULL,
  \`gallery\` JSON NOT NULL,
  \`staff\` JSON NOT NULL,
  \`services\` JSON NOT NULL,
  \`parking\` TEXT NOT NULL,
  \`pickup_available\` TINYINT(1) NOT NULL,
  \`delivery_available\` TINYINT(1) NOT NULL DEFAULT 1,
  \`delivery_radius_km\` DOUBLE NOT NULL,
  \`delivery_fee\` DOUBLE NOT NULL DEFAULT 12.5,
  \`delivery_free_minimum\` DOUBLE NOT NULL DEFAULT 150,
  \`tax_rate\` DOUBLE NOT NULL DEFAULT 0.08875,
  \`featured_offers\` JSON NOT NULL,
  \`description\` TEXT NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`locations_slug_key\` (\`slug\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`drivers\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`phone\` VARCHAR(191) NOT NULL,
  \`email\` VARCHAR(191) DEFAULT NULL,
  \`vehicle\` VARCHAR(191) NOT NULL,
  \`location_id\` VARCHAR(191) NOT NULL,
  \`status\` VARCHAR(191) NOT NULL DEFAULT 'available',
  \`active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`photo_url\` TEXT DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`drivers_location_id_idx\` (\`location_id\`),
  KEY \`drivers_status_idx\` (\`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`location_inventory\` (
  \`location_id\` VARCHAR(191) NOT NULL,
  \`product_id\` VARCHAR(191) NOT NULL,
  \`seed_stock\` INT NOT NULL,
  \`on_hand\` INT NOT NULL,
  \`promo_price\` DOUBLE DEFAULT NULL,
  \`featured\` TINYINT(1) NOT NULL DEFAULT 0,
  \`hidden\` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (\`location_id\`, \`product_id\`),
  KEY \`location_inventory_product_id_idx\` (\`product_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`events\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`slug\` VARCHAR(191) NOT NULL,
  \`title\` VARCHAR(191) NOT NULL,
  \`type\` VARCHAR(191) NOT NULL,
  \`description\` TEXT NOT NULL,
  \`location_id\` VARCHAR(191) NOT NULL,
  \`date\` VARCHAR(191) NOT NULL,
  \`start_time\` VARCHAR(191) NOT NULL,
  \`end_time\` VARCHAR(191) NOT NULL,
  \`price\` DOUBLE NOT NULL,
  \`seats_total\` INT NOT NULL,
  \`seats_available\` INT NOT NULL,
  \`image\` VARCHAR(191) NOT NULL,
  \`hosts\` JSON NOT NULL,
  \`active\` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`events_slug_key\` (\`slug\`),
  KEY \`events_location_id_idx\` (\`location_id\`),
  KEY \`events_active_idx\` (\`active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`reviews\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`product_id\` VARCHAR(191) NOT NULL,
  \`user_name\` VARCHAR(191) NOT NULL,
  \`rating\` INT NOT NULL,
  \`title\` VARCHAR(191) NOT NULL,
  \`body\` TEXT NOT NULL,
  \`date\` VARCHAR(191) NOT NULL,
  \`verified\` TINYINT(1) NOT NULL,
  \`images\` JSON DEFAULT NULL,
  \`helpful\` INT NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`reviews_product_id_idx\` (\`product_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`email\` VARCHAR(191) NOT NULL,
  \`name\` VARCHAR(191) NOT NULL,
  \`role\` VARCHAR(191) NOT NULL,
  \`password_hash\` VARCHAR(191) DEFAULT NULL,
  \`active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`preferred_branch_id\` VARCHAR(191) NOT NULL,
  \`loyalty_points\` INT NOT NULL,
  \`loyalty_tier\` VARCHAR(191) NOT NULL,
  \`addresses\` JSON NOT NULL,
  \`recently_viewed\` JSON NOT NULL,
  \`avatar_url\` TEXT DEFAULT NULL,
  \`permission_grants\` JSON NOT NULL,
  \`permission_revokes\` JSON NOT NULL,
  \`allowed_location_ids\` JSON DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`users_email_key\` (\`email\`),
  KEY \`users_role_idx\` (\`role\`),
  KEY \`users_active_idx\` (\`active\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`orders\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`user_id\` VARCHAR(191) NOT NULL,
  \`date\` VARCHAR(191) NOT NULL,
  \`status\` VARCHAR(191) NOT NULL,
  \`total\` DOUBLE NOT NULL,
  \`fulfillment\` VARCHAR(191) NOT NULL,
  \`location_id\` VARCHAR(191) NOT NULL,
  \`tracking\` VARCHAR(191) DEFAULT NULL,
  \`driver_id\` VARCHAR(191) DEFAULT NULL,
  \`delivery_status\` VARCHAR(191) DEFAULT NULL,
  \`delivery_phone\` VARCHAR(191) DEFAULT NULL,
  \`delivery_address\` JSON DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`orders_user_id_idx\` (\`user_id\`),
  KEY \`orders_location_id_idx\` (\`location_id\`),
  KEY \`orders_date_idx\` (\`date\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`order_items\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`order_id\` VARCHAR(191) NOT NULL,
  \`product_id\` VARCHAR(191) NOT NULL,
  \`quantity\` INT NOT NULL,
  \`price\` DOUBLE NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`order_items_order_id_idx\` (\`order_id\`),
  KEY \`order_items_product_id_idx\` (\`product_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`inventory_ledger\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`location_id\` VARCHAR(191) NOT NULL,
  \`product_id\` VARCHAR(191) NOT NULL,
  \`delta\` INT NOT NULL,
  \`on_hand_after\` INT NOT NULL,
  \`reason\` VARCHAR(191) NOT NULL,
  \`order_id\` VARCHAR(191) DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`inventory_ledger_location_id_product_id_idx\` (\`location_id\`, \`product_id\`),
  KEY \`inventory_ledger_order_id_idx\` (\`order_id\`),
  KEY \`inventory_ledger_created_at_idx\` (\`created_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`activity_logs\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`actor_user_id\` VARCHAR(191) DEFAULT NULL,
  \`actor_name\` VARCHAR(191) NOT NULL,
  \`actor_role\` VARCHAR(191) NOT NULL,
  \`actor_email\` VARCHAR(191) DEFAULT NULL,
  \`action\` VARCHAR(191) NOT NULL,
  \`entity_type\` VARCHAR(191) NOT NULL,
  \`entity_id\` VARCHAR(191) DEFAULT NULL,
  \`summary\` TEXT NOT NULL,
  \`metadata\` JSON DEFAULT NULL,
  \`location_id\` VARCHAR(191) DEFAULT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`activity_logs_created_at_idx\` (\`created_at\`),
  KEY \`activity_logs_actor_user_id_idx\` (\`actor_user_id\`),
  KEY \`activity_logs_action_idx\` (\`action\`),
  KEY \`activity_logs_entity_idx\` (\`entity_type\`, \`entity_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`role_definitions\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`slug\` VARCHAR(191) NOT NULL,
  \`label\` VARCHAR(191) NOT NULL,
  \`description\` TEXT NOT NULL,
  \`permissions\` JSON NOT NULL,
  \`rank\` INT NOT NULL DEFAULT 1,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`role_definitions_slug_key\` (\`slug\`),
  KEY \`role_definitions_rank_idx\` (\`rank\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

`);

  parts.push(`DELETE FROM \`activity_logs\`;
DELETE FROM \`inventory_ledger\`;
DELETE FROM \`order_items\`;
DELETE FROM \`orders\`;
DELETE FROM \`reviews\`;
DELETE FROM \`events\`;
DELETE FROM \`location_inventory\`;
DELETE FROM \`drivers\`;
DELETE FROM \`users\`;
DELETE FROM \`products\`;
DELETE FROM \`locations\`;
DELETE FROM \`categories\`;
DELETE FROM \`role_definitions\`;

`);

  parts.push(`-- Categories (${categories.length})\n`);
  parts.push(
    insertRaw(
      "categories",
      ["slug", "name", "tagline", "description", "color"],
      categories.map((c) => [c.slug, c.name, c.tagline, c.description, c.color]),
    ),
  );

  parts.push(`\n-- Products (${products.length})\n`);
  parts.push(
    insertRaw(
      "products",
      [
        "id",
        "slug",
        "name",
        "brand",
        "category_slug",
        "subcategory",
        "description",
        "brand_story",
        "origin",
        "country",
        "abv",
        "volume_ml",
        "price",
        "compare_at_price",
        "rating",
        "review_count",
        "tasting_notes",
        "food_pairings",
        "cocktails",
        "images",
        "color",
        "accent_color",
        "label_color",
        "bottle_height",
        "is_premium",
        "is_imported",
        "tags",
        "nutrition",
        "glb_url",
        "usdz_url",
        "is_custom",
        "created_at",
        "updated_at",
      ],
      products.map(productValues),
    ),
  );

  parts.push(`\n-- Locations (${locations.length})\n`);
  parts.push(
    insertRaw(
      "locations",
      [
        "id",
        "slug",
        "name",
        "short_name",
        "address",
        "city",
        "state",
        "zip",
        "phone",
        "email",
        "hours",
        "lat",
        "lng",
        "hero_image",
        "gallery",
        "staff",
        "services",
        "parking",
        "pickup_available",
        "delivery_available",
        "delivery_radius_km",
        "delivery_fee",
        "delivery_free_minimum",
        "tax_rate",
        "featured_offers",
        "description",
      ],
      locations.map(locationValues),
    ),
  );

  const inventoryRows = locations.flatMap((loc) =>
    loc.inventory.map((item) => [
      loc.id,
      item.productId,
      item.stock,
      item.stock,
      item.promoPrice ?? null,
      item.featured ?? false,
      item.hidden ?? false,
    ]),
  );
  parts.push(`\n-- Location inventory (${inventoryRows.length})\n`);
  parts.push(
    insertRaw(
      "location_inventory",
      ["location_id", "product_id", "seed_stock", "on_hand", "promo_price", "featured", "hidden"],
      inventoryRows,
    ),
  );

  parts.push(`\n-- Drivers (${drivers.length})\n`);
  parts.push(
    insertRaw(
      "drivers",
      ["id", "name", "phone", "email", "vehicle", "location_id", "status", "active", "photo_url"],
      drivers.map((d) => [
        d.id,
        d.name,
        d.phone,
        d.email ?? null,
        d.vehicle,
        d.locationId,
        d.status,
        d.active,
        d.photoUrl ?? null,
      ]),
    ),
  );

  parts.push(`\n-- Events (${events.length})\n`);
  parts.push(
    insertRaw(
      "events",
      [
        "id",
        "slug",
        "title",
        "type",
        "description",
        "location_id",
        "date",
        "start_time",
        "end_time",
        "price",
        "seats_total",
        "seats_available",
        "image",
        "hosts",
        "active",
      ],
      events.map((e) => [
        e.id,
        e.slug,
        e.title,
        e.type,
        e.description,
        e.locationId,
        e.date,
        e.startTime,
        e.endTime,
        e.price,
        e.seatsTotal,
        e.seatsAvailable,
        e.image,
        `__RAW__:${sqlJson(e.hosts)}`,
        e.active !== false,
      ]),
    ),
  );

  parts.push(`\n-- Reviews (${reviews.length})\n`);
  parts.push(
    insertRaw(
      "reviews",
      ["id", "product_id", "user_name", "rating", "title", "body", "date", "verified", "images", "helpful"],
      reviews.map((r) => [
        r.id,
        r.productId,
        r.userName,
        r.rating,
        r.title,
        r.body,
        r.date,
        r.verified,
        r.images ? `__RAW__:${sqlJson(r.images)}` : null,
        r.helpful,
      ]),
    ),
  );

  const seedUsers = [...demoAccounts, ...loyaltyTestCustomers];
  parts.push(`\n-- Demo users (${seedUsers.length}) — password: ${DEMO_PASSWORD}\n`);
  parts.push(
    insertRaw(
      "users",
      [
        "id",
        "email",
        "name",
        "role",
        "password_hash",
        "active",
        "preferred_branch_id",
        "loyalty_points",
        "loyalty_tier",
        "addresses",
        "recently_viewed",
        "avatar_url",
        "permission_grants",
        "permission_revokes",
        "allowed_location_ids",
        "created_at",
        "updated_at",
      ],
      seedUsers.map((account) => userValues(account, passwordHash)),
    ),
  );

  const orders = demoUser.orders as Order[];
  parts.push(`\n-- Orders (${orders.length})\n`);
  parts.push(
    insertRaw(
      "orders",
      [
        "id",
        "user_id",
        "date",
        "status",
        "total",
        "fulfillment",
        "location_id",
        "tracking",
        "driver_id",
        "delivery_status",
        "delivery_phone",
        "delivery_address",
        "created_at",
      ],
      orders.map((order) => [
        order.id,
        demoUser.id,
        order.date,
        order.status,
        order.total,
        order.fulfillment,
        order.locationId,
        order.tracking ?? null,
        null,
        null,
        null,
        null,
        `__RAW__:${sqlDate(`${order.date}T15:30:00Z`)}`,
      ]),
    ),
  );

  const orderItems = orders.flatMap((order) =>
    order.items.map((item, index) => [
      `oi-${order.id}-${index + 1}`,
      order.id,
      item.productId,
      item.quantity,
      item.price,
    ]),
  );
  parts.push(`\n-- Order items (${orderItems.length})\n`);
  parts.push(
    insertRaw("order_items", ["id", "order_id", "product_id", "quantity", "price"], orderItems),
  );

  const activityRows: Array<Array<string | number | boolean | null | undefined>> = [
    [
      "act-seed-login",
      demoOwner.id,
      demoOwner.name,
      demoOwner.email,
      "owner",
      "auth.login",
      "user",
      demoOwner.id,
      "Sam signed in as owner",
      null,
      null,
      `__RAW__:${sqlDate("2026-01-10T09:00:00Z")}`,
    ],
    ...demoUser.orders.map((order) => [
      `act-seed-${order.id.toLowerCase()}`,
      demoUser.id,
      demoUser.name,
      demoUser.email,
      "customer",
      order.status === "cancelled" ? "order.cancelled" : "order.placed",
      "order",
      order.id,
      order.status === "cancelled"
        ? `Cancelled order ${order.id}`
        : `Placed ${order.fulfillment} order ${order.id} for $${order.total.toFixed(2)}`,
      `__RAW__:${sqlJson({ total: order.total, fulfillment: order.fulfillment, status: order.status })}`,
      order.locationId,
      `__RAW__:${sqlDate(`${order.date}T15:30:00Z`)}`,
    ]),
    [
      "act-seed-restock",
      demoOwner.id,
      demoOwner.name,
      demoOwner.email,
      "owner",
      "inventory.restock",
      "inventory",
      "mk-buffalo-trace",
      "Restocked Buffalo Trace Bourbon at Downtown to 24",
      `__RAW__:${sqlJson({ quantity: 24, reason: "restock" })}`,
      "loc1",
      `__RAW__:${sqlDate("2026-07-20T11:15:00Z")}`,
    ],
    [
      "act-seed-adjust",
      demoOwner.id,
      demoOwner.name,
      demoOwner.email,
      "owner",
      "inventory.adjust",
      "inventory",
      "mk-glenfiddich-12",
      "Adjusted Glenfiddich 12 at Uptown by -2",
      `__RAW__:${sqlJson({ delta: -2, reason: "adjustment" })}`,
      "loc3",
      `__RAW__:${sqlDate("2026-07-28T16:40:00Z")}`,
    ],
  ];

  parts.push(`\n-- Activity logs (${activityRows.length})\n`);
  parts.push(
    insertRaw(
      "activity_logs",
      [
        "id",
        "actor_user_id",
        "actor_name",
        "actor_email",
        "actor_role",
        "action",
        "entity_type",
        "entity_id",
        "summary",
        "metadata",
        "location_id",
        "created_at",
      ],
      activityRows,
    ),
  );

  parts.push(`
SET FOREIGN_KEY_CHECKS = 1;
`);

  writeFileSync(outPath, parts.join(""), "utf8");
  console.log(`Wrote ${outPath}`);
  void insert;
  void nowSeed;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
