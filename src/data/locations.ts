import type { InventoryItem, StoreLocation } from "@/types";
import { products } from "./products";

const BASE_COUNTS = [
  18, 12, 8, 5, 10, 22, 16, 14, 9, 3, 11, 15, 10, 7, 6, 4, 2, 1, 20, 14, 13, 12, 8, 11, 9, 7, 6, 5, 4, 3, 25, 8,
];

/** Every catalog bottle gets an explicit on-hand count (0 is allowed). */
function catalogRow(index: number) {
  const p = products[index];
  return {
    productId: p.id,
    stock: BASE_COUNTS[index % BASE_COUNTS.length],
    featured: index < 6,
    promoPrice:
      p.slug === "titos-handmade-vodka" ? 16 : p.slug === "buffalo-trace-bourbon" ? 24 : undefined,
  };
}

function inventoryForBranch(
  adjust: (base: number, index: number) => number,
  extra?: (item: InventoryItem, index: number) => InventoryItem,
): InventoryItem[] {
  return products.map((_, i) => {
    const row = catalogRow(i);
    const item: InventoryItem = {
      ...row,
      stock: Math.max(0, Math.floor(adjust(row.stock, i))),
    };
    return extra ? extra(item, i) : item;
  });
}

export const locations: StoreLocation[] = [
  {
    id: "loc1",
    slug: "sams-downtown",
    name: "Sam's Discount Liquor — Downtown",
    shortName: "Downtown",
    address: "128 Grand Avenue",
    city: "New York",
    state: "NY",
    zip: "10013",
    phone: "+1 (212) 555-0188",
    email: "downtown@samsdiscountliquor.com",
    hours: [
      { day: "Mon–Thu", open: "11:00", close: "21:00" },
      { day: "Fri–Sat", open: "10:00", close: "23:00" },
      { day: "Sun", open: "12:00", close: "20:00" },
    ],
    lat: 40.7209,
    lng: -74.0007,
    heroImage: "/store/downtown-maison.jpg",
    gallery: ["/store/downtown-maison.jpg", "/store/downtown-alt.jpg", "/store/bar-wall.jpg"],
    staff: [
      {
        name: "Elena Voss",
        role: "Master Sommelier",
        image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80",
      },
      {
        name: "Marcus Chen",
        role: "Whiskey Curator",
        image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&q=80",
      },
    ],
    services: ["In-store tasting", "Private cellar", "Same-day delivery", "Gift wrapping"],
    parking: "Valet available on Grand Ave; garage on Mercer St.",
    pickupAvailable: true,
    deliveryAvailable: true,
    deliveryRadiusKm: 12,
    deliveryFee: 12.5,
    deliveryFreeMinimum: 150,
    taxRate: 0.08875,
    inventory: inventoryForBranch((base, i) => base + (i % 3) - 1),
    featuredOffers: ["10% off Scotch this week", "Complimentary gift wrap over $150"],
    description:
      "Our flagship store in SoHo — vaulted ceilings, oak shelving, and a private tasting salon for collectors.",
  },
  {
    id: "loc2",
    slug: "sams-waterfront",
    name: "Sam's Discount Liquor — Waterfront",
    shortName: "Waterfront",
    address: "44 Harbor Boulevard",
    city: "Brooklyn",
    state: "NY",
    zip: "11201",
    phone: "+1 (718) 555-0142",
    email: "waterfront@samsdiscountliquor.com",
    hours: [
      { day: "Mon–Thu", open: "12:00", close: "21:00" },
      { day: "Fri–Sat", open: "11:00", close: "22:00" },
      { day: "Sun", open: "12:00", close: "19:00" },
    ],
    lat: 40.7021,
    lng: -73.9872,
    heroImage: "/store/waterfront-maison.jpg",
    gallery: ["/store/waterfront-maison.jpg", "/store/downtown-alt.jpg"],
    staff: [
      {
        name: "Sofia Alvarez",
        role: "Store Director",
        image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80",
      },
    ],
    services: ["Harbor pickup", "Event hosting", "Wine club", "Climate cellar"],
    parking: "Free customer parking behind the building.",
    pickupAvailable: true,
    deliveryAvailable: true,
    deliveryRadiusKm: 8,
    deliveryFee: 10,
    deliveryFreeMinimum: 100,
    taxRate: 0.08875,
    inventory: inventoryForBranch(
      (base, i) => (i === 13 ? 0 : base - (i % 4)),
      (item, i) => ({
        ...item,
        promoPrice: i === 6 ? 42 : item.promoPrice,
        featured: i >= 4 && i < 8,
      }),
    ),
    featuredOffers: ["Rum flight tasting Saturdays", "Free delivery over $100 in Brooklyn"],
    description:
      "Waterfront views meet warm amber lighting — perfect for weekend browsing and harbor-side pickup.",
  },
  {
    id: "loc3",
    slug: "sams-uptown",
    name: "Sam's Discount Liquor — Uptown",
    shortName: "Uptown",
    address: "890 Madison Avenue",
    city: "New York",
    state: "NY",
    zip: "10021",
    phone: "+1 (212) 555-0199",
    email: "uptown@samsdiscountliquor.com",
    hours: [
      { day: "Mon–Sat", open: "10:00", close: "20:00" },
      { day: "Sun", open: "11:00", close: "18:00" },
    ],
    lat: 40.7736,
    lng: -73.9654,
    heroImage: "/store/waterfront-alt.jpg",
    gallery: ["/store/waterfront-alt.jpg", "/store/downtown-maison.jpg"],
    staff: [
      {
        name: "James Whitmore",
        role: "Cognac Specialist",
        image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80",
      },
      {
        name: "Ava Laurent",
        role: "Champagne Concierge",
        image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
      },
    ],
    services: ["Personal shopping", "Corporate gifting", "Rare allocation list", "Concierge delivery"],
    parking: "Street parking; nearby garage on 72nd.",
    pickupAvailable: true,
    deliveryAvailable: true,
    deliveryRadiusKm: 15,
    deliveryFee: 15,
    deliveryFreeMinimum: 200,
    taxRate: 0.08875,
    inventory: inventoryForBranch(
      (base, i) => (i === 13 ? 2 : Math.max(1, base + 2 - (i % 2))),
      (item, i) => ({
        ...item,
        featured: [0, 9, 10, 13].includes(i),
        promoPrice: i === 9 ? 269 : item.promoPrice,
      }),
    ),
    featuredOffers: ["Allocation lottery for Louis XIII", "Champagne pairing evenings"],
    description:
      "Our most exclusive boutique — rare allocations, crystal decanters, and white-glove service on Madison Avenue.",
  },
];

