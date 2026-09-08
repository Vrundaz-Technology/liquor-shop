import { isDbConfigured } from "@/lib/db/prisma";
import { addColumnIfMissing } from "@/lib/db/schema-guard";

let inventoryVisibilitySchemaReady = false;

/**
 * Ensures location_inventory.hidden exists on older databases without a full migrate.
 *
 * Must be awaited before any typed Prisma read of LocationInventory (including
 * `location.findMany({ include: { inventory: true } })`), because Prisma selects
 * every column in the schema and errors with P2022 when one is missing.
 *
 * Always call this outside `$transaction`. MySQL commits the surrounding
 * transaction implicitly when it runs DDL, which would silently split a
 * multi-statement unit of work in half.
 */
export async function ensureInventoryVisibilityColumn() {
  if (!isDbConfigured() || inventoryVisibilitySchemaReady) return;
  await addColumnIfMissing("location_inventory", "hidden", "BOOLEAN NOT NULL DEFAULT false");
  inventoryVisibilitySchemaReady = true;
}
