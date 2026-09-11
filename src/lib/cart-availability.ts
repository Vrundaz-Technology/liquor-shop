import { getAllLocations, getLocationById } from "@/data/locations";
import { getProductById, products } from "@/data/products";
import { getLiveStock } from "@/store/inventory";
import type { CartItem, Product, StoreLocation } from "@/types";

export type CartLineAvailability = {
  productId: string;
  product: Product;
  quantity: number;
  stock: number;
  available: boolean;
  shortfall: number;
};

export type LocationCoverage = {
  location: StoreLocation;
  coversAll: boolean;
  missingCount: number;
  availableCount: number;
};

export type CartAvailability = {
  branchId: string;
  branch: StoreLocation;
  lines: CartLineAvailability[];
  available: CartLineAvailability[];
  unavailable: CartLineAvailability[];
  hasConflicts: boolean;
  /** Locations ranked by how many cart lines they can fulfill */
  betterLocations: LocationCoverage[];
  /** Best single location that covers the full cart (if any) */
  fullCoverageLocation: StoreLocation | null;
};

export function getAvailableStock(locationId: string, productId: string) {
  return getLiveStock(locationId, productId);
}

export function locationCoversCart(
  items: Pick<CartItem, "productId" | "quantity">[],
  locationId: string,
) {
  if (!items.length) return true;
  return items.every((item) => getAvailableStock(locationId, item.productId) >= item.quantity);
}

export function findLocationsCoveringCart(
  items: Pick<CartItem, "productId" | "quantity">[],
) {
  if (!items.length) return getAllLocations();
  return getAllLocations().filter((loc) => locationCoversCart(items, loc.id));
}

export function analyzeCartAvailability(
  items: CartItem[],
  branchId: string,
): CartAvailability {
  const branch = getLocationById(branchId) ?? getAllLocations()[0];

  const lines: CartLineAvailability[] = items
    .map((item) => {
      const product = getProductById(item.productId);
      if (!product) return null;
      const stock = getAvailableStock(branchId, item.productId);
      const available = stock >= item.quantity;
      return {
        productId: item.productId,
        product,
        quantity: item.quantity,
        stock,
        available,
        shortfall: available ? 0 : Math.max(0, item.quantity - stock),
      };
    })
    .filter(Boolean) as CartLineAvailability[];

  const available = lines.filter((l) => l.available);
  const unavailable = lines.filter((l) => !l.available);

  const covering = findLocationsCoveringCart(items);
  const fullCoverageLocation =
    covering.find((l) => l.id === branchId) ?? covering[0] ?? null;

  const betterLocations: LocationCoverage[] = getAllLocations()
    .map((loc) => {
      let availableCount = 0;
      let missingCount = 0;
      for (const item of items) {
        const stock = getAvailableStock(loc.id, item.productId);
        if (stock >= item.quantity) availableCount += 1;
        else missingCount += 1;
      }
      return {
        location: loc,
        coversAll: missingCount === 0 && items.length > 0,
        missingCount,
        availableCount,
      };
    })
    .filter((c) => c.location.id !== branchId)
    .sort((a, b) => {
      if (a.coversAll !== b.coversAll) return a.coversAll ? -1 : 1;
      if (b.availableCount !== a.availableCount) {
        return b.availableCount - a.availableCount;
      }
      return a.missingCount - b.missingCount;
    });

  return {
    branchId,
    branch,
    lines,
    available,
    unavailable,
    hasConflicts: unavailable.length > 0,
    betterLocations,
    fullCoverageLocation:
      fullCoverageLocation && fullCoverageLocation.id !== branchId
        ? fullCoverageLocation
        : betterLocations.find((c) => c.coversAll)?.location ?? null,
  };
}

export type LocationStock = {
  location: StoreLocation;
  stock: number;
};

/** Stock count for one bottle at every branch (including 0). */
export function stockByLocation(productId: string): LocationStock[] {
  return getAllLocations().map((location) => ({
    location,
    stock: getAvailableStock(location.id, productId),
  }));
}

export function maxStockAnywhere(productId: string) {
  return Math.max(0, ...stockByLocation(productId).map((row) => row.stock));
}

/** Other branches that can fulfill this bottle (highest stock first). */
export function otherLocationsWithStock(
  productId: string,
  excludeBranchId: string,
  minQty = 1,
): LocationStock[] {
  return stockByLocation(productId)
    .filter((row) => row.location.id !== excludeBranchId && row.stock >= minQty)
    .sort((a, b) => b.stock - a.stock);
}

/** Other stores with any bottles — those that can cover `needed` first. */
export function otherLocationsForDemand(
  productId: string,
  excludeBranchId: string,
  needed: number,
): (LocationStock & { canFulfill: boolean })[] {
  return stockByLocation(productId)
    .filter((row) => row.location.id !== excludeBranchId && row.stock > 0)
    .map((row) => ({ ...row, canFulfill: row.stock >= needed }))
    .sort((a, b) => {
      if (a.canFulfill !== b.canFulfill) return a.canFulfill ? -1 : 1;
      return b.stock - a.stock;
    });
}

/** Locations that can fulfill a specific unavailable product */
export function locationsWithProduct(
  productId: string,
  quantity: number,
  excludeBranchId?: string,
) {
  return otherLocationsWithStock(
    productId,
    excludeBranchId ?? "",
    quantity,
  ).map((row) => row.location);
}

/**
 * Suggest in-stock bottles at the current branch as alternatives
 * (same category preferred, then brand, then other premium).
 */
export function suggestAlternatives(
  branchId: string,
  cartProductIds: string[],
  unavailable: CartLineAvailability[],
  limit = 4,
): Product[] {
  const cartSet = new Set(cartProductIds);
  const categories = new Set(unavailable.map((u) => u.product.category));
  const brands = new Set(unavailable.map((u) => u.product.brand));

  const inStock = products.filter((p) => {
    if (cartSet.has(p.id)) return false;
    return getAvailableStock(branchId, p.id) > 0;
  });

  const scored = inStock
    .map((p) => {
      let score = 0;
      if (categories.has(p.category)) score += 3;
      if (brands.has(p.brand)) score += 2;
      if (p.isPremium) score += 1;
      const stock = getAvailableStock(branchId, p.id);
      if (stock >= 5) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price);

  return scored.slice(0, limit).map((s) => s.p);
}
