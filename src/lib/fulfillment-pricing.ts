import type { StoreLocation } from "@/types";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export type FulfillmentPricing = {
  deliveryAvailable: boolean;
  deliveryFee: number;
  deliveryFreeMinimum: number;
  taxRate: number;
};

export const DEFAULT_FULFILLMENT_PRICING: FulfillmentPricing = {
  deliveryAvailable: true,
  deliveryFee: 12.5,
  deliveryFreeMinimum: 150,
  taxRate: 0.08875,
};

export type LocationPricingFields = Pick<
  StoreLocation,
  "deliveryAvailable" | "deliveryFee" | "deliveryFreeMinimum" | "taxRate"
>;

export function pricingFromLocation(
  location?: Partial<LocationPricingFields> | null,
): FulfillmentPricing {
  return {
    deliveryAvailable: location?.deliveryAvailable ?? DEFAULT_FULFILLMENT_PRICING.deliveryAvailable,
    deliveryFee: location?.deliveryFee ?? DEFAULT_FULFILLMENT_PRICING.deliveryFee,
    deliveryFreeMinimum:
      location?.deliveryFreeMinimum ?? DEFAULT_FULFILLMENT_PRICING.deliveryFreeMinimum,
    taxRate: location?.taxRate ?? DEFAULT_FULFILLMENT_PRICING.taxRate,
  };
}

export function calculateShipping(
  subtotal: number,
  fulfillment: "delivery" | "pickup" | "pos",
  location?: Partial<LocationPricingFields> | null,
) {
  if (fulfillment === "pickup" || fulfillment === "pos") return 0;
  const pricing = pricingFromLocation(location);
  if (!pricing.deliveryAvailable) return 0;
  if (pricing.deliveryFreeMinimum > 0 && subtotal >= pricing.deliveryFreeMinimum) return 0;
  return pricing.deliveryFee;
}

export function calculateTax(
  subtotal: number,
  location?: Partial<LocationPricingFields> | null,
) {
  const pricing = pricingFromLocation(location);
  return Math.round(subtotal * pricing.taxRate * 100) / 100;
}

export function formatTaxRatePercent(rate: number) {
  const pct = rate * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(3).replace(/\.?0+$/, "")}%`;
}

export function formatDeliveryPricingSummary(location: Partial<LocationPricingFields>) {
  const pricing = pricingFromLocation(location);
  if (!pricing.deliveryAvailable) return "Delivery off";
  const fee = formatCurrency(pricing.deliveryFee);
  if (pricing.deliveryFreeMinimum > 0) {
    return `${fee} · Free over ${formatCurrency(pricing.deliveryFreeMinimum)}`;
  }
  return `${fee} flat rate`;
}

export function amountUntilFreeDelivery(subtotal: number, location?: Partial<LocationPricingFields> | null) {
  const pricing = pricingFromLocation(location);
  if (!pricing.deliveryAvailable || pricing.deliveryFreeMinimum <= 0) return null;
  const remaining = pricing.deliveryFreeMinimum - subtotal;
  if (remaining <= 0) return null;
  return remaining;
}

export type PublicFulfillmentLocation = {
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
  deliveryRadiusKm?: number;
  services?: string[];
};

/** Modes customers can choose on the live site (POS is staff-only). */
export function customerFulfillmentModes(location?: PublicFulfillmentLocation | null) {
  const modes: Array<"delivery" | "pickup"> = [];
  if (location?.deliveryAvailable) modes.push("delivery");
  if (location?.pickupAvailable) modes.push("pickup");
  return modes;
}

export function publicFulfillmentSummary(location?: PublicFulfillmentLocation | null) {
  const pickup = Boolean(location?.pickupAvailable);
  const delivery = Boolean(location?.deliveryAvailable);
  if (pickup && delivery) {
    const radius = location?.deliveryRadiusKm;
    return typeof radius === "number" && radius > 0
      ? `Pickup · Delivery ${radius} km`
      : "Pickup · Delivery";
  }
  if (pickup) return "Pickup available";
  if (delivery) {
    const radius = location?.deliveryRadiusKm;
    return typeof radius === "number" && radius > 0
      ? `Delivery ${radius} km`
      : "Delivery available";
  }
  return "In-store shopping only";
}

/** Drop pickup/delivery marketing when that mode is off for this store. */
export function publicStoreServices(
  services: string[] | undefined,
  deliveryAvailable: boolean | undefined,
  pickupAvailable: boolean | undefined = true,
) {
  const list = services ?? [];
  return list.filter((item) => {
    if (!deliveryAvailable && /deliver/i.test(item)) return false;
    if (!pickupAvailable && /\bpick[\s-]?up\b/i.test(item)) return false;
    return true;
  });
}
