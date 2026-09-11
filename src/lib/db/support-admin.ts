import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { SAMS_ORG_ID, resolveLocationOrganizationId } from "@/lib/db/organization";
import { routeSupportTicket } from "@/lib/support/routing";
import type {
  SupportCategory,
  SupportMessage,
  SupportTicket,
  SupportTicketStatus,
  SupportRouteScope,
  UserProfile,
} from "@/types";
import { canAccessLocation, hasAllLocationAccess } from "@/lib/auth/location-access";
import { isStaffRole } from "@/lib/auth/roles";

let ready = false;

export async function ensureSupportSchema() {
  if (!isDbConfigured() || ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      organization_id VARCHAR(191) NOT NULL,
      location_id VARCHAR(191) NULL,
      order_id VARCHAR(191) NULL,
      user_id VARCHAR(191) NOT NULL,
      category VARCHAR(64) NOT NULL,
      subject VARCHAR(191) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      route_scope VARCHAR(32) NOT NULL,
      route_reason VARCHAR(255) NULL,
      assignee_user_id VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX support_tickets_org_idx (organization_id),
      INDEX support_tickets_location_idx (location_id),
      INDEX support_tickets_user_idx (user_id),
      INDEX support_tickets_status_idx (status),
      INDEX support_tickets_category_idx (category),
      INDEX support_tickets_order_idx (order_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      ticket_id VARCHAR(191) NOT NULL,
      author_user_id VARCHAR(191) NULL,
      author_name VARCHAR(191) NOT NULL,
      author_role VARCHAR(32) NOT NULL DEFAULT 'customer',
      body TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX support_messages_ticket_idx (ticket_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  ready = true;
}

type TicketRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
  order_id: string | null;
  user_id: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  route_scope: string;
  route_reason: string | null;
  assignee_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  customer_name?: string;
  customer_email?: string;
};

type MessageRow = {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_name: string;
  author_role: string;
  body: string;
  created_at: Date | string;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function mapSupportMessage(row: MessageRow): SupportMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorUserId: row.author_user_id ?? undefined,
    authorName: row.author_name,
    authorRole: row.author_role as SupportMessage["authorRole"],
    body: row.body,
    createdAt: iso(row.created_at),
  };
}

export function mapSupportTicket(row: TicketRow, messages: SupportMessage[] = []): SupportTicket {
  return {
    id: row.id,
    organizationId: row.organization_id,
    locationId: row.location_id ?? undefined,
    orderId: row.order_id ?? undefined,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    category: row.category as SupportCategory,
    subject: row.subject,
    status: row.status as SupportTicketStatus,
    priority: (row.priority as SupportTicket["priority"]) || "normal",
    routeScope: row.route_scope as SupportRouteScope,
    routeReason: row.route_reason ?? undefined,
    assigneeUserId: row.assignee_user_id ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    messages,
  };
}

async function loadMessages(ticketId: string): Promise<SupportMessage[]> {
  const rows = await prisma.$queryRawUnsafe<MessageRow[]>(
    `SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC`,
    ticketId,
  );
  return rows.map(mapSupportMessage);
}

export async function createSupportTicket(input: {
  user: UserProfile;
  category: SupportCategory;
  subject: string;
  body: string;
  orderId?: string | null;
  locationId?: string | null;
  priority?: SupportTicket["priority"];
}): Promise<SupportTicket> {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureSupportSchema();

  let orderLocationId: string | null = null;
  let organizationId = input.user.organizationId || SAMS_ORG_ID;

  if (input.orderId) {
    const orders = await prisma.order.findMany({
      where: { id: input.orderId, userId: input.user.id },
      take: 1,
    });
    const order = orders[0];
    if (!order) throw new Error("Order not found for this account.");
    orderLocationId = order.locationId;
    organizationId =
      (await resolveLocationOrganizationId(order.locationId)) ?? organizationId;
  } else if (input.locationId) {
    organizationId =
      (await resolveLocationOrganizationId(input.locationId)) ?? organizationId;
  }

  const route = routeSupportTicket({
    category: input.category,
    organizationId,
    orderLocationId,
    preferredLocationId: input.user.preferredBranchId,
    selectedLocationId: input.locationId,
  });

  const id = `TCK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
  const messageId = `msg-${crypto.randomUUID()}`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO support_tickets
      (id, organization_id, location_id, order_id, user_id, category, subject, status, priority,
       route_scope, route_reason, assignee_user_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,'open',?,?,?,NULL,NOW(3),NOW(3))`,
    id,
    route.organizationId,
    route.locationId,
    input.orderId ?? null,
    input.user.id,
    input.category,
    input.subject.trim().slice(0, 191),
    input.priority ?? "normal",
    route.scope,
    route.reason,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO support_messages
      (id, ticket_id, author_user_id, author_name, author_role, body, created_at)
     VALUES (?,?,?,?, 'customer', ?, NOW(3))`,
    messageId,
    id,
    input.user.id,
    input.user.name,
    input.body.trim(),
  );

  return getSupportTicketById(id, { forUserId: input.user.id });
}

export async function getSupportTicketById(
  ticketId: string,
  opts?: { forUserId?: string; actor?: UserProfile },
): Promise<SupportTicket> {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureSupportSchema();
  const rows = await prisma.$queryRawUnsafe<(TicketRow & { customer_name: string; customer_email: string })[]>(
    `SELECT t.*, u.name AS customer_name, u.email AS customer_email
     FROM support_tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.id = ?
     LIMIT 1`,
    ticketId,
  );
  const row = rows[0];
  if (!row) throw new Error("Ticket not found.");

  if (opts?.forUserId && row.user_id !== opts.forUserId) {
    throw new Error("Ticket not found.");
  }
  if (opts?.actor && isStaffRole(opts.actor)) {
    assertStaffCanSeeTicket(opts.actor, row);
  }

  const messages = await loadMessages(ticketId);
  return mapSupportTicket(row, messages);
}

function assertStaffCanSeeTicket(actor: UserProfile, row: TicketRow) {
  if (row.route_scope === "platform" || row.route_scope === "owner") {
    if (actor.role !== "owner" && actor.role !== "admin" && !hasAllLocationAccess(actor)) {
      // Store-scoped CSR can still see owner-routed tickets for their org if they have support.manage
      // but not platform — allow owner/admin only for platform.
      if (row.route_scope === "platform" && actor.role !== "owner") {
        throw new Error("This ticket is routed to platform support.");
      }
    }
  }
  if (row.location_id && !canAccessLocation(actor, row.location_id)) {
    throw new Error("You do not have access to this store's tickets.");
  }
}

export async function listCustomerTickets(userId: string): Promise<SupportTicket[]> {
  if (!isDbConfigured()) return [];
  await ensureSupportSchema();
  const rows = await prisma.$queryRawUnsafe<TicketRow[]>(
    `SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    userId,
  );
  return rows.map((row) => mapSupportTicket(row));
}

