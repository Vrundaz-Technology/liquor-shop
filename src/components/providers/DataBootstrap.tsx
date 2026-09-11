"use client";

import { useEffect } from "react";
import { hydrateRuntimeData } from "@/lib/runtime-data";
import { useInventoryStore } from "@/store/inventory";
import { useUserStore } from "@/store/user";
import { useWishlistStore } from "@/store/wishlist";
import { useCartStore } from "@/store/cart";

function whenHydrated(
  persistApi: { hasHydrated: () => boolean; onFinishHydration: (cb: () => void) => () => void },
  fn: () => void,
) {
  if (persistApi.hasHydrated()) {
    fn();
    return () => {};
  }
  return persistApi.onFinishHydration(fn);
}

export function DataBootstrap() {
  const setHydrated = useInventoryStore((s) => s.setHydrated);
  const syncFromServer = useInventoryStore((s) => s.syncFromServer);
  const hydrateSession = useUserStore((s) => s.hydrateSession);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const res = await fetch("/api/bootstrap");
        if (!res.ok) throw new Error("bootstrap failed");
        const data = await res.json();
        if (cancelled) return;

        hydrateRuntimeData({
          products: data.products,
          locations: data.locations,
          categories: data.categories,
          events: data.events,
          reviews: data.reviews,
          dbConnected: data.dbConnected,
        });

        if (data.inventory?.stocks) {
          syncFromServer(
            data.inventory.stocks,
            data.inventory.seats,
            data.inventory.hidden,
            data.inventory.reserved,
          );
        } else {
          setHydrated(true);
        }
      } catch (error) {
        console.warn("[DataBootstrap] Using seed fallback:", error);
        if (!cancelled) setHydrated(true);
      }
    }

    const unsubInventory = whenHydrated(useInventoryStore.persist, () => {
      void loadCatalog();
    });
    const unsubWishlist = whenHydrated(useWishlistStore.persist, () => {
      const { isLoggedIn, profile } = useUserStore.getState();
      if (isLoggedIn) {
        useWishlistStore.getState().bindUser(profile.id);
      } else {
        useWishlistStore.getState().unbindUser();
      }
    });
    const unsubCart = whenHydrated(useCartStore.persist, () => {
      const { isLoggedIn, profile } = useUserStore.getState();
      if (isLoggedIn) {
        useCartStore.getState().bindUser(profile.id);
      } else {
        useCartStore.getState().unbindUser();
      }
    });
    void hydrateSession();

    return () => {
      cancelled = true;
      unsubInventory();
      unsubWishlist();
      unsubCart();
    };
  }, [setHydrated, syncFromServer, hydrateSession]);

  return null;
}
