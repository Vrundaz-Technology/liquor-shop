import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureOrganizationSchema, actorOrganizationId, SAMS_ORG_ID } from "@/lib/db/organization";
import { moneyNumber } from "@/lib/db/money";
import type { UserProfile } from "@/types";

export type CustomerSegment = "VIP" | "Frequent" | "Inactive" | "New" | "Regular";

export type CrmCustomer = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  marketingConsent: boolean;
  segment: CustomerSegment;
  totalSpent: number;
  orderCount: number;
  averageOrderValue: number;
  lastOrderAt?: string;
  createdAt: string;
};

function computeSegment(row: {
  total_spent: unknown;
  order_count: number;
  last_order_at: Date | null;
  created_at: Date;
}): CustomerSegment {
  const totalSpent = moneyNumber(row.total_spent);
  const daysSinceLast = row.last_order_at
    ? (Date.now() - row.last_order_at.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  if (totalSpent >= 2000) return "VIP";
  if (row.order_count >= 10) return "Frequent";
  if (row.order_count <= 1 && daysSinceLast < 60) return "New";
  if (daysSinceLast >= 60) return "Inactive";
  return "Regular";
}

export async function syncOrganizationCustomer(input: {
  organizationId: string;
  userId: string;
  orderTotal: number;
}) {
  if (!isDbConfigured()) return;
  await ensureOrganizationSchema();
  const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM organization_customers WHERE organization_id = ? AND user_id = ? LIMIT 1`,
    input.organizationId,
    input.userId,
  );
  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE organization_customers
       SET total_spent = total_spent + ?,
           order_count = order_count + 1,
           last_order_at = NOW(3),
           updated_at = NOW(3)
       WHERE id = ?`,
      input.orderTotal,
      existing[0].id,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO organization_customers
        (id, organization_id, user_id, total_spent, order_count, last_order_at, marketing_consent)
       VALUES (?,?,?,?,1,NOW(3),false)`,
      `oc-${crypto.randomUUID()}`,
      input.organizationId,
      input.userId,
      input.orderTotal,
    );
  }
}

export async function listOrganizationCustomers(
  actor: UserProfile,
  filters: { segment?: string; q?: string; limit?: number } = {},
): Promise<CrmCustomer[]> {
  if (!isDbConfigured()) return [];
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  const limit = Math.min(filters.limit ?? 100, 300);
  const params: unknown[] = [orgId];
  let qSql = "";
  if (filters.q?.trim()) {
    qSql = ` AND (LOWER(u.name) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?))`;
    params.push(`%${filters.q.trim()}%`, `%${filters.q.trim()}%`);
  }
  params.push(limit);

  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      user_id: string;
      name: string;
      email: string;
      notes: string | null;
      marketing_consent: boolean;
      total_spent: number;
      order_count: number;
      last_order_at: Date | null;
      created_at: Date;
    }[]
  >(
    `SELECT oc.id, oc.user_id, u.name, u.email, oc.notes, oc.marketing_consent,
            oc.total_spent, oc.order_count, oc.last_order_at, oc.created_at
     FROM organization_customers oc
     INNER JOIN users u ON u.id = oc.user_id
     WHERE oc.organization_id = ?${qSql}
     ORDER BY oc.total_spent DESC
     LIMIT ?`,
    ...params,
  );

  const mapped = rows.map((row) => {
    const segment = computeSegment(row);
    const totalSpent = moneyNumber(row.total_spent);
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      email: row.email,
      notes: row.notes ?? undefined,
      marketingConsent: row.marketing_consent,
      segment,
      totalSpent,
      orderCount: row.order_count,
      averageOrderValue: row.order_count ? totalSpent / row.order_count : 0,
      lastOrderAt: row.last_order_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
    } satisfies CrmCustomer;
  });

  if (filters.segment && filters.segment !== "all") {
    return mapped.filter((c) => c.segment === filters.segment);
  }
  return mapped;
}

export async function listCustomerOrders(
  actor: UserProfile,
  customerId: string,
  limit = 25,
) {
  if (!isDbConfigured()) return [];
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  const customers = await prisma.$queryRawUnsafe<{ user_id: string }[]>(
    `SELECT user_id FROM organization_customers WHERE id = ? AND organization_id = ? LIMIT 1`,
    customerId,
    orgId,
  );
  const userId = customers[0]?.user_id;
  if (!userId) return [];

  const rows = await prisma.order.findMany({
    where: {
      userId,
      OR: [{ organizationId: orgId }, { organizationId: null }],
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    status: row.status,
    fulfillment: row.fulfillment,
    locationId: row.locationId,
    total: moneyNumber(row.total),
    itemCount: row.items.reduce((sum, i) => sum + i.quantity, 0),
    paymentStatus: row.paymentStatus,
  }));
}

export async function getCustomerCrmSnapshot(
  actor: UserProfile,
  customerId: string,
): Promise<{ notes: string; marketingConsent: boolean } | null> {
  if (!isDbConfigured()) return null;
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  const rows = await prisma.$queryRawUnsafe<
    { notes: string | null; marketing_consent: boolean | number }[]
  >(
    `SELECT notes, marketing_consent FROM organization_customers
     WHERE id = ? AND organization_id = ? LIMIT 1`,
    customerId,
    orgId,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    notes: row.notes ?? "",
    marketingConsent: Boolean(row.marketing_consent),
  };
}

export async function updateCustomerNotes(
  actor: UserProfile,
  customerId: string,
  notes: string,
  marketingConsent?: boolean,
) {
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  await prisma.$executeRawUnsafe(
    `UPDATE organization_customers
     SET notes = ?, marketing_consent = COALESCE(?, marketing_consent), updated_at = NOW(3)
     WHERE id = ? AND organization_id = ?`,
    notes,
    marketingConsent ?? null,
    customerId,
    orgId,
  );
}
