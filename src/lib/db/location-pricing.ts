import { isDbConfigured } from "@/lib/db/prisma";
import { DEFAULT_FULFILLMENT_PRICING } from "@/lib/fulfillment-pricing";
import { moneyOptional } from "@/lib/db/money";
import { addColumnIfMissing } from "@/lib/db/schema-guard";

let locationPricingSchemaReady = false;

/** Ensures delivery/pricing columns exist on older databases without a full migrate. */
export async function ensureLocationPricingSchema() {
  if (!isDbConfigured() || locationPricingSchemaReady) return;
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
