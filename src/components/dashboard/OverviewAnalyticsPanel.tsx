"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatPrice, cn } from "@/lib/utils";
import type { AnalyticsOverview } from "@/lib/db/analytics";
import type { StoreLocation } from "@/types";
import { ArrowUpRight, Loader2, Package } from "lucide-react";
import {
  LocationScopeBar,
  type LocationFilter,
} from "@/components/dashboard/LocationScopeBar";
import { dashboardPath } from "@/lib/dashboard/routes";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  compareValues,
  SortableTh,
  useTableSort,
} from "@/components/ui/SortableTh";

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function inventoryProductHref(opts: {
  q: string;
  locationId?: string;
  status?: "low" | "out";
}) {
  const params = new URLSearchParams();
  if (opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.locationId) params.set("location", opts.locationId);
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();
  return qs ? `${dashboardPath("inventory")}?${qs}` : dashboardPath("inventory");
}

type DatePreset = "today" | "7d" | "30d" | "month" | "custom";

function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = toYmd(now);
  if (preset === "today") return { from: to, to };
  if (preset === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: toYmd(start), to };
  }
  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: toYmd(start), to };
  }
  if (preset === "month") {
    return { from: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  return { from: toYmd(start), to };
}

async function loadAnalytics(locationId: string, from: string, to: string) {
  const params = new URLSearchParams();
  if (locationId && locationId !== "all") params.set("locationId", locationId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const q = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<{ ok: true; analytics: AnalyticsOverview }>(
    `/api/analytics${q}`,
  );
  return data.analytics;
}

type Props = {
  locationId: LocationFilter;
  onLocationChange: (id: LocationFilter) => void;
  locations: StoreLocation[];
  allowAll: boolean;
};

function AnalyticsSkeleton() {
  return (
    <div className="mt-4 min-w-0 space-y-6 sm:mt-6 sm:space-y-8" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading store analytics…
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[4.5rem] animate-pulse rounded-sm border border-white/10 bg-white/[0.04] p-3 sm:p-4"
          />
        ))}
      </div>
    </div>
  );
}

