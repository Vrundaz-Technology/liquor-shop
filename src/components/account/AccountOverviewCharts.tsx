"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getProductById } from "@/data/products";
import { getCategories } from "@/data/categories";
import { formatPrice, cn } from "@/lib/utils";
import type { Order } from "@/types";

const GOLD = "#c9a962";
const CREAM = "#f3ead7";
const MUTED = "#9a9488";
const PIE_COLORS = ["#c9a962", "#e4c878", "#8a7340", "#c4a07a", "#6b5344", "#9a9488"];

const TOOLTIP_STYLE = {
  background: "#121212",
  border: "1px solid rgba(201, 169, 98, 0.30)",
  borderRadius: 2,
  fontSize: 11,
  color: CREAM,
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
};

function orderWhen(order: Order) {
  const raw = order.createdAt || order.date;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function isSpendOrder(order: Order) {
  return order.status !== "cancelled";
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

function buildMonthSeries(orders: Order[], months = 6) {
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  const spend = new Map(keys.map((k) => [k, 0]));
  const count = new Map(keys.map((k) => [k, 0]));
  for (const order of orders.filter(isSpendOrder)) {
    const key = monthKey(orderWhen(order));
    if (!spend.has(key)) continue;
    spend.set(key, (spend.get(key) ?? 0) + order.total);
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return keys.map((key) => ({
    key,
    label: monthLabel(key),
    spend: Math.round((spend.get(key) ?? 0) * 100) / 100,
    orders: count.get(key) ?? 0,
  }));
}

function fulfillmentLabel(value: Order["fulfillment"]) {
  if (value === "delivery") return "Delivery";
  if (value === "pickup") return "Pickup";
  return "In store";
}

type Props = { orders: Order[] };

export function AccountOverviewCharts({ orders }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const categories = useMemo(() => getCategories(), []);

  const stats = useMemo(() => {
    const spendOrders = orders.filter(isSpendOrder);
    const spent = spendOrders.reduce((n, o) => n + o.total, 0);
    const avg = spendOrders.length ? spent / spendOrders.length : 0;
    return { spent, avg, count: spendOrders.length };
  }, [orders]);

  const monthSeries = useMemo(() => buildMonthSeries(orders, 6), [orders]);

  const mix = useMemo(() => {
    const buckets = { delivery: 0, pickup: 0, pos: 0 };
    for (const order of orders.filter(isSpendOrder)) {
      buckets[order.fulfillment] += 1;
    }
    return (["delivery", "pickup", "pos"] as const)
      .map((key) => ({
        key,
        name: fulfillmentLabel(key),
        value: buckets[key],
      }))
      .filter((row) => row.value > 0);
  }, [orders]);

  const categorySeries = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of orders.filter(isSpendOrder)) {
      for (const item of order.items) {
        const product = getProductById(item.productId);
        const slug = product?.category ?? "other";
        const name = categories.find((c) => c.slug === slug)?.name ?? "Other";
        const line = item.price * item.quantity;
        totals.set(name, (totals.get(name) ?? 0) + line);
      }
    }
    return [...totals.entries()]
      .map(([name, spend]) => ({ name, spend: Math.round(spend * 100) / 100 }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
  }, [categories, orders]);

  const empty = orders.filter(isSpendOrder).length === 0;
  const chartH = "h-48 sm:h-56 lg:h-64";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Spent" value={formatPrice(stats.spent)} sub="Completed orders" />
        <Kpi label="Avg order" value={stats.count ? formatPrice(stats.avg) : "—"} sub="Your usual ticket" />
        <Kpi
          label="This period"
          value={formatPrice(monthSeries.reduce((n, r) => n + r.spend, 0))}
          sub="Last 6 months"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {empty ? (
        <div className="rounded-sm border border-dashed border-white/12 bg-black/20 px-4 py-10 text-center">
          <p className="font-display text-lg text-cream">Your activity will live here</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Place an order and we’ll chart spend, how you shop, and favorite categories.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          <section className="min-w-0 rounded-sm border border-white/10 bg-black/25 p-4 sm:p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Spending</p>
                <h3 className="mt-1 font-display text-lg text-cream sm:text-xl">Last six months</h3>
              </div>
              <p className="text-xs text-muted">Gold line is order totals</p>
            </div>
            <div className={cn("w-full min-w-0", chartH)}>
              {ready ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="accountSpendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GOLD} stopOpacity={0.38} />
                        <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: MUTED, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: MUTED, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={{ color: CREAM, fontSize: 11 }}
                      labelStyle={{ color: CREAM, fontSize: 11 }}
                      cursor={{ stroke: "rgba(201, 169, 98, 0.35)" }}
                      formatter={(value, name) =>
                        name === "spend"
                          ? [formatPrice(Number(value ?? 0)), "Spend"]
                          : [String(value ?? 0), "Orders"]
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      stroke={GOLD}
                      strokeWidth={2}
                      fill="url(#accountSpendFill)"
                      name="spend"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ChartSkeleton />
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-sm border border-white/10 bg-black/25 p-4 sm:p-5 lg:col-span-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gold">How you shop</p>
            <h3 className="mt-1 font-display text-lg text-cream sm:text-xl">Fulfillment mix</h3>
            <div className={cn("mt-2 w-full min-w-0", chartH)}>
              {ready && mix.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="82%"
                      paddingAngle={2}
                      stroke="rgba(0,0,0,0.4)"
                    >
                      {mix.map((entry, i) => (
                        <Cell key={entry.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={{ color: CREAM, fontSize: 11 }}
                      labelStyle={{ color: CREAM, fontSize: 11 }}
                      formatter={(value, name) => [`${value} orders`, String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartSkeleton />
              )}
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {mix.map((row, i) => (
                <li key={row.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    aria-hidden
                  />
                  {row.name}
                  <span className="tabular-nums text-cream">{row.value}</span>
                </li>
              ))}
            </ul>
          </section>

          {categorySeries.length ? (
            <section className="min-w-0 rounded-sm border border-white/10 bg-black/25 p-4 sm:p-5 lg:col-span-5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Taste</p>
              <h3 className="mt-1 font-display text-lg text-cream sm:text-xl">Spend by category</h3>
              <div className="mt-2 h-48 w-full min-w-0 sm:h-52">
                {ready ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categorySeries}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: MUTED, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => formatPrice(Number(v))}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={88}
                        tick={{ fill: CREAM, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: CREAM, fontSize: 11 }}
                        labelStyle={{ color: CREAM, fontSize: 11 }}
                        cursor={{ fill: "rgba(201, 169, 98, 0.08)" }}
                        formatter={(value) => [formatPrice(Number(value ?? 0)), "Spend"]}
                      />
                      <Bar dataKey="spend" fill={GOLD} radius={[0, 2, 2, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartSkeleton />
                )}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-sm border border-white/10 bg-black/25 p-4", className)}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="font-price mt-2 truncate text-xl text-cream">{value}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded-sm bg-white/[0.04]" />;
}
