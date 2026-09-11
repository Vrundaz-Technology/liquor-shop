"use client";

import { useEffect, useState } from "react";

export type CardsTableView = "cards" | "table";

function readStoredView(key: string, fallback: CardsTableView): CardsTableView {
  try {
    const saved = window.localStorage.getItem(key);
    if (saved === "cards" || saved === "table") return saved;
  } catch {
    /* ignore quota / private mode */
  }
  return fallback;
}

/**
 * Persist Cards | Table preference across section navigation and reloads.
 * Hydrates from localStorage after mount to avoid SSR mismatch.
 */
export function usePersistedViewMode(
  storageKey: string,
  fallback: CardsTableView = "cards",
): [CardsTableView, (next: CardsTableView) => void] {
  const [view, setView] = useState<CardsTableView>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setView(readStoredView(storageKey, fallback));
    setReady(true);
  }, [storageKey, fallback]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storageKey, view);
    } catch {
      /* ignore */
    }
  }, [storageKey, view, ready]);

  return [view, setView];
}
