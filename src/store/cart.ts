"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types";
import { useBranchStore } from "@/store/branch";
import { useInventoryStore } from "@/store/inventory";
import { useCartFeedbackStore } from "@/store/cart-feedback";
import { getAvailableStock, locationCoversCart } from "@/lib/cart-availability";

export type AddItemResult = {
  ok: boolean;
  added: number;
  quantity: number;
  reason?: "out_of_stock" | "wrong_store" | "not_coverable";
};

type CartSnapshot = {
  items: CartItem[];
  savedForLater: string[];
  coupon: string | null;
  loyaltyPointsRedeem: number;
  fulfillment: "delivery" | "pickup";
  /** Store that must fulfill this cart (one order = one store). */
  fulfillmentLocationId: string | null;
};

type CartState = CartSnapshot & {
  /** Active account for the current session. Null when logged out. */
  ownerId: string | null;
  /** Saved carts keyed by user id. */
  accounts: Record<string, CartSnapshot>;
  /** Guest cart while signed out (cleared when a session ends). */
  guest: CartSnapshot;
  addItem: (productId: string, qty?: number) => AddItemResult;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  saveForLater: (productId: string) => void;
  moveToCart: (productId: string) => AddItemResult;
  applyCoupon: (code: string | null) => boolean;
  setLoyaltyPointsRedeem: (points: number) => void;
  setFulfillment: (f: "delivery" | "pickup") => void;
  clear: () => void;
  /** Drop lines the location cannot fulfill; lock cart to that store. */
  reconcileToLocation: (locationId: string) => { removed: number };
  reorderItems: (lines: { productId: string; quantity: number }[]) => {
    added: number;
    skipped: number;
  };
  itemCount: () => number;
  bindUser: (userId: string) => void;
  unbindUser: () => void;
};

export { getCouponDiscount, isValidCoupon } from "@/lib/commerce";

const emptySnapshot = (): CartSnapshot => ({
  items: [],
  savedForLater: [],
  coupon: null,
  loyaltyPointsRedeem: 0,
  fulfillment: "delivery",
  fulfillmentLocationId: null,
});

function snapshotFrom(state: CartSnapshot): CartSnapshot {
  return {
    items: state.items.map((item) => ({ ...item })),
    savedForLater: [...state.savedForLater],
    coupon: state.coupon,
    loyaltyPointsRedeem: state.loyaltyPointsRedeem ?? 0,
    fulfillment: state.fulfillment,
    fulfillmentLocationId: state.fulfillmentLocationId ?? null,
  };
}

function applySnapshot(snapshot: CartSnapshot | undefined): CartSnapshot {
  if (!snapshot) return emptySnapshot();
  return {
    items: Array.isArray(snapshot.items) ? snapshot.items.map((item) => ({ ...item })) : [],
    savedForLater: Array.isArray(snapshot.savedForLater) ? [...snapshot.savedForLater] : [],
    coupon: snapshot.coupon ?? null,
    loyaltyPointsRedeem: Math.max(0, Math.trunc(snapshot.loyaltyPointsRedeem ?? 0)),
    fulfillment: snapshot.fulfillment === "pickup" ? "pickup" : "delivery",
    fulfillmentLocationId: snapshot.fulfillmentLocationId ?? null,
  };
}

