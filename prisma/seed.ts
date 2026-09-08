import { Prisma, PrismaClient } from "@prisma/client";
import { categories } from "../src/data/categories";
import { products } from "../src/data/products";
import { locations } from "../src/data/locations";
import {
  events,
  reviews,
  demoUser,
  demoOwner,
  demoAccounts,
} from "../src/data/events";
import { hashPassword } from "../src/lib/auth/password";
import { DEMO_PASSWORD } from "../src/lib/auth/roles";
import { ensureDeliverySchema } from "../src/lib/db/delivery";
import { ensureLocationPricingSchema } from "../src/lib/db/location-pricing";
import { ensureRoleDefinitionsSchema } from "../src/lib/db/roles-admin";
import { drivers } from "../src/data/drivers";
import type { Order, Product, StoreLocation, UserProfile } from "../src/types";

const prisma = new PrismaClient();

function productRow(p: Product) {
  return {
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    categorySlug: p.category,
    subcategory: p.subcategory ?? null,
    description: p.description,
    brandStory: p.brandStory,
    origin: p.origin,
    country: p.country,
    abv: p.abv,
    volumeMl: p.volumeMl,
    price: p.price,
    compareAtPrice: p.compareAtPrice ?? null,
    rating: p.rating,
    reviewCount: p.reviewCount,
    tastingNotes: p.tastingNotes,
    foodPairings: p.foodPairings,
    cocktails: p.cocktails,
    images: p.images,
    color: p.color,
    accentColor: p.accentColor,
    labelColor: p.labelColor,
    bottleHeight: p.bottleHeight,
    isPremium: p.isPremium,
    isImported: p.isImported,
    tags: p.tags,
    nutrition: p.nutrition ?? Prisma.DbNull,
    glbUrl: p.glbUrl ?? null,
    usdzUrl: p.usdzUrl ?? null,
    isCustom: false,
  };
}

function locationRow(loc: StoreLocation) {
  return {
    slug: loc.slug,
    name: loc.name,
    shortName: loc.shortName,
    address: loc.address,
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    phone: loc.phone,
    email: loc.email,
    hours: loc.hours,
    lat: loc.lat,
    lng: loc.lng,
    heroImage: loc.heroImage,
    gallery: loc.gallery,
    staff: loc.staff,
    services: loc.services,
    parking: loc.parking,
    pickupAvailable: loc.pickupAvailable,
    deliveryAvailable: loc.deliveryAvailable,
    deliveryRadiusKm: loc.deliveryRadiusKm,
    deliveryFee: loc.deliveryFee,
    deliveryFreeMinimum: loc.deliveryFreeMinimum,
    taxRate: loc.taxRate,
    featuredOffers: loc.featuredOffers,
    description: loc.description,
  };
}

function userRow(profile: UserProfile, passwordHash: string) {
  return {
    email: profile.email,
    name: profile.name,
    role: profile.role,
    passwordHash,
    active: profile.active,
    preferredBranchId: profile.preferredBranchId,
    loyaltyPoints: profile.loyaltyPoints,
    loyaltyTier: profile.loyaltyTier,
    addresses: profile.addresses,
    recentlyViewed: profile.recentlyViewed,
    avatarUrl: profile.avatarUrl ?? null,
    permissionGrants: profile.permissionGrants ?? [],
    permissionRevokes: profile.permissionRevokes ?? [],
    allowedLocationIds: profile.allowedLocationIds ?? Prisma.DbNull,
  };
}

async function seedCategories() {
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: c,
    });
  }
}

async function seedProducts() {
  for (const p of products) {
    const row = productRow(p);
    await prisma.product.upsert({
      where: { id: p.id },
      create: { id: p.id, ...row },
      update: row,
    });
  }
}

async function seedLocations() {
  for (const loc of locations) {
    const row = locationRow(loc);
    await prisma.location.upsert({
      where: { id: loc.id },
      create: { id: loc.id, ...row },
      update: row,
    });

    for (const item of loc.inventory) {
      await prisma.locationInventory.upsert({
        where: {
          locationId_productId: {
            locationId: loc.id,
            productId: item.productId,
          },
        },
        create: {
          locationId: loc.id,
          productId: item.productId,
          seedStock: item.stock,
          onHand: item.stock,
          promoPrice: item.promoPrice ?? null,
          featured: item.featured ?? false,
          hidden: item.hidden ?? false,
        },
        update: {
          seedStock: item.stock,
          promoPrice: item.promoPrice ?? null,
          featured: item.featured ?? false,
          hidden: item.hidden ?? false,
        },
      });
    }
  }
}

