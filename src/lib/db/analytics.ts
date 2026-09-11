import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureOrganizationSchema, actorOrganizationId, SAMS_ORG_ID } from "@/lib/db/organization";
import {
  accessibleLocations,
  canAccessLocation,
  hasAllLocationAccess,
} from "@/lib/auth/location-access";
import { moneyNumber } from "@/lib/db/money";
import type { UserProfile } from "@/types";

export type LocationMetrics = {
  locationId: string;
  locationName: string;
  /** Customer-paid total (post discount + tax + delivery). */
  sales: number;
  /** Merchandise subtotal before discounts. */
  grossSales: number;
  /** Merchandise after discounts. */
  netSales: number;
  orders: number;
  avgOrder: number;
  deliveryOrders: number;
  pickupOrders: number;
  cancelledOrders: number;
  discounts: number;
  tax: number;
  deliveryRevenue: number;
  /** Not tracked yet — reserved for driver/partner cost. */
  deliveryCosts: number;
  thirdPartyDeliveryCosts: number;
  productCost: number;
  estimatedProfit: number;
};

export type AnalyticsOverview = {
  range: { from: string; to: string };
  totals: {
    sales: number;
    grossSales: number;
    netSales: number;
    orders: number;
    avgOrder: number;
    deliveryOrders: number;
    pickupOrders: number;
    cancelledOrders: number;
    /** Cancelled order value (proxy until payment refunds exist). */
    refunds: number;
    discounts: number;
    tax: number;
    deliveryRevenue: number;
    deliveryCosts: number;
    thirdPartyDeliveryCosts: number;
    productCost: number;
    estimatedCogs: number;
    estimatedProfit: number;
    newCustomers: number;
    returningCustomers: number;
  };
  locationCounts: Record<string, number>;
  locations: LocationMetrics[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  lowStock: {
    locationId: string;
    locationName: string;
    productId: string;
    productName: string;
    brand: string;
    imageUrl?: string;
    onHand: number;
    reserved: number;
    available: number;
    threshold: number;
  }[];
};

type LocAggRow = {
  location_id: string;
  location_name: string;
  orders: number | bigint;
  cancelled_orders: number | bigint;
  sales: number | string | null;
  gross_sales: number | string | null;
  discounts: number | string | null;
  tax: number | string | null;
  delivery_revenue: number | string | null;
  delivery_orders: number | bigint;
  pickup_orders: number | bigint;
  refunds: number | string | null;
};

function asCount(value: number | bigint | null | undefined) {
  if (value == null) return 0;
  return typeof value === "bigint" ? Number(value) : Number(value) || 0;
}

function firstImageUrl(images: unknown): string | undefined {
  if (Array.isArray(images)) {
    const first = images.find((v) => typeof v === "string" && v.trim());
    return typeof first === "string" ? first : undefined;
  }
  if (typeof images === "string") {
    try {
      const parsed = JSON.parse(images) as unknown;
      return firstImageUrl(parsed);
    } catch {
      return images.startsWith("/") || images.startsWith("http") ? images : undefined;
    }
  }
  return undefined;
}

function orderWhere(opts: {
  orgId: string;
  from: string;
  to: string;
  locationId?: string;
  allowAll: boolean;
  accessibleIds: string[];
}) {
  const params: unknown[] = [opts.orgId, opts.from, opts.to];
  const where: string[] = [`o.organization_id = ?`, `o.date >= ?`, `o.date <= ?`];

  if (opts.locationId && opts.locationId !== "all") {
    params.push(opts.locationId);
    where.push(`o.location_id = ?`);
  } else if (!opts.allowAll) {
    if (!opts.accessibleIds.length) return null;
    opts.accessibleIds.forEach((id) => params.push(id));
    where.push(`o.location_id IN (${opts.accessibleIds.map(() => "?").join(",")})`);
  }

  return { params, whereSql: where.join(" AND ") };
}

function financeFromRow(row: {
  sales: number;
  grossSales: number;
  discounts: number;
  tax: number;
  deliveryRevenue: number;
  productCost: number;
}) {
  const netSales = Math.max(0, row.grossSales - row.discounts);
  const productCost =
    row.productCost > 0 ? row.productCost : Math.round(netSales * 0.55 * 100) / 100;
  const deliveryCosts = 0;
  const thirdPartyDeliveryCosts = 0;
  // Profit on merchandise + delivery fee collected − estimated COGS − known delivery costs.
  const estimatedProfit =
    netSales - productCost + row.deliveryRevenue - deliveryCosts - thirdPartyDeliveryCosts;
  return {
    netSales,
    productCost,
    deliveryCosts,
    thirdPartyDeliveryCosts,
    estimatedProfit,
    estimatedCogs: productCost,
  };
}

function mapLocationRow(
  row: LocAggRow,
  productCostByLocation: Map<string, number>,
): LocationMetrics {
  const sales = moneyNumber(row.sales);
  const grossSales = moneyNumber(row.gross_sales);
  const discounts = moneyNumber(row.discounts);
  const tax = moneyNumber(row.tax);
  const deliveryRevenue = moneyNumber(row.delivery_revenue);
  const orders = asCount(row.orders);
  const finance = financeFromRow({
    sales,
    grossSales,
    discounts,
    tax,
    deliveryRevenue,
    productCost: productCostByLocation.get(row.location_id) ?? 0,
  });
  return {
    locationId: row.location_id,
    locationName: row.location_name,
    sales,
    grossSales,
    netSales: finance.netSales,
    orders,
    avgOrder: orders ? sales / orders : 0,
    deliveryOrders: asCount(row.delivery_orders),
    pickupOrders: asCount(row.pickup_orders),
    cancelledOrders: asCount(row.cancelled_orders),
    discounts,
    tax,
    deliveryRevenue,
    deliveryCosts: finance.deliveryCosts,
    thirdPartyDeliveryCosts: finance.thirdPartyDeliveryCosts,
    productCost: finance.productCost,
    estimatedProfit: finance.estimatedProfit,
  };
}

function sumLocations(locations: LocationMetrics[], refunds: number) {
  const sales = locations.reduce((s, l) => s + l.sales, 0);
  const grossSales = locations.reduce((s, l) => s + l.grossSales, 0);
  const discounts = locations.reduce((s, l) => s + l.discounts, 0);
  const tax = locations.reduce((s, l) => s + l.tax, 0);
  const deliveryRevenue = locations.reduce((s, l) => s + l.deliveryRevenue, 0);
  const productCost = locations.reduce((s, l) => s + l.productCost, 0);
  const deliveryCosts = locations.reduce((s, l) => s + l.deliveryCosts, 0);
  const thirdPartyDeliveryCosts = locations.reduce((s, l) => s + l.thirdPartyDeliveryCosts, 0);
  const netSales = Math.max(0, grossSales - discounts);
  const orders = locations.reduce((s, l) => s + l.orders, 0);
  const estimatedProfit = locations.reduce((s, l) => s + l.estimatedProfit, 0);
  return {
    sales,
    grossSales,
    netSales,
    orders,
    avgOrder: orders ? sales / orders : 0,
    deliveryOrders: locations.reduce((s, l) => s + l.deliveryOrders, 0),
    pickupOrders: locations.reduce((s, l) => s + l.pickupOrders, 0),
    cancelledOrders: locations.reduce((s, l) => s + l.cancelledOrders, 0),
    refunds,
    discounts,
    tax,
    deliveryRevenue,
    deliveryCosts,
    thirdPartyDeliveryCosts,
    productCost,
    estimatedCogs: productCost,
    estimatedProfit,
  };
}

/**
 * Owner analytics via SQL aggregations — never pulls every order row into Node.
 */
export async function fetchOwnerAnalytics(
  actor: UserProfile,
  opts: { from?: string; to?: string; locationId?: string } = {},
): Promise<AnalyticsOverview> {
  if (!isDbConfigured()) {
    return emptyAnalytics(opts);
  }
  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(actor) ?? SAMS_ORG_ID;
  const to = opts.to ?? new Date().toISOString().slice(0, 10);
  const from =
    opts.from ??
    new Date().toISOString().slice(0, 10); // default Today when caller omits range

  const allowAll = hasAllLocationAccess(actor);
  const accessible = accessibleLocations(actor);
  const accessibleIds = accessible.map((l) => l.id);

  if (
    opts.locationId &&
    opts.locationId !== "all" &&
    !canAccessLocation(actor, opts.locationId)
  ) {
    return emptyAnalytics({ from, to });
  }

  const allScope = orderWhere({
    orgId,
    from,
    to,
    locationId: "all",
    allowAll,
    accessibleIds,
  });
  if (!allScope) return emptyAnalytics({ from, to });

  const filteredScope = orderWhere({
    orgId,
    from,
    to,
    locationId: opts.locationId,
    allowAll,
    accessibleIds,
  });
  if (!filteredScope) return emptyAnalytics({ from, to });

  const lowStockParams: unknown[] = [orgId];
  let lowStockLocSql = "";
  if (opts.locationId && opts.locationId !== "all") {
    lowStockLocSql = ` AND li.location_id = ?`;
    lowStockParams.push(opts.locationId);
  } else if (!allowAll && accessibleIds.length) {
    lowStockLocSql = ` AND li.location_id IN (${accessibleIds.map(() => "?").join(",")})`;
    accessibleIds.forEach((id) => lowStockParams.push(id));
  }

  const locationSql = `SELECT
       o.location_id,
       COALESCE(l.short_name, l.name) AS location_name,
       CAST(SUM(CASE WHEN o.status <> 'cancelled' THEN 1 ELSE 0 END) AS UNSIGNED) AS orders,
       CAST(SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS UNSIGNED) AS cancelled_orders,
       CAST(COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total ELSE 0 END), 0) AS DECIMAL(14,2)) AS sales,
       CAST(COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.subtotal ELSE 0 END), 0) AS DECIMAL(14,2)) AS gross_sales,
       CAST(COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.discount_amount ELSE 0 END), 0) AS DECIMAL(14,2)) AS discounts,
       CAST(COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.tax_amount ELSE 0 END), 0) AS DECIMAL(14,2)) AS tax,
       CAST(COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.delivery_fee ELSE 0 END), 0) AS DECIMAL(14,2)) AS delivery_revenue,
       CAST(SUM(CASE WHEN o.status <> 'cancelled' AND o.fulfillment = 'delivery' THEN 1 ELSE 0 END) AS UNSIGNED) AS delivery_orders,
       CAST(SUM(CASE WHEN o.status <> 'cancelled' AND o.fulfillment = 'pickup' THEN 1 ELSE 0 END) AS UNSIGNED) AS pickup_orders,
       CAST(COALESCE(SUM(CASE WHEN o.status = 'cancelled' THEN o.total ELSE 0 END), 0) AS DECIMAL(14,2)) AS refunds
     FROM orders o
     INNER JOIN locations l ON l.id = o.location_id
     WHERE ${allScope.whereSql}
     GROUP BY o.location_id, l.short_name, l.name
     ORDER BY sales DESC`;

  const [locRows, productRows, cogsRows, lowStock, customerRows] = await Promise.all([
    prisma.$queryRawUnsafe<LocAggRow[]>(locationSql, ...allScope.params),
    prisma.$queryRawUnsafe<
      { product_id: string; name: string; quantity: number | bigint; revenue: number | string | null }[]
    >(
      `SELECT oi.product_id, p.name,
              CAST(SUM(oi.quantity) AS UNSIGNED) AS quantity,
              CAST(SUM(oi.quantity * oi.price) AS DECIMAL(14,2)) AS revenue
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       INNER JOIN products p ON p.id = oi.product_id
       WHERE ${filteredScope.whereSql} AND o.status <> 'cancelled'
       GROUP BY oi.product_id, p.name
       ORDER BY revenue DESC
       LIMIT 10`,
      ...filteredScope.params,
    ),
    prisma.$queryRawUnsafe<{ location_id: string; product_cost: number | string | null }[]>(
      `SELECT o.location_id,
              CAST(COALESCE(SUM(
                oi.quantity * COALESCE(li.cost_price, p.cost_price, 0)
              ), 0) AS DECIMAL(14,2)) AS product_cost
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       INNER JOIN products p ON p.id = oi.product_id
       LEFT JOIN location_inventory li
         ON li.location_id = o.location_id AND li.product_id = oi.product_id
       WHERE ${allScope.whereSql} AND o.status <> 'cancelled'
       GROUP BY o.location_id`,
      ...allScope.params,
    ),
    prisma.$queryRawUnsafe<
      {
        location_id: string;
        location_short_name: string;
        product_id: string;
        product_name: string;
        brand: string;
        images: unknown;
        on_hand: number | bigint;
        reserved: number | bigint;
        threshold: number | bigint;
      }[]
    >(
      `SELECT li.location_id,
              l.short_name AS location_short_name,
              li.product_id,
              p.name AS product_name,
              p.brand AS brand,
              p.images AS images,
              CAST(li.on_hand AS SIGNED) AS on_hand,
              CAST(COALESCE(li.reserved, 0) AS SIGNED) AS reserved,
              CAST(COALESCE(li.low_stock_threshold, 5) AS SIGNED) AS threshold
       FROM location_inventory li
       INNER JOIN locations l ON l.id = li.location_id
       INNER JOIN products p ON p.id = li.product_id
       WHERE l.organization_id = ?${lowStockLocSql}
         AND (li.on_hand - COALESCE(li.reserved, 0)) <= COALESCE(li.low_stock_threshold, 5)
         AND COALESCE(li.hidden, false) = false
       ORDER BY (li.on_hand - COALESCE(li.reserved, 0)) ASC, p.name ASC
       LIMIT 12`,
      ...lowStockParams,
    ),
    prisma.$queryRawUnsafe<{ new_customers: number | bigint; returning_customers: number | bigint }[]>(
      `SELECT
         CAST(COALESCE(SUM(CASE WHEN first_date >= ? AND first_date <= ? THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS new_customers,
         CAST(COALESCE(SUM(CASE WHEN first_date < ? OR first_date > ? THEN 1 ELSE 0 END), 0) AS UNSIGNED) AS returning_customers
       FROM (
         SELECT scoped.user_id, MIN(hist.date) AS first_date
         FROM (
           SELECT DISTINCT o.user_id AS user_id
           FROM orders o
           WHERE ${filteredScope.whereSql}
             AND o.status <> 'cancelled'
             AND o.user_id IS NOT NULL
         ) scoped
         INNER JOIN orders hist
           ON hist.user_id = scoped.user_id
          AND hist.organization_id = ?
          AND hist.status <> 'cancelled'
         GROUP BY scoped.user_id
       ) firsts`,
      from,
      to,
      from,
      to,
      ...filteredScope.params,
      orgId,
    ),
  ]);

  const productCostByLocation = new Map(
    cogsRows.map((row) => [row.location_id, moneyNumber(row.product_cost)] as const),
  );

  const metricsById = new Map(
    locRows.map((row) => [row.location_id, mapLocationRow(row, productCostByLocation)] as const),
  );

  // Always show every accessible store (zeros when quiet) for location comparison.
  const allLocations: LocationMetrics[] = accessible.map((loc) => {
    const existing = metricsById.get(loc.id);
    if (existing) return { ...existing, locationName: loc.shortName || loc.name };
    return {
      locationId: loc.id,
      locationName: loc.shortName || loc.name,
      sales: 0,
      grossSales: 0,
      netSales: 0,
      orders: 0,
      avgOrder: 0,
      deliveryOrders: 0,
      pickupOrders: 0,
      cancelledOrders: 0,
      discounts: 0,
      tax: 0,
      deliveryRevenue: 0,
      deliveryCosts: 0,
      thirdPartyDeliveryCosts: 0,
      productCost: 0,
      estimatedProfit: 0,
    };
  });

  // Include any DB locations not in runtime catalog (edge case).
  for (const row of locRows) {
    if (!allLocations.some((l) => l.locationId === row.location_id)) {
      allLocations.push(mapLocationRow(row, productCostByLocation));
    }
  }

  allLocations.sort((a, b) => b.sales - a.sales || a.locationName.localeCompare(b.locationName));

  const locationCounts = Object.fromEntries(allLocations.map((l) => [l.locationId, l.orders]));
  const selectedId = opts.locationId && opts.locationId !== "all" ? opts.locationId : null;
  const locationsForTotals = selectedId
    ? allLocations.filter((l) => l.locationId === selectedId)
    : allLocations;
  const refunds = locRows
    .filter((row) => !selectedId || row.location_id === selectedId)
    .reduce((s, row) => s + moneyNumber(row.refunds), 0);
  const baseTotals = sumLocations(locationsForTotals, refunds);
  const customer = customerRows[0];

  return {
    range: { from, to },
    totals: {
      ...baseTotals,
      newCustomers: asCount(customer?.new_customers),
      returningCustomers: asCount(customer?.returning_customers),
    },
    locationCounts,
    locations: allLocations,
    topProducts: productRows.map((p) => ({
      productId: p.product_id,
      name: p.name,
      quantity: asCount(p.quantity),
      revenue: moneyNumber(p.revenue),
    })),
    lowStock: lowStock.map((r) => {
      const onHand = asCount(r.on_hand);
      const reserved = asCount(r.reserved);
      return {
        locationId: r.location_id,
        locationName: r.location_short_name,
        productId: r.product_id,
        productName: r.product_name,
        brand: r.brand,
        imageUrl: firstImageUrl(r.images),
        onHand,
        reserved,
        available: Math.max(0, onHand - reserved),
        threshold: asCount(r.threshold) || 5,
      };
    }),
  };
}

function emptyAnalytics(opts: { from?: string; to?: string }): AnalyticsOverview {
  const to = opts.to ?? new Date().toISOString().slice(0, 10);
  const from = opts.from ?? to;
  return {
    range: { from, to },
    totals: {
      sales: 0,
      grossSales: 0,
      netSales: 0,
      orders: 0,
      avgOrder: 0,
      deliveryOrders: 0,
      pickupOrders: 0,
      cancelledOrders: 0,
      refunds: 0,
      discounts: 0,
      tax: 0,
      deliveryRevenue: 0,
      deliveryCosts: 0,
      thirdPartyDeliveryCosts: 0,
      productCost: 0,
      estimatedCogs: 0,
      estimatedProfit: 0,
      newCustomers: 0,
      returningCustomers: 0,
    },
    locationCounts: {},
    locations: [],
    topProducts: [],
    lowStock: [],
  };
}
