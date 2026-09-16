"use client";

import { useEffect, useRef } from "react";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";

/** Syncs signed-in cart snapshots for abandoned-cart reminders. */
export function CartAbandonedSync() {
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const items = useCartStore((s) => s.items);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_cart",
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      }).catch(() => {
        /* non-blocking */
      });
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [isLoggedIn, items]);

  return null;
}