async function seedEvents() {
  // `events.active` is created by prisma/migrations/0_init, which `db:setup`
  // applies before this seed runs — no ad-hoc ALTER needed.
  for (const e of events) {
    const row = {
      slug: e.slug,
      title: e.title,
      type: e.type,
      description: e.description,
      locationId: e.locationId,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      price: e.price,
      seatsTotal: e.seatsTotal,
      image: e.image,
      hosts: e.hosts,
    };
    await prisma.event.upsert({
      where: { id: e.id },
      create: { id: e.id, seatsAvailable: e.seatsAvailable, ...row },
      update: row,
    });
    await prisma.$executeRawUnsafe(
      `UPDATE events SET active = ? WHERE id = ?`,
      e.active !== false,
      e.id,
    );
  }
}

async function seedReviews() {
  for (const r of reviews) {
    const row = {
      productId: r.productId,
      userName: r.userName,
      rating: r.rating,
      title: r.title,
      body: r.body,
      date: r.date,
      verified: r.verified,
      images: r.images ?? Prisma.DbNull,
      helpful: r.helpful,
    };
    await prisma.review.upsert({
      where: { id: r.id },
      create: { id: r.id, ...row },
      update: row,
    });
  }
}

async function seedUser(profile: UserProfile, passwordHash: string) {
  const row = userRow(profile, passwordHash);
  await prisma.user.upsert({
    where: { id: profile.id },
    create: { id: profile.id, ...row },
    update: {
      email: row.email,
      name: row.name,
      role: row.role,
      passwordHash: row.passwordHash,
      active: true,
      preferredBranchId: row.preferredBranchId,
      loyaltyTier: row.loyaltyTier,
      addresses: row.addresses,
      recentlyViewed: row.recentlyViewed,
      avatarUrl: row.avatarUrl,
      permissionGrants: row.permissionGrants,
      permissionRevokes: row.permissionRevokes,
      allowedLocationIds: row.allowedLocationIds,
    },
  });
}

async function seedOrders(userId: string, orders: Order[]) {
  for (const order of orders) {
    await prisma.order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        userId,
        date: order.date,
        status: order.status,
        total: order.total,
        fulfillment: order.fulfillment,
        locationId: order.locationId,
        tracking: order.tracking ?? null,
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
      update: {
        date: order.date,
        status: order.status,
        total: order.total,
        fulfillment: order.fulfillment,
        locationId: order.locationId,
        tracking: order.tracking ?? null,
      },
    });

    const existingItems = await prisma.orderItem.findMany({
      where: { orderId: order.id },
    });
    if (existingItems.length) {
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    }
    await prisma.orderItem.createMany({
      data: order.items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    });
  }
}

async function seedDrivers() {
  await ensureDeliverySchema();
  for (const driver of drivers) {
    await prisma.driver.upsert({
      where: { id: driver.id },
      create: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email ?? null,
        vehicle: driver.vehicle,
        locationId: driver.locationId,
        status: driver.status,
        active: driver.active,
        photoUrl: driver.photoUrl ?? null,
      },
      update: {
        name: driver.name,
        phone: driver.phone,
        email: driver.email ?? null,
        vehicle: driver.vehicle,
        locationId: driver.locationId,
        status: driver.status,
        active: driver.active,
        photoUrl: driver.photoUrl ?? null,
      },
    });
  }
}

