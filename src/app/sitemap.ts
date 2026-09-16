import { MetadataRoute } from "next";
import { fetchAllProducts, fetchAllLocations, fetchCategories, fetchEvents } from "@/lib/db/queries";
import { categories as seedCategories } from "@/data/categories";
import { products as seedProducts } from "@/data/products";
import { locations as seedLocations } from "@/data/locations";
import { events as seedEvents } from "@/data/events";
import { SITE } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFrequency = NonNullable<SitemapEntry["changeFrequency"]>;

async function safeList<T>(load: () => Promise<T[]>, fallback: T[]): Promise<T[]> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

function entry(url: string, changeFrequency: ChangeFrequency, priority: number): SitemapEntry {
  return { url, changeFrequency, priority };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const [products, categories, locations, events] = await Promise.all([
    safeList(fetchAllProducts, seedProducts),
    safeList(fetchCategories, seedCategories),
    safeList(fetchAllLocations, seedLocations),
    safeList(fetchEvents, seedEvents),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    entry(base, "weekly", 1),
    entry(`${base}/virtual-store`, "weekly", 0.9),
    entry(`${base}/shop`, "weekly", 0.9),
    entry(`${base}/locations`, "monthly", 0.8),
    entry(`${base}/events`, "weekly", 0.7),
  ];

  return [
    ...staticPages,
    ...categories.map((c) => entry(`${base}/shop/${c.slug}`, "weekly", 0.7)),
    ...products.map((p) => entry(`${base}/products/${p.slug}`, "weekly", 0.8)),
    ...products.map((p) => entry(`${base}/ar/${p.slug}`, "monthly", 0.6)),
    ...locations.map((l) => entry(`${base}/locations/${l.slug}`, "monthly", 0.6)),
    ...events
      .filter((e) => e.active !== false)
      .map((e) => entry(`${base}/events/${e.slug}`, "weekly", 0.6)),
  ];
}
