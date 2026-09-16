/** Distance and delivery ETA helpers for store selection. */

const EARTH_RADIUS_MI = 3958.8;

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kmToMiles(km: number) {
  return km * 0.621371;
}

export function milesToKm(miles: number) {
  return miles / 0.621371;
}

/** Rough delivery window from road distance (minutes). */
export function estimateDeliveryEta(miles: number): { min: number; max: number; label: string } {
  const raw = 25 + miles * 4.5;
  const min = Math.max(20, Math.round(raw / 5) * 5);
  const max = min + 15;
  return { min, max, label: `${min}–${max} min` };
}

export function formatMiles(miles: number) {
  if (miles < 0.1) return "0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}
