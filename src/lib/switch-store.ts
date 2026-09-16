"use client";

import { useBranchStore } from "@/store/branch";
import { useCartStore } from "@/store/cart";
import { useCartFeedbackStore } from "@/store/cart-feedback";
import { getLocationById } from "@/data/locations";

/**
 * Switch shopping store and keep the cart fulfillable by one location.
 * Removes lines the new store cannot cover — one order = one store.
 */
export function switchShoppingStore(locationId: string) {
  const prev = useBranchStore.getState().branchId;
  if (prev === locationId) return { removed: 0 };

  useBranchStore.getState().setBranch(locationId);
  const { removed } = useCartStore.getState().reconcileToLocation(locationId);
  const store = getLocationById(locationId);

  if (removed > 0) {
    useCartFeedbackStore.getState().notifyWarning(
      removed === 1
        ? `Switched to ${store?.shortName ?? "this store"}. 1 item was removed because it isn’t stocked there.`
        : `Switched to ${store?.shortName ?? "this store"}. ${removed} items were removed because they aren’t stocked there.`,
    );
  }

  return { removed };
}
