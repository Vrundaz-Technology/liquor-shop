import { describe, expect, it } from "vitest";
import { filterAndSortProducts, type ShopFilters } from "@/lib/shop-catalog";
import type { Product } from "@/types";

function product(partial: Partial<Product> & Pick<Product, "id" | "slug" | "name" | "category" | "price">): Product {
  return {
    brand: "Brand",
    subcategory: partial.category,
    description: "Test",
    brandStory: "",
    origin: "USA",
    country: "USA",
    abv: 40,
    volumeMl: 750,
    rating: 4,
    reviewCount: 1,
    tastingNotes: [],
    foodPairings: [],
    cocktails: [],
    images: ["/x.jpg"],
    color: "#000",
    accentColor: "#111",
    labelColor: "#fff",
    bottleHeight: 1,
    isPremium: false,
    isImported: false,
    tags: [],
    ...partial,
  };
}

const base: Product[] = [
  product({
    id: "p1",
    slug: "alpha-bourbon",
    name: "Alpha Bourbon",
    brand: "Alpha",
    category: "bourbon",
    price: 40,
    rating: 4.5,
    reviewCount: 10,
  }),
  product({
    id: "p2",
    slug: "beta-vodka",
    name: "Beta Vodka",
    brand: "Beta",
    category: "vodka",
    price: 25,
    rating: 3.2,
    reviewCount: 2,
  }),
];

const stock: Record<string, number> = {
  "loc-a:p1": 5,
  "loc-a:p2": 0,
};

const defaults: ShopFilters = {
  q: "",
  category: "all",
  brand: "all",
  type: "all",
  size: "all",
  sort: "popular",
  inStockOnly: true,
};

describe("filterAndSortProducts", () => {
  it("hides out-of-stock when inStockOnly is on", () => {
    const list = filterAndSortProducts(base, defaults, {
      branchId: "loc-a",
      getOnHand: (loc, id) => stock[`${loc}:${id}`] ?? 0,
      isHidden: () => false,
    });
    expect(list.map((p) => p.id)).toEqual(["p1"]);
  });

  it("filters by category", () => {
    const list = filterAndSortProducts(
      base,
      { ...defaults, category: "vodka", inStockOnly: false },
      {
        branchId: "loc-a",
        getOnHand: () => 10,
        isHidden: () => false,
      },
    );
    expect(list.map((p) => p.id)).toEqual(["p2"]);
  });

  it("excludes hidden products", () => {
    const list = filterAndSortProducts(
      base,
      { ...defaults, inStockOnly: false },
      {
        branchId: "loc-a",
        getOnHand: () => 10,
        isHidden: (_loc, id) => id === "p1",
      },
    );
    expect(list.map((p) => p.id)).toEqual(["p2"]);
  });
});
