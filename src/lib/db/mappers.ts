import type {
  EventItem,
  InventoryItem,
  InventoryLedgerEntry,
  Order,
  Product,
  Review,
  StoreLocation,
  UserProfile,
} from "@/types";
import { mapLocationPricing } from "@/lib/db/location-pricing";
import { moneyNumber, moneyOptional } from "@/lib/db/money";
import type {
  Category as DbCategory,
  Event as DbEvent,
  InventoryLedger as DbLedger,
  Location as DbLocation,
  LocationInventory as DbInventory,
  Order as DbOrder,
  OrderItem as DbOrderItem,
  Product as DbProduct,
  Review as DbReview,
  User as DbUser,
} from "@prisma/client";

type DbProductRow = DbProduct;
type DbLocationRow = DbLocation & { inventory: DbInventory[] };
type DbOrderRow = DbOrder & { items: DbOrderItem[] };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function asCocktails(value: unknown): Product["cocktails"] {
  if (!Array.isArray(value)) return [];
  return value as Product["cocktails"];
}

function asNutrition(value: unknown): Product["nutrition"] {
  if (!value || typeof value !== "object") return undefined;
  return value as Product["nutrition"];
}

export function mapProduct(row: DbProductRow): Product {
  const ext = row as DbProductRow & {
    costPrice?: number | null;
    sku?: string | null;
    upc?: string | null;
    minQty?: number | null;
    maxQty?: number | null;
    organizationId?: string | null;
  };
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.categorySlug,
    subcategory: row.subcategory ?? undefined,
    description: row.description,
    brandStory: row.brandStory,
    origin: row.origin,
    country: row.country,
    abv: row.abv,
    volumeMl: row.volumeMl,
    price: moneyNumber(row.price),
    compareAtPrice: moneyOptional(row.compareAtPrice),
    costPrice: moneyOptional(ext.costPrice),
    sku: ext.sku ?? undefined,
    upc: ext.upc ?? undefined,
    minQty: ext.minQty ?? 1,
    maxQty: ext.maxQty ?? undefined,
    organizationId: ext.organizationId ?? undefined,
    rating: row.rating,
    reviewCount: row.reviewCount,
    tastingNotes: asStringArray(row.tastingNotes),
    foodPairings: asStringArray(row.foodPairings),
    cocktails: asCocktails(row.cocktails),
    images: asStringArray(row.images),
    color: row.color,
    accentColor: row.accentColor,
    labelColor: row.labelColor,
    bottleHeight: row.bottleHeight,
    isPremium: row.isPremium,
    isImported: row.isImported,
    tags: asStringArray(row.tags),
    nutrition: asNutrition(row.nutrition),
    glbUrl: row.glbUrl ?? undefined,
    usdzUrl: row.usdzUrl ?? undefined,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : undefined,
  };
}

export function mapInventoryItem(row: DbInventory): InventoryItem {
  const ext = row as DbInventory & {
    reserved?: number;
    basePrice?: number | null;
    salePrice?: number | null;
    costPrice?: number | null;
    lowStockThreshold?: number;
  };
  return {
    productId: row.productId,
    stock: row.seedStock,
    reserved: ext.reserved ?? 0,
    basePrice: moneyOptional(ext.basePrice),
    salePrice: moneyOptional(ext.salePrice),
    costPrice: moneyOptional(ext.costPrice),
    promoPrice: moneyOptional(row.promoPrice),
    featured: row.featured,
    hidden: Boolean((row as { hidden?: boolean }).hidden),
    lowStockThreshold: ext.lowStockThreshold ?? 5,
  };
}