function persistActive(state: CartState, patch: Partial<CartSnapshot>): Partial<CartState> {
  const next: CartSnapshot = {
    items: patch.items ?? state.items,
    savedForLater: patch.savedForLater ?? state.savedForLater,
    coupon: patch.coupon !== undefined ? patch.coupon : state.coupon,
    loyaltyPointsRedeem:
      patch.loyaltyPointsRedeem !== undefined
        ? patch.loyaltyPointsRedeem
        : state.loyaltyPointsRedeem,
    fulfillment: patch.fulfillment ?? state.fulfillment,
    fulfillmentLocationId:
      patch.fulfillmentLocationId !== undefined
        ? patch.fulfillmentLocationId
        : state.fulfillmentLocationId,
  };
  if (next.items.length === 0) {
    next.fulfillmentLocationId = null;
  }
  if (state.ownerId) {
    return {
      ...next,
      accounts: {
        ...state.accounts,
        [state.ownerId]: snapshotFrom(next),
      },
    };
  }
  return {
    ...next,
    guest: snapshotFrom(next),
  };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      ...emptySnapshot(),
      accounts: {},
      guest: emptySnapshot(),
      addItem: (productId, qty = 1) => {
        const branchId = useBranchStore.getState().branchId;
        const state = get();
        const lockId = state.fulfillmentLocationId ?? branchId;

        // Cart already locked to another store — refuse mix that can't share one order.
        if (
          state.fulfillmentLocationId &&
          state.fulfillmentLocationId !== branchId &&
          state.items.length > 0
        ) {
          return { ok: false, added: 0, quantity: 0, reason: "wrong_store" };
        }

        void useInventoryStore.getState().revision;
        const onHand = getAvailableStock(lockId, productId);
        const existing = state.items.find((i) => i.productId === productId);
        const current = existing?.quantity ?? 0;
        const nextQty = Math.min(current + Math.max(0, qty), onHand);
        const added = nextQty - current;
        if (nextQty <= 0 || added <= 0) {
          return { ok: false, added: 0, quantity: current, reason: "out_of_stock" };
        }

        const projected = existing
          ? state.items.map((i) =>
              i.productId === productId ? { ...i, quantity: nextQty } : i,
            )
          : [
              ...state.items,
              { productId, quantity: nextQty, fulfillment: state.fulfillment },
            ];

        if (!locationCoversCart(projected, lockId)) {
          return { ok: false, added: 0, quantity: current, reason: "not_coverable" };
        }

        set((s) =>
          persistActive(s, {
            items: projected,
            fulfillmentLocationId: lockId,
            savedForLater: s.savedForLater.filter((id) => id !== productId),
          }),
        );
        return { ok: true, added, quantity: nextQty };
      },
      removeItem: (productId) =>
        set((s) =>
          persistActive(s, {
            items: s.items.filter((i) => i.productId !== productId),
          }),
        ),
      setQuantity: (productId, quantity) =>
        set((s) => {
          const lockId =
            s.fulfillmentLocationId ?? useBranchStore.getState().branchId;
          const onHand = getAvailableStock(lockId, productId);
          const nextQty = Math.min(Math.max(0, quantity), onHand);
          return persistActive(s, {
            items:
              nextQty <= 0
                ? s.items.filter((i) => i.productId !== productId)
                : s.items.map((i) =>
                    i.productId === productId ? { ...i, quantity: nextQty } : i,
                  ),
            fulfillmentLocationId: lockId,
          });
        }),
      saveForLater: (productId) =>
        set((s) =>
          persistActive(s, {
            items: s.items.filter((i) => i.productId !== productId),
            savedForLater: s.savedForLater.includes(productId)
              ? s.savedForLater
              : [...s.savedForLater, productId],
          }),
        ),
      moveToCart: (productId) => {
        const result = get().addItem(productId, 1);
        set((s) =>
          persistActive(s, {
            savedForLater: s.savedForLater.filter((id) => id !== productId),
          }),
        );
        return result;
      },
      applyCoupon: (code) => {
        const trimmed = code?.trim() || null;
        if (!trimmed) {
          set((s) => persistActive(s, { coupon: null }));
          return true;
        }
        set((s) => persistActive(s, { coupon: trimmed.toUpperCase() }));
        return true;
      },
      setLoyaltyPointsRedeem: (points) =>
        set((s) =>
          persistActive(s, {
            loyaltyPointsRedeem: Math.max(0, Math.trunc(points) || 0),
          }),
        ),
      setFulfillment: (fulfillment) =>
        set((s) =>
          persistActive(s, {
            fulfillment,
            items: s.items.map((i) => ({ ...i, fulfillment })),
          }),
        ),
      clear: () =>
        set((s) =>
          persistActive(s, {
            items: [],
            coupon: null,
            loyaltyPointsRedeem: 0,
            fulfillmentLocationId: null,
          }),
        ),
      reconcileToLocation: (locationId) => {
        const state = get();
        if (!state.items.length) {
          set((s) => persistActive(s, { fulfillmentLocationId: null }));
          return { removed: 0 };
        }
        const kept = state.items.filter(
          (item) => getAvailableStock(locationId, item.productId) >= item.quantity,
        );
        const removed = state.items.length - kept.length;
        set((s) =>
          persistActive(s, {
            items: kept.map((i) => ({
              ...i,
              quantity: Math.min(i.quantity, getAvailableStock(locationId, i.productId)),
            })),
            fulfillmentLocationId: kept.length ? locationId : null,
          }),
        );
        return { removed };
      },
      reorderItems: (lines) => {
        let added = 0;
        let skipped = 0;
        for (const line of lines) {
          const result = get().addItem(line.productId, line.quantity);
          if (result.added > 0) added += 1;
          else skipped += 1;
        }
        return { added, skipped };
      },
      itemCount: () => get().items.reduce((n, i) => n + i.quantity, 0),
      bindUser: (userId) => {
        const id = userId.trim();
        if (!id) return;
        set((s) => {
          const accounts =
            s.ownerId && s.ownerId !== id
              ? { ...s.accounts, [s.ownerId]: snapshotFrom(s) }
              : s.accounts;
          const loaded = applySnapshot(
            accounts[id] ?? (s.ownerId === id ? snapshotFrom(s) : undefined),
          );
          return {
            ownerId: id,
            accounts: {
              ...accounts,
              [id]: loaded,
            },
            guest: emptySnapshot(),
            ...loaded,
          };
        });
      },
      unbindUser: () => {
        set((s) => {
          if (!s.ownerId) {
            const guest = applySnapshot(
              s.items.length > 0 || s.savedForLater.length > 0 || s.coupon
                ? snapshotFrom(s)
                : s.guest,
            );
            return {
              ownerId: null,
              guest,
              ...guest,
            };
          }
          return {
            ownerId: null,
            accounts: {
              ...s.accounts,
              [s.ownerId]: snapshotFrom(s),
            },
            guest: emptySnapshot(),
            ...emptySnapshot(),
          };
        });
        useCartFeedbackStore.getState().dismiss();
        useCartFeedbackStore.getState().dismissWarning();
        useCartFeedbackStore.getState().dismissInfo();
      },
    }),
    {
      name: "sams-cart",
      version: 4,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as {
          accounts?: Record<string, CartSnapshot>;
          guest?: CartSnapshot;
        };
        const accounts: Record<string, CartSnapshot> = {};
        for (const [id, snap] of Object.entries(state.accounts ?? {})) {
          accounts[id] = applySnapshot(snap);
        }
        return {
          ownerId: null,
          ...emptySnapshot(),
          accounts,
          guest: emptySnapshot(),
        };
      },
      partialize: (state) => ({
        accounts: state.accounts,
        guest: state.ownerId ? state.guest : snapshotFrom(state),
      }),
    },
  ),
);

