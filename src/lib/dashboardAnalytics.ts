import { format, parseISO, startOfMonth } from "date-fns";
import { getProductById } from "@/data/products";
import { getLocationById } from "@/data/locations";
import type { Order, UserProfile } from "@/types";

export const CHART_COLORS = {
  gold: "#c9a962",
  goldBright: "#e4c878",
  goldDim: "#8a7340",
  cream: "#f3ead7",
  muted: "#9a9488",
  success: "#6d9b7a",
  danger: "#c45c5c",
  info: "#7a8fa8",
  grid: "rgba(255,255,255,0.06)",
  tooltipBg: "#141414",
  tooltipBorder: "rgba(201,169,98,0.25)",
  series: [
    "#c9a962",
    "#e4c878",
    "#6d9b7a",
    "#8a7340",
    "#7a8fa8",
    "#c45c5c",
    "#a67c52",
    "#b8a48a",
  ],
};

const TIER_THRESHOLDS = {
  Member: 0,
  Connoisseur: 500,
  Collector: 1500,
  VIP: 3000,
} as const;

const STATUS_LABELS: Record<Order["status"], string> = {
  new: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Assigned",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  completed: "Completed",
  cancelled: "Cancelled",
  processing: "Processing",
  shipped: "Shipped",
};

const STATUS_FILLS: Record<Order["status"], string> = {
  new: CHART_COLORS.goldBright,
  accepted: CHART_COLORS.goldBright,
  preparing: CHART_COLORS.gold,
  ready: CHART_COLORS.gold,
  assigned: CHART_COLORS.info,
  out_for_delivery: CHART_COLORS.info,
  delivered: CHART_COLORS.success,
  ready_for_pickup: CHART_COLORS.gold,
  picked_up: CHART_COLORS.success,
  completed: CHART_COLORS.success,
  cancelled: CHART_COLORS.danger,
  processing: CHART_COLORS.goldBright,
  shipped: CHART_COLORS.info,
};

export type ChartSelection =
  | { type: "month"; key: string; label: string }
  | { type: "category"; key: string; label: string }
  | { type: "product"; key: string; label: string }
  | { type: "branch"; key: string; label: string }
  | { type: "status"; key: Order["status"]; label: string }
  | { type: "fulfillment"; key: Order["fulfillment"]; label: string };

export function activeOrders(orders: Order[]) {
  return orders.filter((o) =>
    ![
      "delivered",
      "picked_up",
      "completed",
      "cancelled",
    ].includes(o.status),
  );
}

export function completedOrders(orders: Order[]) {
  return orders.filter((o) => o.status !== "cancelled");
}

export function filterOrdersByLocation(
  orders: Order[],
  locationId: string | "all",
): Order[] {
  if (locationId === "all") return orders;
  return orders.filter((o) => o.locationId === locationId);
}

export function buildDashboardMetrics(
  profile: UserProfile,
  locationId: string | "all" = "all",
) {
  const orders = [...filterOrdersByLocation(profile.orders, locationId)].sort(
    (a, b) => (a.date < b.date ? 1 : -1),
  );
  const billed = completedOrders(orders);
  const totalSpent = billed.reduce((sum, o) => sum + o.total, 0);
  const avgOrder = billed.length ? totalSpent / billed.length : 0;
  const bottles = billed.reduce(
    (sum, o) => sum + o.items.reduce((n, i) => n + i.quantity, 0),
    0,
  );
  const active = activeOrders(orders);

  const prevHalf = billed.slice(Math.floor(billed.length / 2));
  const recentHalf = billed.slice(0, Math.floor(billed.length / 2) || 1);
  const prevSpend = prevHalf.reduce((s, o) => s + o.total, 0);
  const recentSpend = recentHalf.reduce((s, o) => s + o.total, 0);
  const spendTrend =
    prevSpend > 0 ? ((recentSpend - prevSpend) / prevSpend) * 100 : 0;

  const nextTier =
    profile.loyaltyTier === "VIP"
      ? null
      : profile.loyaltyTier === "Collector"
        ? "VIP"
        : profile.loyaltyTier === "Connoisseur"
          ? "Collector"
          : "Connoisseur";
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;
  const loyaltyProgress = nextThreshold
    ? Math.min(100, (profile.loyaltyPoints / nextThreshold) * 100)
    : 100;

  return {
    orders,
    billed,
    totalSpent,
    avgOrder,
    bottles,
    activeCount: active.length,
    orderCount: orders.length,
    spendTrend,
    nextTier,
    nextThreshold,
    loyaltyProgress,
    pointsToNext: nextThreshold
      ? Math.max(0, nextThreshold - profile.loyaltyPoints)
      : 0,
    locationId,
  };
}

