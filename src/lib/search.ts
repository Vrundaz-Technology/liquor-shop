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

export type SearchPage = {
  href: string;
  label: string;
  description: string;
  keywords: string;
};

const PAGES: SearchPage[] = [
  { href: "/shop", label: "Collections", description: "Browse bottles and brands", keywords: "shop collections bottles buy catalog" },
  { href: "/virtual-store", label: "Virtual Store", description: "Walk the showroom", keywords: "virtual store ar 3d showroom" },
  { href: "/locations", label: "Locations", description: "Stores, pickup, and delivery", keywords: "store location hours address pickup delivery zip" },
  { href: "/events", label: "Events", description: "Tastings and in-store events", keywords: "events tasting class" },
  { href: "/track", label: "Track order", description: "Look up delivery status", keywords: "track tracking order delivery shipment eta" },
  { href: "/support", label: "Support", description: "Help, tickets, and order issues", keywords: "support help contact ticket refund damaged" },
  { href: "/cart", label: "Cart", description: "Review items before checkout", keywords: "cart bag checkout" },
  { href: "/wishlist", label: "Wishlist", description: "Saved bottles", keywords: "wishlist favorites saved" },
  { href: "/account", label: "Account", description: "Orders, profile, and loyalty", keywords: "account orders profile loyalty" },
  { href: "/login", label: "Sign in", description: "Member and staff login", keywords: "login signin sign in account" },
];

export function searchPages(query: string, limit = 6): SearchPage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PAGES.filter((page) =>
    `${page.label} ${page.description} ${page.keywords}`.toLowerCase().includes(q),
  ).slice(0, limit);
}

export function searchAll(query: string) {
  const productResults = searchProducts(query, 8);
  const categoryResults = getCategories().filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.tagline.toLowerCase().includes(query.toLowerCase()),
  );
  return { products: productResults, categories: categoryResults, pages: searchPages(query) };
}
