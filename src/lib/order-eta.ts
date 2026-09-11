import { estimateDeliveryEta, haversineMiles, kmToMiles } from "@/lib/geo";
import type { DeliveryAddress, StoreLocation } from "@/types";

/** ETA label for cart/checkout when customer ZIP coords are known. */
export function deliveryEtaForStore(
  store: StoreLocation,
  customer?: { lat: number | null; lng: number | null; zip?: string } | null,
): string | null {
  if (!store.deliveryAvailable) return null;
  const eta = computeDeliveryEtaWindow(store, customer);
  return eta?.label ?? "30–45 min";
}

export function pickupEtaForStore(store: StoreLocation): string {
  const today = store.hours[0];
  if (!today) return "Ready during store hours";
  return `Ready for pickup · open ${today.open}–${today.close}`;
}

/** Midpoint minutes for tracking / APIs (estimate only — not live GPS). */
export function computeDeliveryEtaMinutes(
  store: StoreLocation,
  customer?: { lat?: number | null; lng?: number | null; zip?: string } | null,
): number | null {
  if (!store.deliveryAvailable) return null;
  const window = computeDeliveryEtaWindow(store, customer);
  if (!window) return null;
  return Math.round((window.min + window.max) / 2);
}

function computeDeliveryEtaWindow(
  store: StoreLocation,
  customer?: { lat?: number | null; lng?: number | null; zip?: string } | null,
) {
  if (customer?.lat != null && customer?.lng != null) {
    const miles = haversineMiles(
      { lat: customer.lat, lng: customer.lng },
      { lat: store.lat, lng: store.lng },
    );
    return estimateDeliveryEta(miles);
  }
  // No live geocode — use a mid-radius estimate from the store delivery zone.
  const radiusMi = kmToMiles(store.deliveryRadiusKm || 8);
  return estimateDeliveryEta(Math.max(1.5, radiusMi * 0.45));
}

export function deliveryAddressForEta(delivery?: DeliveryAddress | null) {
  if (!delivery) return null;
  return { lat: null as number | null, lng: null as number | null, zip: delivery.zip };
}
