"use client";

import { useEffect, useState } from "react";
import { getCatalogStock, seedEventSeats } from "@/lib/inventory";
import { useInventoryStore } from "@/store/inventory";

/** True after the first client paint — avoids SSR / persist rehydration mismatches. */
export function useClientMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Sellable count (on-hand − reserved); catalog seed until mounted for SSR. */
export function useLiveOnHand(locationId: string, productId: string) {
  const mounted = useClientMounted();
  const live = useInventoryStore((s) => s.getAvailable(locationId, productId));
  if (!mounted) return getCatalogStock(locationId, productId);
  return live;
}

/** Live seat count; uses seed until mounted so SSR matches hydration. */
export function useLiveSeats(eventId: string) {
  const mounted = useClientMounted();
  const live = useInventoryStore((s) => s.getSeats(eventId));
  if (!mounted) return seedEventSeats()[eventId] ?? 0;
  return live;
}
