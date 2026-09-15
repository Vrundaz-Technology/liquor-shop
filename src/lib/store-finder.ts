import { getAllLocations } from "@/data/locations";
import {
  estimateDeliveryEta,
  formatMiles,
  haversineMiles,
  kmToMiles,
} from "@/lib/geo";
import type { StoreLocation } from "@/types";

export type GeoPoint = { lat: number; lng: number; label?: string };

export type NearbyStore = {
  store: StoreLocation;
  miles: number;
  milesLabel: string;
  withinDeliveryRadius: boolean;
  deliveryEta: { min: number; max: number; label: string } | null;
  /** Pickup always available when store allows it */
  canPickup: boolean;
  canDeliver: boolean;
};

export async function geocodeUsZip(zip: string): Promise<GeoPoint | null> {
  const clean = zip.trim().replace(/\s+/g, "").slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return null;

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`, {
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{
        latitude: string;
        longitude: string;
        "place name"?: string;
        "state abbreviation"?: string;
      }>;
    };
    const place = data.places?.[0];
    if (!place) return null;
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const city = place["place name"];
    const state = place["state abbreviation"];
    return {
      lat,
      lng,
      label: city && state ? `${city}, ${state} ${clean}` : clean,
    };
  } catch {
    return null;
  }
}

/** Match stores by ZIP prefix / exact ZIP when geocoding fails. */
export function storesMatchingZipFallback(
  zip: string,
  stores: StoreLocation[] = getAllLocations(),
): NearbyStore[] {
  const clean = zip.trim().replace(/\s+/g, "").slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return [];
  const prefix = clean.slice(0, 3);
  return stores
    .map((store) => {
      const exact = store.zip === clean;
      const near = store.zip.startsWith(prefix);
      if (!exact && !near) return null;
      const canPickup = Boolean(store.pickupAvailable);
      const miles = exact ? 0.8 : 3.5;
      const eta = store.deliveryAvailable ? estimateDeliveryEta(miles) : null;
      const canDeliver = Boolean(store.deliveryAvailable && eta);
      if (!canPickup && !canDeliver) return null;
      return {
        store,
        miles,
        milesLabel: formatMiles(miles),
        withinDeliveryRadius: Boolean(store.deliveryAvailable),
        deliveryEta: eta,
        canPickup,
        canDeliver,
      } satisfies NearbyStore;
    })
    .filter(Boolean)
    .sort((a, b) => a!.miles - b!.miles) as NearbyStore[];
}

export function findNearbyStores(
  point: GeoPoint,
  opts?: { maxMiles?: number; requireDelivery?: boolean; stores?: StoreLocation[] },
): NearbyStore[] {
  const maxMiles = opts?.maxMiles ?? 40;
  const catalog = opts?.stores ?? getAllLocations();
  const rows: NearbyStore[] = catalog.map((store) => {
    const miles = haversineMiles(point, { lat: store.lat, lng: store.lng });
    const radiusMi = kmToMiles(store.deliveryRadiusKm || 0);
    const withinDeliveryRadius =
      Boolean(store.deliveryAvailable) && radiusMi > 0 && miles <= radiusMi + 0.05;
    const deliveryEta = withinDeliveryRadius ? estimateDeliveryEta(miles) : null;
    return {
      store,
      miles,
      milesLabel: formatMiles(miles),
      withinDeliveryRadius,
      deliveryEta,
      canPickup: Boolean(store.pickupAvailable),
      canDeliver: Boolean(withinDeliveryRadius && deliveryEta),
    };
  });

  return rows
    .filter((row) => {
      if (row.miles > maxMiles) return false;
      if (opts?.requireDelivery) return row.canDeliver;
      return row.canDeliver || row.canPickup;
    })
    .sort((a, b) => {
      if (a.canDeliver !== b.canDeliver) return a.canDeliver ? -1 : 1;
      return a.miles - b.miles;
    });
}

export async function findStoresForZip(
  zip: string,
  stores?: StoreLocation[],
): Promise<{
  point: GeoPoint | null;
  stores: NearbyStore[];
  source: "geo" | "zip-fallback";
}> {
  const catalog = stores ?? getAllLocations();
  const point = await geocodeUsZip(zip);
  if (point) {
    return { point, stores: findNearbyStores(point, { stores: catalog }), source: "geo" };
  }
  return {
    point: null,
    stores: storesMatchingZipFallback(zip, catalog),
    source: "zip-fallback",
  };
}
