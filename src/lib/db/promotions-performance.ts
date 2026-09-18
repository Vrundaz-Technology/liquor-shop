import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { moneyNumber } from "@/lib/db/money";
import { ensureOrganizationSchema } from "@/lib/db/organization";
import { accessibleLocations, canAccessLocation, hasAllLocationAccess } from "@/lib/auth/location-access";
import type { UserProfile } from "@/types";

export type PromoPerformanceSort =
  | "spent"
  | "discount"
  | "orders"
  | "customers"
  | "lastUsed"
  | "name";

export type PromoPerformanceFilters = {
  organizationId: string;
  fromDate?: string;
  toDate?: string;
  promoId?: string;
  type?: string;
  status?: "all" | "active" | "inactive" | "expired";
  sort?: PromoPerformanceSort;
  locationId?: string;
};

export type PromoOfferPerformance = {
  promoId: string;
  name: string;
  code: string | null;
  type: string;
  scope: string;
  active: boolean;
  expired: boolean;
  locationId: string | null;
  customers: number;
  orders: number;
  totalSpent: number;
  discountGiven: number;
  avgOrder: number;
  lastUsedAt: string | null;
};

export type PromoPerformanceSummary = {
  customers: number;
  orders: number;
  totalSpent: number;
  discountGiven: number;
};

type PromoRow = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  scope: string;
  active: number | boolean;
  location_id: string | null;
  ends_at: Date | string | null;
};

type AggRow = {
  promotion_id: string;
  customers: number | bigint;
  orders: number | bigint;
  total_spent: number | string | null;
  discount_given: number | string | null;
  last_used_at: Date | string | null;
};

function toYmdStart(ymd: string) {
  return `${ymd} 00:00:00`;
}

function toYmdEnd(ymd: string) {
  return `${ymd} 23:59:59`;
}

function isExpired(endsAt: Date | string | null) {
  if (!endsAt) return false;
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
}

