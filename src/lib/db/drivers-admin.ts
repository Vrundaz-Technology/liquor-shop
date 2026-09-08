import type { Driver, DriverStatus, UserProfile } from "@/types";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureDeliverySchema } from "@/lib/db/delivery";
import { recordActivity } from "@/lib/db/activity";
import { hasPermission } from "@/lib/auth/permissions";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/auth/location-access";

type DriverRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  vehicle: string;
  location_id: string;
  status: string;
  active: boolean;
  photo_url: string | null;
};

function asDriver(row: DriverRow): Driver {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? undefined,
    vehicle: row.vehicle,
    locationId: row.location_id,
    status: row.status as DriverStatus,
    active: row.active,
    photoUrl: row.photo_url ?? undefined,
  };
}

export type DriverInput = {
  name: string;
  phone: string;
  email?: string;
  vehicle: string;
  locationId: string;
  photoUrl?: string;
  status?: DriverStatus;
  active?: boolean;
};

function accessibleLocationIds(actor: UserProfile) {
  if (hasAllLocationAccess(actor)) return null;
  return actor.allowedLocationIds ?? [];
}

export async function listDriversForAdmin(
  actor: UserProfile,
  opts?: { includeInactive?: boolean; locationId?: string },
) {
  await ensureDeliverySchema();
  if (!isDbConfigured()) return [];

  const allowAll = hasAllLocationAccess(actor);
  const ids = accessibleLocationIds(actor);
  const filters: string[] = [];
  const params: unknown[] = [];

  if (!opts?.includeInactive) {
    filters.push("active = true");
  }
  if (opts?.locationId) {
    filters.push("location_id = ?");
    params.push(opts.locationId);
  } else if (!allowAll && ids?.length) {
    filters.push(`location_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  } else if (!allowAll) {
    return [];
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await prisma.$queryRawUnsafe<DriverRow[]>(
    `SELECT * FROM drivers ${where} ORDER BY name ASC`,
    ...params,
  );
  return rows.map(asDriver);
}

async function getDriverRow(driverId: string) {
  const rows = await prisma.$queryRawUnsafe<DriverRow[]>(
    `SELECT * FROM drivers WHERE id = ? LIMIT 1`,
    driverId,
  );
  return rows[0] ?? null;
}

async function driverHasActiveRuns(driverId: string) {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) AS count FROM orders
     WHERE driver_id = ?
       AND fulfillment = 'delivery'
       AND status <> 'cancelled'
       AND COALESCE(delivery_status, 'unassigned') <> 'delivered'`,
    driverId,
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

export async function createDriver(actor: UserProfile, input: DriverInput) {
  if (!hasPermission(actor, "deliveries.manage")) {
    return { error: "You cannot add drivers.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };
  if (!canAccessLocation(actor, input.locationId)) {
    return { error: "You cannot manage drivers for that store.", status: 403 as const };
  }

  await ensureDeliverySchema();
  const id = `drv-${crypto.randomUUID().slice(0, 8)}`;
  const email = input.email?.trim().toLowerCase() || null;
  const photoUrl = input.photoUrl?.trim() || null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO drivers (id, name, phone, email, vehicle, location_id, status, active, photo_url)
     VALUES (?,?,?,?,?,?,'available',true,?)`,
    id,
    input.name.trim(),
    input.phone.trim(),
    email,
    input.vehicle.trim(),
    input.locationId,
    photoUrl,
  );

  const row = await getDriverRow(id);
  if (!row) return { error: "Driver was created but could not be loaded.", status: 500 as const };
  const driver = asDriver(row);
  await recordActivity({
    actorUserId: actor.id,
    action: "driver.created",
    entityType: "driver",
    entityId: driver.id,
    locationId: driver.locationId,
    summary: `${actor.name} added driver ${driver.name}`,
  });
  return { driver };
}

export async function updateDriver(
  actor: UserProfile,
  driverId: string,
  input: Partial<DriverInput>,
) {
  if (!hasPermission(actor, "deliveries.manage")) {
    return { error: "You cannot edit drivers.", status: 403 as const };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 as const };

  await ensureDeliverySchema();
  const existing = await getDriverRow(driverId);
  if (!existing) return { error: "Driver not found.", status: 404 as const };
  if (!canAccessLocation(actor, existing.location_id)) {
    return { error: "You cannot manage that driver.", status: 403 as const };
  }

  const nextLocationId = input.locationId ?? existing.location_id;
  if (!canAccessLocation(actor, nextLocationId)) {
    return { error: "You cannot move a driver to that store.", status: 403 as const };
  }

  if (input.locationId && input.locationId !== existing.location_id) {
    const onRun = await driverHasActiveRuns(driverId);
    if (onRun) {
      return {
        error: "This driver has an open delivery. Finish or reassign it before changing stores.",
        status: 409 as const,
      };
    }
  }

  const nextStatus = input.status ?? (existing.status as DriverStatus);
  if (nextStatus === "on_route" && existing.status !== "on_route") {
    return { error: "Driver status on route is set automatically when assigned.", status: 400 as const };
  }

  if (input.active === false && existing.active) {
    const onRun = await driverHasActiveRuns(driverId);
    if (onRun) {
      return {
        error: "This driver still has an open delivery. Complete or reassign it before deactivating.",
        status: 409 as const,
      };
    }
  }

  await prisma.$executeRawUnsafe(
    `UPDATE drivers SET
      name = ?,
      phone = ?,
      email = ?,
      vehicle = ?,
      location_id = ?,
      status = ?,
      active = ?,
      photo_url = ?
     WHERE id = ?`,
    (input.name ?? existing.name).trim(),
    (input.phone ?? existing.phone).trim(),
    input.email !== undefined ? input.email.trim().toLowerCase() || null : existing.email,
    (input.vehicle ?? existing.vehicle).trim(),
    nextLocationId,
    nextStatus,
    input.active ?? existing.active,
    input.photoUrl !== undefined ? input.photoUrl.trim() || null : existing.photo_url,
    driverId,
  );

  const row = await getDriverRow(driverId);
  if (!row) return { error: "Driver not found.", status: 404 as const };
  const driver = asDriver(row);
  await recordActivity({
    actorUserId: actor.id,
    action: input.active === false ? "driver.deactivated" : "driver.updated",
    entityType: "driver",
    entityId: driver.id,
    locationId: driver.locationId,
    summary:
      input.active === false
        ? `${actor.name} deactivated driver ${driver.name}`
        : `${actor.name} updated driver ${driver.name}`,
  });
  return { driver };
}

export async function deactivateDriver(actor: UserProfile, driverId: string) {
  return updateDriver(actor, driverId, { active: false, status: "offline" });
}
