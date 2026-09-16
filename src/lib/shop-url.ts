import type { ShopFilters, ShopSort } from "@/lib/shop-catalog";

const SORTS = new Set<ShopSort>([
  "popular",
  "price-asc",
  "price-desc",
  "newest",
  "best-selling",
  "rating",
  "featured",
]);

export const DEFAULT_SHOP_FILTERS: ShopFilters = {
  q: "",
  category: "all",
  brand: "all",
  type: "all",
  size: "all",
  minPrice: 0,
  maxPrice: 5000,
  minRating: 0,
  inStockOnly: true,
  maxDeliveryMinutes: 0,
  sort: "popular",
};

export function parseShopFilters(
  params: URLSearchParams,
  defaults: Partial<ShopFilters> = {},
): ShopFilters {
  const base = { ...DEFAULT_SHOP_FILTERS, ...defaults };
  const sortRaw = params.get("sort") ?? base.sort ?? "popular";
  const sort = SORTS.has(sortRaw as ShopSort) ? (sortRaw as ShopSort) : "popular";

  const minPrice = Number(params.get("minPrice") ?? base.minPrice ?? 0);
  const maxPrice = Number(params.get("maxPrice") ?? base.maxPrice ?? 5000);
  const minRating = Number(params.get("minRating") ?? base.minRating ?? 0);
  const maxDeliveryMinutes = Number(
    params.get("delivery") ?? params.get("maxDeliveryMinutes") ?? base.maxDeliveryMinutes ?? 0,
  );

  return {
    q: params.get("q") ?? base.q ?? "",
    category: params.get("category") ?? base.category ?? "all",
    brand: params.get("brand") ?? base.brand ?? "all",
    type: params.get("type") ?? base.type ?? "all",
    size: params.get("size") ?? base.size ?? "all",
    minPrice: Number.isFinite(minPrice) ? Math.max(0, minPrice) : 0,
    maxPrice: Number.isFinite(maxPrice) ? Math.max(10, maxPrice) : 5000,
    minRating: Number.isFinite(minRating) ? Math.min(5, Math.max(0, minRating)) : 0,
    inStockOnly: params.has("inStock")
      ? params.get("inStock") !== "0"
      : Boolean(base.inStockOnly),
    storeId: params.get("store") ?? base.storeId,
    maxDeliveryMinutes: Number.isFinite(maxDeliveryMinutes) ? maxDeliveryMinutes : 0,
    sort,
  };
}

export function shopFiltersToSearchParams(
  filters: ShopFilters,
  opts?: { omitCategory?: boolean },
): URLSearchParams {
  const params = new URLSearchParams();
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  if (!opts?.omitCategory && filters.category && filters.category !== "all") {
    params.set("category", filters.category);
  }
  if (filters.brand && filters.brand !== "all") params.set("brand", filters.brand);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.size && filters.size !== "all") params.set("size", filters.size);
  if (typeof filters.minPrice === "number" && filters.minPrice > 0) {
    params.set("minPrice", String(filters.minPrice));
  }
  if (typeof filters.maxPrice === "number" && filters.maxPrice < 5000) {
    params.set("maxPrice", String(filters.maxPrice));
  }
  if (typeof filters.minRating === "number" && filters.minRating > 0) {
    params.set("minRating", String(filters.minRating));
  }
  if (filters.inStockOnly === false) params.set("inStock", "0");
  if (filters.storeId && filters.storeId !== "current" && filters.storeId !== "all") {
    params.set("store", filters.storeId);
  }
  if (filters.maxDeliveryMinutes && filters.maxDeliveryMinutes > 0) {
    params.set("delivery", String(filters.maxDeliveryMinutes));
  }
  if (filters.sort && filters.sort !== "popular") params.set("sort", filters.sort);
  return params;
}

export function shopHref(filters: ShopFilters, categorySlug?: string) {
  const params = shopFiltersToSearchParams(filters, { omitCategory: Boolean(categorySlug) });
  const query = params.toString();
  const base = categorySlug ? `/shop/${categorySlug}` : "/shop";
  return query ? `${base}?${query}` : base;
}
