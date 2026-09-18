"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Headphones, LayoutGrid, Package, RotateCcw, Table2 } from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { Button } from "@/components/ui/Button";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import {
  SortableTh,
  compareValues,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { customerStatusLabel, formatOrderPlaced, orderPlacedAt } from "@/lib/commerce/order-tracking";
import { getLocationById } from "@/data/locations";
import { getProductById } from "@/data/products";
import { formatPrice, cn } from "@/lib/utils";
import type { Order } from "@/types";

const ACCOUNT_ORDERS_VIEW_KEY = "account-orders-view";

type StatusFilter = "all" | "active" | "completed" | "cancelled";
type FulfillmentFilter = "all" | "delivery" | "pickup" | "pos";
type DateFilter = "all" | "30d" | "90d" | "year";
type SortKey = "date" | "id" | "status" | "total" | "items" | "type";

const FULFILLMENT_LABEL: Record<Order["fulfillment"], string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  pos: "In-store",
};

function isCompleted(status: Order["status"]) {
  return status === "delivered" || status === "picked_up" || status === "completed";
}

function itemCount(order: Order) {
  return order.items.reduce((n, item) => n + item.quantity, 0);
}

function productNames(order: Order) {
  return order.items
    .map((item) => getProductById(item.productId)?.name ?? "")
    .filter(Boolean);
}

type Props = {
  orders: Order[];
  onOpen: (orderId: string) => void;
  onReorder: (orderId: string) => void;
  onHelp: (orderId: string) => void;
};

