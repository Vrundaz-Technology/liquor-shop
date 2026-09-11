import { prisma, isDbConfigured } from "@/lib/db/prisma";
import {
  mapCategory,
  mapEvent,
  mapLocation,
  mapOrder,
  mapProduct,
  mapReview,
  mapUser,
} from "@/lib/db/mappers";
import type { CartItem, NewBottleInput, Order, Product, UserProfile } from "@/types";
import { categories as seedCategories } from "@/data/categories";
import { products as seedProducts } from "@/data/products";
import { locations as seedLocations } from "@/data/locations";
import { events as seedEvents, reviews as seedReviews, demoUser } from "@/data/events";
import { getCouponDiscount, resolvePromotionDiscount } from "@/lib/commerce";
import {
  loyaltyDiscountFromPoints,
} from "@/lib/commerce/cart-pricing";
import { calculateShipping, calculateTax } from "@/lib/fulfillment-pricing";
import { ensureLocationPricingSchema, mapLocationPricing } from "@/lib/db/location-pricing";
import { ensureInventoryVisibilityColumn } from "@/lib/db/inventory-visibility";
import type { Prisma } from "@prisma/client";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges, onlyChanged } from "@/lib/activity/changes";
import { attachProfileExtras } from "@/lib/db/users";
import { saveOrderDelivery, hydrateOrderDelivery } from "@/lib/db/delivery";
import type { DeliveryAddress } from "@/types";
import {
  ensureOrganizationSchema,
  resolveLocationOrganizationId,
  SAMS_ORG_ID,
} from "@/lib/db/organization";
import { initialOrderStatus, availableStock } from "@/lib/commerce/order-status";
import * as loyaltyDb from "@/lib/db/loyalty";
import { syncOrganizationCustomer } from "@/lib/db/crm";

import { moneyNumber } from "@/lib/db/money";

