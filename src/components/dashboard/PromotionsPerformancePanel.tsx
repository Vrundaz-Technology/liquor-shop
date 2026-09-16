"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent,
  CalendarDays,
  DollarSign,
  ShoppingBag,
  Tag,
  Ticket,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import {
  compareValues,
  SortableTh,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import { cn, formatPrice } from "@/lib/utils";

type DatePreset = "all" | "today" | "7d" | "30d" | "month";
type SortOption = "spent" | "discount" | "orders" | "customers" | "lastUsed" | "name";
type StatusFilter = "all" | "active" | "inactive" | "expired";

type OfferRow = {
  promoId: string;
  name: string;
  code: string | null;
  type: string;
  scope: string;
  active: boolean;
  expired: boolean;
  customers: number;
  orders: number;
  totalSpent: number;
  discountGiven: number;
  avgOrder: number;
  lastUsedAt: string | null;
};

type PerformanceResponse = {
  ok: true;
  summary: {
    customers: number;
    orders: number;
    totalSpent: number;
    discountGiven: number;
  };
  offers: OfferRow[];
};

function promoTypeLabel(type: string, hasCode: boolean) {
  const kind = hasCode ? "Coupon" : "Promotion";
  switch (type) {
    case "percent":
      return `${kind} — % off`;
    case "fixed":
      return `${kind} — amount off`;
    case "bogo":
      return "Buy X Get Y Free";
    case "free_delivery":
      return "Free delivery";
    default:
      return kind;
  }
}

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

const SORT_LABELS: Record<SortOption, string> = {
  spent: "Total spent",
  discount: "Discount given",
  orders: "Orders",
  customers: "Customers",
  lastUsed: "Last used",
  name: "Name",
};

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeForPreset(preset: DatePreset): { fromDate?: string; toDate?: string } {
  const now = new Date();
  const toDate = toYmd(now);
  if (preset === "today") return { fromDate: toDate, toDate };
  if (preset === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { fromDate: toYmd(start), toDate };
  }
  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { fromDate: toYmd(start), toDate };
  }
  if (preset === "month") {
    return { fromDate: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), toDate };
  }
  return {};
}

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(offer: OfferRow) {
  if (offer.expired) return "Expired";
  if (offer.active) return "Active";
  return "Inactive";
}

