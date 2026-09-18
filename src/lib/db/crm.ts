import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureOrganizationSchema, actorOrganizationId, SAMS_ORG_ID } from "@/lib/db/organization";
import { moneyNumber } from "@/lib/db/money";
import { getCategories } from "@/data/categories";
import type { UserPreferences, UserProfile } from "@/types";

export type CustomerSegment = "VIP" | "Frequent" | "Inactive" | "New" | "Regular";

/** Shown in CRM. Keep in lockstep with computeSegment. */
export const CUSTOMER_SEGMENT_GUIDE: {
  id: CustomerSegment;
  rule: string;
  detail: string;
}[] = [
  {
    id: "VIP",
    rule: "$2,000+ spent",
    detail: "Lifetime spend of $2,000 or more. Checked first.",
  },
  {
    id: "Frequent",
    rule: "10+ orders",
    detail: "Ten or more orders with you, if they are not already VIP.",
  },
  {
    id: "New",
    rule: "First order",
    detail: "Exactly one order. First-time buyers, even if that order was a while ago.",
  },
  {
    id: "Inactive",
    rule: "60+ days quiet",
    detail: "No order in 60 days, or never ordered. Typical for seeded accounts with $0.",
  },
  {
    id: "Regular",
    rule: "Recent 2–9 orders",
    detail: "Everyone else who ordered in the last 60 days and is not VIP, Frequent, or New.",
  },
];

export const CUSTOMER_METRIC_GUIDE = [
  { id: "orders", label: "Orders", detail: "How many orders this customer has placed with your stores." },
  { id: "spent", label: "Spent", detail: "Net they have paid after refunds (lifetime, this organization)." },
  { id: "aov", label: "AOV", detail: "Average order value: spent ÷ orders. Shows $0 when they have no orders." },
  { id: "loyalty", label: "Loyalty", detail: "Points and tier in your store program." },
  { id: "lastOrder", label: "Last order", detail: "Date of their most recent order." },
  { id: "marketing", label: "Marketing", detail: "Whether they opted in to promotional email and offers." },
] as const;

export type CrmAddress = {
  label: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
};

export type CrmFavorite = {
  id: string;
  name: string;
  count: number;
};

export type CrmDiscountUse = {
  orderId: string;
  code: string | null;
  promotionName: string | null;
  amount: number;
  usedAt: string | null;
};

export type CrmMarketingPrefs = {
  consent: boolean;
  emails: boolean;
  sms: boolean;
  push: boolean;
};

export type CrmCustomer = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  notes?: string;
  marketingConsent: boolean;
  segment: CustomerSegment;
  totalSpent: number;
  orderCount: number;
  averageOrderValue: number;
  lastOrderAt: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
  createdAt: string;
};

export type CrmCustomerOrder = {
  id: string;
  date: string;
  createdAt: string | null;
  status: string;
  fulfillment: string;
  locationId: string;
  total: number;
  itemCount: number;
  paymentStatus: string;
  couponCode: string | null;
  discountAmount: number;
  refundedAmount: number;
};

export type CrmCustomerDetail = CrmCustomer & {
  addresses: CrmAddress[];
  favoriteProducts: CrmFavorite[];
  favoriteCategories: CrmFavorite[];
  discountsUsed: CrmDiscountUse[];
  marketingPrefs: CrmMarketingPrefs;
  orders: CrmCustomerOrder[];
};

function computeSegment(row: {
  total_spent: unknown;
  order_count: number;
  last_order_at: Date | null;
}): CustomerSegment {
  const totalSpent = moneyNumber(row.total_spent);
  const daysSinceLast = row.last_order_at
    ? (Date.now() - row.last_order_at.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  if (totalSpent >= 2000) return "VIP";
  if (row.order_count >= 10) return "Frequent";
  if (row.order_count === 1) return "New";
  if (daysSinceLast >= 60) return "Inactive";
  return "Regular";
}

/** Keep in lockstep with computeSegment. */
const SEGMENT_SQL = `CASE
  WHEN oc.total_spent >= 2000 THEN 'VIP'
  WHEN oc.order_count >= 10 THEN 'Frequent'
  WHEN oc.order_count = 1 THEN 'New'
  WHEN oc.last_order_at IS NULL OR oc.last_order_at < DATE_SUB(NOW(3), INTERVAL 60 DAY) THEN 'Inactive'
  ELSE 'Regular'
END`;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseAddresses(raw: unknown): CrmAddress[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const line1 = typeof row.line1 === "string" ? row.line1.trim() : "";
      if (!line1) return null;
      return {
        label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : "Address",
        line1,
        city: typeof row.city === "string" ? row.city : "",
        state: typeof row.state === "string" ? row.state : "",
        zip: typeof row.zip === "string" ? row.zip : "",
        isDefault: Boolean(row.isDefault),
      };
    })
    .filter((row): row is CrmAddress => Boolean(row));
}

function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  return {
    marketingEmails: typeof row.marketingEmails === "boolean" ? row.marketingEmails : undefined,
    smsUpdates: typeof row.smsUpdates === "boolean" ? row.smsUpdates : undefined,
    pushUpdates: typeof row.pushUpdates === "boolean" ? row.pushUpdates : undefined,
  };
}