function unitPriceForInventory(
  productPrice: number,
  inv?: {
    basePrice?: unknown;
    salePrice?: unknown;
    promoPrice?: unknown;
  } | null,
) {
  const sale = moneyNumber(inv?.salePrice);
  if (inv?.salePrice != null && sale > 0) return sale;
  const promo = moneyNumber(inv?.promoPrice);
  if (inv?.promoPrice != null && promo > 0) return promo;
  const base = moneyNumber(inv?.basePrice);
  if (inv?.basePrice != null && base > 0) return base;
  return productPrice;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function splitCsv(value: string | undefined, fallback: string[]) {
  if (value == null) return fallback;
  const next = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  return next.length ? next : fallback;
}

function composeProductImages(cover: string | undefined, extras: string[] | undefined, fallback: string[]) {
  const unique: string[] = [];
  for (const url of [cover ?? "", ...(extras ?? [])]) {
    const next = url.trim();
    if (next && !unique.includes(next)) unique.push(next);
  }
  return unique.length ? unique.slice(0, 8) : fallback;
}

export async function fetchAllProducts(): Promise<Product[]> {
  if (!isDbConfigured()) return seedProducts;
  const rows = await prisma.product.findMany({ orderBy: { name: "asc" } });
  return rows.map(mapProduct);
}

export async function fetchProductBySlug(slug: string) {
  if (!isDbConfigured()) return seedProducts.find((p) => p.slug === slug);
  const row = await prisma.product.findUnique({ where: { slug } });
  return row ? mapProduct(row) : undefined;
}

export async function fetchProductById(id: string) {
  if (!isDbConfigured()) return seedProducts.find((p) => p.id === id);
  const row = await prisma.product.findUnique({ where: { id } });
  return row ? mapProduct(row) : undefined;
}

export async function fetchAllLocations(opts?: { inventoryMode?: "full" | "featured" }) {
  const inventoryMode = opts?.inventoryMode ?? "full";
  if (!isDbConfigured()) {
    if (inventoryMode === "full") return seedLocations;
    return seedLocations.map((loc) => ({
      ...loc,
      inventory: loc.inventory.filter((row) => row.featured),
    }));
  }
  await ensureLocationPricingSchema();
  await ensureInventoryVisibilityColumn();
  const rows = await prisma.location.findMany({
    include: {
      inventory:
        inventoryMode === "featured"
          ? { where: { featured: true } }
          : true,
    },
    orderBy: { name: "asc" },
  });
  return rows.map(mapLocation);
}

export async function fetchLocationBySlug(slug: string) {
  if (!isDbConfigured()) return seedLocations.find((l) => l.slug === slug);
  await ensureLocationPricingSchema();
  await ensureInventoryVisibilityColumn();
  const row = await prisma.location.findUnique({
    where: { slug },
    include: { inventory: true },
  });
  return row ? mapLocation(row) : undefined;
}

export async function fetchLocationById(id: string) {
  if (!isDbConfigured()) return seedLocations.find((l) => l.id === id);
  await ensureLocationPricingSchema();
  await ensureInventoryVisibilityColumn();
  const row = await prisma.location.findUnique({
    where: { id },
    include: { inventory: true },
  });
  return row ? mapLocation(row) : undefined;
}

export async function fetchCategories() {
  if (!isDbConfigured()) return seedCategories;
  const rows = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return rows.map(mapCategory);
}

function normalizeColor(value: string | undefined) {
  const raw = (value ?? "#C9A962").trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  if (/^[0-9a-fA-F]{3,8}$/.test(raw)) return `#${raw}`;
  return "#C9A962";
}

export async function createShopCategory(
  input: { name: string; tagline?: string; description?: string; color?: string; slug?: string },
  actorUserId?: string,
) {
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  const name = input.name.trim();
  let slug = (input.slug?.trim() || slugify(name)).slice(0, 40);
  if (!slug) return { error: "Category name is required.", status: 400 as const };
  const taken = await prisma.category.findUnique({ where: { slug } });
  if (taken) {
    let n = 2;
    while (await prisma.category.findUnique({ where: { slug: `${slug}-${n}` } })) n += 1;
    slug = `${slug}-${n}`;
  }
  const row = await prisma.category.create({
    data: {
      slug,
      name,
      tagline: input.tagline?.trim() || "Collection",
      description: input.description?.trim() || `${name} bottles at Sam's Discount Liquor.`,
      color: normalizeColor(input.color),
    },
  });
  const category = mapCategory(row);
  await recordActivity({
    actorUserId,
    action: "category.created",
    entityType: "category",
    entityId: category.slug,
    summary: `Added category “${category.name}”`,
    metadata: {
      changes: [{ field: "created", to: category.name }],
    },
  });
  return { category };
}

export async function updateShopCategory(
  slug: string,
  input: { name?: string; tagline?: string; description?: string; color?: string },
  actorUserId?: string,
) {
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (!existing) return { error: "Category not found.", status: 404 as const };
  const row = await prisma.category.update({
    where: { slug },
    data: {
      name: input.name?.trim() || existing.name,
      tagline: input.tagline?.trim() || existing.tagline,
      description: input.description?.trim() || existing.description,
      color: input.color ? normalizeColor(input.color) : existing.color,
    },
  });
  const category = mapCategory(row);
  const changes = [];
  if (input.name !== undefined && input.name.trim() && input.name.trim() !== existing.name) {
    changes.push({ field: "name", from: existing.name, to: category.name });
  }
  if (input.tagline !== undefined && input.tagline.trim() !== existing.tagline) {
    changes.push({ field: "tagline", from: existing.tagline, to: category.tagline });
  }
  if (input.description !== undefined && input.description.trim() !== existing.description) {
    changes.push({ field: "description", from: existing.description, to: category.description });
  }
  if (input.color && normalizeColor(input.color) !== existing.color) {
    changes.push({ field: "color", from: existing.color, to: category.color });
  }
  await recordActivity({
    actorUserId,
    action: "category.updated",
    entityType: "category",
    entityId: category.slug,
    summary: `Updated category “${category.name}”`,
    metadata: changes.length ? { changes } : undefined,
  });
  return { category };
}

export async function deleteShopCategory(slug: string, actorUserId?: string) {
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (!existing) return { error: "Category not found.", status: 404 as const };
  const remaining = await prisma.category.count();
  if (remaining <= 1) {
    return { error: "The last category cannot be removed.", status: 409 as const };
  }
  const bottles = await prisma.product.count({ where: { categorySlug: slug } });
  if (bottles > 0) {
    return {
      error: `Move or delete the ${bottles} bottle${bottles === 1 ? "" : "s"} in this category first.`,
      status: 409 as const,
    };
  }
  await prisma.category.delete({ where: { slug } });
  await recordActivity({
    actorUserId,
    action: "category.deleted",
    entityType: "category",
    entityId: slug,
    summary: `Removed category “${existing.name}”`,
    metadata: {
      changes: [{ field: "deleted", from: existing.name, to: "(deleted)" }],
    },
  });
  return { ok: true as const, slug };
}

export async function fetchEvents() {
  if (!isDbConfigured()) return seedEvents;
  const { ensureEventSchema } = await import("@/lib/db/store-admin");
  await ensureEventSchema();
  const rows = await prisma.event.findMany({ orderBy: { date: "asc" } });
  const flags = await prisma.$queryRaw<{ id: string; active: boolean }[]>`
    SELECT id, active FROM events
  `;
  const activeById = new Map(flags.map((row) => [row.id, row.active]));
  return rows.map((row) => mapEvent({ ...row, active: activeById.get(row.id) ?? true }));
}

export async function fetchEventBySlug(slug: string) {
  if (!isDbConfigured()) return seedEvents.find((e) => e.slug === slug);
  const { ensureEventSchema } = await import("@/lib/db/store-admin");
  await ensureEventSchema();
  const row = await prisma.event.findUnique({ where: { slug } });
  if (!row) return undefined;
  const flags = await prisma.$queryRaw<{ active: boolean }[]>`
    SELECT active FROM events WHERE id = ${row.id}
  `;
  return mapEvent({ ...row, active: flags[0]?.active ?? true });
}

export async function fetchReviewsForProduct(productId: string) {
  if (!isDbConfigured()) return seedReviews.filter((r) => r.productId === productId);
  const rows = await prisma.review.findMany({
    where: { productId },
    orderBy: { date: "desc" },
  });
  return rows.map(mapReview);
}

export async function fetchInventoryState() {
  if (!isDbConfigured()) {
    const stocks: Record<string, number> = {};
    const reserved: Record<string, number> = {};
    const prices: Record<
      string,
      {
        basePrice: number | null;
        salePrice: number | null;
        costPrice: number | null;
        promoPrice: number | null;
      }
    > = {};
    const hidden: Record<string, boolean> = {};
    for (const loc of seedLocations) {
      for (const row of loc.inventory) {
        const key = `${loc.id}:${row.productId}`;
        stocks[key] = row.stock;
        reserved[key] = 0;
        prices[key] = {
          basePrice: null,
          salePrice: null,
          costPrice: null,
          promoPrice: null,
        };
        if (row.hidden) hidden[key] = true;
      }
    }
    const seats: Record<string, number> = {};
    for (const e of seedEvents) seats[e.id] = e.seatsAvailable;
    return { stocks, reserved, prices, seats, hidden };
  }

  await ensureInventoryVisibilityColumn();

  const rows = await prisma.$queryRaw<
    {
      location_id: string;
      product_id: string;
      on_hand: number;
      reserved: number;
      hidden: boolean;
      base_price: unknown;
      sale_price: unknown;
      cost_price: unknown;
      promo_price: unknown;
    }[]
  >`
    SELECT location_id, product_id, on_hand,
           COALESCE(reserved, 0) AS reserved,
           COALESCE(hidden, false) AS hidden,
           base_price, sale_price, cost_price, promo_price
    FROM location_inventory
  `;
  const stocks: Record<string, number> = {};
  const reserved: Record<string, number> = {};
  const prices: Record<
    string,
    {
      basePrice: number | null;
      salePrice: number | null;
      costPrice: number | null;
      promoPrice: number | null;
    }
  > = {};
  const hidden: Record<string, boolean> = {};
  for (const row of rows) {
    const key = `${row.location_id}:${row.product_id}`;
    stocks[key] = row.on_hand;
    reserved[key] = row.reserved ?? 0;
    prices[key] = {
      basePrice: row.base_price == null ? null : moneyNumber(row.base_price),
      salePrice: row.sale_price == null ? null : moneyNumber(row.sale_price),
      costPrice: row.cost_price == null ? null : moneyNumber(row.cost_price),
      promoPrice: row.promo_price == null ? null : moneyNumber(row.promo_price),
    };
    if (row.hidden) hidden[key] = true;
  }

  const events = await prisma.event.findMany();
  const seats: Record<string, number> = {};
  for (const e of events) seats[e.id] = e.seatsAvailable;

  return { stocks, reserved, prices, seats, hidden };
}

export async function setProductVisibility(
  locationId: string,
  productId: string,
  hidden: boolean,
  actorUserId?: string,
) {
  if (!isDbConfigured()) return { hidden };
  await ensureInventoryVisibilityColumn();

  const existing = await prisma.locationInventory.findUnique({
    where: { locationId_productId: { locationId, productId } },
  });
  if (existing) {
    await prisma.$executeRaw`
      UPDATE location_inventory
      SET hidden = ${hidden}
      WHERE location_id = ${locationId} AND product_id = ${productId}
    `;
  } else {
    await prisma.locationInventory.create({
      data: {
        locationId,
        productId,
        seedStock: 0,
        onHand: 0,
        featured: false,
      },
    });
    await prisma.$executeRaw`
      UPDATE location_inventory
      SET hidden = ${hidden}
      WHERE location_id = ${locationId} AND product_id = ${productId}
    `;
  }

  await recordActivity({
    actorUserId,
    action: "inventory.visibility",
    entityType: "inventory",
    entityId: productId,
    locationId,
    summary: `${hidden ? "Hid" : "Showed"} bottle on this store's website`,
    metadata: activityChanges(
      [
        {
          field: "visibility",
          from: existing?.hidden ? "Hidden" : "Visible",
          to: hidden ? "Hidden" : "Visible",
        },
      ],
      { productId, hidden },
    ),
  });

  return { hidden, inventory: await fetchInventoryState() };
}

export async function fetchUserByEmail(email: string): Promise<UserProfile | null> {
  if (!isDbConfigured()) {
    if (email === demoUser.email) return demoUser;
    return null;
  }
  const row = await prisma.user.findUnique({
    where: { email },
    include: {
      orders: {
        include: { items: true },
        orderBy: { date: "desc" },
      },
    },
  });
  if (!row) return null;
  const orders = await Promise.all(row.orders.map((order) => hydrateOrderDelivery(mapOrder(order))));
  return attachProfileExtras(mapUser(row, orders));
}

/** Auth/session profile — no order history (keeps refresh + /me fast). */
export async function fetchSessionUser(id: string): Promise<UserProfile | null> {
  if (!isDbConfigured()) {
    if (id === demoUser.id) return { ...demoUser, orders: [] };
    return null;
  }
  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) return null;
  return attachProfileExtras(mapUser(row, []));
}