export async function listStaffTickets(input: {
  actor: UserProfile;
  status?: SupportTicketStatus | "all";
  category?: SupportCategory | "all";
  scope?: SupportRouteScope | "all";
  locationId?: string | "all";
  q?: string;
  limit?: number;
}): Promise<SupportTicket[]> {
  if (!isDbConfigured()) return [];
  await ensureSupportSchema();

  const where: string[] = ["1=1"];
  const params: unknown[] = [];

  if (input.status && input.status !== "all") {
    where.push(`t.status = ?`);
    params.push(input.status);
  }
  if (input.category && input.category !== "all") {
    where.push(`t.category = ?`);
    params.push(input.category);
  }
  if (input.scope && input.scope !== "all") {
    where.push(`t.route_scope = ?`);
    params.push(input.scope);
  }
  if (input.locationId && input.locationId !== "all") {
    where.push(`t.location_id = ?`);
    params.push(input.locationId);
  }
  if (input.q?.trim()) {
    where.push(
      `(t.subject LIKE ? OR t.id LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR t.order_id LIKE ?)`,
    );
    const like = `%${input.q.trim()}%`;
    params.push(like, like, like, like, like);
  }

  // Store-scoped staff: only tickets for their locations (not org-wide owner inbox).
  if (!hasAllLocationAccess(input.actor) && input.actor.allowedLocationIds?.length) {
    const ids = input.actor.allowedLocationIds;
    where.push(`t.location_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  } else if (input.actor.role !== "owner" && input.actor.role !== "admin") {
    where.push(`t.route_scope <> 'platform'`);
  }

  const limit = Math.min(150, Math.max(1, input.limit ?? 80));
  params.push(limit);

  const rows = await prisma.$queryRawUnsafe<(TicketRow & { customer_name: string; customer_email: string })[]>(
    `SELECT t.*, u.name AS customer_name, u.email AS customer_email
     FROM support_tickets t
     JOIN users u ON u.id = t.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY
       CASE t.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
       t.updated_at DESC
     LIMIT ?`,
    ...params,
  );

  return rows
    .filter((row) => {
      if (row.location_id && !canAccessLocation(input.actor, row.location_id)) return false;
      if (row.route_scope === "platform" && input.actor.role !== "owner") return false;
      return true;
    })
    .map((row) => mapSupportTicket(row));
}

export async function addSupportMessage(input: {
  ticketId: string;
  author: UserProfile;
  body: string;
  asStaff?: boolean;
}): Promise<SupportTicket> {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureSupportSchema();

  const ticket = await getSupportTicketById(input.ticketId, {
    forUserId: input.asStaff ? undefined : input.author.id,
    actor: input.asStaff ? input.author : undefined,
  });

  if (ticket.status === "closed") {
    throw new Error("This ticket is closed.");
  }

  const messageId = `msg-${crypto.randomUUID()}`;
  const role = input.asStaff ? "staff" : "customer";
  await prisma.$executeRawUnsafe(
    `INSERT INTO support_messages
      (id, ticket_id, author_user_id, author_name, author_role, body, created_at)
     VALUES (?,?,?,?,?,?, NOW(3))`,
    messageId,
    input.ticketId,
    input.author.id,
    input.author.name,
    role,
    input.body.trim(),
  );

  const nextStatus =
    role === "staff"
      ? ticket.status === "open"
        ? "pending"
        : ticket.status
      : "open";

  await prisma.$executeRawUnsafe(
    `UPDATE support_tickets SET status = ?, updated_at = NOW(3) WHERE id = ?`,
    nextStatus,
    input.ticketId,
  );

  return getSupportTicketById(input.ticketId, {
    forUserId: input.asStaff ? undefined : input.author.id,
    actor: input.asStaff ? input.author : undefined,
  });
}

export async function updateSupportTicket(input: {
  ticketId: string;
  actor: UserProfile;
  status?: SupportTicketStatus;
  assigneeUserId?: string | null;
  priority?: SupportTicket["priority"];
}): Promise<SupportTicket> {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureSupportSchema();
  await getSupportTicketById(input.ticketId, { actor: input.actor });

  const sets: string[] = ["updated_at = NOW(3)"];
  const params: unknown[] = [];
  if (input.status) {
    sets.push(`status = ?`);
    params.push(input.status);
  }
  if (input.priority) {
    sets.push(`priority = ?`);
    params.push(input.priority);
  }
  if (input.assigneeUserId !== undefined) {
    sets.push(`assignee_user_id = ?`);
    params.push(input.assigneeUserId);
  }
  params.push(input.ticketId);
  await prisma.$executeRawUnsafe(
    `UPDATE support_tickets SET ${sets.join(", ")} WHERE id = ?`,
    ...params,
  );

  return getSupportTicketById(input.ticketId, { actor: input.actor });
}

export async function supportTrends(actor: UserProfile, locationId?: string | null) {
  if (!isDbConfigured()) {
    return { open: 0, pending: 0, resolved: 0, closed: 0, last7Days: 0, byCategory: {} as Record<string, number> };
  }
  await ensureSupportSchema();
  const locClause = locationId ? `AND location_id = ?` : "";
  const params = locationId ? [locationId] : [];

  // Hide platform from non-owners
  const platformClause =
    actor.role === "owner" ? "" : `AND route_scope <> 'platform'`;

  const summary = await prisma.$queryRawUnsafe<
    {
      open_cnt: number | bigint;
      pending_cnt: number | bigint;
      resolved_cnt: number | bigint;
      closed_cnt: number | bigint;
      last7: number | bigint;
    }[]
  >(
    `SELECT
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_cnt,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_cnt,
       SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_cnt,
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_cnt,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS last7
     FROM support_tickets
     WHERE 1=1 ${locClause} ${platformClause}`,
    ...params,
  );

  const byCat = await prisma.$queryRawUnsafe<{ category: string; cnt: number | bigint }[]>(
    `SELECT category, COUNT(*) AS cnt FROM support_tickets
     WHERE 1=1 ${locClause} ${platformClause}
     GROUP BY category`,
    ...params,
  );

  const s = summary[0];
  const byCategory: Record<string, number> = {};
  for (const row of byCat) byCategory[row.category] = Number(row.cnt);

  return {
    open: Number(s?.open_cnt ?? 0),
    pending: Number(s?.pending_cnt ?? 0),
    resolved: Number(s?.resolved_cnt ?? 0),
    closed: Number(s?.closed_cnt ?? 0),
    last7Days: Number(s?.last7 ?? 0),
    byCategory,
  };
}