export async function fetchPromotionPerformance(
  actor: UserProfile,
  filters: PromoPerformanceFilters,
): Promise<{ summary: PromoPerformanceSummary; offers: PromoOfferPerformance[] }> {
  if (!isDbConfigured()) {
    return {
      summary: { customers: 0, orders: 0, totalSpent: 0, discountGiven: 0 },
      offers: [],
    };
  }

  await ensureOrganizationSchema();

  const allowAll = hasAllLocationAccess(actor);
  const accessibleIds = accessibleLocations(actor).map((loc) => loc.id);
  if (!allowAll && accessibleIds.length === 0) {
    return {
      summary: { customers: 0, orders: 0, totalSpent: 0, discountGiven: 0 },
      offers: [],
    };
  }

  if (filters.locationId && filters.locationId !== "all") {
    if (!canAccessLocation(actor, filters.locationId)) {
      return {
        summary: { customers: 0, orders: 0, totalSpent: 0, discountGiven: 0 },
        offers: [],
      };
    }
  }

  const promoParams: unknown[] = [];
  const promoWhere: string[] = [
    `(p.organization_id = ? OR p.organization_id IS NULL)`,
  ];
  promoParams.push(filters.organizationId);

  if (filters.promoId) {
    promoParams.push(filters.promoId);
    promoWhere.push(`p.id = ?`);
  }
  if (filters.type && filters.type !== "all") {
    promoParams.push(filters.type);
    promoWhere.push(`p.type = ?`);
  }

  let promos = await prisma.$queryRawUnsafe<PromoRow[]>(
    `SELECT p.id, p.name, p.code, p.type, p.scope, p.active, p.location_id, p.ends_at
     FROM promotions p
     WHERE ${promoWhere.join(" AND ")}
     ORDER BY p.name ASC`,
    ...promoParams,
  );

  if (!allowAll) {
    promos = promos.filter((p) => {
      if (!p.location_id) return true;
      return accessibleIds.includes(p.location_id);
    });
  }

  const orderParams: unknown[] = [filters.organizationId];
  const orderWhere: string[] = [
    `o.promotion_id IS NOT NULL`,
    `o.status <> 'cancelled'`,
    `o.organization_id = ?`,
  ];

  if (filters.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.fromDate)) {
    orderParams.push(toYmdStart(filters.fromDate));
    orderWhere.push(`o.created_at >= ?`);
  }
  if (filters.toDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.toDate)) {
    orderParams.push(toYmdEnd(filters.toDate));
    orderWhere.push(`o.created_at <= ?`);
  }

  if (filters.locationId && filters.locationId !== "all") {
    orderParams.push(filters.locationId);
    orderWhere.push(`o.location_id = ?`);
  } else if (!allowAll) {
    accessibleIds.forEach((id) => orderParams.push(id));
    orderWhere.push(`o.location_id IN (${accessibleIds.map(() => "?").join(",")})`);
  }

  const aggs = await prisma.$queryRawUnsafe<AggRow[]>(
    `SELECT
        o.promotion_id,
        COUNT(DISTINCT o.user_id) AS customers,
        COUNT(*) AS orders,
        COALESCE(SUM(o.total), 0) AS total_spent,
        COALESCE(SUM(o.discount_amount), 0) AS discount_given,
        MAX(o.created_at) AS last_used_at
     FROM orders o
     WHERE ${orderWhere.join(" AND ")}
     GROUP BY o.promotion_id`,
    ...orderParams,
  );

  const aggByPromo = new Map(aggs.map((row) => [row.promotion_id, row]));

  let offers: PromoOfferPerformance[] = promos.map((promo) => {
    const active = Boolean(promo.active);
    const expired = isExpired(promo.ends_at);
    const agg = aggByPromo.get(promo.id);
    const customers = Number(agg?.customers ?? 0);
    const orders = Number(agg?.orders ?? 0);
    const totalSpent = moneyNumber(agg?.total_spent ?? 0);
    const discountGiven = moneyNumber(agg?.discount_given ?? 0);
    const last =
      agg?.last_used_at == null
        ? null
        : agg.last_used_at instanceof Date
          ? agg.last_used_at.toISOString()
          : new Date(agg.last_used_at).toISOString();

    return {
      promoId: promo.id,
      name: promo.name,
      code: promo.code,
      type: promo.type,
      scope: promo.scope,
      active,
      expired,
      locationId: promo.location_id,
      customers,
      orders,
      totalSpent,
      discountGiven,
      avgOrder: orders > 0 ? totalSpent / orders : 0,
      lastUsedAt: last,
    };
  });

  const status = filters.status ?? "all";
  if (status === "active") {
    offers = offers.filter((o) => o.active && !o.expired);
  } else if (status === "inactive") {
    offers = offers.filter((o) => !o.active && !o.expired);
  } else if (status === "expired") {
    offers = offers.filter((o) => o.expired);
  }

  const sort = filters.sort ?? "spent";
  offers.sort((a, b) => {
    switch (sort) {
      case "discount":
        return b.discountGiven - a.discountGiven || a.name.localeCompare(b.name);
      case "orders":
        return b.orders - a.orders || a.name.localeCompare(b.name);
      case "customers":
        return b.customers - a.customers || a.name.localeCompare(b.name);
      case "lastUsed": {
        const av = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bv = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bv - av || a.name.localeCompare(b.name);
      }
      case "name":
        return a.name.localeCompare(b.name);
      case "spent":
      default:
        return b.totalSpent - a.totalSpent || a.name.localeCompare(b.name);
    }
  });

  // Summary over filtered offers (usage in range already baked into offer rows)
  const summary = offers.reduce<PromoPerformanceSummary>(
    (acc, offer) => {
      acc.orders += offer.orders;
      acc.totalSpent += offer.totalSpent;
      acc.discountGiven += offer.discountGiven;
      return acc;
    },
    { customers: 0, orders: 0, totalSpent: 0, discountGiven: 0 },
  );

  // Distinct customers across offers need a separate query when multiple offers overlap.
  const summaryParams = [...orderParams];
  let promoIdFilter = "";
  if (filters.promoId) {
    summaryParams.push(filters.promoId);
    promoIdFilter = ` AND o.promotion_id = ?`;
  } else if (status !== "all" || (filters.type && filters.type !== "all")) {
    const ids = offers.map((o) => o.promoId);
    if (ids.length === 0) {
      summary.customers = 0;
    } else {
      ids.forEach((id) => summaryParams.push(id));
      promoIdFilter = ` AND o.promotion_id IN (${ids.map(() => "?").join(",")})`;
    }
  }

  if (promoIdFilter || status === "all") {
    const customerRows = await prisma.$queryRawUnsafe<{ c: number | bigint }[]>(
      `SELECT COUNT(DISTINCT o.user_id) AS c
       FROM orders o
       WHERE ${orderWhere.join(" AND ")}${promoIdFilter}`,
      ...summaryParams,
    );
    summary.customers = Number(customerRows[0]?.c ?? 0);
  }

  return { summary, offers };
}

export type PromoUsageOrder = {
  id: string;
  date: string;
  createdAt: string | null;
  status: string;
  fulfillment: string;
  locationId: string;
  storeName: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  couponCode: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  items: { productId: string; productName: string; quantity: number; price: number }[];
};

export type PromoUsageCustomer = {
  id: string;
  name: string;
  email: string;
  orders: number;
  totalSpent: number;
  discountGiven: number;
  lastUsedAt: string | null;
};

export type PromoUsageDetail = {
  offer: PromoOfferPerformance | null;
  orders: PromoUsageOrder[];
  customers: PromoUsageCustomer[];
};