export async function fetchUserById(id: string): Promise<UserProfile | null> {
  if (!isDbConfigured()) {
    if (id === demoUser.id) return demoUser;
    return null;
  }
  const row = await prisma.user.findUnique({
    where: { id },
    include: {
      orders: {
        include: { items: true },
        orderBy: { date: "desc" },
      },
    },
  });
  if (!row) return null;
  const orders = await Promise.all(row.orders.map((order) => hydrateOrderDelivery(mapOrder(order))));
  return attachProfileExtras(mapUser(row, orders));
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<
    Pick<UserProfile, "name" | "preferredBranchId" | "recentlyViewed" | "addresses">
  >,
) {
  if (!isDbConfigured()) return;
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredBranchId: true, addresses: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: patch,
  });
  if (patch.preferredBranchId || patch.addresses) {
    const changes = onlyChanged([
      {
        field: "preferred branch",
        from: existing?.preferredBranchId ?? "(none)",
        to: patch.preferredBranchId ?? existing?.preferredBranchId ?? "(none)",
      },
      {
        field: "addresses",
        from: Array.isArray(existing?.addresses) ? existing.addresses.length : 0,
        to: Array.isArray(patch.addresses)
          ? patch.addresses.length
          : Array.isArray(existing?.addresses)
            ? existing.addresses.length
            : 0,
      },
    ]).filter((c) => {
      if (c.field === "preferred branch" && !patch.preferredBranchId) return false;
      if (c.field === "addresses" && !patch.addresses) return false;
      return true;
    });
    if (changes.length) {
      await recordActivity({
        actorUserId: userId,
        action: "user.profile_updated",
        entityType: "profile",
        entityId: userId,
        summary: patch.preferredBranchId
          ? `Updated preferred branch to ${patch.preferredBranchId}`
          : "Updated saved addresses",
        metadata: activityChanges(changes),
      });
    }
  }
}

export async function redeemUserLoyaltyPoints(
  userId: string,
  points: number,
  organizationId?: string,
  orderId?: string | null,
) {
  if (!isDbConfigured()) return true;
  const orgId = organizationId ?? SAMS_ORG_ID;
  await loyaltyDb.redeemLoyaltyPoints({
    organizationId: orgId,
    userId,
    points,
    orderId,
  });
  await recordActivity({
    actorUserId: userId,
    action: "user.points_redeemed",
    entityType: "profile",
    entityId: userId,
    summary: `Redeemed ${points} loyalty points`,
    metadata: activityChanges([{ field: "points", to: `-${points}` }], {
      points,
      organizationId: orgId,
      orderId: orderId ?? null,
    }),
  });
  return true;
}

type Tx = Prisma.TransactionClient;

export class StockConflictError extends Error {
  shortfalls: { productId: string; requested: number; onHand: number }[];
  constructor(shortfalls: { productId: string; requested: number; onHand: number }[]) {
    super("Insufficient stock for one or more items.");
    this.name = "StockConflictError";
    this.shortfalls = shortfalls;
  }
}

async function writeStockChange(
  tx: Tx,
  locationId: string,
  productId: string,
  nextQty: number,
  reason: string,
  orderId?: string,
) {
  const existing = await tx.locationInventory.findUnique({
    where: { locationId_productId: { locationId, productId } },
  });
  const current = existing?.onHand ?? 0;
  const delta = nextQty - current;

  await tx.locationInventory.upsert({
    where: { locationId_productId: { locationId, productId } },
    create: {
      locationId,
      productId,
      seedStock: nextQty,
      onHand: nextQty,
    },
    update: { onHand: nextQty },
  });

  if (delta !== 0) {
    await tx.inventoryLedger.create({
      data: {
        locationId,
        productId,
        delta,
        onHandAfter: nextQty,
        reason,
        orderId,
      },
    });
  }

  return nextQty;
}

export async function createCustomProduct(
  input: NewBottleInput,
  allSlugs: string[],
  actorUserId?: string,
) {
  const baseSlug = slugify(`${input.brand} ${input.name}`) || "new-bottle";
  let slug = baseSlug;
  let n = 2;
  const taken = new Set(allSlugs);
  while (taken.has(slug)) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  const id = `custom-${slug}-${Date.now().toString(36)}`;
  const notes = splitCsv(input.tastingNotes, ["To taste"]);
  const pairings = splitCsv(input.foodPairings, []);
  const imageFallback =
    seedProducts[0]?.images[0] || "/products/market/buffalo-trace-bourbon.jpg";
  const images = composeProductImages(input.imageUrl, input.images, [imageFallback]);

  const product: Product = {
    id,
    slug,
    name: input.name.trim(),
    brand: input.brand.trim(),
    category: input.category,
    description: input.description.trim() || `${input.name} from ${input.brand}.`,
    brandStory:
      input.brandStory?.trim() || `${input.brand} — added to Sam's Discount Liquor collection.`,
    origin: input.origin.trim() || "Unknown",
    country: input.country.trim() || "USA",
    abv: input.abv,
    volumeMl: input.volumeMl,
    price: input.price,
    compareAtPrice: input.compareAtPrice && input.compareAtPrice > 0 ? input.compareAtPrice : undefined,
    costPrice: input.costPrice && input.costPrice > 0 ? input.costPrice : undefined,
    sku: input.sku?.trim() || undefined,
    upc: input.upc?.trim() || undefined,
    minQty: input.minQty ?? 1,
    maxQty: input.maxQty ?? undefined,
    rating: 0,
    reviewCount: 0,
    tastingNotes: notes,
    foodPairings: pairings,
    cocktails: [],
    images,
    color: "#2a1a12",
    accentColor: "#c9a962",
    labelColor: "#f3ead7",
    bottleHeight: 1,
    isPremium: input.isPremium,
    isImported: input.isImported,
    tags: ["owner-added"],
    glbUrl: `/models/bottles/${slug}.glb`,
  };

  if (!isDbConfigured()) return { product, inventory: await fetchInventoryState() };

  await prisma.$transaction(async (tx) => {
    await tx.product.create({
      data: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        categorySlug: product.category,
        description: product.description,
        brandStory: product.brandStory,
        origin: product.origin,
        country: product.country,
        abv: product.abv,
        volumeMl: product.volumeMl,
        price: product.price,
        compareAtPrice: product.compareAtPrice ?? null,
        costPrice: product.costPrice ?? null,
        sku: product.sku ?? null,
        upc: product.upc ?? null,
        minQty: product.minQty ?? 1,
        maxQty: product.maxQty ?? null,
        rating: product.rating,
        reviewCount: product.reviewCount,
        tastingNotes: product.tastingNotes,
        foodPairings: product.foodPairings,
        cocktails: product.cocktails,
        images: product.images,
        color: product.color,
        accentColor: product.accentColor,
        labelColor: product.labelColor,
        bottleHeight: product.bottleHeight,
        isPremium: product.isPremium,
        isImported: product.isImported,
        tags: product.tags,
        glbUrl: product.glbUrl,
        isCustom: true,
      },
    });

    const locations = await tx.location.findMany({ select: { id: true } });
    const qty = Math.floor(input.initialStock);
    const targetIds =
      input.stockLocationIds && input.stockLocationIds.length > 0
        ? new Set(input.stockLocationIds)
        : new Set(locations.map((l) => l.id));

    await tx.locationInventory.createMany({
      data: locations.map((loc) => {
        const stock = targetIds.has(loc.id) ? qty : 0;
        return {
          locationId: loc.id,
          productId: product.id,
          seedStock: stock,
          onHand: stock,
        };
      }),
    });
  });

  await recordActivity({
    actorUserId,
    action: "catalog.created",
    entityType: "product",
    entityId: product.id,
    summary: `Added bottle “${product.name}” (${product.brand}) with ${Math.floor(input.initialStock)} units`,
    metadata: activityChanges(
      [
        { field: "created", to: product.name },
        { field: "brand", to: product.brand },
        { field: "category", to: product.category },
        { field: "price", to: `$${Number(product.price).toFixed(2)}` },
        { field: "initial stock", to: Math.floor(input.initialStock) },
      ],
      {
        brand: product.brand,
        category: product.category,
        initialStock: Math.floor(input.initialStock),
        stockLocationIds: input.stockLocationIds ?? "all",
      },
    ),
  });

  return { product, inventory: await fetchInventoryState() };
}