export function OverviewAnalyticsPanel({
  locationId,
  onLocationChange,
  locations,
  allowAll,
}: Props) {
  const initial = useMemo(() => rangeForPreset("today"), []);
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);

  const range = useMemo(() => {
    const from = fromDate || toDate || initial.from;
    const to = toDate || fromDate || initial.to;
    return from <= to ? { from, to } : { from: to, to: from };
  }, [fromDate, toDate, initial.from, initial.to]);

  const { data, isLoading, isPlaceholderData, error, refetch, isFetching } = useQuery({
    queryKey: ["owner-analytics", locationId, range.from, range.to],
    queryFn: () => loadAnalytics(locationId, range.from, range.to),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const counts = data?.locationCounts ?? {};

  return (
    <>
      <div className="space-y-4">
        <LocationScopeBar
          value={locationId}
          onChange={onLocationChange}
          counts={counts}
          locations={locations}
          allowAll={allowAll}
          label="Analytics scope"
          countNoun="orders"
        />

        <div className="rounded-sm border border-white/10 bg-black/25 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:gap-3">
              <div className="min-w-[10rem] flex-1 sm:max-w-[14rem]">
                <Select
                  label="Date range"
                  value={datePreset}
                  ariaLabel="Date range"
                  onChange={(value) => {
                    const preset = value as DatePreset;
                    setDatePreset(preset);
                    if (preset === "custom") return;
                    const next = rangeForPreset(preset);
                    setFromDate(next.from);
                    setToDate(next.to);
                  }}
                  options={[
                    { value: "today", label: "Today" },
                    { value: "7d", label: "Last 7 days" },
                    { value: "30d", label: "Last 30 days" },
                    { value: "month", label: "This month" },
                    { value: "custom", label: "Custom range" },
                  ]}
                />
              </div>
              <label className="block min-w-[9rem] flex-1 text-[10px] uppercase tracking-[0.14em] text-muted sm:max-w-[11rem]">
                From
                <Input
                  className="mt-1.5 py-2 scheme-dark"
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </label>
              <label className="block min-w-[9rem] flex-1 text-[10px] uppercase tracking-[0.14em] text-muted sm:max-w-[11rem]">
                To
                <Input
                  className="mt-1.5 py-2 scheme-dark"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  max={toYmd(new Date())}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </label>
            </div>
            <p className="shrink-0 text-[11px] text-white/40 lg:pb-2.5">
              Showing {range.from} → {range.to}
            </p>
          </div>
        </div>
      </div>

      {isLoading && !data ? <AnalyticsSkeleton /> : null}

      {error && !data ? (
        <div className="mt-8 rounded-sm border border-(--danger)/30 bg-(--danger)/10 p-4 text-sm text-cream">
          Could not load analytics.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {data ? (
        <AnalyticsBody
          data={data}
          isFetching={isFetching || isPlaceholderData}
          onRefresh={() => void refetch()}
        />
      ) : null}
    </>
  );
}

function AnalyticsBody({
  data,
  isFetching,
  onRefresh,
}: {
  data: AnalyticsOverview;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const t = data.totals;
  const isEmptyPeriod = t.orders === 0 && t.sales === 0;

  type LocSortKey = "location" | "sales" | "orders" | "avg" | "delivery" | "pickup";
  const { sortKey: locSortKey, sortDir: locSortDir, toggleSort: toggleLocSort } = useTableSort<LocSortKey>(
    "sales",
    "desc",
    ["sales", "orders", "avg", "delivery", "pickup"],
  );

  const sortedLocations = useMemo(() => {
    return [...data.locations].sort((a, b) => {
      switch (locSortKey) {
        case "orders":
          return compareValues(a.orders, b.orders, locSortDir);
        case "avg":
          return compareValues(a.avgOrder, b.avgOrder, locSortDir);
        case "delivery":
          return compareValues(a.deliveryOrders, b.deliveryOrders, locSortDir);
        case "pickup":
          return compareValues(a.pickupOrders, b.pickupOrders, locSortDir);
        case "location":
          return compareValues(a.locationName, b.locationName, locSortDir);
        case "sales":
        default:
          return compareValues(a.sales, b.sales, locSortDir);
      }
    });
  }, [data.locations, locSortDir, locSortKey]);

  const opsCards = [
    { label: "Sales", value: formatPrice(t.sales), emphasis: true, hint: "Collected (incl. tax & delivery)" },
    { label: "Orders", value: String(t.orders), emphasis: true },
    { label: "Avg order", value: formatPrice(t.avgOrder), emphasis: true },
    { label: "Delivery orders", value: String(t.deliveryOrders) },
    { label: "Pickup orders", value: String(t.pickupOrders) },
    { label: "Cancelled", value: String(t.cancelledOrders) },
    { label: "Refunds*", value: formatPrice(t.refunds), hint: "Cancelled order value (proxy)" },
    { label: "New customers", value: String(t.newCustomers) },
    { label: "Returning", value: String(t.returningCustomers) },
  ];

  const financeCards = [
    { label: "Gross sales", value: formatPrice(t.grossSales), emphasis: true, hint: "Merchandise before discounts" },
    { label: "Discounts", value: formatPrice(t.discounts) },
    { label: "Net sales", value: formatPrice(t.netSales), emphasis: true, hint: "Gross − discounts" },
    { label: "Taxes", value: formatPrice(t.tax) },
    { label: "Delivery revenue", value: formatPrice(t.deliveryRevenue) },
    {
      label: "Delivery costs",
      value: t.deliveryCosts > 0 ? formatPrice(t.deliveryCosts) : "—",
      hint: "Not tracked yet",
    },
    {
      label: "3P delivery costs",
      value: t.thirdPartyDeliveryCosts > 0 ? formatPrice(t.thirdPartyDeliveryCosts) : "—",
      hint: "Not tracked yet",
    },
    { label: "Product cost", value: formatPrice(t.productCost), hint: "COGS from cost prices when set" },
    { label: "Est. profit", value: formatPrice(t.estimatedProfit), emphasis: true },
  ];

  const renderCards = (
    cards: { label: string; value: string; emphasis?: boolean; hint?: string }[],
  ) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          title={card.hint}
          className={cn(
            "min-w-0 rounded-sm border p-3 transition-colors sm:p-4",
            card.emphasis
              ? "border-white/12 bg-gradient-to-b from-white/[0.05] to-black/20"
              : "border-white/10 bg-black/20",
          )}
        >
          <p
            className={cn(
              "truncate text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.16em]",
              card.emphasis ? "text-gold/90" : "text-muted",
            )}
          >
            {card.label}
          </p>
          <p className="mt-2 truncate font-display text-xl tabular-nums text-cream sm:text-2xl">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mt-5 min-w-0 space-y-6 sm:mt-6 sm:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Today’s dashboard</p>
          <p className="mt-1 text-sm text-muted">
            {isEmptyPeriod
              ? "No orders in this range yet — try another store or wider dates."
              : `Results for ${data.range.from} → ${data.range.to}${isFetching ? " · refreshing" : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm border border-white/10 px-3 text-xs text-cream/85 transition hover:border-(--gold)/35 hover:bg-white/[0.04] hover:text-cream disabled:opacity-60"
        >
          {isFetching ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
          Refresh
        </button>
      </div>

      <section className="space-y-3">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-muted">Operations</h3>
        {renderCards(opsCards)}
      </section>

      <section className="space-y-3">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-muted">Financial</h3>
        {renderCards(financeCards)}
        <p className="text-[11px] text-muted">
          *Refunds currently use cancelled order value until payment refunds are tracked. Delivery /
          3P costs show when configured.
        </p>
      </section>

      <section className="min-w-0">
        <h3 className="font-display text-lg text-cream sm:text-xl">Location comparison</h3>

        <ul className="mt-3 space-y-2 lg:hidden">
          {sortedLocations.map((loc) => (
            <li
              key={loc.locationId}
              className="rounded-sm border border-white/10 bg-black/20 p-3"
            >
              <p className="truncate font-medium text-cream">{loc.locationName}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-sm border border-white/5 px-2 py-1.5">
                  <p className="text-muted">Sales</p>
                  <p className="mt-0.5 truncate tabular-nums text-gold">{formatPrice(loc.sales)}</p>
                </div>
                <div className="rounded-sm border border-white/5 px-2 py-1.5">
                  <p className="text-muted">Orders</p>
                  <p className="mt-0.5 tabular-nums text-cream">{loc.orders}</p>
                </div>
                <div className="rounded-sm border border-white/5 px-2 py-1.5">
                  <p className="text-muted">Avg</p>
                  <p className="mt-0.5 truncate tabular-nums text-cream">
                    {formatPrice(loc.avgOrder)}
                  </p>
                </div>
                <div className="rounded-sm border border-white/5 px-2 py-1.5">
                  <p className="text-muted">Delivery</p>
                  <p className="mt-0.5 tabular-nums text-cream">{loc.deliveryOrders}</p>
                </div>
                <div className="rounded-sm border border-white/5 px-2 py-1.5">
                  <p className="text-muted">Pickup</p>
                  <p className="mt-0.5 tabular-nums text-cream">{loc.pickupOrders}</p>
                </div>
              </div>
            </li>
          ))}
          {!sortedLocations.length ? (
            <li className="rounded-sm border border-dashed border-white/10 px-3 py-6 text-sm text-muted">
              No orders in this range yet.
            </li>
          ) : null}
        </ul>

        <div className="mt-3 hidden overflow-x-auto rounded-sm border border-white/10 lg:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-cream/5 text-[10px] uppercase tracking-[0.16em] text-muted">
              <tr>
                <SortableTh
                  label="Location"
                  column="location"
                  sortKey={locSortKey}
                  sortDir={locSortDir}
                  onSort={toggleLocSort}
                />
                <SortableTh
                  label="Sales"
                  column="sales"
                  sortKey={locSortKey}
                  sortDir={locSortDir}
                  onSort={toggleLocSort}
                />
                <SortableTh
                  label="Orders"
                  column="orders"
                  sortKey={locSortKey}
                  sortDir={locSortDir}
                  onSort={toggleLocSort}
                />
                <SortableTh
                  label="Avg"
                  column="avg"
                  sortKey={locSortKey}
                  sortDir={locSortDir}
                  onSort={toggleLocSort}
                />
                <SortableTh
                  label="Delivery"
                  column="delivery"
                  sortKey={locSortKey}
                  sortDir={locSortDir}
                  onSort={toggleLocSort}
                />
                <SortableTh
                  label="Pickup"
                  column="pickup"
                  sortKey={locSortKey}
                  sortDir={locSortDir}
                  onSort={toggleLocSort}
                />
              </tr>
            </thead>
            <tbody>
              {sortedLocations.map((loc) => (
                <tr key={loc.locationId} className="border-t border-cream/10">
                  <td className="max-w-[10rem] truncate px-3 py-3 text-cream sm:px-4">
                    {loc.locationName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-gold sm:px-4">
                    {formatPrice(loc.sales)}
                  </td>
                  <td className="px-3 py-3 tabular-nums sm:px-4">{loc.orders}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums sm:px-4">
                    {formatPrice(loc.avgOrder)}
                  </td>
                  <td className="px-3 py-3 tabular-nums sm:px-4">{loc.deliveryOrders}</td>
                  <td className="px-3 py-3 tabular-nums sm:px-4">{loc.pickupOrders}</td>
                </tr>
              ))}
              {!sortedLocations.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-muted">
                    No orders in this range yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <h3 className="font-display text-lg text-cream sm:text-xl">Top products</h3>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
              {data.range.from} → {data.range.to}
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {data.topProducts.map((p, index) => (
              <li key={p.productId}>
                <Link
                  href={inventoryProductHref({ q: p.name })}
                  className="group flex items-center gap-3 rounded-sm border border-white/10 bg-black/20 px-3 py-2.5 transition hover:border-(--gold)/35 hover:bg-white/[0.04]"
                >
                  <span className="w-5 shrink-0 text-[11px] tabular-nums text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-cream group-hover:text-gold">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                    {p.quantity} sold
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-gold">
                    {formatPrice(p.revenue)}
                  </span>
                  <ArrowUpRight
                    size={12}
                    className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 group-hover:text-gold"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
            {!data.topProducts.length ? (
              <li className="rounded-sm border border-dashed border-white/10 px-3 py-6 text-sm text-muted">
                No product sales yet.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-lg text-cream sm:text-xl">Low stock</h3>
              <p className="mt-1 text-xs text-muted">
                {data.lowStock.length
                  ? `${data.lowStock.filter((r) => r.available <= 0).length} out · ${data.lowStock.filter((r) => r.available > 0).length} running low`
                  : "All stores above threshold"}
              </p>
            </div>
            <Link
              href={dashboardPath("inventory")}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-gold transition hover:text-cream"
            >
              Inventory
              <ArrowUpRight size={12} />
            </Link>
          </div>

          <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-sm border border-white/10 bg-black/20">
            {data.lowStock.slice(0, 5).map((row) => {
              const out = row.available <= 0;
              return (
                <li key={`${row.locationId}-${row.productId}`}>
                  <Link
                    href={inventoryProductHref({
                      q: row.productName,
                      locationId: row.locationId,
                      status: out ? "out" : "low",
                    })}
                    className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-white/[0.04] sm:gap-3.5 sm:px-3.5"
                  >
                    <div className="relative h-11 w-9 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-white/[0.03]">
                      {row.imageUrl ? (
                        <Image
                          src={row.imageUrl}
                          alt=""
                          fill
                          className="object-contain p-0.5"
                          sizes="36px"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-muted">
                          <Package size={14} />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-cream group-hover:text-gold">
                        {row.productName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {row.brand}
                        <span className="text-white/25"> · </span>
                        {row.locationName}
                        {row.reserved > 0 ? (
                          <>
                            <span className="text-white/25"> · </span>
                            {row.reserved} reserved
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span
                        className={
                          out
                            ? "inline-flex rounded-sm border border-(--danger)/35 bg-(--danger)/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-(--danger)"
                            : "inline-flex rounded-sm border border-(--gold)/35 bg-(--gold)/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-gold"
                        }
                      >
                        {out ? "Out" : "Low"}
                      </span>
                      <p
                        className={`mt-1 text-xs tabular-nums ${out ? "text-(--danger)" : "text-cream"}`}
                      >
                        {row.available}
                        <span className="text-muted"> / {row.threshold}</span>
                      </p>
                    </div>
                    <ArrowUpRight
                      size={12}
                      className="shrink-0 self-center text-muted opacity-0 transition group-hover:opacity-100 group-hover:text-gold"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
            {!data.lowStock.length ? (
              <li className="px-3 py-6 text-sm text-muted">No low-stock alerts.</li>
            ) : null}
          </ul>

          {data.lowStock.length > 5 ? (
            <Link
              href={dashboardPath("inventory")}
              className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.14em] text-cream/80 transition hover:border-(--gold)/35 hover:bg-white/[0.05] hover:text-gold"
            >
              Show more
              <span className="normal-case tracking-normal text-muted">
                ({data.lowStock.length - 5}+ in inventory)
              </span>
              <ArrowUpRight size={12} className="text-gold" />
            </Link>
          ) : data.lowStock.length > 0 ? (
            <Link
              href={dashboardPath("inventory")}
              className="mt-3 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-gold"
            >
              Open inventory
              <ArrowUpRight size={12} />
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
