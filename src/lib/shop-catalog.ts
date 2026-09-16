import type { Product } from "@/types";
import { searchProducts } from "@/lib/search";
import { estimateDeliveryEta, haversineMiles, kmToMiles } from "@/lib/geo";
import { getAllLocations, getLocationById } from "@/data/locations";

export type ShopSort =
  | "popular"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "best-selling"
  | "rating"
  | "featured";

export type ShopFilters = {
  q?: string;
  category?: string; // "all" or slug
  brand?: string; // "all" or brand
  type?: string; // subcategory or "all"
  size?: string; // "all" | "375" | "750" | "1000" | "1750"
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly?: boolean;
  /** Filter products in stock at this store (defaults to current branch when omitted in UI). */
  storeId?: string;
  /** Max delivery ETA minutes from customer ZIP coords (optional). */
  maxDeliveryMinutes?: number;
  sort?: ShopSort;
};

export const SIZE_OPTIONS = [
  { value: "all", label: "Any size" },
  { value: "375", label: "375 ml" },
  { value: "750", label: "750 ml" },
  { value: "1000", label: "1 L" },
  { value: "1750", label: "1.75 L" },
] as const;

export const SORT_OPTIONS: { value: ShopSort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "best-selling", label: "Best selling" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "featured", label: "Featured" },
];

export const DELIVERY_TIME_OPTIONS = [
  { value: 0, label: "Any delivery time" },
  { value: 45, label: "Under 45 min" },
  { value: 60, label: "Under 60 min" },
  { value: 90, label: "Under 90 min" },
] as const;

function sizeBucket(volumeMl: number) {
  if (volumeMl <= 400) return "375";
  if (volumeMl <= 800) return "750";
  if (volumeMl <= 1200) return "1000";
  return "1750";
}

function popularityScore(p: Product) {
  return p.rating * Math.log10((p.reviewCount || 0) + 1) * 10 + (p.isPremium ? 2 : 0);
}

function newestScore(p: Product) {
  if (p.createdAt) {
    const t = Date.parse(p.createdAt);
    if (Number.isFinite(t)) return t;
  }
  // Stable fallback from id so seed catalogs still sort deterministically.
  let hash = 0;
  for (let i = 0; i < p.id.length; i++) hash = (hash * 31 + p.id.charCodeAt(i)) >>> 0;
  return hash;
}

function bestSellingScore(p: Product) {
  // Prefer explicit units when present; otherwise use review volume × rating as proxy.
  const units = typeof p.unitsSold === "number" ? p.unitsSold : p.reviewCount;
  return units * Math.max(p.rating, 1) + (p.isPremium ? 5 : 0);
}

export function filterAndSortProducts(
  products: Product[],
  filters: ShopFilters,
  opts: {
    branchId: string;
    getOnHand: (locationId: string, productId: string) => number;
    isHidden: (locationId: string, productId: string) => boolean;
    customerLat?: number | null;
    customerLng?: number | null;
  },
): Product[] {
  const storeId = filters.storeId && filters.storeId !== "all" ? filters.storeId : opts.branchId;
  const q = filters.q?.trim() ?? "";

  let list = products.filter((p) => !opts.isHidden(storeId, p.id));

  if (q) {
    const hits = new Set(searchProducts(q, 0).map((p) => p.id));
    list = list.filter((p) => hits.has(p.id));
  }

  const category = filters.category && filters.category !== "all" ? filters.category : "";
  if (category) {
    list = list.filter(
      (p) =>
        p.category === category ||
        (category === "whiskey" && ["scotch", "bourbon"].includes(p.category)),
    );
  }

  if (filters.brand && filters.brand !== "all") {
    list = list.filter((p) => p.brand === filters.brand);
  }

  if (filters.type && filters.type !== "all") {
    list = list.filter(
      (p) =>
        p.subcategory === filters.type ||
        p.category === filters.type ||
        p.tags.includes(filters.type!),
    );
  }

  if (filters.size && filters.size !== "all") {
    list = list.filter((p) => sizeBucket(p.volumeMl) === filters.size);
  }

  if (typeof filters.maxPrice === "number") {
    list = list.filter((p) => p.price <= filters.maxPrice!);
  }
  if (typeof filters.minPrice === "number") {
    list = list.filter((p) => p.price >= filters.minPrice!);
  }
  if (typeof filters.minRating === "number" && filters.minRating > 0) {
    list = list.filter((p) => p.rating >= filters.minRating!);
  }
  if (filters.inStockOnly) {
    list = list.filter((p) => opts.getOnHand(storeId, p.id) > 0);
  }

  // Delivery time: keep products that are in stock at a store which can deliver within the window.
  if (
    filters.maxDeliveryMinutes &&
    filters.maxDeliveryMinutes > 0 &&
    opts.customerLat != null &&
    opts.customerLng != null
  ) {
    const eligibleStoreIds = getAllLocations()
      .filter((loc) => {
        if (!loc.deliveryAvailable) return false;
        const miles = haversineMiles(
          { lat: opts.customerLat!, lng: opts.customerLng! },
          { lat: loc.lat, lng: loc.lng },
        );
        if (miles > kmToMiles(loc.deliveryRadiusKm || 0)) return false;
        return estimateDeliveryEta(miles).max <= filters.maxDeliveryMinutes!;
      })
      .map((l) => l.id);

    if (eligibleStoreIds.length === 0) {
      list = [];
    } else {
      list = list.filter((p) =>
        eligibleStoreIds.some(
          (id) => !opts.isHidden(id, p.id) && opts.getOnHand(id, p.id) > 0,
        ),
      );
    }
  }

  const sort = filters.sort ?? "popular";
  const sorted = [...list];
  switch (sort) {
    case "price-asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      break;
    case "newest":
      sorted.sort((a, b) => newestScore(b) - newestScore(a));
      break;
    case "best-selling":
      sorted.sort((a, b) => bestSellingScore(b) - bestSellingScore(a) || b.rating - a.rating);
      break;
    case "featured": {
      const loc = getLocationById(storeId);
      const featured = new Set(
        (loc?.inventory ?? []).filter((i) => i.featured).map((i) => i.productId),
      );
      sorted.sort((a, b) => Number(featured.has(b.id)) - Number(featured.has(a.id)) || b.rating - a.rating);
      break;
    }
    case "popular":
    default:
      sorted.sort((a, b) => popularityScore(b) - popularityScore(a));
      break;
  }

  return sorted;
}

export function uniqueBrands(products: Product[]) {
  return [...new Set(products.map((p) => p.brand))].sort((a, b) => a.localeCompare(b));
}

export function uniqueTypes(products: Product[]) {
  const set = new Set<string>();
  for (const p of products) {
    if (p.subcategory) set.add(p.subcategory);
    for (const tag of p.tags.slice(0, 2)) set.add(tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
