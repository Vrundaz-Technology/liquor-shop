import { ensureLocationPricingSchema, mapLocationPricing } from "@/lib/db/location-pricing";
import { ensureInventoryVisibilityColumn } from "@/lib/db/inventory-visibility";
import { DEFAULT_FULFILLMENT_PRICING } from "@/lib/fulfillment-pricing";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { addColumnIfMissing } from "@/lib/db/schema-guard";
import { mapEvent, mapLocation } from "@/lib/db/mappers";
import { recordActivity } from "@/lib/db/activity";
import { hasPermission } from "@/lib/auth/permissions";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/auth/location-access";
import type { EventItem, StoreLocation, UserProfile } from "@/types";

const DEFAULT_HOURS = [
  { day: "Mon–Thu", open: "11:00", close: "21:00" },
  { day: "Fri–Sat", open: "10:00", close: "23:00" },
  { day: "Sun", open: "12:00", close: "20:00" },
];

const DEFAULT_HERO = "/store/downtown-maison.jpg";

let eventSchemaReady = false;

/** Ensures events.active exists for older databases without a full migrate. */
export async function ensureEventSchema() {
  if (!isDbConfigured() || eventSchemaReady) return;
  await addColumnIfMissing("events", "active", "BOOLEAN NOT NULL DEFAULT true");
  eventSchemaReady = true;
}

export const EVENT_TYPES = ["wine-tasting", "whiskey-tasting", "launch", "festival"] as const;
export type AdminEventType = (typeof EVENT_TYPES)[number];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueLocationSlug(base: string, exceptId?: string) {
  let slug = slugify(base) || `store-${Date.now().toString(36)}`;
  let n = 2;
  while (true) {
    const hit = await prisma.location.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
    slug = `${slugify(base)}-${n++}`;
  }
}

async function uniqueEventSlug(base: string, exceptId?: string) {
  let slug = slugify(base) || `event-${Date.now().toString(36)}`;
  let n = 2;
  while (true) {
    const hit = await prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
    slug = `${slugify(base)}-${n++}`;
  }
}

export async function listLocationIds() {
  if (!isDbConfigured()) return [];
  const rows = await prisma.location.findMany({ select: { id: true } });
  return rows.map((row) => row.id);
}

export type LocationInput = {
  name: string;
  shortName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  description?: string;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
  deliveryRadiusKm?: number;
  deliveryFee?: number;
  deliveryFreeMinimum?: number;
  taxRate?: number;
  parking?: string;
  heroImage?: string;
  gallery?: string[];
  lat?: number;
  lng?: number;
};

function galleryUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function composeGallery(hero: string, extras: string[] = []) {
  const unique: string[] = [];
  for (const url of [hero, ...extras]) {
    const next = url.trim();
    if (next && !unique.includes(next)) unique.push(next);
  }
  return unique.slice(0, 8);
}