function StatusBadge({ offer }: { offer: OfferRow }) {
  const label = statusLabel(offer);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        label === "Active" && "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
        label === "Expired" && "border-white/12 bg-white/[0.03] text-muted",
        label === "Inactive" && "border-white/12 bg-white/[0.03] text-muted",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          label === "Active" && "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
          label !== "Active" && "bg-white/30",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

function offerKindLabel(offer: OfferRow) {
  if (offer.code) return `Coupon · ${offer.code}`;
  return "Promotion";
}

export function PromotionsPerformancePanel() {
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [promoId, setPromoId] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("spent");
  const { sortKey, sortDir, toggleSort } = useTableSort<
    "name" | "type" | "status" | "customers" | "orders" | "spent" | "discount" | "avg" | "lastUsed"
  >("spent", "desc", ["customers", "orders", "spent", "discount", "avg", "lastUsed"]);

  const dateRange = useMemo(() => rangeForPreset(datePreset), [datePreset]);

  const queryKey = useMemo(
    () => [
      "promotions-performance",
      datePreset,
      dateRange.fromDate ?? "",
      dateRange.toDate ?? "",
      promoId,
      typeFilter,
      statusFilter,
      sort,
    ],
    [datePreset, dateRange.fromDate, dateRange.toDate, promoId, typeFilter, statusFilter, sort],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.fromDate) params.set("fromDate", dateRange.fromDate);
      if (dateRange.toDate) params.set("toDate", dateRange.toDate);
      if (promoId !== "all") params.set("promoId", promoId);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("sort", sort);
      const qs = params.toString();
      return apiFetch<PerformanceResponse>(`/api/promotions/performance${qs ? `?${qs}` : ""}`);
    },
  });

  const summary = data?.summary ?? {
    customers: 0,
    orders: 0,
    totalSpent: 0,
    discountGiven: 0,
  };
  const offers = data?.offers ?? [];

  // Offer dropdown options from current result set + keep selected if filtered away
  const offerOptions = useMemo(() => {
    const map = new Map(offers.map((o) => [o.promoId, o.name]));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [offers]);

  const { data: allOffersForFilter } = useQuery({
    queryKey: ["promotions"],
    queryFn: async () => {
      const json = await apiFetch<{ ok: true; promotions: { id: string; name: string }[] }>(
        "/api/promotions",
      );
      return json.promotions;
    },
  });

  const offerFilterOptions = useMemo(() => {
    const list = allOffersForFilter ?? offerOptions.map(([id, name]) => ({ id, name }));
    return list;
  }, [allOffersForFilter, offerOptions]);

  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return compareValues(a.name, b.name, sortDir);
        case "type":
          return compareValues(a.type, b.type, sortDir);
        case "status":
          return compareValues(statusLabel(a), statusLabel(b), sortDir);
        case "customers":
          return compareValues(a.customers, b.customers, sortDir);
        case "orders":
          return compareValues(a.orders, b.orders, sortDir);
        case "discount":
          return compareValues(a.discountGiven, b.discountGiven, sortDir);
        case "avg":
          return compareValues(a.avgOrder, b.avgOrder, sortDir);
        case "lastUsed": {
          const av = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
          const bv = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
          return compareValues(av, bv, sortDir);
        }
        case "spent":
        default:
          return compareValues(a.totalSpent, b.totalSpent, sortDir);
      }
    });
  }, [offers, sortDir, sortKey]);

  const hasFilters =
    datePreset !== "all" ||
    promoId !== "all" ||
    typeFilter !== "all" ||
    statusFilter !== "all";

  const clearFilters = () => {
    setDatePreset("all");
    setPromoId("all");
    setTypeFilter("all");
    setStatusFilter("all");
  };

  const metricCards = [
    {
      label: "Customers",
      value: String(summary.customers),
      hint: "Distinct customers who used an offer",
      icon: Users,
    },
    {
      label: "Orders with an offer",
      value: String(summary.orders),
      hint: "Orders that applied a coupon or promotion",
      icon: ShoppingBag,
    },
    {
      label: "Total spent",
      value: formatPrice(summary.totalSpent),
      hint: "What those customers paid",
      icon: DollarSign,
    },
    {
      label: "Discount given",
      value: formatPrice(summary.discountGiven),
      hint: "Value handed back across those orders",
      icon: Tag,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[9.5rem] flex-1 sm:flex-none">
          <NativeSelect
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            className="h-11 py-0"
            aria-label="Date range"
          >
            {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((key) => (
              <option key={key} value={key}>
                {DATE_PRESET_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-[10rem] flex-1 sm:flex-none">
          <NativeSelect
            value={promoId}
            onChange={(e) => setPromoId(e.target.value)}
            className="h-11 py-0"
            aria-label="Offer"
          >
            <option value="all">All offers</option>
            {offerFilterOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="min-w-[9rem] flex-1 sm:flex-none">
          <NativeSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-11 py-0"
            aria-label="Type"
          >
            <option value="all">All types</option>
            <option value="percent">Percent off</option>
            <option value="fixed">Amount off</option>
            <option value="bogo">Buy X Get Y</option>
            <option value="free_delivery">Free delivery</option>
          </NativeSelect>
        </div>

        <div className="min-w-[9rem] flex-1 sm:flex-none">
          <NativeSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-11 py-0"
            aria-label="Status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
          </NativeSelect>
        </div>

        <div className="min-w-[10.5rem] flex-1 sm:ml-auto sm:flex-none">
          <NativeSelect
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="h-11 py-0"
            aria-label="Sort"
          >
            {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
              <option key={key} value={key}>
                Sort: {SORT_LABELS[key]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {hasFilters ? (
        <ActiveFiltersBar
          resultCount={offers.length}
          resultNoun="offer"
          chips={[
            ...(datePreset !== "all"
              ? [
                  {
                    id: "date",
                    label: DATE_PRESET_LABELS[datePreset],
                    onRemove: () => setDatePreset("all"),
                  },
                ]
              : []),
            ...(promoId !== "all"
              ? [
                  {
                    id: "offer",
                    label:
                      offerFilterOptions.find((p) => p.id === promoId)?.name ?? "Selected offer",
                    onRemove: () => setPromoId("all"),
                  },
                ]
              : []),
            ...(typeFilter !== "all"
              ? [
                  {
                    id: "type",
                    label: typeFilter.replace("_", " "),
                    onRemove: () => setTypeFilter("all"),
                  },
                ]
              : []),
            ...(statusFilter !== "all"
              ? [
                  {
                    id: "status",
                    label: statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1),
                    onRemove: () => setStatusFilter("all"),
                  },
                ]
              : []),
          ]}
          onClearAll={clearFilters}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/20 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-gold/90">{card.label}</p>
                <Icon size={14} className="shrink-0 text-muted" aria-hidden />
              </div>
              <p className="mt-2 font-display text-2xl tabular-nums text-cream">{card.value}</p>
              <p className="mt-1.5 text-xs text-muted">{card.hint}</p>
            </div>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading performance…</p>
      ) : offers.length === 0 ? (
        <div className="rounded-sm border border-dashed border-white/15 px-4 py-10 text-center">
          <BadgePercent className="mx-auto h-8 w-8 text-muted" aria-hidden />
          <p className="mt-3 text-sm text-muted">
            {hasFilters
              ? "No offers match these filters."
              : "No promotion usage yet. Orders that apply a coupon or offer will show up here."}
          </p>
        </div>
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead>
              <tr className={tableHeadRowClass}>
                <SortableTh
                  label="Offer"
                  column="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Type"
                  column="type"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Status"
                  column="status"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Customers"
                  column="customers"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label="Orders"
                  column="orders"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label="Total spent"
                  column="spent"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label="Discount"
                  column="discount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label="Avg order"
                  column="avg"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label="Last used"
                  column="lastUsed"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sortedOffers.map((offer) => (
                <tr key={offer.promoId} className={tableRowClass}>
                  <td className={cn(tableCellClass, "min-w-[12rem]")}>
                    <div className="flex items-start gap-2">
                      <Ticket size={14} className="mt-0.5 shrink-0 text-gold/80" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium text-cream">{offer.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{offerKindLabel(offer)}</p>
                      </div>
                    </div>
                  </td>
                  <td className={tableCellClass}>
                    {promoTypeLabel(offer.type, Boolean(offer.code))}
                  </td>
                  <td className={tableCellClass}>
                    <StatusBadge offer={offer} />
                  </td>
                  <td className={cn(tableCellClass, "text-right tabular-nums")}>
                    {offer.customers}
                  </td>
                  <td className={cn(tableCellClass, "text-right tabular-nums")}>{offer.orders}</td>
                  <td className={cn(tableCellClass, "text-right tabular-nums")}>
                    {formatPrice(offer.totalSpent)}
                  </td>
                  <td className={cn(tableCellClass, "text-right tabular-nums")}>
                    {formatPrice(offer.discountGiven)}
                  </td>
                  <td className={cn(tableCellClass, "text-right tabular-nums text-muted")}>
                    {offer.orders > 0 ? formatPrice(offer.avgOrder) : "—"}
                  </td>
                  <td className={cn(tableCellClass, "text-right text-muted")}>
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {offer.lastUsedAt ? (
                        <CalendarDays size={12} className="shrink-0 opacity-60" aria-hidden />
                      ) : null}
                      {formatShortDate(offer.lastUsedAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