export function monthlySpendSeries(orders: Order[]) {
  const map = new Map<
    string,
    { key: string; month: string; spend: number; orders: number }
  >();

  for (const order of completedOrders(orders)) {
    const key = format(startOfMonth(parseISO(order.date)), "yyyy-MM");
    const cur = map.get(key) ?? {
      key,
      month: format(startOfMonth(parseISO(order.date)), "MMM"),
      spend: 0,
      orders: 0,
    };
    cur.spend += order.total;
    cur.orders += 1;
    map.set(key, cur);
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, v]) => ({
      key,
      month: v.month,
      label: format(parseISO(`${key}-01`), "MMMM yyyy"),
      spend: Math.round(v.spend * 100) / 100,
      orders: v.orders,
    }));
}

export function categorySpendSeries(orders: Order[]) {
  const map = new Map<string, number>();

  for (const order of completedOrders(orders)) {
    for (const item of order.items) {
      const product = getProductById(item.productId);
      const cat = product?.category ?? "other";
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      map.set(label, (map.get(label) ?? 0) + item.price * item.quantity);
    }
  }

  return [...map.entries()]
    .map(([name, value], i) => ({
      name,
      value: Math.round(value * 100) / 100,
      fill: CHART_COLORS.series[i % CHART_COLORS.series.length],
    }))
    .sort((a, b) => b.value - a.value);
}

export function fulfillmentSeries(orders: Order[]) {
  const map = { delivery: 0, pickup: 0, pos: 0 };
  for (const order of completedOrders(orders)) {
    map[order.fulfillment] += 1;
  }
  return [
    {
      name: "Delivery",
      key: "delivery" as const,
      value: map.delivery,
      fill: CHART_COLORS.gold,
    },
    {
      name: "Pickup",
      key: "pickup" as const,
      value: map.pickup,
      fill: CHART_COLORS.info,
    },
    {
      name: "In-store",
      key: "pos" as const,
      value: map.pos,
      fill: CHART_COLORS.success,
    },
  ];
}

export function statusSeries(orders: Order[]) {
  const map = new Map<Order["status"], number>();
  for (const order of orders) {
    map.set(order.status, (map.get(order.status) ?? 0) + 1);
  }
  return [...map.entries()].map(([status, value]) => ({
    name: STATUS_LABELS[status],
    key: status,
    value,
    fill: STATUS_FILLS[status],
  }));
}

export function branchSpendSeries(orders: Order[]) {
  const map = new Map<string, { name: string; spend: number; id: string }>();
  for (const order of completedOrders(orders)) {
    const loc = getLocationById(order.locationId);
    const name = loc?.shortName ?? order.locationId;
    const cur = map.get(order.locationId) ?? {
      name,
      spend: 0,
      id: order.locationId,
    };
    cur.spend += order.total;
    map.set(order.locationId, cur);
  }
  return [...map.values()]
    .map((row, i) => ({
      name: row.name,
      key: row.id,
      spend: Math.round(row.spend * 100) / 100,
      fill: CHART_COLORS.series[i % CHART_COLORS.series.length],
    }))
    .sort((a, b) => b.spend - a.spend);
}

export function topProductsSeries(orders: Order[], limit = 5) {
  const map = new Map<
    string,
    { id: string; name: string; quantity: number; spend: number }
  >();

  for (const order of completedOrders(orders)) {
    for (const item of order.items) {
      const product = getProductById(item.productId);
      const name = product?.name ?? item.productId;
      const cur = map.get(item.productId) ?? {
        id: item.productId,
        name,
        quantity: 0,
        spend: 0,
      };
      cur.quantity += item.quantity;
      cur.spend += item.price * item.quantity;
      map.set(item.productId, cur);
    }
  }

  return [...map.values()]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      key: row.id,
      spend: Math.round(row.spend * 100) / 100,
      shortName:
        row.name.length > 22 ? `${row.name.slice(0, 20)}…` : row.name,
    }));
}

export function filterOrdersBySelection(
  orders: Order[],
  selection: ChartSelection | null,
): Order[] {
  if (!selection) return orders;

  switch (selection.type) {
    case "month":
      return completedOrders(orders).filter(
        (o) => format(startOfMonth(parseISO(o.date)), "yyyy-MM") === selection.key,
      );
    case "category":
      return completedOrders(orders).filter((o) =>
        o.items.some((item) => {
          const p = getProductById(item.productId);
          const cat = (p?.category ?? "other").toLowerCase();
          return cat === selection.key.toLowerCase();
        }),
      );
    case "product":
      return completedOrders(orders).filter((o) =>
        o.items.some((item) => item.productId === selection.key),
      );
    case "branch":
      return completedOrders(orders).filter(
        (o) => o.locationId === selection.key,
      );
    case "status":
      return orders.filter((o) => o.status === selection.key);
    case "fulfillment":
      return completedOrders(orders).filter(
        (o) => o.fulfillment === selection.key,
      );
    default:
      return orders;
  }
}

