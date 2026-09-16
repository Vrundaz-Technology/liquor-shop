"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BottlePatch, NewBottleInput, Product } from "@/types";
import { products as catalogProducts, isCatalogProduct, getAllProducts } from "@/data/products";
import { setCustomProducts } from "@/data/custom-products";
import { getAllLocations } from "@/data/locations";
import { useInventoryStore } from "@/store/inventory";
import { isDbConnected } from "@/lib/runtime-data";
import { upsertRuntimeProduct } from "@/lib/runtime-data";
import { apiCreateProduct, apiPatchProduct, apiDeleteProduct } from "@/lib/api-mutations";

export type { NewBottleInput } from "@/types";

type CatalogState = {
  custom: Product[];
  revision: number;
  addBottle: (input: NewBottleInput) => Promise<Product | { error: string }>;
  updateBottle: (productId: string, input: BottlePatch) => Promise<Product | { error: string }>;
  removeBottle: (productId: string) => Promise<boolean>;
  bumpRevision: () => void;
  allProducts: () => Product[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function uniqueId(slug: string) {
  return `custom-${slug}-${Date.now().toString(36)}`;
}

function uniqueSlug(base: string, existing: Product[]) {
  let slug = base || `bottle-${Date.now().toString(36)}`;
  let n = 2;
  const taken = new Set(existing.map((p) => p.slug));
  while (taken.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

function splitCsv(value: string | undefined, fallback: string[]) {
  if (value == null) return fallback;
  const next = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  return next.length ? next : fallback;
}

function composeImages(cover: string | undefined, extras: string[] | undefined, fallback: string[]) {
  const unique: string[] = [];
  for (const url of [cover ?? "", ...(extras ?? [])]) {
    const next = url.trim();
    if (next && !unique.includes(next)) unique.push(next);
  }
  return unique.length ? unique.slice(0, 8) : fallback;
}

function buildProduct(input: NewBottleInput, all: Product[]): Product {
  const baseSlug = slugify(`${input.brand} ${input.name}`) || "new-bottle";
  const slug = uniqueSlug(baseSlug, all);
  const notes = splitCsv(input.tastingNotes, ["To taste"]);
  const pairings = splitCsv(input.foodPairings, []);
  const images = composeImages(
    input.imageUrl,
    input.images,
    [catalogProducts[0]?.images[0] || "/products/market/buffalo-trace-bourbon.jpg"],
  );

  return {
    id: uniqueId(slug),
    slug,
    name: input.name.trim(),
    brand: input.brand.trim(),
    category: input.category,
    description: input.description.trim() || `${input.name} from ${input.brand}.`,
    brandStory:
      input.brandStory?.trim() || `${input.brand} — added to Sam's Discount Liquor collection.`,
    origin: input.origin.trim() || "Unknown",
    country: input.country.trim() || "USA",
    abv: input.abv,
    volumeMl: input.volumeMl,
    price: input.price,
    compareAtPrice: input.compareAtPrice && input.compareAtPrice > 0 ? input.compareAtPrice : undefined,
    rating: 0,
    reviewCount: 0,
    tastingNotes: notes,
    foodPairings: pairings,
    cocktails: [],
    images,
    color: "#2a1a12",
    accentColor: "#c9a962",
    labelColor: "#f3ead7",
    bottleHeight: 1,
    isPremium: input.isPremium,
    isImported: input.isImported,
    tags: ["owner-added"],
  };
}

function syncRegistry(list: Product[]) {
  setCustomProducts(list);
}

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      custom: [],
      revision: 0,
      allProducts: () => getAllProducts(),
      bumpRevision: () => set({ revision: get().revision + 1 }),
      addBottle: async (input) => {
        const name = input.name.trim();
        const brand = input.brand.trim();
        if (!name || !brand) return { error: "Name and brand are required." };
        if (!(input.price > 0)) return { error: "Price must be greater than 0." };
        if (!(input.abv > 0) || input.abv > 80) {
          return { error: "ABV must be between 0 and 80." };
        }
        if (!(input.volumeMl > 0)) return { error: "Volume must be greater than 0." };
        if (input.initialStock < 0) return { error: "Stock cannot be negative." };

        if (isDbConnected()) {
          try {
            const { product: saved, inventory } = await apiCreateProduct(input);
            const next = [saved, ...get().custom.filter((p) => p.id !== saved.id)];
            syncRegistry(next);
            set({ custom: next, revision: get().revision + 1 });
            upsertRuntimeProduct(saved);
            if (inventory) {
              useInventoryStore.getState().syncFromServer(
                inventory.stocks,
                inventory.seats,
                inventory.hidden,
                inventory.reserved,
              );
            }
            return saved;
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : "Could not save bottle to the database.",
            };
          }
        }

        const product = buildProduct(input, get().allProducts());
        const next = [product, ...get().custom];
        syncRegistry(next);
        set({ custom: next, revision: get().revision + 1 });
        upsertRuntimeProduct(product);

        const qty = Math.floor(input.initialStock);
        const inv = useInventoryStore.getState();
        const targets =
          input.stockLocationIds && input.stockLocationIds.length > 0
            ? getAllLocations().filter((l) => input.stockLocationIds!.includes(l.id))
            : getAllLocations();
        for (const loc of targets) {
          inv.setOnHand(loc.id, product.id, qty, "restock");
        }
        if (input.stockLocationIds && input.stockLocationIds.length > 0) {
          for (const loc of getAllLocations()) {
            if (!input.stockLocationIds.includes(loc.id)) {
              inv.setOnHand(loc.id, product.id, 0, "restock");
            }
          }
        }

        return product;
      },
      updateBottle: async (productId, input) => {
        const name = input.name?.trim();
        const brand = input.brand?.trim();
        if (name !== undefined && !name) return { error: "Name is required." };
        if (brand !== undefined && !brand) return { error: "Brand is required." };
        if (input.price != null && !(input.price > 0)) return { error: "Price must be greater than 0." };
        if (input.abv != null && (!(input.abv > 0) || input.abv > 80)) {
          return { error: "ABV must be between 0 and 80." };
        }
        if (input.volumeMl != null && !(input.volumeMl > 0)) {
          return { error: "Volume must be greater than 0." };
        }

        if (isDbConnected()) {
          try {
            const { product: saved } = await apiPatchProduct(productId, input);
            const next = get().custom.map((p) => (p.id === saved.id ? saved : p));
            syncRegistry(next);
            set({ custom: next, revision: get().revision + 1 });
            upsertRuntimeProduct(saved);
            return saved;
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : "Could not update that bottle.",
            };
          }
        }

        const current = get().allProducts().find((p) => p.id === productId);
        if (!current) return { error: "Bottle not found." };
        const updated: Product = {
          ...current,
          name: name ?? current.name,
          brand: brand ?? current.brand,
          category: input.category ?? current.category,
          description: input.description?.trim() || current.description,
          brandStory: input.brandStory?.trim() || current.brandStory,
          origin: input.origin?.trim() || current.origin,
          country: input.country?.trim() || current.country,
          abv: input.abv ?? current.abv,
          volumeMl: input.volumeMl ?? current.volumeMl,
          price: input.price ?? current.price,
          compareAtPrice:
            input.compareAtPrice === undefined
              ? current.compareAtPrice
              : input.compareAtPrice && input.compareAtPrice > 0
                ? input.compareAtPrice
                : undefined,
          tastingNotes: splitCsv(input.tastingNotes, current.tastingNotes),
          foodPairings: splitCsv(input.foodPairings, current.foodPairings),
          images: composeImages(input.imageUrl, input.images, current.images),
          isPremium: input.isPremium ?? current.isPremium,
          isImported: input.isImported ?? current.isImported,
        };
        upsertRuntimeProduct(updated);
        const custom = get().custom;
        const idx = custom.findIndex((p) => p.id === productId);
        const next = idx >= 0 ? custom.map((p) => (p.id === productId ? updated : p)) : [updated, ...custom];
        syncRegistry(next);
        set({ custom: next, revision: get().revision + 1 });
        return updated;
      },
      removeBottle: async (productId) => {
        if (isCatalogProduct(productId)) return false;
        if (isDbConnected()) {
          try {
            const result = await apiDeleteProduct(productId);
            const next = get().custom.filter((p) => p.id !== productId);
            syncRegistry(next);
            set({ custom: next, revision: get().revision + 1 });
            if (result.inventory) {
              useInventoryStore.getState().syncFromServer(
                result.inventory.stocks,
                result.inventory.seats,
                result.inventory.hidden,
                result.inventory.reserved,
              );
            }
            return true;
          } catch (error) {
            console.error(error);
            return false;
          }
        }
        const next = get().custom.filter((p) => p.id !== productId);
        if (next.length === get().custom.length) return false;
        syncRegistry(next);
        set({ custom: next, revision: get().revision + 1 });
        return true;
      },
    }),
    {
      name: "sams-catalog-v1",
      partialize: (s) => ({ custom: s.custom }),
      onRehydrateStorage: () => (state) => {
        if (state) syncRegistry(state.custom);
      },
    },
  ),
);

// Sync immediately if store already has data (HMR / same-session)
if (typeof window !== "undefined") {
  syncRegistry(useCatalogStore.getState().custom);
}