export async function deleteCustomProduct(productId: string, actorUserId?: string) {
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) return { error: "Bottle not found.", status: 404 as const };
  if (!existing.isCustom) {
    return { error: "Seed catalog bottles cannot be deleted.", status: 400 as const };
  }
  const sold = await prisma.orderItem.count({ where: { productId } });
  if (sold > 0) {
    return { error: "This bottle is on past orders and cannot be deleted.", status: 409 as const };
  }
  await prisma.$transaction(async (tx) => {
    await tx.locationInventory.deleteMany({ where: { productId } });
    await tx.review.deleteMany({ where: { productId } });
    await tx.inventoryLedger.deleteMany({ where: { productId } });
    await tx.product.delete({ where: { id: productId } });
  });
  await recordActivity({
    actorUserId,
    action: "catalog.deleted",
    entityType: "product",
    entityId: productId,
    summary: `Removed bottle “${existing.name}” (${existing.brand})`,
    metadata: activityChanges([
      { field: "deleted", from: existing.name, to: "(deleted)" },
      { field: "brand", from: existing.brand, to: "(deleted)" },
    ]),
  });
  return { ok: true as const, id: productId, inventory: await fetchInventoryState() };
}

export async function updateCatalogProduct(
  productId: string,
  input: Partial<Omit<NewBottleInput, "initialStock" | "stockLocationIds">>,
  actorUserId?: string,
) {
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) return { error: "Bottle not found.", status: 404 as const };
  const mapped = mapProduct(existing);
  const tastingNotes = splitCsv(input.tastingNotes, mapped.tastingNotes);
  const foodPairings = splitCsv(input.foodPairings, mapped.foodPairings);
  const images = composeProductImages(input.imageUrl, input.images, mapped.images);
  const compareAtPrice =
    input.compareAtPrice === undefined
      ? existing.compareAtPrice
      : input.compareAtPrice && input.compareAtPrice > 0
        ? input.compareAtPrice
        : null;

  const row = await prisma.product.update({
    where: { id: productId },
    data: {
      name: input.name?.trim() ?? existing.name,
      brand: input.brand?.trim() ?? existing.brand,
      categorySlug: input.category ?? existing.categorySlug,
      description: input.description?.trim() || existing.description,
      brandStory: input.brandStory?.trim() || existing.brandStory,
      origin: input.origin?.trim() || existing.origin,
      country: input.country?.trim() || existing.country,
      abv: input.abv ?? existing.abv,
      volumeMl: input.volumeMl ?? existing.volumeMl,
      price: input.price ?? existing.price,
      compareAtPrice,
      costPrice:
        input.costPrice === undefined
          ? existing.costPrice
          : input.costPrice && input.costPrice > 0
            ? input.costPrice
            : null,
      sku: input.sku !== undefined ? input.sku.trim() || null : existing.sku,
      upc: input.upc !== undefined ? input.upc.trim() || null : existing.upc,
      minQty: input.minQty ?? existing.minQty,
      maxQty:
        input.maxQty === undefined
          ? existing.maxQty
          : input.maxQty && input.maxQty > 0
            ? input.maxQty
            : null,
      tastingNotes,
      foodPairings,
      images,
      isPremium: input.isPremium ?? existing.isPremium,
      isImported: input.isImported ?? existing.isImported,
    },
  });
  const product = mapProduct(row);
  const money = (n: number | null | undefined) =>
    n == null || n <= 0 ? "(none)" : `$${Number(n).toFixed(2)}`;
  const list = (arr: string[]) => (arr.length ? arr.join(", ") : "(none)");
  const changes = onlyChanged([
    { field: "name", from: mapped.name, to: product.name },
    { field: "brand", from: mapped.brand, to: product.brand },
    { field: "category", from: mapped.category, to: product.category },
    { field: "description", from: mapped.description, to: product.description },
    { field: "brand story", from: mapped.brandStory, to: product.brandStory },
    { field: "origin", from: mapped.origin, to: product.origin },
    { field: "country", from: mapped.country, to: product.country },
    { field: "abv", from: mapped.abv, to: product.abv },
    { field: "volume", from: `${mapped.volumeMl}ml`, to: `${product.volumeMl}ml` },
    { field: "price", from: money(mapped.price), to: money(product.price) },
    {
      field: "compare at",
      from: money(mapped.compareAtPrice),
      to: money(product.compareAtPrice),
    },
    { field: "cost", from: money(mapped.costPrice), to: money(product.costPrice) },
    { field: "sku", from: mapped.sku ?? "(none)", to: product.sku ?? "(none)" },
    { field: "upc", from: mapped.upc ?? "(none)", to: product.upc ?? "(none)" },
    { field: "min qty", from: mapped.minQty, to: product.minQty },
    {
      field: "max qty",
      from: mapped.maxQty ?? "(none)",
      to: product.maxQty ?? "(none)",
    },
    {
      field: "tasting notes",
      from: list(mapped.tastingNotes),
      to: list(product.tastingNotes),
    },
    {
      field: "food pairings",
      from: list(mapped.foodPairings),
      to: list(product.foodPairings),
    },
    {
      field: "images",
      from: mapped.images.length,
      to: product.images.length,
    },
    {
      field: "premium",
      from: mapped.isPremium ? "Yes" : "No",
      to: product.isPremium ? "Yes" : "No",
    },
    {
      field: "imported",
      from: mapped.isImported ? "Yes" : "No",
      to: product.isImported ? "Yes" : "No",
    },
  ]);
  if (changes.length) {
    await recordActivity({
      actorUserId,
      action: "catalog.updated",
      entityType: "product",
      entityId: product.id,
      summary: `Updated bottle “${product.name}” (${product.brand}) — ${changes.length} field${
        changes.length === 1 ? "" : "s"
      }`,
      metadata: activityChanges(changes, {
        brand: product.brand,
        category: product.category,
        price: product.price,
      }),
    });
  }
  return { product };
}

