"use client";

import { useSyncExternalStore } from "react";
import {
  isDbConnected,
  isRuntimeDataLoaded,
  subscribeRuntimeCatalog,
} from "@/lib/runtime-data";

function connectionSnapshot() {
  const loaded = isRuntimeDataLoaded();
  const connected = isDbConnected();
  return `${loaded ? "1" : "0"}:${connected ? "1" : "0"}`;
}

/**
 * Live server/db status from `/api/bootstrap`.
 * `loaded` is false until the first hydrate — do not treat that as offline.
 */
export function useServerConnection() {
  const snap = useSyncExternalStore(
    subscribeRuntimeCatalog,
    connectionSnapshot,
    connectionSnapshot,
  );
  const loaded = snap.startsWith("1");
  const connected = snap.endsWith("1");
  return {
    loaded,
    connected,
    ready: loaded && connected,
    offline: loaded && !connected,
  };
}