export async function createStoreLocation(actor: UserProfile, input: LocationInput) {
  if (!hasPermission(actor, "locations.create")) {
    return { error: "You cannot add locations.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  await ensureLocationPricingSchema();
  await ensureInventoryVisibilityColumn();

  const shortName = input.shortName.trim();
  const name = input.name.trim() || `Sam's Discount Liquor — ${shortName}`;
  const id = `loc-${crypto.randomUUID().slice(0, 8)}`;
  const slug = await uniqueLocationSlug(shortName || name);
  const heroImage = input.heroImage?.trim() || DEFAULT_HERO;
  const gallery = composeGallery(heroImage, input.gallery);

  await prisma.$transaction(async (tx) => {
    await tx.location.create({
      data: {
        id,
        slug,
        name,
        shortName,
        address: input.address.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        zip: input.zip.trim(),
        phone: input.phone.trim(),
        email: input.email.trim().toLowerCase(),
        hours: DEFAULT_HOURS,
        lat: input.lat ?? 40.7209,
        lng: input.lng ?? -74.0007,
        heroImage,
        gallery,
        staff: [],
        services: ["Pickup", "Gift wrapping"],
        parking: input.parking?.trim() || "Street parking nearby.",
        pickupAvailable: input.pickupAvailable ?? true,
        deliveryAvailable: input.deliveryAvailable ?? DEFAULT_FULFILLMENT_PRICING.deliveryAvailable,
        deliveryRadiusKm: input.deliveryRadiusKm ?? 8,
        deliveryFee: input.deliveryFee ?? DEFAULT_FULFILLMENT_PRICING.deliveryFee,
        deliveryFreeMinimum:
          input.deliveryFreeMinimum ?? DEFAULT_FULFILLMENT_PRICING.deliveryFreeMinimum,
        taxRate: input.taxRate ?? DEFAULT_FULFILLMENT_PRICING.taxRate,
        featuredOffers: [],
        description: input.description?.trim() || `${name} is now part of the Sam's Discount Liquor network.`,
      } as never,
    });
    const products = await tx.product.findMany({ select: { id: true } });
    if (products.length) {
      await tx.locationInventory.createMany({
        data: products.map((product) => ({
          locationId: id,
          productId: product.id,
          seedStock: 0,
          onHand: 0,
        })),
      });
    }

    // Scoped staff/admins must gain access to the store they just created.
    if (!hasAllLocationAccess(actor) && actor.allowedLocationIds?.length) {
      const nextIds = [...new Set([...actor.allowedLocationIds, id])];
      await tx.user.update({
        where: { id: actor.id },
        data: { allowedLocationIds: nextIds },
      });
    }
  });

  const row = await prisma.location.findUnique({
    where: { id },
    include: { inventory: true },
  });
  if (!row) return { error: "Location was created but could not be loaded.", status: 500 as const };
  const location = mapLocation(row);
  await recordActivity({
    actorUserId: actor.id,
    action: "location.created",
    entityType: "location",
    entityId: location.id,
    locationId: location.id,
    summary: `${actor.name} added store ${location.shortName}`,
  });
  return { location };
}

export async function updateStoreLocation(
  actor: UserProfile,
  locationId: string,
  input: Partial<LocationInput>,
) {
  if (!hasPermission(actor, "locations.edit")) {
    return { error: "You cannot edit locations.", status: 403 as const };
  }
  if (!canAccessLocation(actor, locationId)) {
    return { error: "You cannot manage that store.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  await ensureLocationPricingSchema();
  await ensureInventoryVisibilityColumn();
  const existing = await prisma.location.findUnique({ where: { id: locationId } });
  if (!existing) return { error: "Location not found.", status: 404 as const };

  const shortName = input.shortName?.trim() ?? existing.shortName;
  const slug =
    input.shortName && input.shortName.trim() !== existing.shortName
      ? await uniqueLocationSlug(shortName, locationId)
      : existing.slug;
  // Empty string means "cleared" — fall back to default hero, not the previous image.
  const heroImage =
    input.heroImage !== undefined
      ? input.heroImage.trim() || DEFAULT_HERO
      : existing.heroImage;
  const previousExtras = galleryUrls(existing.gallery).filter((url) => url !== existing.heroImage);
  const gallery =
    input.gallery != null
      ? composeGallery(heroImage, input.gallery)
      : composeGallery(heroImage, previousExtras);

  const existingPricing = mapLocationPricing(existing);

  await prisma.location.update({
    where: { id: locationId },
    data: {
      slug,
      name: input.name?.trim() ?? existing.name,
      shortName,
      address: input.address?.trim() ?? existing.address,
      city: input.city?.trim() ?? existing.city,
      state: input.state?.trim() ?? existing.state,
      zip: input.zip?.trim() ?? existing.zip,
      phone: input.phone?.trim() ?? existing.phone,
      email: input.email?.trim().toLowerCase() ?? existing.email,
      description: input.description?.trim() ?? existing.description,
      pickupAvailable: input.pickupAvailable ?? existing.pickupAvailable,
      deliveryAvailable: input.deliveryAvailable ?? existingPricing.deliveryAvailable,
      deliveryRadiusKm: input.deliveryRadiusKm ?? existing.deliveryRadiusKm,
      deliveryFee: input.deliveryFee ?? existingPricing.deliveryFee,
      deliveryFreeMinimum: input.deliveryFreeMinimum ?? existingPricing.deliveryFreeMinimum,
      taxRate: input.taxRate ?? existingPricing.taxRate,
      parking: input.parking?.trim() ?? existing.parking,
      heroImage,
      gallery,
      lat: input.lat ?? existing.lat,
      lng: input.lng ?? existing.lng,
    } as never,
  });

  const row = await prisma.location.findUnique({
    where: { id: locationId },
    include: { inventory: true },
  });
  if (!row) return { error: "Location not found.", status: 404 as const };
  const location = mapLocation(row);
  await recordActivity({
    actorUserId: actor.id,
    action: "location.updated",
    entityType: "location",
    entityId: location.id,
    locationId: location.id,
    summary: `${actor.name} updated store ${location.shortName}`,
  });
  return { location };
}

export async function deleteStoreLocation(actor: UserProfile, locationId: string) {
  if (!hasPermission(actor, "locations.delete")) {
    return { error: "You cannot remove locations.", status: 403 as const };
  }
  if (!canAccessLocation(actor, locationId)) {
    return { error: "You cannot manage that store.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };

  const existing = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, shortName: true },
  });
  if (!existing) return { error: "Location not found.", status: 404 as const };

  const remaining = await prisma.location.count();
  if (remaining <= 1) {
    return { error: "The last store cannot be removed.", status: 409 as const };
  }
  const orders = await prisma.order.count({ where: { locationId } });
  if (orders > 0) {
    return {
      error: "This store has orders, so it cannot be deleted. Deactivate it by leaving it unpublished in a future update, or keep it for history.",
      status: 409 as const,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.event.deleteMany({ where: { locationId } });
    await tx.inventoryLedger.deleteMany({ where: { locationId } });
    await tx.location.delete({ where: { id: locationId } });
  });

  await recordActivity({
    actorUserId: actor.id,
    action: "location.deleted",
    entityType: "location",
    entityId: locationId,
    summary: `${actor.name} removed store ${existing.shortName}`,
  });
  return { ok: true as const, id: locationId };
}

export type EventInput = {
  title: string;
  type: AdminEventType;
  description: string;
  locationId: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  seatsTotal: number;
  image?: string;
  hosts?: string[];
  active?: boolean;
};

export async function createStoreEvent(actor: UserProfile, input: EventInput) {
  if (!hasPermission(actor, "events.create")) {
    return { error: "You cannot add events.", status: 403 as const };
  }
  if (!canAccessLocation(actor, input.locationId)) {
    return { error: "You cannot add events for that store.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  await ensureEventSchema();
  const location = await prisma.location.findUnique({ where: { id: input.locationId } });
  if (!location) return { error: "Location not found.", status: 404 as const };
  if (input.endTime && input.startTime && input.endTime <= input.startTime) {
    return { error: "End time must be after start time.", status: 400 as const };
  }

  const seatsTotal = Math.max(1, Math.floor(input.seatsTotal));
  const id = `evt-${crypto.randomUUID().slice(0, 8)}`;
  const slug = await uniqueEventSlug(input.title);
  const active = input.active ?? true;
  const row = await prisma.event.create({
    data: {
      id,
      slug,
      title: input.title.trim(),
      type: input.type,
      description: input.description.trim(),
      locationId: input.locationId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      price: input.price,
      seatsTotal,
      seatsAvailable: seatsTotal,
      image: input.image?.trim() || location.heroImage || DEFAULT_HERO,
      hosts: input.hosts?.filter(Boolean) ?? [],
    },
  });
  await prisma.$executeRaw`UPDATE events SET active = ${active} WHERE id = ${id}`;
  const event = mapEvent({ ...row, active });
  await recordActivity({
    actorUserId: actor.id,
    action: "event.created",
    entityType: "event",
    entityId: event.id,
    locationId: event.locationId,
    summary: `${actor.name} added event “${event.title}”`,
  });
  return { event };
}

export async function updateStoreEvent(
  actor: UserProfile,
  eventId: string,
  input: Partial<EventInput>,
) {
  if (!hasPermission(actor, "events.edit")) {
    return { error: "You cannot edit events.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  const existing = await prisma.event.findUnique({ where: { id: eventId } });
  if (!existing) return { error: "Event not found.", status: 404 as const };
  if (!canAccessLocation(actor, existing.locationId)) {
    return { error: "You cannot manage that event.", status: 403 as const };
  }
  const nextLocationId = input.locationId ?? existing.locationId;
  if (!canAccessLocation(actor, nextLocationId)) {
    return { error: "You cannot move this event to that store.", status: 403 as const };
  }

  const seatsTotal = input.seatsTotal != null ? Math.max(1, Math.floor(input.seatsTotal)) : existing.seatsTotal;
  const sold = existing.seatsTotal - existing.seatsAvailable;
  if (seatsTotal < sold) {
    return {
      error: `At least ${sold} seat${sold === 1 ? "" : "s"} already booked. Raise the total or keep it at ${sold}+.`,
      status: 409 as const,
    };
  }
  const seatsAvailable = Math.max(0, seatsTotal - sold);

  const nextStart = input.startTime ?? existing.startTime;
  const nextEnd = input.endTime ?? existing.endTime;
  if (nextStart && nextEnd && nextEnd <= nextStart) {
    return { error: "End time must be after start time.", status: 400 as const };
  }

  await ensureEventSchema();
  const location = await prisma.location.findUnique({ where: { id: nextLocationId } });
  const fallbackImage = location?.heroImage || DEFAULT_HERO;
  const nextImage =
    input.image !== undefined
      ? input.image.trim() || fallbackImage
      : existing.image;
  const existingActiveRows = await prisma.$queryRaw<{ active: boolean }[]>`
    SELECT active FROM events WHERE id = ${eventId}
  `;
  const existingActive = existingActiveRows[0]?.active ?? true;
  const nextActive = input.active !== undefined ? input.active : existingActive;

  const row = await prisma.event.update({
    where: { id: eventId },
    data: {
      title: input.title?.trim() ?? existing.title,
      slug: input.title && input.title.trim() !== existing.title
        ? await uniqueEventSlug(input.title, eventId)
        : existing.slug,
      type: input.type ?? existing.type,
      description: input.description?.trim() ?? existing.description,
      locationId: nextLocationId,
      date: input.date ?? existing.date,
      startTime: nextStart,
      endTime: nextEnd,
      price: input.price ?? existing.price,
      seatsTotal,
      seatsAvailable,
      image: nextImage,
      hosts: (input.hosts ?? existing.hosts) as string[],
    },
  });
  await prisma.$executeRaw`UPDATE events SET active = ${nextActive} WHERE id = ${eventId}`;
  const event = mapEvent({ ...row, active: nextActive });
  await recordActivity({
    actorUserId: actor.id,
    action: "event.updated",
    entityType: "event",
    entityId: event.id,
    locationId: event.locationId,
    summary:
      input.active !== undefined && input.active !== existingActive
        ? `${actor.name} ${event.active ? "activated" : "deactivated"} event “${event.title}”`
        : `${actor.name} updated event “${event.title}”`,
  });
  return { event };
}

export async function deleteStoreEvent(actor: UserProfile, eventId: string) {
  if (!hasPermission(actor, "events.delete")) {
    return { error: "You cannot remove events.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  const existing = await prisma.event.findUnique({ where: { id: eventId } });
  if (!existing) return { error: "Event not found.", status: 404 as const };
  if (!canAccessLocation(actor, existing.locationId)) {
    return { error: "You cannot manage that event.", status: 403 as const };
  }
  await prisma.event.delete({ where: { id: eventId } });
  await recordActivity({
    actorUserId: actor.id,
    action: "event.deleted",
    entityType: "event",
    entityId: eventId,
    locationId: existing.locationId,
    summary: `${actor.name} removed event “${existing.title}”`,
  });
  return { ok: true as const, id: eventId };
}

export type { StoreLocation, EventItem };
export { hasAllLocationAccess };