async function logStockActivity(opts: {
  actorUserId?: string;
  locationId: string;
  productId?: string;
  reason: string;
  quantity?: number;
  previousQuantity?: number;
  delta?: number;
}) {
  const location =
    opts.locationId && opts.locationId !== "all"
      ? await prisma.location.findUnique({
          where: { id: opts.locationId },
          select: { shortName: true },
        })
      : null;
  const product = opts.productId
    ? await prisma.product.findUnique({
        where: { id: opts.productId },
        select: { name: true },
      })
    : null;
  const branch = location?.shortName ?? (opts.locationId === "all" ? "all stores" : opts.locationId);
  const bottle = product?.name ?? opts.productId ?? "catalog";
  const action =
    opts.reason === "restock"
      ? "inventory.restock"
      : opts.reason === "reset"
        ? "inventory.reset"
        : typeof opts.delta === "number"
          ? "inventory.adjust"
          : "inventory.set";
  const summary =
    action === "inventory.reset"
      ? `Reset inventory to catalog seed at ${branch}`
      : action === "inventory.restock"
        ? `Restocked ${bottle} at ${branch}${typeof opts.quantity === "number" ? ` to ${opts.quantity}` : typeof opts.delta === "number" ? ` (${opts.delta > 0 ? "+" : ""}${opts.delta})` : ""}`
        : typeof opts.delta === "number"
          ? `Adjusted ${bottle} at ${branch} by ${opts.delta > 0 ? "+" : ""}${opts.delta}`
          : `Set ${bottle} at ${branch} to ${opts.quantity ?? 0} on hand`;

  const changes: { field: string; from?: unknown; to?: unknown }[] = [];
  if (typeof opts.previousQuantity === "number" && typeof opts.quantity === "number") {
    changes.push({ field: "quantity", from: opts.previousQuantity, to: opts.quantity });
  } else if (typeof opts.quantity === "number") {
    changes.push({ field: "quantity", to: opts.quantity });
  }
  if (typeof opts.delta === "number") {
    changes.push({
      field: "delta",
      to: `${opts.delta > 0 ? "+" : ""}${opts.delta}`,
    });
  }
  if (action === "inventory.reset") {
    changes.push({ field: "reset", to: "seed stock" });
  }

  await recordActivity({
    actorUserId: opts.actorUserId,
    action,
    entityType: "inventory",
    entityId: opts.productId,
    summary,
    locationId: opts.locationId === "all" ? undefined : opts.locationId,
    metadata: activityChanges(changes, {
      reason: opts.reason,
      quantity: opts.quantity,
      delta: opts.delta,
    }),
  });
}

export async function setInventoryOnHand(
  locationId: string,
  productId: string,
  quantity: number,
  reason: string,
  orderId?: string,
  actorUserId?: string,
) {
  if (!isDbConfigured()) return quantity;
  const nextQty = Math.max(0, Math.floor(quantity));
  const existing = await prisma.locationInventory.findUnique({
    where: { locationId_productId: { locationId, productId } },
    select: { onHand: true },
  });
  const previousQuantity = existing?.onHand ?? 0;
  await prisma.$transaction((tx) =>
    writeStockChange(tx, locationId, productId, nextQty, reason, orderId),
  );
  await logStockActivity({
    actorUserId,
    locationId,
    productId,
    reason,
    previousQuantity,
    quantity: nextQty,
    delta: nextQty - previousQuantity,
  });
  return nextQty;
}

export async function adjustInventory(
  locationId: string,
  productId: string,
  delta: number,
  reason: string,
  orderId?: string,
  actorUserId?: string,
) {
  if (!isDbConfigured()) return true;
  if (!delta) return true;

  await ensureInventoryVisibilityColumn();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.locationInventory.findUnique({
      where: { locationId_productId: { locationId, productId } },
    });
    const current = existing?.onHand ?? 0;
    const nextQty = current + delta;
    if (nextQty < 0) return null;
    await writeStockChange(tx, locationId, productId, nextQty, reason, orderId);
    return { previousQuantity: current, quantity: nextQty };
  });
  if (result) {
    await logStockActivity({
      actorUserId,
      locationId,
      productId,
      reason,
      previousQuantity: result.previousQuantity,
      quantity: result.quantity,
      delta,
    });
  }
  return Boolean(result);
}

async function deductOrderStockTx(
  tx: Tx,
  locationId: string,
  items: Pick<CartItem, "productId" | "quantity">[],
  orderId: string,
) {
  const shortfalls: { productId: string; requested: number; onHand: number }[] = [];

  for (const item of items) {
    // Atomic: POS / immediate sale cannot take bottles held for online orders.
    const affected = await tx.$executeRaw`
      UPDATE location_inventory
      SET on_hand = on_hand - ${item.quantity}
      WHERE location_id = ${locationId}
        AND product_id = ${item.productId}
        AND (on_hand - COALESCE(reserved, 0)) >= ${item.quantity}
    `;

    if (Number(affected) !== 1) {
      const row = await tx.locationInventory.findUnique({
        where: { locationId_productId: { locationId, productId: item.productId } },
      });
      const reserved = (row as { reserved?: number } | null)?.reserved ?? 0;
      shortfalls.push({
        productId: item.productId,
        requested: item.quantity,
        onHand: availableStock(row?.onHand ?? 0, reserved),
      });
    }
  }

  if (shortfalls.length) throw new StockConflictError(shortfalls);

  for (const item of items) {
    const row = await tx.locationInventory.findUnique({
      where: { locationId_productId: { locationId, productId: item.productId } },
    });
    await tx.inventoryLedger.create({
      data: {
        locationId,
        productId: item.productId,
        delta: -item.quantity,
        onHandAfter: row?.onHand ?? 0,
        reason: "sale",
        orderId,
      },
    });
  }
}

/** Hold stock for online orders without decrementing on-hand yet. */
async function reserveOrderStockTx(
  tx: Tx,
  locationId: string,
  items: Pick<CartItem, "productId" | "quantity">[],
  orderId: string,
) {
  const shortfalls: { productId: string; requested: number; onHand: number }[] = [];

  for (const item of items) {
    const affected = await tx.$executeRaw`
      UPDATE location_inventory
      SET reserved = COALESCE(reserved, 0) + ${item.quantity}
      WHERE location_id = ${locationId}
        AND product_id = ${item.productId}
        AND (on_hand - COALESCE(reserved, 0)) >= ${item.quantity}
    `;

    if (Number(affected) !== 1) {
      const row = await tx.locationInventory.findUnique({
        where: { locationId_productId: { locationId, productId: item.productId } },
      });
      const reserved = (row as { reserved?: number } | null)?.reserved ?? 0;
      shortfalls.push({
        productId: item.productId,
        requested: item.quantity,
        onHand: availableStock(row?.onHand ?? 0, reserved),
      });
      continue;
    }

    const row = await tx.locationInventory.findUnique({
      where: { locationId_productId: { locationId, productId: item.productId } },
    });
    await tx.inventoryLedger.create({
      data: {
        locationId,
        productId: item.productId,
        delta: item.quantity,
        onHandAfter: row?.onHand ?? 0,
        reason: "reserve",
        orderId,
      },
    });
  }

  if (shortfalls.length) throw new StockConflictError(shortfalls);
}