function categoryName(slug: string) {
  return getCategories().find((c) => c.slug === slug)?.name ?? slug;
}

function mapCustomer(row: {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  marketing_consent: boolean | number;
  total_spent: unknown;
  order_count: number;
  last_order_at: Date | string | null;
  loyalty_points: number | null;
  loyalty_tier: string | null;
  created_at: Date | string;
}): CrmCustomer {
  const lastOrderAt =
    row.last_order_at == null
      ? null
      : row.last_order_at instanceof Date
        ? row.last_order_at
        : new Date(row.last_order_at);
  const createdAt =
    row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  const totalSpent = moneyNumber(row.total_spent);
  const orderCount = Number(row.order_count ?? 0);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone?.trim() || null,
    notes: row.notes ?? undefined,
    marketingConsent: Boolean(row.marketing_consent),
    segment: computeSegment({
      total_spent: row.total_spent,
      order_count: orderCount,
      last_order_at: lastOrderAt,
    }),
    totalSpent,
    orderCount,
    averageOrderValue: orderCount ? totalSpent / orderCount : 0,
    lastOrderAt: toIso(lastOrderAt),
    loyaltyPoints: Number(row.loyalty_points ?? 0),
    loyaltyTier: row.loyalty_tier || "Member",
    createdAt: toIso(createdAt) ?? new Date().toISOString(),
  };
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

