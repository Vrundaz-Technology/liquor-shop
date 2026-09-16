import Fuse from "fuse.js";
import { getAllProducts } from "@/data/products";
import { getCategories } from "@/data/categories";
import type { Product } from "@/types";

const fuseKeys = [
  { name: "name", weight: 0.4 },
  { name: "brand", weight: 0.3 },
  { name: "category", weight: 0.15 },
  { name: "tastingNotes", weight: 0.1 },
  { name: "origin", weight: 0.05 },
];

let cachedFuse: Fuse<Product> | null = null;
let cachedCount = -1;

function productFuse() {
  const products = getAllProducts();
  if (!cachedFuse || cachedCount !== products.length) {
    cachedFuse = new Fuse(products, {
      keys: fuseKeys,
      threshold: 0.35,
      includeScore: true,
    });
    cachedCount = products.length;
  }
  return cachedFuse;
}

export function searchProducts(query: string, limit = 12): Product[] {
  if (!query.trim()) return [];
  const fuse = productFuse();
  const opts = limit > 0 ? { limit } : undefined;
  return fuse.search(query, opts).map((r) => r.item);
}

export function searchAll(query: string) {
  const productResults = searchProducts(query, 8);
  const categoryResults = getCategories().filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.tagline.toLowerCase().includes(query.toLowerCase()),
  );
  return { products: productResults, categories: categoryResults };
}
