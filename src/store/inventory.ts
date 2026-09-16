"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, InventoryLedgerEntry, InventoryLedgerReason } from "@/types";
import {
  getCatalogStock,
  mergeSeedStocks,
  seedBottleStocks,
  seedEventSeats,
  stockKey,
} from "@/lib/inventory";
import { availableStock } from "@/lib/commerce/order-status";
import { getCustomProducts } from "@/data/custom-products";
import { getAllLocations } from "@/data/locations";
import { isDbConnected } from "@/lib/runtime-data";
import {
  apiAdjustInventory,
  apiBookSeats,
  apiResetInventory,
  apiSetInventory,
  apiSetProductVisibility,
} from "@/lib/api-mutations";

type DeductResult =
  | { ok: true }
  | {
      ok: false;
      shortfalls: { productId: string; requested: number; onHand: number }[];
    };

type InventoryState = {
  stocks: Record<string, number>;
  /** Online order holds — sellable qty is onHand − reserved. */
  reserved: Record<string, number>;
  seats: Record<string, number>;
  /** Keys are locationId:productId — true means hidden on that store's website. */
  hidden: Record<string, boolean>;
  ledger: InventoryLedgerEntry[];
  revision: number;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  getOnHand: (locationId: string, productId: string) => number;
  getReserved: (locationId: string, productId: string) => number;
  /** Sellable bottles (on-hand minus online holds). */
  getAvailable: (locationId: string, productId: string) => number;
  getSeats: (eventId: string) => number;
  isHidden: (locationId: string, productId: string) => boolean;
  setHidden: (locationId: string, productId: string, hidden: boolean) => void;
  setOnHand: (
    locationId: string,
    productId: string,
    quantity: number,
    reason?: InventoryLedgerReason,
  ) => void;
  adjust: (
    locationId: string,
    productId: string,
    delta: number,
    reason?: InventoryLedgerReason,
    orderId?: string,
  ) => boolean;
  deductOrder: (
    locationId: string,
    items: Pick<CartItem, "productId" | "quantity">[],
    orderId: string,
  ) => DeductResult;
  restockOrder: (
    locationId: string,
    items: Pick<CartItem, "productId" | "quantity">[],
    orderId: string,
  ) => void;
  bookSeats: (eventId: string, qty: number) => Promise<boolean>;
  resetToCatalog: (locationId?: string) => void;
  syncFromServer: (
    stocks: Record<string, number>,
    seats: Record<string, number>,
    hidden?: Record<string, boolean>,
    reserved?: Record<string, number>,
  ) => void;
};