/** Convert reserved → sold when staff accepts / starts preparing. */
async function commitReservedStockTx(
  tx: Tx,
  locationId: string,
  items: Pick<CartItem, "productId" | "quantity">[],
  orderId: string,
) {
  for (const item of items) {
    const before = await tx.locationInventory.findUnique({
      where: { locationId_productId: { locationId, productId: item.productId } },
    });
    if (!before) continue;
    const reservedBefore = (before as { reserved?: number }).reserved ?? 0;
    const releaseQty = Math.min(reservedBefore, item.quantity);

    const affected = await tx.$executeRaw`
      UPDATE location_inventory
      SET on_hand = on_hand - ${item.quantity},
          reserved = GREATEST(0, COALESCE(reserved, 0) - ${item.quantity})
      WHERE location_id = ${locationId}
        AND product_id = ${item.productId}
        AND on_hand >= ${item.quantity}
    `;
    if (Number(affected) !== 1) {
      throw new StockConflictError([
        {
          productId: item.productId,
          requested: item.quantity,
          onHand: before.onHand ?? 0,
        },
      ]);
    }

    const row = await tx.locationInventory.findUnique({
      where: { locationId_productId: { locationId, productId: item.productId } },
    });
    const nextOnHand = row?.onHand ?? 0;

    await tx.inventoryLedger.create({
      data: {
        locationId,
        productId: item.productId,
        delta: -item.quantity,
        onHandAfter: nextOnHand,
        reason: "sale",
        orderId,
      },
    });

    if (releaseQty > 0) {
      await tx.inventoryLedger.create({
        data: {
          locationId,
          productId: item.productId,
          delta: -releaseQty,
          onHandAfter: nextOnHand,
          reason: "release",
          orderId,
        },
      });
    }
  }
}

async function releaseReservedStockTx(
  tx: Tx,
  locationId: string,
  items: Pick<CartItem, "productId" | "quantity">[],
  orderId: string,
) {
  for (const item of items) {
    const before = await tx.locationInventory.findUnique({
      where: { locationId_productId: { locationId, productId: item.productId } },
    });
    if (!before) continue;
    const reserved = (before as { reserved?: number }).reserved ?? 0;
    const releaseQty = Math.min(reserved, item.quantity);
    if (!releaseQty) continue;

    await tx.$executeRaw`
      UPDATE location_inventory
      SET reserved = GREATEST(0, COALESCE(reserved, 0) - ${releaseQty})
      WHERE location_id = ${locationId}
        AND product_id = ${item.productId}
    `;

    await tx.inventoryLedger.create({
      data: {
        locationId,
        productId: item.productId,
        delta: -releaseQty,
        onHandAfter: before.onHand ?? 0,
        reason: "release",
        orderId,
      },
    });
  }
}

export async function commitReservedStockForOrder(
  tx: Prisma.TransactionClient,
  locationId: string,
  items: Pick<CartItem, "productId" | "quantity">[],
  orderId: string,
) {
  await commitReservedStockTx(tx, locationId, items, orderId);
}

export async function deductOrderStock(
  locationId: string,
  items: Pick<CartItem, "productId" | "quantity">[],
  orderId: string,
) {
  if (!isDbConfigured()) return { ok: true as const };

  try {
    await prisma.$transaction((tx) => deductOrderStockTx(tx, locationId, items, orderId));
    return { ok: true as const };
  } catch (error) {
    if (error instanceof StockConflictError) {
      return { ok: false as const, shortfalls: error.shortfalls };
    }
    throw error;
  }
}

export async function bookEventSeats(eventId: string, qty: number, actorUserId?: string) {
  if (!isDbConfigured()) return true;
  if (qty <= 0) return false;

  const { ensureEventSchema } = await import("@/lib/db/store-admin");
  await ensureEventSchema();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return false;
  const flags = await prisma.$queryRaw<{ active: boolean }[]>`
    SELECT active FROM events WHERE id = ${eventId}
  `;
  if (flags[0]?.active === false) return false;
  const result = await prisma.event.updateMany({
    where: { id: eventId, seatsAvailable: { gte: qty } },
    data: { seatsAvailable: { decrement: qty } },
  });
  if (result.count === 1) {
    await recordActivity({
      actorUserId,
      action: "event.booked",
      entityType: "event",
      entityId: eventId,
      locationId: event.locationId,
      summary: `Booked ${qty} seat${qty === 1 ? "" : "s"} for “${event.title}”`,
      metadata: activityChanges(
        [
          {
            field: "seats available",
            from: event.seatsAvailable,
            to: event.seatsAvailable - qty,
          },
          { field: "seats booked", to: qty },
        ],
        { qty, guestName: actorUserId ? undefined : "guest" },
      ),
    });
  }
  return result.count === 1;
}

async function ensureCustomer(
  tx: Tx,
  input: { email: string; name: string; userId?: string; preferredBranchId: string },
) {
  const email = input.email.trim().toLowerCase();
  // Authenticated checkout: only the session user may own the order.
  if (input.userId) {
    const byId = await tx.user.findUnique({ where: { id: input.userId } });
    if (!byId || !byId.active) {
      throw new Error("Signed-in account is not available for checkout.");
    }
    return byId;
  }
  // Guest checkout: if the email already belongs to an account, require sign-in
  // so strangers cannot attach orders to someone else's history.
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) {
    const auth = await tx.$queryRaw<{ password_hash: string | null }[]>`
      SELECT password_hash FROM users WHERE id = ${existing.id} LIMIT 1
    `;
    if (auth[0]?.password_hash) {
      throw new Error("An account with this email already exists. Sign in to place the order.");
    }
    return existing;
  }
  return tx.user.create({
    data: {
      id: `u-${crypto.randomUUID()}`,
      email,
      name: input.name.trim(),
      role: "customer",
      preferredBranchId: input.preferredBranchId,
      loyaltyPoints: 0,
      loyaltyTier: "Member",
      addresses: [],
      recentlyViewed: [],
      permissionGrants: [],
      permissionRevokes: [],
    },
  });
}