function ensureEverySkuHasAStore() {
  for (const product of products) {
    const total = locations.reduce((n, loc) => {
      const row = loc.inventory.find((i) => i.productId === product.id);
      return n + (row?.stock ?? 0);
    }, 0);
    if (total > 0) continue;
    const uptown = locations.find((l) => l.id === "loc3");
    const row = uptown?.inventory.find((i) => i.productId === product.id);
    if (row) row.stock = 2;
    else {
      uptown?.inventory.push({ productId: product.id, stock: 2 });
    }
  }
}

ensureEverySkuHasAStore();

import { runtimeData, productData } from "@/lib/runtime-data-bridge";

export function getAllLocations() {
  return runtimeData().getRuntimeLocations();
}

export function getLocationBySlug(slug: string) {
  return getAllLocations().find((l) => l.slug === slug);
}

export function getLocationById(id: string) {
  return getAllLocations().find((l) => l.id === id);
}

/** Catalog row (promo / featured / seed count). Live on-hand is `useInventoryStore`. */
export function getStock(locationId: string, productId: string) {
  const loc = getLocationById(locationId);
  return loc?.inventory.find((i) => i.productId === productId);
}

export function getPriceForLocation(locationId: string, productId: string) {
  const product = productData().getProductById(productId);
  const stock = getStock(locationId, productId);
  if (!product) return 0;
  if (stock?.salePrice != null && stock.salePrice > 0) return stock.salePrice;
  if (stock?.promoPrice != null && stock.promoPrice > 0) return stock.promoPrice;
  if (stock?.basePrice != null && stock.basePrice > 0) return stock.basePrice;
  return product.price;
}
