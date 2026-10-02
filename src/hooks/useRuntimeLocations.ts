"use client";

import { useSyncExternalStore } from "react";
import { getAllLocations, getPublicLocations } from "@/data/locations";
import {
  getRuntimeCatalogRevision,
  subscribeRuntimeCatalog,
} from "@/lib/runtime-data";
import type { StoreLocation } from "@/types";

let locationsCacheRev = -1;
let locationsCache: StoreLocation[] = getAllLocations();

function locationsSnapshot(): StoreLocation[] {
  const rev = getRuntimeCatalogRevision();
  if (rev !== locationsCacheRev) {
    locationsCacheRev = rev;
    locationsCache = getAllLocations();
  }
  return locationsCache;
}

/** Live store list — updates when bootstrap loads or dashboard add/edit/remove runs. */
export function useRuntimeLocations() {
  return useSyncExternalStore(subscribeRuntimeCatalog, locationsSnapshot, locationsSnapshot);
}

let publicCacheRev = -1;
let publicCache: StoreLocation[] = getPublicLocations();

function publicLocationsSnapshot(): StoreLocation[] {
  const rev = getRuntimeCatalogRevision();
  if (rev !== publicCacheRev) {
    publicCacheRev = rev;
    publicCache = getPublicLocations();
  }
  return publicCache;
}

/** Active stores only — for the shop, map, checkout, and store finder. */
export function usePublicLocations() {
  return useSyncExternalStore(subscribeRuntimeCatalog, publicLocationsSnapshot, publicLocationsSnapshot);
}