export function buildSelectionDetails(
  orders: Order[],
  selection: ChartSelection,
) {
  const matched = filterOrdersBySelection(orders, selection);
  const forSpend =
    selection.type === "status"
      ? matched.filter((o) => o.status !== "cancelled")
      : matched;

  let lineSpend = forSpend.reduce((s, o) => s + o.total, 0);
  let bottles = forSpend.reduce(
    (s, o) => s + o.items.reduce((n, i) => n + i.quantity, 0),
    0,
  );

  const lines: {
    label: string;
    detail: string;
    amount?: number;
    href?: string;
  }[] = [];

  if (selection.type === "category") {
    const itemMap = new Map<
      string,
      { name: string; qty: number; spend: number; slug?: string }
    >();
    for (const order of matched) {
      for (const item of order.items) {
        const p = getProductById(item.productId);
        const cat = (p?.category ?? "other").toLowerCase();
        if (cat !== selection.key.toLowerCase()) continue;
        const cur = itemMap.get(item.productId) ?? {
          name: p?.name ?? item.productId,
          qty: 0,
          spend: 0,
          slug: p?.slug,
        };
        cur.qty += item.quantity;
        cur.spend += item.price * item.quantity;
        itemMap.set(item.productId, cur);
      }
    }
    lineSpend = [...itemMap.values()].reduce((s, i) => s + i.spend, 0);
    bottles = [...itemMap.values()].reduce((s, i) => s + i.qty, 0);
    for (const row of [...itemMap.values()].sort((a, b) => b.spend - a.spend)) {
      lines.push({
        label: row.name,
        detail: `${row.qty} bottle${row.qty === 1 ? "" : "s"}`,
        amount: row.spend,
        href: row.slug ? `/products/${row.slug}` : undefined,
      });
    }
  } else if (selection.type === "product") {
    const product = getProductById(selection.key);
    let qty = 0;
    let spend = 0;
    for (const order of matched) {
      for (const item of order.items) {
        if (item.productId !== selection.key) continue;
        qty += item.quantity;
        spend += item.price * item.quantity;
      }
    }
    lineSpend = spend;
    bottles = qty;
    lines.push({
      label: product?.name ?? selection.label,
      detail: `${product?.brand ?? "Bottle"} · ${qty} purchased`,
      amount: spend,
      href: product ? `/products/${product.slug}` : undefined,
    });
    if (product) {
      lines.push({
        label: "Category",
        detail: product.category,
      });
      lines.push({
        label: "ABV / size",
        detail: `${product.abv}% · ${product.volumeMl}ml`,
      });
    }
  } else if (selection.type === "branch") {
    const loc = getLocationById(selection.key);
    if (loc) {
      lines.push({
        label: loc.name,
        detail: `${loc.address}, ${loc.city}`,
        href: `/locations/${loc.slug}`,
      });
      lines.push({
        label: "Phone",
        detail: loc.phone,
      });
    }
  } else if (selection.type === "month") {
    for (const order of matched) {
      const loc = getLocationById(order.locationId);
      lines.push({
        label: order.id,
        detail: `${order.date} · ${order.fulfillment} · ${order.status}${loc ? ` · ${loc.shortName}` : ""}`,
        amount: order.total,
      });
    }
  } else {
    for (const order of matched) {
      const loc = getLocationById(order.locationId);
      lines.push({
        label: order.id,
        detail: `${order.date} · ${order.fulfillment} · ${order.status}${loc ? ` · ${loc.shortName}` : ""}`,
        amount: order.status === "cancelled" ? undefined : order.total,
      });
    }
  }

  const typeLabel: Record<ChartSelection["type"], string> = {
    month: "Month",
    category: "Category",
    product: "Bottle",
    branch: "Branch",
    status: "Status",
    fulfillment: "Fulfillment",
  };

  return {
    typeLabel: typeLabel[selection.type],
    title: selection.label,
    orderCount: matched.length,
    spend: Math.round(lineSpend * 100) / 100,
    bottles,
    avgOrder: matched.length
      ? Math.round((lineSpend / Math.max(1, forSpend.length)) * 100) / 100
      : 0,
    orders: matched,
    lines,
    accent:
      selection.type === "status"
        ? STATUS_FILLS[selection.key]
        : selection.type === "fulfillment"
          ? selection.key === "delivery"
            ? CHART_COLORS.gold
            : selection.key === "pos"
              ? CHART_COLORS.success
              : CHART_COLORS.info
          : CHART_COLORS.gold,
  };
}

export function sameSelection(
  a: ChartSelection | null,
  b: ChartSelection,
): boolean {
  return !!a && a.type === b.type && a.key === b.key;
}

export { STATUS_LABELS };