type UsageOrderRow = {
  id: string;
  date: string;
  created_at: Date | string | null;
  status: string;
  fulfillment: string;
  location_id: string;
  store_name: string | null;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  coupon_code: string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  total: number | string | null;
};

export async function fetchPromotionUsage(
  actor: UserProfile,
  filters: {
    organizationId: string;
    promoId: string;
    fromDate?: string;
    toDate?: string;
    locationId?: string;
  },
): Promise<PromoUsageDetail> {
  const empty: PromoUsageDetail = { offer: null, orders: [], customers: [] };
  if (!isDbConfigured()) return empty;

  const { offers } = await fetchPromotionPerformance(actor, {
    organizationId: filters.organizationId,
    promoId: filters.promoId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    locationId: filters.locationId,
    status: "all",
  });
  const offer = offers.find((row) => row.promoId === filters.promoId) ?? null;
  if (!offer) return empty;

  const allowAll = hasAllLocationAccess(actor);
  const accessibleIds = accessibleLocations(actor).map((loc) => loc.id);
  if (!allowAll && accessibleIds.length === 0) return { offer, orders: [], customers: [] };

  const params: unknown[] = [];
  const where: string[] = [`o.status <> 'cancelled'`];

  if (offer.code) {
    params.push(filters.promoId, offer.code);
    where.push(
      `(o.promotion_id = ? OR (o.promotion_id IS NULL AND UPPER(COALESCE(o.coupon_code, '')) = UPPER(?)))`,
    );
  } else {
    params.push(filters.promoId);
    where.push(`o.promotion_id = ?`);
  }

  params.push(filters.organizationId);
  where.push(`o.organization_id = ?`);

  if (filters.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.fromDate)) {
    params.push(toYmdStart(filters.fromDate));
    where.push(`o.created_at >= ?`);
  }
  if (filters.toDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.toDate)) {
    params.push(toYmdEnd(filters.toDate));
    where.push(`o.created_at <= ?`);
  }

  if (filters.locationId && filters.locationId !== "all") {
    if (!canAccessLocation(actor, filters.locationId)) return { offer, orders: [], customers: [] };
    params.push(filters.locationId);
    where.push(`o.location_id = ?`);
  } else if (!allowAll) {
    accessibleIds.forEach((id) => params.push(id));
    where.push(`o.location_id IN (${accessibleIds.map(() => "?").join(",")})`);
  }

  const rows = await prisma.$queryRawUnsafe<UsageOrderRow[]>(
    `SELECT o.id, o.date, o.created_at, o.status, o.fulfillment, o.location_id, o.user_id,
            l.short_name AS store_name,
            u.name AS customer_name, u.email AS customer_email,
            o.coupon_code, o.subtotal, o.discount_amount, o.total
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN locations l ON l.id = o.location_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.created_at DESC
     LIMIT 250`,
    ...params,
  );

  const orderIds = rows.map((row) => row.id);
  const itemRows =
    orderIds.length === 0
      ? []
      : await prisma.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          include: { product: { select: { name: true } } },
        });
  const itemsByOrder = new Map<string, PromoUsageOrder["items"]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      productId: item.productId,
      productName: item.product?.name ?? item.productId,
      quantity: item.quantity,
      price: moneyNumber(item.price),
    });
    itemsByOrder.set(item.orderId, list);
  }

  const orders: PromoUsageOrder[] = rows.map((row) => ({
    id: row.id,
    date: row.date,
    createdAt:
      row.created_at == null
        ? null
        : row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    status: row.status,
    fulfillment: row.fulfillment,
    locationId: row.location_id,
    storeName: row.store_name || row.location_id,
    customerId: row.user_id,
    customerName: row.customer_name || "Guest",
    customerEmail: row.customer_email || "—",
    couponCode: row.coupon_code,
    subtotal: moneyNumber(row.subtotal ?? 0),
    discountAmount: moneyNumber(row.discount_amount ?? 0),
    total: moneyNumber(row.total ?? 0),
    items: itemsByOrder.get(row.id) ?? [],
  }));

  const byCustomer = new Map<string, PromoUsageCustomer>();
  for (const order of orders) {
    const current = byCustomer.get(order.customerId) ?? {
      id: order.customerId,
      name: order.customerName,
      email: order.customerEmail,
      orders: 0,
      totalSpent: 0,
      discountGiven: 0,
      lastUsedAt: null,
    };
    current.orders += 1;
    current.totalSpent += order.total;
    current.discountGiven += order.discountAmount;
    if (!current.lastUsedAt || (order.createdAt && order.createdAt > current.lastUsedAt)) {
      current.lastUsedAt = order.createdAt;
    }
    byCustomer.set(order.customerId, current);
  }

  return {
    offer,
    orders,
    customers: [...byCustomer.values()].sort((a, b) => b.totalSpent - a.totalSpent || b.orders - a.orders),
  };
}
