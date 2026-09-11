"use client";

import { useCartStore } from "@/store/cart";
import { useCartFeedbackStore } from "@/store/cart-feedback";
import { getLocationById } from "@/data/locations";
import { useBranchStore } from "@/store/branch";

export function addToCart(productId: string, qty = 1) {
  const result = useCartStore.getState().addItem(productId, qty);
  if (result.ok) {
    useCartFeedbackStore.getState().notify(productId, result.added, result.quantity);
    return result;
  }

  const branch = useBranchStore.getState().branch();
  const lockId = useCartStore.getState().fulfillmentLocationId;
  const lockStore = lockId ? getLocationById(lockId) : null;

  if (result.reason === "wrong_store") {
    useCartFeedbackStore.getState().notifyWarning(
      lockStore
        ? `Your cart is locked to ${lockStore.shortName}. Switch stores from the cart (or clear it) before adding bottles from ${branch.shortName}.`
        : `This cart belongs to another store. Switch stores from your cart before adding more bottles.`,
    );
  } else if (result.reason === "out_of_stock") {
    useCartFeedbackStore.getState().notifyWarning(
      `Not enough stock at ${lockStore?.shortName ?? branch.shortName} for that bottle.`,
    );
  } else if (result.reason === "not_coverable") {
    useCartFeedbackStore.getState().notifyWarning(
      `That mix can’t be fulfilled by one store. Remove conflicting bottles or switch stores first.`,
    );
  }

  return result;
}
