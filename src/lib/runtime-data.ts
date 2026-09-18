import type {
  CategorySlug,
  EventItem,
  Product,
  Review,
  StoreLocation,
  UserProfile,
} from "@/types";
import { categories as seedCategories } from "@/data/categories";
import { products as seedProducts } from "@/data/products";
import { locations as seedLocations } from "@/data/locations";
import { events as seedEvents, reviews as seedReviews } from "@/data/events";

type CategoryRow = (typeof seedCategories)[number];

let products: Product[] = [...seedProducts];
let locations: StoreLocation[] = [...seedLocations];
let categories: CategoryRow[] = [...seedCategories];
let events: EventItem[] = [...seedEvents];
let reviews: Review[] = [...seedReviews];
let usersByEmail = new Map<string, UserProfile>();
let dbConnected = false;
let loaded = false;
let catalogRevision = 0;

type CatalogListener = () => void;
const catalogListeners = new Set<CatalogListener>();

function bumpCatalog() {
  catalogRevision += 1;
  catalogListeners.forEach((listener) => listener());
}

/** Subscribe to catalog mutations (locations/events/etc). Returns unsubscribe. */
export function subscribeRuntimeCatalog(listener: CatalogListener) {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

export function getRuntimeCatalogRevision() {
  return catalogRevision;
}

export function isRuntimeDataLoaded() {
  return loaded;
}

export function isDbConnected() {
  return dbConnected;
}

/** Bootstrap failed or timed out — catalog may stay on seed data. */
export function markRuntimeUnavailable() {
  dbConnected = false;
  loaded = true;
  bumpCatalog();
}

export function hydrateRuntimeData(payload: {
  products: Product[];
  locations: StoreLocation[];
  categories: CategoryRow[];
  events: EventItem[];
  reviews: Review[];
  users?: UserProfile[];
  dbConnected?: boolean;
}) {
  products = payload.products;
  locations = payload.locations;
  categories = payload.categories;
  events = payload.events.map((event) => ({
    ...event,
    active: event.active !== false,
  }));
  reviews = payload.reviews;
  dbConnected = payload.dbConnected ?? false;
  loaded = true;

  if (payload.users?.length) {
    usersByEmail = new Map(payload.users.map((u) => [u.email.toLowerCase(), u]));
  }
  bumpCatalog();
}

export function getRuntimeProducts() {
  return products;
}

export function getRuntimeLocations() {
  return locations;
}

export function getRuntimeCategories() {
  return categories;
}

export function getRuntimeEvents() {
  return events;
}

export function getRuntimeReviews() {
  return reviews;
}

export function getRuntimeUserByEmail(email: string) {
  return usersByEmail.get(email.toLowerCase());
}

export function upsertRuntimeProduct(product: Product) {
  const idx = products.findIndex((p) => p.id === product.id);
  if (idx >= 0) products[idx] = product;
  else products = [product, ...products];
}

export function upsertRuntimeLocationInventory(
  locationId: string,
  productId: string,
  patch: { promoPrice?: number; featured?: boolean },
) {
  locations = locations.map((loc) => {
    if (loc.id !== locationId) return loc;
    const inventory = loc.inventory.map((row) =>
      row.productId === productId ? { ...row, ...patch } : row,
    );
    if (!inventory.some((r) => r.productId === productId)) {
      inventory.push({ productId, stock: 0, ...patch });
    }
    return { ...loc, inventory };
  });
}

export function addRuntimeLocationInventoryRow(
  locationId: string,
  productId: string,
  stock: number,
) {
  locations = locations.map((loc) => {
    if (loc.id !== locationId) return loc;
    const exists = loc.inventory.some((r) => r.productId === productId);
    if (exists) return loc;
    return {
      ...loc,
      inventory: [...loc.inventory, { productId, stock }],
    };
  });
}

export function upsertRuntimeLocation(location: StoreLocation) {
  const idx = locations.findIndex((item) => item.id === location.id);
  if (idx >= 0) {
    locations = locations.map((item, index) => (index === idx ? location : item));
  } else {
    locations = [...locations, location];
  }
  bumpCatalog();
}

export function removeRuntimeLocation(id: string) {
  locations = locations.filter((item) => item.id !== id);
  events = events.filter((item) => item.locationId !== id);
  bumpCatalog();
}

export function upsertRuntimeCategory(category: CategoryRow) {
  const idx = categories.findIndex((item) => item.slug === category.slug);
  if (idx >= 0) {
    categories = categories.map((item, index) => (index === idx ? category : item));
  } else {
    categories = [...categories, category].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function removeRuntimeCategory(slug: string) {
  categories = categories.filter((item) => item.slug !== slug);
}

export function upsertRuntimeEvent(event: EventItem) {
  const idx = events.findIndex((item) => item.id === event.id);
  if (idx >= 0) {
    events = events.map((item, index) => (index === idx ? event : item));
  } else {
    events = [...events, event];
  }
  bumpCatalog();
}

export function removeRuntimeEvent(id: string) {
  events = events.filter((item) => item.id !== id);
  bumpCatalog();
}

export function updateRuntimeEventSeats(eventId: string, seatsAvailable: number) {
  events = events.map((e) => (e.id === eventId ? { ...e, seatsAvailable } : e));
  bumpCatalog();
}

export function isCatalogProductId(id: string) {
  return seedProducts.some((p) => p.id === id);
}

export function getRuntimeProductsByCategory(category: string) {
  return products.filter(
    (p) => p.category === category || p.subcategory?.toLowerCase() === category,
  );
}

export function getRuntimeSimilarProducts(product: Product, limit = 4) {
  return products
    .filter(
      (p) =>
        p.id !== product.id &&
        (p.category === product.category || p.brand === product.brand),
    )
    .slice(0, limit);
}

export type { CategoryRow, CategorySlug };
