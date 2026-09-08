import type { Prisma } from "@prisma/client";
import type { ActivityAction, ActivityEntityType, ActivityLogEntry } from "@/types";
import { prisma, isDbConfigured } from "@/lib/db/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type ActivityInput = {
  actorUserId?: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
  locationId?: string;
};

async function snapshotActor(db: Db, userId?: string | null) {
  if (!userId) {
    return {
      actorUserId: null,
      actorName: "Guest",
      actorEmail: null as string | null,
      actorRole: "guest",
    };
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    return {
      actorUserId: userId,
      actorName: "Unknown user",
      actorEmail: null as string | null,
      actorRole: "unknown",
    };
  }
  return {
    actorUserId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    actorRole: user.role,
  };
}

export async function recordActivity(input: ActivityInput, db: Db = prisma) {
  if (!isDbConfigured()) return;
  const actor = await snapshotActor(db, input.actorUserId);
  await db.activityLog.create({
    data: {
      ...actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      locationId: input.locationId,
    },
  });
}

export function mapActivity(row: {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Prisma.JsonValue;
  locationId: string | null;
  createdAt: Date;
}): ActivityLogEntry {
  return {
    id: row.id,
    actorUserId: row.actorUserId ?? undefined,
    actorName: row.actorName,
    actorEmail: row.actorEmail ?? undefined,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? undefined,
    summary: row.summary,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : undefined,
    locationId: row.locationId ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date().toISOString(),
  };
}

export async function fetchActivityLogs(filters: {
  action?: string;
  actorUserId?: string;
  entityType?: string;
  locationId?: string;
  /** When set (and locationId is not), restrict to these stores plus global (null) events. */
  locationIds?: string[];
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}) {
  if (!isDbConfigured()) {
    return { logs: [] as ActivityLogEntry[], total: 0 };
  }

  const fromDate = parseIsoBound(filters.from);
  const toDate = parseIsoBound(filters.to);
  const createdAt =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        }
      : undefined;

  const andParts: Prisma.ActivityLogWhereInput[] = [];
  if (filters.locationId) {
    andParts.push({ locationId: filters.locationId });
  } else if (filters.locationIds) {
    andParts.push({
      OR: [
        { locationId: { in: filters.locationIds } },
        { locationId: null },
      ],
    });
  }
  if (filters.q) {
    andParts.push({
      OR: [
        { summary: { contains: filters.q } },
        { actorName: { contains: filters.q } },
        { actorEmail: { contains: filters.q } },
        { entityId: { contains: filters.q } },
      ],
    });
  }

  const where: Prisma.ActivityLogWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(andParts.length ? { AND: andParts } : {}),
  };

  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);
  const dir = filters.sortDir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.ActivityLogOrderByWithRelationInput =
    filters.sortKey === "user"
      ? { actorName: dir }
      : filters.sortKey === "action"
        ? { action: dir }
        : filters.sortKey === "entity"
          ? { entityType: dir }
          : { createdAt: dir }; // when / default

  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { logs: rows.map(mapActivity), total };
}

function parseIsoBound(value?: string) {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