export async function placeOrder(input: {
  email: string;
  name: string;
  phone?: string;
  userId?: string;
  locationId: string;
  fulfillment: Order["fulfillment"];
  items: Pick<CartItem, "productId" | "quantity">[];
  coupon?: string | null;
  loyaltyPointsRedeem?: number;
  delivery?: DeliveryAddress;
  /** When set, activity log uses this actor (e.g. POS cashier) instead of the customer. */
  activityActorUserId?: string;
  activityAction?: "order.placed" | "pos.sale";
  activityMetadata?: Record<string, unknown>;
}) {
  if (!isDbConfigured()) {
    throw new Error("Database is not configured.");
  }

  await ensureInventoryVisibilityColumn();
  await ensureLocationPricingSchema();
  await ensureOrganizationSchema();

  const organizationId =
    (await resolveLocationOrganizationId(input.locationId)) ?? SAMS_ORG_ID;

  const result = await prisma.$transaction(async (tx) => {
    const location = await tx.location.findUnique({
      where: { id: input.locationId },
      include: { inventory: true },
    });
    if (!location) throw new Error("Location not found.");
    const pricing = mapLocationPricing(location);
    if (input.fulfillment === "delivery" && !pricing.deliveryAvailable) {
      throw new Error("Delivery is not available from this store.");
    }
    if (input.fulfillment === "pickup" && !location.pickupAvailable) {
      throw new Error("Pickup is not available from this store.");
    }

    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const orderItems: Order["items"] = [];
    let subtotal = 0;
    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Unknown product: ${item.productId}`);
      const inv = location.inventory.find((row) => row.productId === item.productId);
      if ((inv as { hidden?: boolean } | undefined)?.hidden) {
        throw new Error(`${product.name} is not available at this store.`);
      }
      const unitPrice = unitPriceForInventory(moneyNumber(product.price), inv);
      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: unitPrice,
      });
      subtotal += unitPrice * item.quantity;
    }

    const promoItems = orderItems.map((item) => {
      const product = productMap.get(item.productId);
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        category: product?.categorySlug,
        brand: product?.brand,
      };
    });

    let isFirstOrder: boolean | undefined;
    if (input.userId) {
      const prior = await tx.order.count({ where: { userId: input.userId } });
      isFirstOrder = prior === 0;
    }

    const promo = await resolvePromotionDiscount({
      code: input.coupon,
      subtotal,
      organizationId,
      locationId: input.locationId,
      items: promoItems,
      isFirstOrder,
    });
    const promoDiscount =
      promo?.discount ??
      (input.coupon ? getCouponDiscount(input.coupon, subtotal) : 0);

    let loyaltyDiscount = 0;
    let loyaltyPointsUsed = 0;
    const requestedPoints = Math.max(0, Math.trunc(input.loyaltyPointsRedeem ?? 0));
    if (requestedPoints > 0 && input.userId) {
      const program = await loyaltyDb.getLoyaltyProgram(organizationId);
      if (!program?.active) {
        throw new Error("Loyalty redemptions are not available right now.");
      }
      const orgBalance = await loyaltyDb.getOrgLoyaltyBalance(organizationId, input.userId);
      const rate = program.redeemRate ?? 0.02;
      const maxDiscount = Math.max(0, subtotal - promoDiscount);
      const rewards = Array.isArray(program.rewards)
        ? (program.rewards as { points: number; value: number }[])
        : [];
      const loyalty = loyaltyDiscountFromPoints({
        points: Math.min(requestedPoints, orgBalance.points),
        redeemRate: rate,
        maxDiscount,
        rewards,
      });
      loyaltyDiscount = loyalty.discount;
      loyaltyPointsUsed = loyalty.points;
    }

    const discount = Math.round((promoDiscount + loyaltyDiscount) * 100) / 100;
    let shipping = calculateShipping(subtotal - discount, input.fulfillment, pricing);
    if (promo?.freeDelivery) shipping = 0;
    const tax = calculateTax(subtotal - discount, pricing);
    const total = Math.max(0, Math.round((subtotal - discount + shipping + tax) * 100) / 100);
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(
      Math.random() * 900 + 100,
    )}`;
    const status = initialOrderStatus(input.fulfillment) as Order["status"];
    const order: Order = {
      id: orderId,
      date: new Date().toISOString().slice(0, 10),
      status,
      items: orderItems,
      total,
      subtotal,
      taxAmount: tax,
      discountAmount: discount,
      deliveryFee: shipping,
      paymentStatus: "paid",
      fulfillment: input.fulfillment,
      locationId: input.locationId,
      organizationId,
      tracking:
        input.fulfillment === "delivery"
          ? `SDL-${Math.floor(Math.random() * 1e8)
              .toString()
              .padStart(8, "0")}`
          : undefined,
      delivery: input.fulfillment === "delivery" ? input.delivery : undefined,
      deliveryStatus: input.fulfillment === "delivery" ? "unassigned" : undefined,
      couponCode: input.coupon?.trim().toUpperCase() || undefined,
      promotionId: promo?.id,
    };

    const user = await ensureCustomer(tx, {
      email: input.email,
      name: input.name,
      userId: input.userId,
      preferredBranchId: input.locationId,
    });

    if (status === "completed" || input.fulfillment === "pos") {
      await deductOrderStockTx(tx, input.locationId, input.items, order.id);
    } else {
      await reserveOrderStockTx(tx, input.locationId, input.items, order.id);
    }

    await tx.order.create({
      data: {
        id: order.id,
        userId: user.id,
        organizationId,
        date: order.date,
        status: order.status,
        paymentStatus: "paid",
        total: order.total,
        subtotal,
        taxAmount: tax,
        discountAmount: discount,
        deliveryFee: shipping,
        fulfillment: order.fulfillment,
        locationId: order.locationId,
        tracking: order.tracking,
        couponCode: order.couponCode,
        promotionId: order.promotionId,
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
    });

    return {
      order,
      userId: user.id,
      loyaltyPointsUsed,
      organizationId,
    };
  });

  if (input.fulfillment === "delivery") {
    if (!input.delivery) {
      throw new Error("Delivery address is required for delivery orders.");
    }
    await saveOrderDelivery(result.order.id, input.delivery);
  }

  if (result.loyaltyPointsUsed > 0) {
    try {
      await redeemUserLoyaltyPoints(
        result.userId,
        result.loyaltyPointsUsed,
        result.organizationId,
        result.order.id,
      );
    } catch (error) {
      console.error("[placeOrder] loyalty redeem failed — cancelling order", error);
      try {
        await cancelOrder(result.order.id, result.userId);
      } catch (cancelError) {
        console.error("[placeOrder] cancel after redeem failure failed", cancelError);
      }
      throw new Error(
        error instanceof Error
          ? error.message
          : "Could not redeem loyalty points. Order was not completed.",
      );
    }
  }

  const skipEarn =
    input.activityAction === "pos.sale" && Boolean(input.activityMetadata?.walkIn);

  let loyalty = { points: 0, balance: 0 };
  if (!skipEarn) {
    const earnBase = Math.max(
      0,
      (result.order.subtotal ?? result.order.total) - (result.order.discountAmount ?? 0),
    );
    loyalty = await loyaltyDb.earnLoyaltyPoints({
      organizationId: result.organizationId,
      userId: result.userId,
      orderTotal: earnBase,
      orderId: result.order.id,
    });
  }

  await syncOrganizationCustomer({
    organizationId: result.organizationId,
    userId: result.userId,
    orderTotal: result.order.total,
  });

  await recordActivity({
    actorUserId: input.activityActorUserId ?? result.userId,
    action: input.activityAction ?? "order.placed",
    entityType: "order",
    entityId: result.order.id,
    locationId: result.order.locationId,
    summary:
      input.activityAction === "pos.sale"
        ? `POS ${result.order.fulfillment} sale ${result.order.id} for $${result.order.total.toFixed(2)}`
        : `Placed ${result.order.fulfillment} order ${result.order.id} for $${result.order.total.toFixed(2)}`,
    metadata: activityChanges(
      [
        { field: "created", to: result.order.id },
        { field: "fulfillment", to: result.order.fulfillment },
        { field: "total", to: `$${result.order.total.toFixed(2)}` },
        { field: "items", to: result.order.items.length },
      ],
      {
        itemCount: result.order.items.length,
        fulfillment: result.order.fulfillment,
        total: result.order.total,
        customerUserId: result.userId,
        ...input.activityMetadata,
      },
    ),
  });

  if (input.activityAction !== "pos.sale" && result.order.fulfillment !== "pos") {
    void (async () => {
      try {
        const { emitStaffNotification } = await import("@/lib/db/staff-notifications");
        const { getLocationById } = await import("@/data/locations");
        const store = getLocationById(result.order.locationId);
        const storeLabel = store?.shortName ?? "store";
        await emitStaffNotification({
          organizationId: result.organizationId,
          type: "order.new",
          title: `New ${result.order.fulfillment} order`,
          body: `${result.order.id} · ${storeLabel} · $${result.order.total.toFixed(2)} · ${result.order.items.length} item(s)`,
          entityType: "order",
          entityId: result.order.id,
          locationId: result.order.locationId,
          actorUserId: result.userId,
          severity: "attention",
          dedupeKey: `order.new:${result.order.id}`,
          href: "/dashboard/orders",
          metadata: {
            fulfillment: result.order.fulfillment,
            total: result.order.total,
          },
        });
      } catch (error) {
        console.error("[placeOrder staff notify]", error);
      }
    })();
  }

  if (input.activityAction !== "pos.sale" && result.order.fulfillment !== "pos") {
    void (async () => {
      try {
        const { notifyOrderConfirmed, notifyLoyalty } = await import("@/lib/notifications");
        const { loadNotifyRecipient } = await import("@/lib/notifications/recipients");
        const { getLocationById } = await import("@/data/locations");
        const recipient = await loadNotifyRecipient(result.userId);
        const store = getLocationById(result.order.locationId);
        await notifyOrderConfirmed({
          orderId: result.order.id,
          tracking: result.order.tracking,
          storeName: store?.shortName,
          userId: result.userId,
          email: recipient?.email ?? input.email,
          phone: input.phone ?? input.delivery?.phone,
          prefs: recipient?.prefs,
        });
        if (loyalty.points > 0) {
          await notifyLoyalty({
            userId: result.userId,
            email: recipient?.email ?? input.email,
            phone: input.phone ?? input.delivery?.phone,
            points: loyalty.points,
            tier: "tier" in loyalty ? String(loyalty.tier) : undefined,
            prefs: recipient?.prefs,
          });
        }
      } catch (error) {
        console.error("[placeOrder] notify failed", error);
      }
    })();
  }

  return {
    order: result.order,
    userId: result.userId,
    loyaltyPoints: loyalty.balance,
  };
}

export async function placePosOrder(input: {
  actorUserId: string;
  locationId: string;
  fulfillment: "pos" | "pickup" | "delivery";
  items: Pick<CartItem, "productId" | "quantity">[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  coupon?: string | null;
  loyaltyPointsRedeem?: number;
  delivery?: DeliveryAddress;
  paymentMethod?: "cash" | "card" | "other";
}) {
  if (!isDbConfigured()) {
    throw new Error("Database is not configured.");
  }

  const staff = await prisma.user.findUnique({ where: { id: input.actorUserId } });
  if (!staff || !staff.active) {
    throw new Error("Signed-in account is not available for POS.");
  }

  const email = input.customerEmail?.trim().toLowerCase();
  const walkIn = !email;
  // Walk-in: do not attach staff as the loyalty customer.
  let customerUserId: string | undefined = undefined;
  let customerName =
    input.customerName?.trim() || (walkIn ? "Walk-in Guest" : "");

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.active) {
        throw new Error("That customer account is deactivated.");
      }
      customerUserId = existing.id;
      if (!customerName) customerName = existing.name;
    } else if (!customerName) {
      customerName = email.split("@")[0] || "Customer";
    }
  }

  return placeOrder({
    email: email || `walkin+${staff.id.slice(0, 8)}@pos.local`,
    name: customerName,
    phone: input.customerPhone,
    userId: customerUserId,
    locationId: input.locationId,
    fulfillment: input.fulfillment,
    items: input.items,
    coupon: input.coupon,
    loyaltyPointsRedeem: customerUserId ? input.loyaltyPointsRedeem : undefined,
    delivery: input.delivery,
    activityActorUserId: staff.id,
    activityAction: "pos.sale",
    activityMetadata: {
      paymentMethod: input.paymentMethod ?? "cash",
      walkIn,
      customerPhone: input.customerPhone ?? null,
      cashierId: staff.id,
      cashierName: staff.name,
    },
  });
}

