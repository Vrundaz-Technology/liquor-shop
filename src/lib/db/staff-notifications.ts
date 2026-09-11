import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { SAMS_ORG_ID, actorOrganizationId } from "@/lib/db/organization";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/auth/location-access";
import { isStaffRole } from "@/lib/auth/roles";
import type { UserProfile } from "@/types";

export type StaffNotificationType =
  | "order.new"
  | "transfer.created"
  | "support.ticket_created"
  | "support.customer_reply";

export type StaffNotificationItem = {
  id: string;
  type: StaffNotificationType | string;
  title: string;
  body: string;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  locationId: string | null;
  severity: string;
  createdAt: string;
  readAt: string | null;
};

let ready = false;

export async function ensureStaffNotificationSchema() {
  if (!isDbConfigured() || ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS staff_notifications (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      organization_id VARCHAR(191) NOT NULL,
      type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      entity_type VARCHAR(64) NULL,
      entity_id VARCHAR(191) NULL,
      location_id VARCHAR(191) NULL,
      actor_user_id VARCHAR(191) NULL,
      severity VARCHAR(16) NOT NULL DEFAULT 'info',
      dedupe_key VARCHAR(191) NULL,
      href VARCHAR(512) NULL,
      metadata JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY staff_notifications_org_dedupe (organization_id, dedupe_key),
      INDEX staff_notifications_org_created (organization_id, created_at),
      INDEX staff_notifications_org_type (organization_id, type),
      INDEX staff_notifications_location (location_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS staff_notification_recipients (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      notification_id VARCHAR(191) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      read_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY staff_notif_recip_unique (notification_id, user_id),
      INDEX staff_notif_recip_user (user_id, read_at, created_at)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  ready = true;
}

const TYPE_PERMISSION: Record<StaffNotificationType, Permission> = {
  "order.new": "orders.view",
  "transfer.created": "inventory.transfer",
  "support.ticket_created": "support.view",
  "support.customer_reply": "support.view",
};

async function resolveRecipientIds(input: {
  organizationId: string;
  permission: Permission;
  locationIds: string[];
  excludeUserId?: string | null;
}): Promise<string[]> {
  const ownerRows = await prisma.$queryRawUnsafe<{ owner_user_id: string | null }[]>(
    `SELECT owner_user_id FROM organizations WHERE id = ? LIMIT 1`,
    input.organizationId,
  );
  const ownerId = ownerRows[0]?.owner_user_id ?? null;

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM users
     WHERE active = 1
       AND (
         organization_id = ?
         OR id = ?
       )
     LIMIT 200`,
    input.organizationId,
    ownerId ?? "",
  );

  const { fetchSessionUser } = await import("@/lib/db/queries");
  const ids: string[] = [];
  for (const row of rows) {
    if (input.excludeUserId && row.id === input.excludeUserId) continue;
    const profile = await fetchSessionUser(row.id);
    if (!profile || !isStaffRole(profile)) continue;
    if (!hasPermission(profile, input.permission)) continue;
    if (input.locationIds.length) {
      const allowed =
        hasAllLocationAccess(profile) ||
        input.locationIds.some((locId) => canAccessLocation(profile, locId));
      if (!allowed) continue;
    }
    ids.push(profile.id);
  }
  return [...new Set(ids)];
}

export async function emitStaffNotification(input: {
  organizationId?: string | null;
  type: StaffNotificationType;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  locationId?: string | null;
  /** Extra locations that should also grant visibility (e.g. transfer destination). */
  locationIds?: string[];
  actorUserId?: string | null;
  severity?: "info" | "attention" | "critical";
  dedupeKey?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!isDbConfigured()) return null;
  try {
    await ensureStaffNotificationSchema();
    const organizationId = input.organizationId?.trim() || SAMS_ORG_ID;
    const permission = TYPE_PERMISSION[input.type];
    const locationIds = [
      ...new Set(
        [input.locationId, ...(input.locationIds ?? [])].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ];

    const recipients = await resolveRecipientIds({
      organizationId,
      permission,
      locationIds,
      excludeUserId: input.actorUserId,
    });
    if (!recipients.length) return null;

    const id = `sn-${crypto.randomUUID()}`;
    const dedupeKey = input.dedupeKey?.trim() || null;

    if (dedupeKey) {
      const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM staff_notifications
         WHERE organization_id = ? AND dedupe_key = ? LIMIT 1`,
        organizationId,
        dedupeKey,
      );
      if (existing[0]) return existing[0].id;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO staff_notifications
        (id, organization_id, type, title, body, entity_type, entity_id, location_id,
         actor_user_id, severity, dedupe_key, href, metadata)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS JSON))`,
      id,
      organizationId,
      input.type,
      input.title.slice(0, 255),
      input.body,
      input.entityType ?? null,
      input.entityId ?? null,
      input.locationId ?? null,
      input.actorUserId ?? null,
      input.severity ?? "info",
      dedupeKey,
      input.href ?? null,
      JSON.stringify(input.metadata ?? {}),
    );

    for (const userId of recipients) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO staff_notification_recipients (id, notification_id, user_id)
         VALUES (?,?,?)`,
        `snr-${crypto.randomUUID()}`,
        id,
        userId,
      );
    }
    return id;
  } catch (error) {
    console.error("[emitStaffNotification]", error);
    return null;
  }
}

