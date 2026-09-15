import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { DEFAULT_FULFILLMENT_PRICING } from "@/lib/fulfillment-pricing";
import { moneyOptional } from "@/lib/db/money";
import { addColumnIfMissing } from "@/lib/db/schema-guard";
import { ensureDispatchSchema } from "@/lib/db/dispatch-settings";

let locationPricingSchemaReady = false;

/** Ensures delivery/pricing columns exist on older databases without a full migrate. */
export async function ensureLocationPricingSchema() {
  if (!isDbConfigured() || locationPricingSchemaReady) return;
  await addColumnIfMissing(
    "locations",
    "pickup_available",
    "BOOLEAN NOT NULL DEFAULT true",
  );
  await addColumnIfMissing(
    "locations",
    "delivery_available",
    "BOOLEAN NOT NULL DEFAULT true",
  );
  await addColumnIfMissing(
    "locations",
    "delivery_fee",
    "DECIMAL(12,2) NOT NULL DEFAULT 12.50",
  );
  await addColumnIfMissing(
    "locations",
    "delivery_free_minimum",
    "DECIMAL(12,2) NOT NULL DEFAULT 150.00",
  );
  await addColumnIfMissing(
    "locations",
    "tax_rate",
    "DECIMAL(8,6) NOT NULL DEFAULT 0.088750",
  );
  await ensureDispatchSchema();
  locationPricingSchemaReady = true;
}

export type LocationPricingRow = {
  deliveryAvailable?: boolean | null;
  deliveryFee?: unknown;
  deliveryFreeMinimum?: unknown;
  taxRate?: unknown;
};

export function mapLocationPricing(row: LocationPricingRow | Record<string, unknown>) {
  const source = row as LocationPricingRow;
  return {
    deliveryAvailable: source.deliveryAvailable ?? DEFAULT_FULFILLMENT_PRICING.deliveryAvailable,
    deliveryFee: moneyOptional(source.deliveryFee) ?? DEFAULT_FULFILLMENT_PRICING.deliveryFee,
    deliveryFreeMinimum:
      moneyOptional(source.deliveryFreeMinimum) ?? DEFAULT_FULFILLMENT_PRICING.deliveryFreeMinimum,
    taxRate: moneyOptional(source.taxRate) ?? DEFAULT_FULFILLMENT_PRICING.taxRate,
  };
}

function asBool(value: unknown, fallback: boolean) {
  if (value === false || value === 0 || value === "0") return false;
  if (value === true || value === 1 || value === "1") return true;
  return fallback;
}

export type LocationFulfillmentSettings = {
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
};

export async function loadLocationFulfillment(
  locationId: string,
): Promise<LocationFulfillmentSettings> {
  await ensureLocationPricingSchema();
  const rows = await prisma.$queryRawUnsafe<
    {
      pickup_available: number | boolean | null;
      delivery_available: number | boolean | null;
    }[]
  >(
    `SELECT pickup_available, delivery_available FROM locations WHERE id = ? LIMIT 1`,
    locationId,
  );
  const row = rows[0];
  return {
    pickupAvailable: asBool(row?.pickup_available, true),
    deliveryAvailable: asBool(row?.delivery_available, true),
  };
}

export async function saveLocationFulfillment(
  locationId: string,
  settings: Partial<LocationFulfillmentSettings>,
): Promise<LocationFulfillmentSettings> {
  const current = await loadLocationFulfillment(locationId);
  const next: LocationFulfillmentSettings = {
    pickupAvailable: settings.pickupAvailable ?? current.pickupAvailable,
    deliveryAvailable: settings.deliveryAvailable ?? current.deliveryAvailable,
  };
  await prisma.$executeRawUnsafe(
    `UPDATE locations SET pickup_available = ?, delivery_available = ? WHERE id = ?`,
    next.pickupAvailable,
    next.deliveryAvailable,
    locationId,
  );
  return next;
}