export function mapLocation(row: DbLocationRow): StoreLocation {
  const ext = row as DbLocationRow & {
    organizationId?: string;
    holidayHours?: unknown;
    minimumOrderAmount?: number;
    paymentSettings?: unknown;
  };
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    organizationId: ext.organizationId,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    phone: row.phone,
    email: row.email,
    hours: row.hours as StoreLocation["hours"],
    holidayHours: Array.isArray(ext.holidayHours)
      ? (ext.holidayHours as StoreLocation["holidayHours"])
      : undefined,
    lat: row.lat,
    lng: row.lng,
    heroImage: row.heroImage,
    gallery: asStringArray(row.gallery),
    staff: row.staff as StoreLocation["staff"],
    services: asStringArray(row.services),
    parking: row.parking,
    pickupAvailable: row.pickupAvailable,
    ...mapLocationPricing(row),
    deliveryRadiusKm: row.deliveryRadiusKm,
    minimumOrderAmount: moneyNumber(ext.minimumOrderAmount),
    paymentSettings:
      ext.paymentSettings && typeof ext.paymentSettings === "object"
        ? (ext.paymentSettings as Record<string, unknown>)
        : undefined,
    inventory: row.inventory.map(mapInventoryItem),
    featuredOffers: asStringArray(row.featuredOffers),
    description: row.description,
  };
}

export function mapEvent(row: DbEvent & { active?: boolean | null }): EventItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type as EventItem["type"],
    description: row.description,
    locationId: row.locationId,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    price: moneyNumber(row.price),
    seatsTotal: row.seatsTotal,
    seatsAvailable: row.seatsAvailable,
    image: row.image,
    hosts: asStringArray(row.hosts),
    active: row.active !== false,
  };
}

export function mapReview(row: DbReview): Review {
  return {
    id: row.id,
    productId: row.productId,
    userName: row.userName,
    rating: row.rating,
    title: row.title,
    body: row.body,
    date: row.date,
    verified: row.verified,
    images: row.images ? asStringArray(row.images) : undefined,
    helpful: row.helpful,
  };
}

export function mapCategory(row: DbCategory) {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    color: row.color,
  };
}

export function mapOrder(row: DbOrderRow): Order {
  const ext = row as DbOrderRow & {
    organizationId?: string | null;
    subtotal?: number;
    taxAmount?: number;
    discountAmount?: number;
    deliveryFee?: number;
    paymentStatus?: string;
    assignedStaffId?: string | null;
    couponCode?: string | null;
    promotionId?: string | null;
  };
  return {
    id: row.id,
    date: row.date,
    status: row.status as Order["status"],
    items: row.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      price: moneyNumber(i.price),
    })),
    total: moneyNumber(row.total),
    subtotal: moneyOptional(ext.subtotal),
    taxAmount: moneyOptional(ext.taxAmount),
    discountAmount: moneyOptional(ext.discountAmount),
    deliveryFee: moneyOptional(ext.deliveryFee),
    paymentStatus: ext.paymentStatus,
    fulfillment: row.fulfillment as Order["fulfillment"],
    locationId: row.locationId,
    organizationId: ext.organizationId ?? undefined,
    tracking: row.tracking ?? undefined,
    assignedStaffId: ext.assignedStaffId ?? undefined,
    couponCode: ext.couponCode ?? undefined,
    promotionId: ext.promotionId ?? undefined,
  };
}

export function mapUser(row: DbUser, orders: Order[]): UserProfile {
  const ext = row as DbUser & { organizationId?: string | null };
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserProfile["role"],
    active: row.active !== false,
    preferredBranchId: row.preferredBranchId,
    organizationId: ext.organizationId ?? undefined,
    loyaltyPoints: row.loyaltyPoints,
    loyaltyTier: row.loyaltyTier as UserProfile["loyaltyTier"],
    addresses: row.addresses as UserProfile["addresses"],
    recentlyViewed: asStringArray(row.recentlyViewed),
    orders,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : undefined,
    avatarUrl:
      typeof (row as { avatarUrl?: unknown }).avatarUrl === "string" &&
      (row as { avatarUrl: string }).avatarUrl
        ? (row as { avatarUrl: string }).avatarUrl
        : undefined,
  };
}

export function mapLedger(row: DbLedger): InventoryLedgerEntry {
  return {
    id: row.id,
    locationId: row.locationId,
    productId: row.productId,
    delta: row.delta,
    onHandAfter: row.onHandAfter,
    reason: row.reason as InventoryLedgerEntry["reason"],
    orderId: row.orderId ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date().toISOString(),
  };
}
