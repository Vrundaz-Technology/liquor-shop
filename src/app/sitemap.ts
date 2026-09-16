import { MetadataRoute } from "next";
import { fetchAllProducts, fetchAllLocations, fetchCategories, fetchEvents } from "@/lib/db/queries";
import { categories as seedCategories } from "@/data/categories";
import { products as seedProducts } from "@/data/products";
import { locations as seedLocations } from "@/data/locations";
import { events as seedEvents } from "@/data/events";
import { SITE } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function safeList<T>(load: () => Promise<T[]>, fallback: T[]): Promise<T[]> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const [products, categories, locations, events] = await Promise.all([
    safeList(fetchAllProducts, seedProducts),
    safeList(fetchCategories, seedCategories),
    safeList(fetchAllLocations, seedLocations),
    safeList(fetchEvents, seedEvents),
  ]);

  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/virtual-store`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/shop`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/locations`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/events`, changeFrequency: "weekly", priority: 0.7 },
    ...categories.map((c) => ({
      url: `${base}/shop/${c.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: `${base}/products/${p.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${base}/ar/${p.slug}`,
      changeFrequency: "monthly",
      priority: 0.6,
    })),
    ...locations.map((l) => ({
      url: `${base}/locations/${l.slug}`,
      changeFrequency: "monthly",
      priority: 0.6,
    })),
    ...events
      .filter((e) => e.active !== false)
      .map((e) => ({
        url: `${base}/events/${e.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
  ];
}
