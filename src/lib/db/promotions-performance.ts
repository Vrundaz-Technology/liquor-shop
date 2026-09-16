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
    `(o.organization_id = ? OR o.organization_id IS NULL)`,
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