export function CustomerOrdersList({ orders, onOpen, onReorder, onHelp }: Props) {
  const [view, setView] = usePersistedViewMode(ACCOUNT_ORDERS_VIEW_KEY, "cards");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [fulfillment, setFulfillment] = useState<FulfillmentFilter>("all");
  const [dateRange, setDateRange] = useState<DateFilter>("all");
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("date", "desc", ["date", "total"]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      dateRange === "30d"
        ? now - 30 * 24 * 60 * 60 * 1000
        : dateRange === "90d"
          ? now - 90 * 24 * 60 * 60 * 1000
          : dateRange === "year"
            ? new Date(new Date().getFullYear(), 0, 1).getTime()
            : 0;

    return orders.filter((order) => {
      if (status === "completed" && !isCompleted(order.status)) return false;
      if (status === "cancelled" && order.status !== "cancelled") return false;
      if (status === "active" && (isCompleted(order.status) || order.status === "cancelled")) {
        return false;
      }
      if (fulfillment !== "all" && order.fulfillment !== fulfillment) return false;
      if (cutoff) {
        const placed = orderPlacedAt(order)?.getTime() ?? 0;
        if (placed < cutoff) return false;
      }
      if (!q) return true;
      const haystack = [
        order.id,
        order.tracking ?? "",
        customerStatusLabel(order),
        FULFILLMENT_LABEL[order.fulfillment],
        getLocationById(order.locationId)?.shortName ?? "",
        ...productNames(order),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, query, status, fulfillment, dateRange]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "date") {
        const av = orderPlacedAt(a)?.getTime() ?? 0;
        const bv = orderPlacedAt(b)?.getTime() ?? 0;
        return compareValues(av, bv, sortDir);
      }
      if (sortKey === "total") return compareValues(a.total, b.total, sortDir);
      if (sortKey === "items") return compareValues(itemCount(a), itemCount(b), sortDir);
      if (sortKey === "type") return compareValues(a.fulfillment, b.fulfillment, sortDir);
      if (sortKey === "status") {
        return compareValues(customerStatusLabel(a), customerStatusLabel(b), sortDir);
      }
      return compareValues(a.id, b.id, sortDir);
    });
  }, [filtered, sortKey, sortDir]);

  const chips = [
    ...(query.trim()
      ? [{ id: "q", label: `“${query.trim()}”`, onRemove: () => setQuery("") }]
      : []),
    ...(status !== "all"
      ? [
          {
            id: "status",
            label:
              status === "active" ? "In progress" : status === "completed" ? "Completed" : "Cancelled",
            onRemove: () => setStatus("all"),
          },
        ]
      : []),
    ...(fulfillment !== "all"
      ? [
          {
            id: "type",
            label: FULFILLMENT_LABEL[fulfillment],
            onRemove: () => setFulfillment("all"),
          },
        ]
      : []),
    ...(dateRange !== "all"
      ? [
          {
            id: "date",
            label:
              dateRange === "30d"
                ? "Last 30 days"
                : dateRange === "90d"
                  ? "Last 90 days"
                  : "This year",
            onRemove: () => setDateRange("all"),
          },
        ]
      : []),
  ];

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3">
        <SearchInput
          className="min-w-0"
          value={query}
          onChange={setQuery}
          placeholder="Search order ID, bottle, or tracking"
          aria-label="Search orders"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <NativeSelect
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-11 py-0"
            wrapperClassName="min-w-0"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
          <NativeSelect
            value={fulfillment}
            onChange={(e) => setFulfillment(e.target.value as FulfillmentFilter)}
            className="h-11 py-0"
            wrapperClassName="min-w-0"
            aria-label="Filter by order type"
          >
            <option value="all">All types</option>
            <option value="delivery">Delivery</option>
            <option value="pickup">Pickup</option>
            <option value="pos">In-store</option>
          </NativeSelect>
          <NativeSelect
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateFilter)}
            className="h-11 py-0"
            wrapperClassName="min-w-0"
            aria-label="Filter by date"
          >
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="year">This year</option>
          </NativeSelect>
          <div className="flex items-center justify-end">
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </div>

      <ActiveFiltersBar
        className="mt-3"
        chips={chips}
        resultCount={sorted.length}
        resultNoun="order"
        onClearAll={() => {
          setQuery("");
          setStatus("all");
          setFulfillment("all");
          setDateRange("all");
        }}
      />

      {sorted.length === 0 ? (
        <div className="mt-4 rounded-sm border border-dashed border-white/15 px-4 py-10 text-center">
          <p className="text-sm text-cream">No orders match these filters.</p>
          <button
            type="button"
            className="mt-3 text-sm text-gold hover:underline"
            onClick={() => {
              setQuery("");
              setStatus("all");
              setFulfillment("all");
              setDateRange("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : view === "table" ? (
        <>
          <ul className="mt-4 space-y-3 xl:hidden">
            {sorted.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onOpen={onOpen}
                onReorder={onReorder}
                onHelp={onHelp}
              />
            ))}
          </ul>
          <div className={cn(tableWrapClass, "mt-4 hidden min-w-0 xl:block")}>
            <table className="w-max min-w-full text-left text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <SortableTh label="Order" column="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Placed" column="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Items" column="items" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Type" column="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh
                    label="Total"
                    column="total"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <th className={cn(tableCellClass, "whitespace-nowrap text-right font-medium")}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((order) => {
                  const placed = formatOrderPlaced(order);
                  const store = getLocationById(order.locationId);
                  const names = productNames(order);
                  return (
                    <tr
                      key={order.id}
                      className={cn(tableRowClass, "cursor-pointer")}
                      onClick={() => onOpen(order.id)}
                    >
                      <td className={cn(tableCellClass, "whitespace-nowrap")}>
                        <p className="font-medium text-cream">{order.id}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {store?.shortName ?? "Store"}
                          {order.tracking ? ` · ${order.tracking}` : ""}
                        </p>
                      </td>
                      <td className={cn(tableCellClass, "whitespace-nowrap")}>
                        <p className="text-cream">{placed.dateLabel}</p>
                        {placed.timeLabel ? (
                          <p className="mt-0.5 text-xs text-muted">{placed.timeLabel}</p>
                        ) : null}
                      </td>
                      <td className={cn(tableCellClass, "max-w-[16rem]")}>
                        <p className="whitespace-nowrap text-cream">
                          {itemCount(order)} item{itemCount(order) === 1 ? "" : "s"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {names.slice(0, 2).join(" · ")}
                          {names.length > 2 ? ` · +${names.length - 2}` : ""}
                        </p>
                      </td>
                      <td className={cn(tableCellClass, "whitespace-nowrap")}>
                        {FULFILLMENT_LABEL[order.fulfillment]}
                      </td>
                      <td className={cn(tableCellClass, "whitespace-nowrap")}>
                        {customerStatusLabel(order)}
                      </td>
                      <td className={cn(tableCellClass, "whitespace-nowrap text-right tabular-nums text-gold")}>
                        {formatPrice(order.total)}
                      </td>
                      <td className={cn(tableCellClass, "text-right")}>
                        <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="shrink-0 whitespace-nowrap px-2.5"
                            onClick={(event) => {
                              event.stopPropagation();
                              onReorder(order.id);
                            }}
                          >
                            <RotateCcw size={13} className="shrink-0" />
                            Reorder
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="shrink-0 whitespace-nowrap px-2.5"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpen(order.id);
                            }}
                          >
                            Details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorted.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onOpen={onOpen}
              onReorder={onReorder}
              onHelp={onHelp}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "cards" | "table";
  onChange: (view: "cards" | "table") => void;
}) {
  return (
    <div className="inline-flex rounded-sm border border-white/10 p-0.5">
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex min-h-10 min-w-10 items-center justify-center transition",
          view === "cards" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
        )}
        aria-label="Card view"
        aria-pressed={view === "cards"}
      >
        <LayoutGrid size={15} />
      </button>
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex min-h-10 min-w-10 items-center justify-center transition",
          view === "table" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
        )}
        aria-label="Table view"
        aria-pressed={view === "table"}
      >
        <Table2 size={15} />
      </button>
    </div>
  );
}