export async function createOrder(userId: string, order: Order) {
  if (!isDbConfigured()) return order;

  await prisma.$transaction(async (tx) => {
    await tx.order.create({
      data: {
        id: order.id,
        userId,
        date: order.date,
        status: order.status,
        total: order.total,
        fulfillment: order.fulfillment,
        locationId: order.locationId,
        tracking: order.tracking,
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
    });
    const pointsEarned = Math.max(0, Math.floor(order.total));
    await tx.user.update({
      where: { id: userId },
      data: { loyaltyPoints: { increment: pointsEarned } },
    });
  });

  return order;
}

const CANCELLABLE_STATUSES = new Set([
  "new",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "out_for_delivery",
  "ready_for_pickup",
  "completed",
  // legacy
  "processing",
  "shipped",
]);

export async function cancelOrder(
  orderId: string,
  actorUserId: string,
  opts?: {
    /** When set, cancel any order owned by this user (staff path uses the order's owner). */
    asStaffForOwnerId?: string;
    actorName?: string;
  },
) {
  if (!isDbConfigured()) return null;

  const ownerUserId = opts?.asStaffForOwnerId ?? actorUserId;

  const cancelled = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, userId: ownerUserId },
      include: { items: true },
    });
    if (!order || !CANCELLABLE_STATUSES.has(order.status)) return null;
    const previousStatus = order.status;

    await tx.order.update({
      where: { id: orderId },
      data: { status: "cancelled" },
    });

    const sales = await tx.inventoryLedger.findMany({
      where: { orderId, reason: "sale" },
    });
    const reserves = await tx.inventoryLedger.findMany({
      where: { orderId, reason: "reserve" },
    });

    if (sales.length) {
      for (const item of order.items) {
        const existing = await tx.locationInventory.findUnique({
          where: {
            locationId_productId: {
              locationId: order.locationId,
              productId: item.productId,
            },
          },
        });
        const nextQty = (existing?.onHand ?? 0) + item.quantity;
        await writeStockChange(tx, order.locationId, item.productId, nextQty, "cancel", orderId);
      }
    } else if (reserves.length) {
      await releaseReservedStockTx(
        tx,
        order.locationId,
        order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        orderId,
      );
    }

    return {
      order: mapOrder({ ...order, status: "cancelled" }),
      previousStatus,
    };
  });

  if (cancelled) {
    const who = opts?.actorName || "Customer";
    await recordActivity({
      actorUserId,
      action: "order.cancelled",
      entityType: "order",
      entityId: cancelled.order.id,
      locationId: cancelled.order.locationId,
      summary: opts?.asStaffForOwnerId
        ? `${who} cancelled order ${cancelled.order.id}`
        : `Cancelled order ${cancelled.order.id}`,
      metadata: activityChanges(
        [{ field: "status", from: cancelled.previousStatus, to: "cancelled" }],
        {
          total: cancelled.order.total,
          fulfillment: cancelled.order.fulfillment,
          staff: Boolean(opts?.asStaffForOwnerId),
        },
      ),
    });
  }

  return cancelled?.order ?? null;
}

export async function resetInventory(locationId?: string, actorUserId?: string) {
  if (!isDbConfigured()) return;

  await ensureInventoryVisibilityColumn();

  await prisma.$transaction(async (tx) => {
    const rows = await tx.locationInventory.findMany(
      locationId ? { where: { locationId } } : undefined,
    );
    for (const row of rows) {
      await writeStockChange(tx, row.locationId, row.productId, row.seedStock, "reset");
    }
    if (!locationId) {
      const events = await tx.event.findMany();
      for (const e of events) {
        await tx.event.update({
          where: { id: e.id },
          data: { seatsAvailable: e.seatsTotal },
        });
      }
    }
  });

  await logStockActivity({
    actorUserId,
    locationId: locationId ?? "all",
    reason: "reset",
  });
}

export async function fetchBootstrapPayload(opts?: { includeReviews?: boolean }) {
  await ensureOrganizationSchema();
  const includeReviews = opts?.includeReviews === true;
  const [products, locations, categories, events, inventory] = await Promise.all([
    fetchAllProducts(),
    fetchAllLocations({ inventoryMode: "featured" }),
    fetchCategories(),
    fetchEvents(),
    fetchInventoryState(),
  ]);

  const reviews = includeReviews
    ? isDbConfigured()
      ? await prisma.review.findMany().then((rows) => rows.map(mapReview))
      : seedReviews
    : [];

  return {
    products,
    locations,
    categories,
    events,
    reviews,
    inventory,
  };
}