export async function listStaffNotificationsForUser(
  actor: UserProfile,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<StaffNotificationItem[]> {
  if (!isDbConfigured()) return [];
  await ensureStaffNotificationSchema();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const unreadSql = opts.unreadOnly ? " AND r.read_at IS NULL" : "";

  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      type: string;
      title: string;
      body: string;
      href: string | null;
      entity_type: string | null;
      entity_id: string | null;
      location_id: string | null;
      severity: string;
      created_at: Date | string;
      read_at: Date | string | null;
    }[]
  >(
    `SELECT n.id, n.type, n.title, n.body, n.href, n.entity_type, n.entity_id,
            n.location_id, n.severity, n.created_at, r.read_at
     FROM staff_notification_recipients r
     INNER JOIN staff_notifications n ON n.id = r.notification_id
     WHERE r.user_id = ?${unreadSql}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    actor.id,
    limit,
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    entityType: row.entity_type,
    entityId: row.entity_id,
    locationId: row.location_id,
    severity: row.severity,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    readAt: row.read_at
      ? row.read_at instanceof Date
        ? row.read_at.toISOString()
        : new Date(row.read_at).toISOString()
      : null,
  }));
}

export async function countUnreadStaffNotifications(actor: UserProfile): Promise<number> {
  if (!isDbConfigured()) return 0;
  await ensureStaffNotificationSchema();
  const rows = await prisma.$queryRawUnsafe<{ c: number | bigint }[]>(
    `SELECT COUNT(*) AS c
     FROM staff_notification_recipients
     WHERE user_id = ? AND read_at IS NULL`,
    actor.id,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function markStaffNotificationsRead(
  actor: UserProfile,
  input: { ids?: string[]; all?: boolean },
): Promise<number> {
  if (!isDbConfigured()) return 0;
  await ensureStaffNotificationSchema();

  if (input.all) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE staff_notification_recipients
       SET read_at = NOW(3)
       WHERE user_id = ? AND read_at IS NULL`,
      actor.id,
    );
    return Number(result);
  }

  const ids = (input.ids ?? []).filter(Boolean).slice(0, 100);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const result = await prisma.$executeRawUnsafe(
    `UPDATE staff_notification_recipients
     SET read_at = NOW(3)
     WHERE user_id = ? AND read_at IS NULL AND notification_id IN (${placeholders})`,
    actor.id,
    ...ids,
  );
  return Number(result);
}

export function orgIdForActor(actor: UserProfile) {
  return actorOrganizationId(actor) ?? SAMS_ORG_ID;
}