export async function reverseOrganizationCustomer(input: {
  organizationId: string;
  userId: string;
}) {
  if (!isDbConfigured()) return;
  await ensureOrganizationSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE organization_customers
     SET total_spent = COALESCE((
           SELECT SUM(GREATEST(0, o.total - COALESCE(o.refunded_amount, 0))) FROM orders o
           WHERE o.user_id = ?
             AND o.organization_id = ?
             AND GREATEST(0, o.total - COALESCE(o.refunded_amount, 0)) > 0
         ), 0),
         order_count = (
           SELECT COUNT(*) FROM orders o
           WHERE o.user_id = ?
             AND o.organization_id = ?
             AND GREATEST(0, o.total - COALESCE(o.refunded_amount, 0)) > 0
         ),
         last_order_at = (
           SELECT MAX(o.created_at) FROM orders o
           WHERE o.user_id = ?
             AND o.organization_id = ?
             AND GREATEST(0, o.total - COALESCE(o.refunded_amount, 0)) > 0
         ),
         updated_at = NOW(3)
     WHERE organization_id = ? AND user_id = ?`,
    input.userId,
    input.organizationId,
    input.userId,
    input.organizationId,
    input.userId,
    input.organizationId,
    input.organizationId,
    input.userId,
  );
}

export async function listOrganizationCustomers(
  actor: UserProfile,
  filters: { segment?: string; q?: string; limit?: number } = {},
): Promise<CrmCustomer[]> {
  if (!isDbConfigured()) return [];
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  const limit = Math.min(filters.limit ?? 100, 300);
  const params: unknown[] = [orgId, orgId];
  let qSql = "";
  if (filters.q?.trim()) {
    qSql = ` AND (
      LOWER(u.name) LIKE LOWER(?)
      OR LOWER(u.email) LIKE LOWER(?)
    )`;
    params.push(`%${filters.q.trim()}%`, `%${filters.q.trim()}%`);
  }
  if (filters.segment && filters.segment !== "all") {
    qSql += ` AND (${SEGMENT_SQL}) = ?`;
    params.push(filters.segment);
  }
  params.push(limit);

  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      user_id: string;
      name: string;
      email: string;
      phone: string | null;
      notes: string | null;
      marketing_consent: boolean | number;
      total_spent: unknown;
      order_count: number;
      last_order_at: Date | string | null;
      loyalty_points: number | null;
      loyalty_tier: string | null;
      created_at: Date | string;
    }[]
  >(
    `SELECT oc.id, oc.user_id, u.name, u.email, oc.notes, oc.marketing_consent,
            oc.total_spent, oc.order_count, oc.last_order_at, oc.created_at,
            COALESCE(oc.loyalty_points, 0) AS loyalty_points,
            COALESCE(oc.loyalty_tier, 'Member') AS loyalty_tier,
            (
              SELECT o.delivery_phone
              FROM orders o
              WHERE o.user_id = oc.user_id
                AND o.organization_id = ?
                AND o.delivery_phone IS NOT NULL
                AND TRIM(o.delivery_phone) <> ''
              ORDER BY o.created_at DESC
              LIMIT 1
            ) AS phone
     FROM organization_customers oc
     INNER JOIN users u ON u.id = oc.user_id
     WHERE oc.organization_id = ?${qSql}
     ORDER BY oc.total_spent DESC
     LIMIT ?`,
    ...params,
  );

  return rows.map(mapCustomer);
}

export async function listCustomerOrders(
  actor: UserProfile,
  customerId: string,
  limit = 25,
): Promise<CrmCustomerOrder[]> {
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
      organizationId: orgId,
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    createdAt: row.createdAt?.toISOString?.() ?? toIso(row.createdAt),
    status: row.status,
    fulfillment: row.fulfillment,
    locationId: row.locationId,
    total: moneyNumber(row.total),
    itemCount: row.items.reduce((sum, i) => i.quantity + sum, 0),
    paymentStatus: row.paymentStatus,
    couponCode: row.couponCode ?? null,
    discountAmount: moneyNumber(row.discountAmount ?? 0),
    refundedAmount: moneyNumber((row as { refundedAmount?: unknown }).refundedAmount),
  }));
}

export async function getCustomerProfile(
  actor: UserProfile,
  customerId: string,
): Promise<CrmCustomerDetail | null> {
  if (!isDbConfigured()) return null;
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor) ?? SAMS_ORG_ID;

  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      user_id: string;
      name: string;
      email: string;
      phone: string | null;
      notes: string | null;
      marketing_consent: boolean | number;
      total_spent: unknown;
      order_count: number;
      last_order_at: Date | string | null;
      loyalty_points: number | null;
      loyalty_tier: string | null;
      created_at: Date | string;
      addresses: unknown;
      preferences: unknown;
    }[]
  >(
    `SELECT oc.id, oc.user_id, u.name, u.email, oc.notes, oc.marketing_consent,
            oc.total_spent, oc.order_count, oc.last_order_at, oc.created_at,
            COALESCE(oc.loyalty_points, 0) AS loyalty_points,
            COALESCE(oc.loyalty_tier, 'Member') AS loyalty_tier,
            u.addresses, u.preferences,
            (
              SELECT o.delivery_phone
              FROM orders o
              WHERE o.user_id = oc.user_id
                AND o.organization_id = ?
                AND o.delivery_phone IS NOT NULL
                AND TRIM(o.delivery_phone) <> ''
              ORDER BY o.created_at DESC
              LIMIT 1
            ) AS phone
     FROM organization_customers oc
     INNER JOIN users u ON u.id = oc.user_id
     WHERE oc.id = ? AND oc.organization_id = ?
     LIMIT 1`,
    orgId,
    customerId,
    orgId,
  );
  const row = rows[0];
  if (!row) return null;

  const customer = mapCustomer(row);
  const prefs = parsePreferences(row.preferences);
  const orders = await listCustomerOrders(actor, customerId, 25);

  const favoriteRows = await prisma.$queryRawUnsafe<
    { product_id: string; name: string | null; category_slug: string | null; qty: number | bigint }[]
  >(
    `SELECT oi.product_id, p.name, p.category_slug, SUM(oi.quantity) AS qty
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = ?
       AND o.organization_id = ?
       AND GREATEST(0, o.total - COALESCE(o.refunded_amount, 0)) > 0
     GROUP BY oi.product_id, p.name, p.category_slug
     ORDER BY qty DESC
     LIMIT 12`,
    row.user_id,
    orgId,
  );

  const favoriteProducts: CrmFavorite[] = favoriteRows.slice(0, 5).map((item) => ({
    id: item.product_id,
    name: item.name || item.product_id,
    count: Number(item.qty ?? 0),
  }));

  const categoryTotals = new Map<string, number>();
  for (const item of favoriteRows) {
    const slug = item.category_slug?.trim();
    if (!slug) continue;
    categoryTotals.set(slug, (categoryTotals.get(slug) ?? 0) + Number(item.qty ?? 0));
  }
  const favoriteCategories: CrmFavorite[] = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, name: categoryName(id), count }));

  const discountRows = await prisma.$queryRawUnsafe<
    {
      id: string;
      coupon_code: string | null;
      discount_amount: unknown;
      created_at: Date | string | null;
      promotion_name: string | null;
    }[]
  >(
    `SELECT o.id, o.coupon_code, o.discount_amount, o.created_at, pr.name AS promotion_name
     FROM orders o
     LEFT JOIN promotions pr ON pr.id = o.promotion_id
     WHERE o.user_id = ?
       AND o.organization_id = ?
       AND GREATEST(0, o.total - COALESCE(o.refunded_amount, 0)) > 0
       AND (
         COALESCE(o.discount_amount, 0) > 0
         OR (o.coupon_code IS NOT NULL AND TRIM(o.coupon_code) <> '')
         OR o.promotion_id IS NOT NULL
       )
     ORDER BY o.created_at DESC
     LIMIT 20`,
    row.user_id,
    orgId,
  );

  return {
    ...customer,
    addresses: parseAddresses(row.addresses),
    favoriteProducts,
    favoriteCategories,
    discountsUsed: discountRows.map((item) => ({
      orderId: item.id,
      code: item.coupon_code,
      promotionName: item.promotion_name,
      amount: moneyNumber(item.discount_amount ?? 0),
      usedAt: toIso(item.created_at),
    })),
    marketingPrefs: {
      consent: customer.marketingConsent,
      emails: prefs.marketingEmails ?? customer.marketingConsent,
      sms: prefs.smsUpdates ?? false,
      push: prefs.pushUpdates ?? false,
    },
    orders,
  };
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