async function seedActivity() {
  const rows = [
    {
      id: "act-seed-login",
      actorUserId: demoOwner.id,
      actorName: demoOwner.name,
      actorEmail: demoOwner.email,
      actorRole: "owner",
      action: "auth.login",
      entityType: "user",
      entityId: demoOwner.id,
      summary: "Sam signed in as owner",
      createdAt: new Date("2026-01-10T09:00:00Z"),
    },
    ...demoUser.orders.map((order) => ({
      id: `act-seed-${order.id.toLowerCase()}`,
      actorUserId: demoUser.id,
      actorName: demoUser.name,
      actorEmail: demoUser.email,
      actorRole: "customer",
      action: order.status === "cancelled" ? "order.cancelled" : "order.placed",
      entityType: "order" as const,
      entityId: order.id,
      locationId: order.locationId,
      summary:
        order.status === "cancelled"
          ? `Cancelled order ${order.id}`
          : `Placed ${order.fulfillment} order ${order.id} for $${order.total.toFixed(2)}`,
      createdAt: new Date(`${order.date}T15:30:00Z`),
      metadata: { total: order.total, fulfillment: order.fulfillment, status: order.status },
    })),
    {
      id: "act-seed-restock",
      actorUserId: demoOwner.id,
      actorName: demoOwner.name,
      actorEmail: demoOwner.email,
      actorRole: "owner",
      action: "inventory.restock",
      entityType: "inventory",
      entityId: "mk-buffalo-trace",
      locationId: "loc1",
      summary: "Restocked Buffalo Trace Bourbon at Downtown to 24",
      createdAt: new Date("2026-07-20T11:15:00Z"),
      metadata: { quantity: 24, reason: "restock" },
    },
    {
      id: "act-seed-adjust",
      actorUserId: demoOwner.id,
      actorName: demoOwner.name,
      actorEmail: demoOwner.email,
      actorRole: "owner",
      action: "inventory.adjust",
      entityType: "inventory",
      entityId: "mk-glenfiddich-12",
      locationId: "loc3",
      summary: "Adjusted Glenfiddich 12 at Uptown by -2",
      createdAt: new Date("2026-07-28T16:40:00Z"),
      metadata: { delta: -2, reason: "adjustment" },
    },
  ];

  for (const row of rows) {
    await prisma.activityLog.upsert({
      where: { id: row.id },
      create: row,
      update: {
        actorUserId: row.actorUserId,
        actorName: row.actorName,
        actorEmail: row.actorEmail,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        summary: row.summary,
        locationId: "locationId" in row ? row.locationId : undefined,
        metadata: "metadata" in row ? row.metadata : undefined,
        createdAt: row.createdAt,
      },
    });
  }
}

async function removeRetiredCatalog() {
  const keepIds = products.map((p) => p.id);
  const retired = await prisma.product.findMany({
    where: { isCustom: false, id: { notIn: keepIds } },
    select: { id: true, name: true },
  });
  if (!retired.length) return;
  const ids = retired.map((row) => row.id);
  console.log(`Removing ${ids.length} retired catalog bottles…`);
  await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.review.deleteMany({ where: { productId: { in: ids } } });
  await prisma.inventoryLedger.deleteMany({ where: { productId: { in: ids } } });
  await prisma.locationInventory.deleteMany({ where: { productId: { in: ids } } });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  console.log(`Seeding ${categories.length} categories…`);
  await seedCategories();

  console.log(`Seeding ${products.length} products…`);
  await seedProducts();
  await removeRetiredCatalog();

  const inventoryRows = locations.reduce((n, loc) => n + loc.inventory.length, 0);
  console.log(`Seeding ${locations.length} locations (${inventoryRows} inventory rows)…`);
  await ensureLocationPricingSchema();
  await seedLocations();

  console.log(`Seeding ${drivers.length} drivers…`);
  await seedDrivers();

  console.log("Ensuring role_definitions table…");
  await ensureRoleDefinitionsSchema();

  console.log(`Seeding ${events.length} events…`);
  await seedEvents();

  console.log(`Seeding ${reviews.length} reviews…`);
  await seedReviews();

  console.log(`Seeding ${demoAccounts.length} demo accounts…`);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const account of demoAccounts) {
    await seedUser(account, passwordHash);
  }

  console.log(`Seeding ${demoUser.orders.length} demo orders…`);
  await seedOrders(demoUser.id, demoUser.orders);

  console.log("Seeding activity logs…");
  await seedActivity();

  console.log(
    "Done. Categories, products, locations (+ pricing), inventory, drivers, events, reviews, demo users, orders, activity, and role_definitions are current.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