function OrderCard({
  order,
  onOpen,
  onReorder,
  onHelp,
}: {
  order: Order;
  onOpen: (orderId: string) => void;
  onReorder: (orderId: string) => void;
  onHelp: (orderId: string) => void;
}) {
  const placed = formatOrderPlaced(order);
  const store = getLocationById(order.locationId);
  const thumbs = order.items
    .map((item) => getProductById(item.productId))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));
  const count = itemCount(order);

  return (
    <li
      className="cursor-pointer rounded-sm border border-white/10 bg-black/20 p-3.5 sm:p-4 transition hover:border-white/20"
      onClick={() => onOpen(order.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium wrap-break-word text-cream">{order.id}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {placed.label}
            {" · "}
            {count} item{count === 1 ? "" : "s"}
            {" · "}
            {FULFILLMENT_LABEL[order.fulfillment]}
            {store ? ` · ${store.shortName}` : ""}
          </p>
          <p className="mt-1 text-xs text-gold">{customerStatusLabel(order)}</p>
        </div>
        <p className="shrink-0 tabular-nums text-gold">{formatPrice(order.total)}</p>
      </div>
      {thumbs.length > 0 ? (
        <div className="mt-3 flex min-w-0 items-center gap-2">
          <div className="flex shrink-0 -space-x-2">
            {thumbs.slice(0, 4).map((product) => {
              const image = product.images?.[0];
              return (
                <span
                  key={product.id}
                  className="relative h-10 w-10 overflow-hidden rounded-sm border border-white/15 bg-white/5"
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted">
                      <Package size={12} />
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <p className="min-w-0 truncate text-xs text-muted">
            {thumbs
              .slice(0, 2)
              .map((product) => product.name)
              .join(" · ")}
            {thumbs.length > 2 ? ` · +${thumbs.length - 2} more` : ""}
          </p>
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:flex sm:flex-wrap sm:items-center">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full whitespace-nowrap sm:w-auto"
          onClick={(event) => {
            event.stopPropagation();
            onReorder(order.id);
          }}
        >
          <RotateCcw size={13} className="shrink-0" />
          Reorder
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full whitespace-nowrap sm:w-auto"
          onClick={(event) => {
            event.stopPropagation();
            onHelp(order.id);
          }}
        >
          <Headphones size={13} className="shrink-0" />
          Help
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="col-span-2 w-full whitespace-nowrap sm:ml-auto sm:w-auto"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(order.id);
          }}
        >
          View details
          <ChevronRight size={13} className="shrink-0" />
        </Button>
      </div>
    </li>
  );
}