function nextLedgerId() {
  return `led-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function writeLedger(
  ledger: InventoryLedgerEntry[],
  entry: Omit<InventoryLedgerEntry, "id" | "createdAt">,
): InventoryLedgerEntry[] {
  const next: InventoryLedgerEntry = {
    ...entry,
    id: nextLedgerId(),
    createdAt: new Date().toISOString(),
  };
  return [next, ...ledger].slice(0, 200);
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      stocks: seedBottleStocks(),
      reserved: {},
      seats: seedEventSeats(),
      hidden: {},
      ledger: [],
      revision: 0,
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      getOnHand: (locationId, productId) => {
        const key = stockKey(locationId, productId);
        const live = get().stocks[key];
        if (typeof live === "number") return Math.max(0, live);
        return getCatalogStock(locationId, productId);
      },
      getReserved: (locationId, productId) => {
        const live = get().reserved[stockKey(locationId, productId)];
        return typeof live === "number" ? Math.max(0, live) : 0;
      },
      getAvailable: (locationId, productId) => {
        if (get().isHidden(locationId, productId)) return 0;
        return availableStock(
          get().getOnHand(locationId, productId),
          get().getReserved(locationId, productId),
        );
      },
      getSeats: (eventId) => {
        const live = get().seats[eventId];
        if (typeof live === "number") return Math.max(0, live);
        return seedEventSeats()[eventId] ?? 0;
      },
      isHidden: (locationId, productId) => {
        return Boolean(get().hidden[stockKey(locationId, productId)]);
      },
      setHidden: (locationId, productId, hidden) => {
        const key = stockKey(locationId, productId);
        set((s) => ({
          hidden: { ...s.hidden, [key]: hidden },
          revision: s.revision + 1,
        }));
        if (isDbConnected()) {
          void apiSetProductVisibility(locationId, productId, hidden)
            .then((res) => {
              if (res.inventory) {
                get().syncFromServer(
                  res.inventory.stocks,
                  res.inventory.seats,
                  res.inventory.hidden,
                  res.inventory.reserved,
                );
              }
            })
            .catch(console.error);
        }
      },
      setOnHand: (locationId, productId, quantity, reason = "adjustment") => {
        const nextQty = Math.max(0, Math.floor(quantity));
        const current = get().getOnHand(locationId, productId);
        const delta = nextQty - current;
        if (delta === 0) return;
        const key = stockKey(locationId, productId);
        set((s) => ({
          stocks: { ...s.stocks, [key]: nextQty },
          revision: s.revision + 1,
          ledger: writeLedger(s.ledger, {
            locationId,
            productId,
            delta,
            onHandAfter: nextQty,
            reason,
          }),
        }));
        if (isDbConnected()) {
          void apiSetInventory(locationId, productId, nextQty, reason).catch(console.error);
        }
      },
      adjust: (locationId, productId, delta, reason = "adjustment", orderId) => {
        if (!delta) return true;
        const current = get().getOnHand(locationId, productId);
        const nextQty = current + delta;
        if (nextQty < 0) return false;
        const key = stockKey(locationId, productId);
        set((s) => ({
          stocks: { ...s.stocks, [key]: nextQty },
          revision: s.revision + 1,
          ledger: writeLedger(s.ledger, {
            locationId,
            productId,
            delta,
            onHandAfter: nextQty,
            reason,
            orderId,
          }),
        }));
        if (isDbConnected()) {
          void apiAdjustInventory(locationId, productId, delta, reason, orderId).catch(
            console.error,
          );
        }
        return true;
      },
      deductOrder: (locationId, items, orderId) => {
        const shortfalls: { productId: string; requested: number; onHand: number }[] =
          [];
        for (const item of items) {
          const avail = get().getAvailable(locationId, item.productId);
          if (avail < item.quantity) {
            shortfalls.push({
              productId: item.productId,
              requested: item.quantity,
              onHand: avail,
            });
          }
        }
        if (shortfalls.length) return { ok: false, shortfalls };

        set((s) => {
          const stocks = { ...s.stocks };
          let ledger = s.ledger;
          for (const item of items) {
            const key = stockKey(locationId, item.productId);
            const current =
              typeof stocks[key] === "number"
                ? stocks[key]
                : getCatalogStock(locationId, item.productId);
            const nextQty = Math.max(0, current - item.quantity);
            stocks[key] = nextQty;
            ledger = writeLedger(ledger, {
              locationId,
              productId: item.productId,
              delta: -item.quantity,
              onHandAfter: nextQty,
              reason: "sale",
              orderId,
            });
          }
          return { stocks, ledger, revision: s.revision + 1 };
        });
        return { ok: true };
      },
      restockOrder: (locationId, items, orderId) => {
        set((s) => {
          const stocks = { ...s.stocks };
          let ledger = s.ledger;
          for (const item of items) {
            const key = stockKey(locationId, item.productId);
            const current =
              typeof stocks[key] === "number"
                ? stocks[key]
                : getCatalogStock(locationId, item.productId);
            const nextQty = current + item.quantity;
            stocks[key] = nextQty;
            ledger = writeLedger(ledger, {
              locationId,
              productId: item.productId,
              delta: item.quantity,
              onHandAfter: nextQty,
              reason: "cancel",
              orderId,
            });
          }
          return { stocks, ledger, revision: s.revision + 1 };
        });
        if (isDbConnected()) {
          for (const item of items) {
            void apiAdjustInventory(
              locationId,
              item.productId,
              item.quantity,
              "cancel",
              orderId,
            ).catch(console.error);
          }
        }
      },
      bookSeats: async (eventId, qty) => {
        const available = get().getSeats(eventId);
        if (qty <= 0 || qty > available) return false;
        set((s) => ({
          seats: { ...s.seats, [eventId]: available - qty },
          revision: s.revision + 1,
        }));
        if (!isDbConnected()) return true;
        try {
          const res = await apiBookSeats(eventId, qty);
          if (res.inventory) {
            get().syncFromServer(
              res.inventory.stocks,
              res.inventory.seats,
              res.inventory.hidden,
              res.inventory.reserved,
            );
          }
          return true;
        } catch (error) {
          set((s) => ({
            seats: { ...s.seats, [eventId]: (s.seats[eventId] ?? 0) + qty },
            revision: s.revision + 1,
          }));
          console.error(error);
          return false;
        }
      },
      resetToCatalog: (locationId) => {
        const seed = seedBottleStocks();
        set((s) => {
          const preserveCustoms = (stocks: Record<string, number>) => {
            const next = { ...stocks };
            for (const product of getCustomProducts()) {
              for (const loc of getAllLocations()) {
                if (locationId && loc.id !== locationId) continue;
                const key = stockKey(loc.id, product.id);
                if (typeof s.stocks[key] === "number") next[key] = s.stocks[key];
              }
            }
            return next;
          };

          if (!locationId) {
            return {
              stocks: preserveCustoms(seed),
              seats: seedEventSeats(),
              revision: s.revision + 1,
              ledger: writeLedger(s.ledger, {
                locationId: "all",
                productId: "*",
                delta: 0,
                onHandAfter: 0,
                reason: "reset",
              }),
            };
          }
          const stocks = { ...s.stocks };
          const prefix = `${locationId}:`;
          for (const [key, value] of Object.entries(seed)) {
            if (key.startsWith(prefix)) stocks[key] = value;
          }
          return {
            stocks: preserveCustoms(stocks),
            revision: s.revision + 1,
            ledger: writeLedger(s.ledger, {
              locationId,
              productId: "*",
              delta: 0,
              onHandAfter: 0,
              reason: "reset",
            }),
          };
        });
        if (isDbConnected()) {
          void apiResetInventory(locationId)
            .then((res) => {
              get().syncFromServer(
                res.inventory.stocks,
                res.inventory.seats,
                res.inventory.hidden,
                res.inventory.reserved,
              );
            })
            .catch(console.error);
        }
      },
      syncFromServer: (stocks, seats, hidden, reserved) => {
        set({
          stocks: { ...seedBottleStocks(), ...stocks },
          seats: { ...seedEventSeats(), ...seats },
          hidden: hidden !== undefined ? hidden : get().hidden,
          reserved: reserved !== undefined ? reserved : get().reserved,
          revision: get().revision + 1,
          hydrated: true,
        });
      },
    }),
    {
      name: "sams-inventory-v4",
      partialize: (s) => ({
        stocks: s.stocks,
        reserved: s.reserved,
        seats: s.seats,
        hidden: s.hidden,
        ledger: s.ledger,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<InventoryState> | undefined;
        return {
          ...current,
          ...saved,
          stocks: mergeSeedStocks(saved?.stocks, seedBottleStocks()),
          reserved: saved?.reserved ?? current.reserved,
          seats: mergeSeedStocks(saved?.seats, seedEventSeats()),
          hidden: saved?.hidden ?? current.hidden,
          ledger: saved?.ledger ?? current.ledger,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

/** Sellable bottles at a branch (on-hand minus online holds). */
export function getLiveStock(locationId: string, productId: string) {
  return useInventoryStore.getState().getAvailable(locationId, productId);
}
