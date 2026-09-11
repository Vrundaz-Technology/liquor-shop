"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Columns3,
  Download,
  ExternalLink,
  Eye,
  LayoutGrid,
  Mail,
  MoreVertical,
  RefreshCw,
  Table2,
  Truck,
} from "lucide-react";
import { OrderSummaryView } from "@/components/dashboard/OrderSummaryView";
import { PanelLoading } from "@/components/dashboard/DashboardLoading";
import { AccessDenied } from "@/components/dashboard/AccessDenied";
import { type LocationFilter } from "@/components/dashboard/LocationScopeBar";
import { useUserStore } from "@/store/user";
import { useInventoryStore } from "@/store/inventory";
import { isDbConnected } from "@/lib/runtime-data";
import { apiFetch } from "@/lib/api-client";
import {
  apiCancelOrder,
  apiFetchOrders,
  apiUpdateOrderStatus,
} from "@/lib/api-mutations";
import { getLocationById } from "@/data/locations";
import { getProductById } from "@/data/products";
import { hasPermission } from "@/lib/auth/permissions";
import { hasAllLocationAccess } from "@/lib/auth/location-access";
import {
  isDeliveryReadyForDispatch,
  isOpenOrderStatus,
  nextStaffStatus,
  ORDER_STATUS_DOT,
  ORDER_STATUS_LABELS,
} from "@/lib/commerce/order-labels";
import { dashboardPath, parseDashboardPath } from "@/lib/dashboard/routes";
import { formatPrice, cn } from "@/lib/utils";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import { NativeSelect } from "@/components/ui/NativeSelect";
import {
  compareValues,
  SortableTh,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import type { Order, StoreLocation } from "@/types";

type StoreOrder = Order & {
  customerId: string;
  customerName: string;
  customerEmail: string;
  unreadForMe?: boolean;
  notificationId?: string | null;
};

type SortKey =
  | "customer"
  | "order"
  | "email"
  | "phone"
  | "date"
  | "fulfillment"
  | "status"
  | "payment"
  | "total"
  | "location"
  | "bottles"
  | "items";
type StatusTab = "all" | "open" | "ready" | "delivered" | "cancelled";
type DatePreset = "all" | "today" | "7d" | "30d" | "month";
type OptionalColumns = {
  orderId: boolean;
  email: boolean;
  phone: boolean;
  status: boolean;
  type: boolean;
  date: boolean;
  location: boolean;
  items: boolean;
  bottles: boolean;
  payment: boolean;
  total: boolean;
};

const ORDERS_VIEW_KEY = "sams.dashboard.view.orders";
const ORDERS_COLUMNS_KEY = "sams.dashboard.columns.orders.v2";

const DEFAULT_COLUMNS: OptionalColumns = {
  orderId: true,
  email: true,
  phone: false,
  status: true,
  type: true,
  date: true,
  location: false,
  items: false,
  bottles: false,
  payment: false,
  total: true,
};

const COLUMN_OPTIONS: { key: keyof OptionalColumns; label: string; hint?: string }[] = [
  { key: "orderId", label: "Order ID" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
  { key: "date", label: "Ordered on" },
  { key: "location", label: "Location" },
  { key: "items", label: "Items" },
  { key: "bottles", label: "Bottles" },
  { key: "payment", label: "Payment" },
  { key: "total", label: "Total" },
];

const STATUS_LABEL = ORDER_STATUS_LABELS;

const STATUS_DOT = ORDER_STATUS_DOT;

const TYPE_PILL: Record<Order["fulfillment"], string> = {
  delivery: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
  pickup: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  pos: "border-(--gold)/40 bg-(--gold)/10 text-gold",
};

const FULFILLMENT_LABEL: Record<Order["fulfillment"], string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  pos: "In-store",
};

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeForPreset(preset: DatePreset): { fromDate: string; toDate: string } {
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
  return { fromDate: "", toDate: "" };
}

function orderDateYmd(date: string) {
  return date.slice(0, 10);
}

function matchesDatePreset(order: Order, preset: DatePreset) {
  if (preset === "all") return true;
  const { fromDate, toDate } = rangeForPreset(preset);
  const d = orderDateYmd(order.date);
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

function loadColumnPrefs(): OptionalColumns {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const raw = window.localStorage.getItem(ORDERS_COLUMNS_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw) as Partial<OptionalColumns>;
    const pick = (key: keyof OptionalColumns) =>
      typeof parsed[key] === "boolean" ? Boolean(parsed[key]) : DEFAULT_COLUMNS[key];
    return {
      orderId: pick("orderId"),
      email: pick("email"),
      phone: pick("phone"),
      status: pick("status"),
      type: pick("type"),
      date: pick("date"),
      location: pick("location"),
      items: pick("items"),
      bottles: pick("bottles"),
      payment: pick("payment"),
      total: pick("total"),
    };
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportOrdersCsv(orders: StoreOrder[]) {
  const header = [
    "id",
    "date",
    "customer",
    "email",
    "phone",
    "status",
    "type",
    "location",
    "items",
    "bottles",
    "total",
    "payment",
  ];
  const lines = [
    header.join(","),
    ...orders.map((order) =>
      [
        order.id,
        order.date,
        order.customerName,
        order.customerEmail,
        order.delivery?.phone ?? "",
        STATUS_LABEL[order.status],
        FULFILLMENT_LABEL[order.fulfillment],
        getLocationById(order.locationId)?.shortName ?? order.locationId,
        itemsSummary(order),
        String(bottleCount(order)),
        String(order.total),
        paymentLabel(order),
      ]
        .map((cell) => csvEscape(String(cell)))
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `orders-${toYmd(new Date())}.csv`;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 0);
}

function itemsSummary(order: Order) {
  if (order.items.length === 0) return "—";
  const first = order.items[0];
  const product = getProductById(first.productId);
  const name = product?.name ?? first.productId;
  if (order.items.length === 1) return `${name} × ${first.quantity}`;
  const qty = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return `${name} + ${order.items.length - 1} more · ${qty} bottles`;
}

function bottleCount(order: Order) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function nextOrderStatus(status: Order["status"], fulfillment: Order["fulfillment"]): Order["status"] | null {
  return nextStaffStatus(fulfillment, status);
}

function formatOrderDate(value: string) {
  const raw = value.trim();
  if (!raw) return "—";
  // Prefer YYYY-MM-DD prefix when present
  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const d = new Date(`${ymd}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return raw;
}

function paymentLabel(order: Order) {
  if (order.status === "cancelled") return "Cancelled";
  if (order.fulfillment === "pos") return "Pay at register — paid";
  if (order.fulfillment === "delivery") {
    return order.status === "delivered" ? "Paid · delivered" : "Paid online";
  }
  return order.status === "picked_up" ||
    order.status === "ready_for_pickup" ||
    order.status === "ready" ||
    order.status === "delivered"
    ? "Paid · pickup"
    : "Paid online";
}

function matchesTab(order: Order, tab: StatusTab) {
  if (tab === "all") return true;
  if (tab === "open") return isOpenOrderStatus(order.status);
  if (tab === "ready") {
    return order.status === "ready" || order.status === "ready_for_pickup";
  }
  if (tab === "delivered") {
    return (
      order.status === "delivered" ||
      order.status === "picked_up" ||
      order.status === "completed"
    );
  }
  return order.status === "cancelled";
}

type Props = {
  locationId: LocationFilter;
  onLocationChange: (id: LocationFilter) => void;
  locations: StoreLocation[];
};

export function OrdersPanel({ locationId, onLocationChange, locations }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const profile = useUserStore((s) => s.profile);
  const cancelLocal = useUserStore((s) => s.cancelOrder);
  const restockOrder = useInventoryStore((s) => s.restockOrder);
  const syncFromServer = useInventoryStore((s) => s.syncFromServer);
  const canView = hasPermission(profile, "orders.view");
  const canManage = hasPermission(profile, "orders.manage");
  const canViewDeliveries = hasPermission(profile, "deliveries.view");
  const allowAll = hasAllLocationAccess(profile);

  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [unreadOrderCount, setUnreadOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewMode, setViewMode] = usePersistedViewMode(ORDERS_VIEW_KEY, "table");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] = useState<OptionalColumns>(DEFAULT_COLUMNS);
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [fulfillmentFilter, setFulfillmentFilter] = useState<Order["fulfillment"] | "all">("all");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("date", "desc");
  const menuRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  const selectedId = parseDashboardPath(pathname).orderId;

  const setOrderParam = useCallback(
    (orderId: string | null) => {
      router.push(
        orderId
          ? dashboardPath("orders", { orderId })
          : dashboardPath("orders"),
        { scroll: false },
      );
    },
    [router],
  );

  useEffect(() => {
    setColumns(loadColumnPrefs());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!menuId && !columnsOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuId && menuRef.current && !menuRef.current.contains(target)) {
        setMenuId(null);
      }
      if (columnsOpen && columnsRef.current && !columnsRef.current.contains(target)) {
        setColumnsOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuId(null);
        setColumnsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId, columnsOpen]);

  const dateRange = useMemo(() => rangeForPreset(datePreset), [datePreset]);

  const load = useCallback(async () => {
    if (!isDbConnected()) {
      const fallback = profile.orders
        .filter((o) => locationId === "all" || o.locationId === locationId)
        .filter((o) => fulfillmentFilter === "all" || o.fulfillment === fulfillmentFilter)
        .filter((o) => matchesDatePreset(o, datePreset))
        .filter((o) => {
          if (!debouncedQ) return true;
          const q = debouncedQ.toLowerCase();
          return (
            o.id.toLowerCase().includes(q) ||
            profile.name.toLowerCase().includes(q) ||
            profile.email.toLowerCase().includes(q) ||
            (o.tracking ?? "").toLowerCase().includes(q)
          );
        })
        .map((o) => ({
          ...o,
          customerId: profile.id,
          customerName: profile.name,
          customerEmail: profile.email,
        }));
      setOrders(unreadOnly ? [] : fallback);
      setUnreadOrderCount(0);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetchOrders({
        locationId: locationId === "all" ? undefined : locationId,
        fulfillment: fulfillmentFilter,
        q: debouncedQ || undefined,
        fromDate: dateRange.fromDate || undefined,
        toDate: dateRange.toDate || undefined,
        unreadOnly: unreadOnly || undefined,
      });
      setOrders(data.orders);
      setUnreadOrderCount(data.unreadOrderCount ?? 0);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [
    datePreset,
    dateRange.fromDate,
    dateRange.toDate,
    debouncedQ,
    fulfillmentFilter,
    locationId,
    profile.email,
    profile.id,
    profile.name,
    profile.orders,
    unreadOnly,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => orders.filter((order) => matchesTab(order, statusTab)),
    [orders, statusTab],
  );

  const tabCounts = useMemo(() => {
    const base = {
      all: orders.length,
      open: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const order of orders) {
      if (matchesTab(order, "open")) base.open += 1;
      if (matchesTab(order, "ready")) base.ready += 1;
      if (matchesTab(order, "delivered")) base.delivered += 1;
      if (matchesTab(order, "cancelled")) base.cancelled += 1;
    }
    return base;
  }, [orders]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "order") return compareValues(a.id, b.id, sortDir);
      if (sortKey === "date") return compareValues(a.date, b.date, sortDir);
      if (sortKey === "customer") return compareValues(a.customerName, b.customerName, sortDir);
      if (sortKey === "email") return compareValues(a.customerEmail, b.customerEmail, sortDir);
      if (sortKey === "phone") {
        return compareValues(a.delivery?.phone ?? "", b.delivery?.phone ?? "", sortDir);
      }
      if (sortKey === "fulfillment") return compareValues(a.fulfillment, b.fulfillment, sortDir);
      if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
      if (sortKey === "payment") {
        return compareValues(paymentLabel(a), paymentLabel(b), sortDir);
      }
      if (sortKey === "location") {
        return compareValues(
          getLocationById(a.locationId)?.shortName ?? a.locationId,
          getLocationById(b.locationId)?.shortName ?? b.locationId,
          sortDir,
        );
      }
      if (sortKey === "bottles") {
        return compareValues(bottleCount(a), bottleCount(b), sortDir);
      }
      if (sortKey === "items") {
        return compareValues(itemsSummary(a), itemsSummary(b), sortDir);
      }
      return compareValues(a.total, b.total, sortDir);
    });
  }, [filtered, sortDir, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [
    locationId,
    statusTab,
    fulfillmentFilter,
    debouncedQ,
    datePreset,
    unreadOnly,
    pageSize,
    sortKey,
    sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, sorted.length);
  const pageOrders = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const clearFilters = () => {
    setQuery("");
    setDebouncedQ("");
    setStatusTab("all");
    setFulfillmentFilter("all");
    setDatePreset("all");
    setUnreadOnly(false);
    if (allowAll && locationId !== "all") onLocationChange("all");
    setPage(1);
  };

  const selectedOrder = selectedId
    ? orders.find((o) => o.id === selectedId) ?? null
    : null;

  const markOrderRead = useCallback(
    async (order: StoreOrder) => {
      if (!order.notificationId || !order.unreadForMe) return;
      try {
        await apiFetch("/api/staff-notifications", {
          method: "POST",
          body: JSON.stringify({ ids: [order.notificationId] }),
        });
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, unreadForMe: false } : o,
          ),
        );
        setUnreadOrderCount((count) => Math.max(0, count - 1));
        void qc.invalidateQueries({ queryKey: ["staff-notifications"] });
      } catch {
        // Soft-fail: opening the order still works if mark-read fails.
      }
    },
    [qc],
  );

  const openSummary = (orderId: string) => {
    setMenuId(null);
    setOrderParam(orderId);
    const order = orders.find((o) => o.id === orderId);
    if (order) void markOrderRead(order);
  };
  const closeSummary = () => setOrderParam(null);

  const setColumnVisible = (key: keyof OptionalColumns, visible: boolean) => {
    setColumns((prev) => {
      const next = { ...prev, [key]: visible };
      try {
        window.localStorage.setItem(ORDERS_COLUMNS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  };

  const handleCancel = async (order: StoreOrder) => {
    if (!canManage) return;
    if (!window.confirm(`Cancel order ${order.id} and restock bottles?`)) return;
    setBusyId(order.id);
    setMenuId(null);
    try {
      if (isDbConnected()) {
        const result = await apiCancelOrder(profile.id, order.id);
        if (result.inventory) {
          syncFromServer(
            result.inventory.stocks,
            result.inventory.seats,
            result.inventory.hidden,
            result.inventory.reserved,
          );
        }
      } else {
        const soldHere = useInventoryStore
          .getState()
          .ledger.some((e) => e.orderId === order.id && e.reason === "sale");
        cancelLocal(order.id);
        if (soldHere) restockOrder(order.locationId, order.items, order.id);
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: "cancelled" } : o)),
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel order.");
    } finally {
      setBusyId(null);
    }
  };

  const handleStatus = async (order: StoreOrder, status: Order["status"]) => {
    if (!canManage) return;
    setBusyId(order.id);
    setMenuId(null);
    try {
      await apiUpdateOrderStatus(order.id, status);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { id: StatusTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "open", label: "Open" },
    { id: "ready", label: "Ready" },
    { id: "delivered", label: "Completed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  const locationOptions = [
    ...(allowAll ? [{ value: "all", label: "All locations" }] : []),
    ...locations.map((loc) => ({ value: loc.id, label: loc.shortName })),
  ];

  if (!canView) {
    return (
      <AccessDenied message="Order access is not enabled for this account. Ask an owner to grant View orders." />
    );
  }

  if (selectedId && selectedOrder) {
    return (
      <OrderSummaryView
        order={selectedOrder}
        onBack={closeSummary}
        canManage={canManage}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {nextOrderStatus(selectedOrder.status, selectedOrder.fulfillment) ? (
                <Button
                  size="sm"
                  loading={busyId === selectedOrder.id}
                  onClick={() =>
                    void handleStatus(
                      selectedOrder,
                      nextOrderStatus(selectedOrder.status, selectedOrder.fulfillment)!,
                    )
                  }
                >
                  Mark{" "}
                  {STATUS_LABEL[
                    nextOrderStatus(selectedOrder.status, selectedOrder.fulfillment)!
                  ].toLowerCase()}
                </Button>
              ) : null}
              {selectedOrder.status !== "cancelled" &&
              selectedOrder.status !== "delivered" &&
              selectedOrder.status !== "picked_up" &&
              selectedOrder.status !== "completed" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === selectedOrder.id}
                  onClick={() => void handleCancel(selectedOrder)}
                >
                  Cancel · restock
                </Button>
              ) : null}
              {selectedOrder.fulfillment === "delivery" &&
              canViewDeliveries &&
              isDeliveryReadyForDispatch(selectedOrder.status) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push(dashboardPath("deliveries"))}
                >
                  <Truck size={14} />
                  Assign driver
                </Button>
              ) : selectedOrder.fulfillment === "delivery" && canViewDeliveries ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => router.push(dashboardPath("deliveries"))}
                >
                  <Truck size={14} />
                  Open deliveries
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
    );
  }

  if (selectedId && loading) {
    return <PanelLoading label="Loading order…" />;
  }

  if (selectedId && !selectedOrder) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-sm text-cream">Order not found in this scope.</p>
        <p className="text-sm text-muted">It may belong to another store or was removed.</p>
        <Button type="button" variant="secondary" size="sm" onClick={closeSummary}>
          <ArrowLeft size={14} />
          Back to orders
        </Button>
      </div>
    );
  }

  return (
    <section className="mt-0 min-w-0 space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-cream sm:text-3xl">Orders</h2>
          <p className="mt-1 text-sm text-muted">Manage and update order status.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-2 sm:w-auto"
            onClick={() => void load()}
            loading={loading}
          >
            {!loading ? <RefreshCw size={14} /> : null}
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-2 sm:w-auto"
            disabled={loading || sorted.length === 0}
            onClick={() => exportOrdersCsv(sorted)}
          >
            <Download size={14} />
            Export
          </Button>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          className="min-w-0 flex-1"
          inputClassName="h-10"
          value={query}
          onChange={setQuery}
          placeholder="Search orders"
          aria-label="Search orders"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[10.5rem] flex-1 sm:flex-none">
            <span className="sr-only">Order status</span>
            <NativeSelect
              value={statusTab}
              onChange={(e) => setStatusTab(e.target.value as StatusTab)}
              className="h-11 py-0"
              aria-label="Filter by status"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label} · {tabCounts[tab.id]}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="inline-flex rounded-sm border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={cn(
                "inline-flex min-h-9 min-w-9 items-center justify-center transition",
                viewMode === "cards" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
              )}
              aria-label="Card view"
              aria-pressed={viewMode === "cards"}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "inline-flex min-h-9 min-w-9 items-center justify-center transition",
                viewMode === "table" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
              )}
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
            >
              <Table2 size={15} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm transition",
              unreadOnly
                ? "border-(--gold)/40 bg-(--gold)/10 text-gold"
                : "border-white/10 text-muted hover:border-white/20 hover:text-cream",
            )}
            aria-pressed={unreadOnly}
            aria-label="Show unread orders only"
          >
            <Mail size={14} />
            <span className="hidden sm:inline">Unread</span>
            {unreadOrderCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-sm bg-(--gold)/20 px-1.5 text-[11px] tabular-nums text-gold">
                {unreadOrderCount > 99 ? "99+" : unreadOrderCount}
              </span>
            ) : null}
          </button>

          <div className="min-w-[9.5rem] flex-1 sm:flex-none">
            <span className="sr-only">Date range</span>
            <NativeSelect
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="h-11 py-0"
              aria-label="Filter by date"
            >
              {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((key) => (
                <option key={key} value={key}>
                  {DATE_PRESET_LABELS[key]}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="min-w-[8.5rem] flex-1 sm:flex-none">
            <span className="sr-only">Order type</span>
            <NativeSelect
              value={fulfillmentFilter}
              onChange={(e) =>
                setFulfillmentFilter(e.target.value as Order["fulfillment"] | "all")
              }
              className="h-11 py-0"
              aria-label="Filter by order type"
            >
              <option value="all">All types</option>
              <option value="pos">In-store</option>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </NativeSelect>
          </div>

          <div className="min-w-[9.5rem] flex-1 sm:flex-none">
            <span className="sr-only">Location</span>
            <NativeSelect
              value={locationId}
              onChange={(e) => onLocationChange(e.target.value as LocationFilter)}
              className="h-11 py-0"
              aria-label="Filter by location"
            >
              {locationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="relative" ref={columnsRef}>
            <button
              type="button"
              onClick={() => setColumnsOpen((open) => !open)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm transition",
                columnsOpen
                  ? "border-(--gold)/40 bg-(--gold)/10 text-gold"
                  : "border-white/10 text-muted hover:border-white/20 hover:text-cream",
              )}
              aria-expanded={columnsOpen}
              aria-haspopup="true"
            >
              <Columns3 size={14} />
              Columns
            </button>
            {columnsOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-64 border border-white/10 bg-(--bg-elevated) py-2 shadow-xl">
                <div className="flex items-center justify-between gap-2 px-3 pb-1.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
                    {viewMode === "cards" ? "Card fields" : "Table columns"}
                  </p>
                  <button
                    type="button"
                    className="text-[10px] uppercase tracking-[0.12em] text-gold/80 transition hover:text-gold"
                    onClick={() => {
                      setColumns(DEFAULT_COLUMNS);
                      try {
                        window.localStorage.setItem(
                          ORDERS_COLUMNS_KEY,
                          JSON.stringify(DEFAULT_COLUMNS),
                        );
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Reset
                  </button>
                </div>
                <p className="px-3 pb-2 text-[11px] text-muted">
                  Customer stays visible. Extra columns scroll sideways.
                </p>
                <div className="max-h-72 overflow-y-auto">
                  {COLUMN_OPTIONS.map((col) => (
                    <label
                      key={col.key}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-cream hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={columns[col.key]}
                        onChange={(e) => setColumnVisible(col.key, e.target.checked)}
                        className="accent-(--gold)"
                      />
                      <span className="min-w-0 flex-1">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ActiveFiltersBar
        className="mt-3"
        resultCount={sorted.length}
        resultNoun="order"
        chips={[
          ...(query.trim()
            ? [
                {
                  id: "q",
                  label: `“${query.trim()}”`,
                  onRemove: () => {
                    setQuery("");
                    setDebouncedQ("");
                  },
                },
              ]
            : []),
          ...(statusTab !== "all"
            ? [
                {
                  id: "status",
                  label: tabs.find((t) => t.id === statusTab)?.label ?? statusTab,
                  onRemove: () => setStatusTab("all"),
                },
              ]
            : []),
          ...(datePreset !== "all"
            ? [
                {
                  id: "date",
                  label: DATE_PRESET_LABELS[datePreset],
                  onRemove: () => setDatePreset("all"),
                },
              ]
            : []),
          ...(unreadOnly
            ? [
                {
                  id: "unread",
                  label: "Unread",
                  onRemove: () => setUnreadOnly(false),
                },
              ]
            : []),
          ...(fulfillmentFilter !== "all"
            ? [
                {
                  id: "fulfillment",
                  label: FULFILLMENT_LABEL[fulfillmentFilter],
                  onRemove: () => setFulfillmentFilter("all"),
                },
              ]
            : []),
          ...(allowAll && locationId !== "all"
            ? [
                {
                  id: "location",
                  label:
                    locations.find((l) => l.id === locationId)?.shortName ?? locationId,
                  onRemove: () => onLocationChange("all"),
                },
              ]
            : []),
        ]}
        onClearAll={clearFilters}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-(--danger)/30 bg-(--danger)/10 px-3 py-2 text-sm text-(--danger)"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
        <p className="text-xs uppercase tracking-[0.14em] text-muted">
          {loading
            ? "Loading…"
            : `${sorted.length} order${sorted.length === 1 ? "" : "s"}`}
          {!loading && sorted.length > 0 ? (
            <span className="text-cream/50">
              {" "}
              · showing {from}–{to}
            </span>
          ) : null}
        </p>
        {!loading && sorted.length > 0 ? (
          <PageSizeSelect
            value={pageSize}
            onChange={setPageSize}
            options={[5, 10, 20, 50]}
          />
        ) : null}
      </div>

      {loading ? (
        <PanelLoading label="Loading orders…" />
      ) : sorted.length === 0 ? (
        <div className="rounded-sm border border-dashed border-white/15 px-4 py-14 text-center">
          <p className="text-sm text-cream">No orders match these filters</p>
          <p className="mt-1 text-sm text-muted">Try another status, store, or search.</p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageOrders.map((order) => {
            const loc = getLocationById(order.locationId);
            const next = nextOrderStatus(order.status, order.fulfillment);
            const phone = order.delivery?.phone?.trim() || "";
            const canCancel =
              canManage &&
              order.status !== "cancelled" &&
              order.status !== "delivered" &&
              order.status !== "picked_up" &&
              order.status !== "completed";
            const bottles = bottleCount(order);
            const menuOpen = menuId === order.id;

            return (
              <article
                key={order.id}
                className={cn(
                  "flex flex-col overflow-hidden rounded-sm border bg-gradient-to-b from-white/[0.035] to-black/25 transition",
                  order.unreadForMe
                    ? "border-(--gold)/35 shadow-[inset_3px_0_0_0_var(--gold)]"
                    : "border-white/10 hover:border-white/18",
                )}
              >
                <button
                  type="button"
                  onClick={() => openSummary(order.id)}
                  className="flex flex-1 flex-col p-4 text-left outline-none transition hover:bg-white/[0.02] focus-visible:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-[15px] font-medium text-cream">
                        {order.unreadForMe ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--gold)"
                            aria-label="Unread"
                          />
                        ) : null}
                        {order.customerName}
                      </p>
                      {columns.email ? (
                        <p className="mt-1 truncate text-xs text-muted">
                          {order.customerEmail || "No email"}
                        </p>
                      ) : null}
                      {columns.phone ? (
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {phone || "No phone"}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      {columns.total ? (
                        <p className="font-display text-lg tabular-nums leading-none text-gold">
                          {formatPrice(order.total)}
                        </p>
                      ) : null}
                      {columns.orderId ? (
                        <p
                          className={cn(
                            "text-[10px] uppercase tracking-[0.14em] text-muted",
                            columns.total ? "mt-1.5" : "",
                          )}
                        >
                          {order.id}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {columns.status || columns.type ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {columns.status ? <StatusBadge status={order.status} /> : null}
                      {columns.type ? <TypePill type={order.fulfillment} /> : null}
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "space-y-2",
                      columns.status || columns.type ? "mt-4 border-t border-white/8 pt-3" : "mt-4",
                    )}
                  >
                    {columns.date || columns.bottles || columns.location ? (
                      <p className="text-xs text-muted">
                        {columns.date ? (
                          <span className="text-cream/80">{formatOrderDate(order.date)}</span>
                        ) : null}
                        {columns.date && (columns.bottles || columns.location) ? (
                          <span className="mx-1.5 text-white/20">·</span>
                        ) : null}
                        {columns.bottles ? (
                          <span>
                            {bottles} bottle{bottles === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {columns.bottles && columns.location ? (
                          <span className="mx-1.5 text-white/20">·</span>
                        ) : null}
                        {columns.location && loc ? <span>{loc.shortName}</span> : null}
                      </p>
                    ) : null}
                    {columns.items ? (
                      <p className="line-clamp-2 text-xs leading-relaxed text-cream/75">
                        {itemsSummary(order)}
                      </p>
                    ) : null}
                    {columns.payment ? (
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
                        {paymentLabel(order)}
                      </p>
                    ) : null}
                  </div>
                </button>

                <div className="flex items-center gap-2 border-t border-white/10 bg-black/30 px-3 py-2.5">
                  {canManage && next ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-9 min-w-0 flex-1 justify-center truncate"
                      loading={busyId === order.id}
                      onClick={() => void handleStatus(order, next)}
                    >
                      Mark {STATUS_LABEL[next].toLowerCase()}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-9 min-w-0 flex-1"
                      onClick={() => openSummary(order.id)}
                    >
                      <Eye size={14} />
                      View details
                    </Button>
                  )}

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-sm border transition",
                        menuOpen
                          ? "border-(--gold)/40 bg-(--gold)/10 text-gold"
                          : "border-white/10 text-muted hover:border-white/20 hover:text-cream",
                      )}
                      aria-label={`More actions for ${order.id}`}
                      aria-expanded={menuOpen}
                      onClick={() =>
                        setMenuId((id) => (id === order.id ? null : order.id))
                      }
                    >
                      <MoreVertical size={15} />
                    </button>
                    {menuOpen ? (
                      <div
                        ref={menuRef}
                        className="absolute right-0 bottom-full z-20 mb-1 w-48 border border-white/10 bg-(--bg-elevated) py-1 shadow-xl"
                      >
                        <MenuItem
                          icon={<Eye size={14} />}
                          label="View details"
                          onClick={() => openSummary(order.id)}
                        />
                        <MenuItem
                          icon={<ExternalLink size={14} />}
                          label="Open in new tab"
                          onClick={() => {
                            setMenuId(null);
                            window.open(
                              dashboardPath("orders", { orderId: order.id }),
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        />
                        {canManage &&
                        canViewDeliveries &&
                        order.fulfillment === "delivery" ? (
                          <MenuItem
                            icon={<Truck size={14} />}
                            label="Open deliveries"
                            onClick={() => {
                              setMenuId(null);
                              router.push(dashboardPath("deliveries"));
                            }}
                          />
                        ) : null}
                        {canCancel ? (
                          <MenuItem
                            label="Cancel · restock"
                            danger
                            disabled={busyId === order.id}
                            onClick={() => void handleCancel(order)}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <>
          {/* Mobile list (table too wide) */}
          <div className="space-y-2 lg:hidden">
            {pageOrders.map((order) => {
              const loc = getLocationById(order.locationId);
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => openSummary(order.id)}
                  className={cn(
                    "flex w-full flex-col gap-2 border border-white/10 bg-black/20 px-3 py-3 text-left transition hover:border-white/20",
                    order.unreadForMe && "border-l-2 border-l-(--gold)/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm text-cream">
                        {order.unreadForMe ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--gold)"
                            aria-hidden
                          />
                        ) : null}
                        {order.customerName}
                      </p>
                      {columns.orderId ? (
                        <p className="truncate text-[11px] text-muted">{order.id}</p>
                      ) : null}
                      {columns.email ? (
                        <p className="truncate text-[11px] text-muted">
                          {order.customerEmail || "—"}
                        </p>
                      ) : null}
                      {columns.phone ? (
                        <p className="truncate text-[11px] text-muted">
                          {order.delivery?.phone?.trim() || "—"}
                        </p>
                      ) : null}
                    </div>
                    {columns.total ? (
                      <p className="shrink-0 tabular-nums text-sm text-gold">
                        {formatPrice(order.total)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {columns.status ? <StatusBadge status={order.status} /> : null}
                    {columns.type ? <TypePill type={order.fulfillment} /> : null}
                    {columns.date ? (
                      <span className="text-[11px] text-muted">{formatOrderDate(order.date)}</span>
                    ) : null}
                    {columns.location ? (
                      <span className="text-[11px] text-muted">{loc?.shortName}</span>
                    ) : null}
                    {columns.bottles ? (
                      <span className="text-[11px] text-muted">
                        {bottleCount(order)} bottle{bottleCount(order) === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {columns.payment ? (
                      <span className="text-[11px] text-muted">{paymentLabel(order)}</span>
                    ) : null}
                  </div>
                  {columns.items ? (
                    <p className="line-clamp-2 text-[11px] text-muted">{itemsSummary(order)}</p>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div
            className={cn(
              "hidden lg:block",
              tableWrapClass,
              "[scrollbar-color:rgba(212,181,110,0.35)_transparent]",
            )}
          >
            <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <SortableTh
                    label="Ordered by"
                    column="customer"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    className="sticky left-0 z-10 bg-(--bg-elevated)"
                  />
                  {columns.orderId ? (
                    <SortableTh
                      label="Order ID"
                      column="order"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.email ? (
                    <SortableTh
                      label="Email"
                      column="email"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.phone ? (
                    <SortableTh
                      label="Phone"
                      column="phone"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.status ? (
                    <SortableTh
                      label="Status"
                      column="status"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.type ? (
                    <SortableTh
                      label="Type"
                      column="fulfillment"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.date ? (
                    <SortableTh
                      label="Ordered on"
                      column="date"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.location ? (
                    <SortableTh
                      label="Location"
                      column="location"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.items ? (
                    <SortableTh
                      label="Items"
                      column="items"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.bottles ? (
                    <SortableTh
                      label="Bottles"
                      column="bottles"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      align="right"
                    />
                  ) : null}
                  {columns.payment ? (
                    <SortableTh
                      label="Payment"
                      column="payment"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {columns.total ? (
                    <SortableTh
                      label="Total"
                      column="total"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      align="right"
                    />
                  ) : null}
                  <th className="w-12 px-2 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => {
                  const next = nextOrderStatus(order.status, order.fulfillment);
                  const phone = order.delivery?.phone ?? "—";
                  const loc = getLocationById(order.locationId);
                  const rowTint = selectedId === order.id || order.unreadForMe;
                  return (
                    <tr
                      key={order.id}
                      className={cn(
                        tableRowClass,
                        "group cursor-pointer hover:bg-white/[0.03]",
                        selectedId === order.id && "bg-(--gold)/5",
                        order.unreadForMe && "border-l-2 border-l-(--gold)/60 bg-(--gold)/[0.03]",
                      )}
                      onClick={() => openSummary(order.id)}
                    >
                      <td
                        className={cn(
                          tableCellClass,
                          "sticky left-0 z-10 min-w-[10rem] max-w-[14rem] whitespace-nowrap bg-(--bg)",
                          "group-hover:bg-(--bg-soft)",
                          rowTint && "bg-(--bg-elevated)",
                        )}
                      >
                        <p className="flex items-center gap-2 truncate font-medium text-cream">
                          {order.unreadForMe ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--gold)"
                              aria-label="Unread"
                            />
                          ) : null}
                          <span className="truncate">{order.customerName}</span>
                        </p>
                        {!columns.orderId ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted">{order.id}</p>
                        ) : null}
                      </td>
                      {columns.orderId ? (
                        <td
                          className={cn(
                            tableCellClass,
                            "whitespace-nowrap font-mono text-[12px] text-muted",
                          )}
                        >
                          {order.id}
                        </td>
                      ) : null}
                      {columns.email ? (
                        <td className={cn(tableCellClass, "min-w-[10rem] max-w-[16rem]")}>
                          <p className="truncate text-muted">{order.customerEmail || "—"}</p>
                        </td>
                      ) : null}
                      {columns.phone ? (
                        <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                          {phone}
                        </td>
                      ) : null}
                      {columns.status ? (
                        <td className={cn(tableCellClass, "whitespace-nowrap")}>
                          <StatusBadge status={order.status} />
                        </td>
                      ) : null}
                      {columns.type ? (
                        <td className={cn(tableCellClass, "whitespace-nowrap")}>
                          <TypePill type={order.fulfillment} />
                        </td>
                      ) : null}
                      {columns.date ? (
                        <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                          {formatOrderDate(order.date)}
                        </td>
                      ) : null}
                      {columns.location ? (
                        <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                          {loc?.shortName ?? order.locationId}
                        </td>
                      ) : null}
                      {columns.items ? (
                        <td className={cn(tableCellClass, "min-w-[12rem] max-w-[18rem]")}>
                          <p className="truncate text-muted">{itemsSummary(order)}</p>
                        </td>
                      ) : null}
                      {columns.bottles ? (
                        <td
                          className={cn(
                            tableCellClass,
                            "whitespace-nowrap text-right tabular-nums text-muted",
                          )}
                        >
                          {bottleCount(order)}
                        </td>
                      ) : null}
                      {columns.payment ? (
                        <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                          {paymentLabel(order)}
                        </td>
                      ) : null}
                      {columns.total ? (
                        <td
                          className={cn(
                            tableCellClass,
                            "whitespace-nowrap text-right tabular-nums text-gold",
                          )}
                        >
                          {formatPrice(order.total)}
                        </td>
                      ) : null}
                      <td
                        className={cn(tableCellClass, "whitespace-nowrap text-right")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-sm text-muted hover:bg-white/5 hover:text-cream"
                          aria-label={`Actions for ${order.id}`}
                          aria-expanded={menuId === order.id}
                          onClick={() =>
                            setMenuId((id) => (id === order.id ? null : order.id))
                          }
                        >
                          <MoreVertical size={16} />
                        </button>
                        {menuId === order.id ? (
                          <div
                            ref={menuRef}
                            className="absolute right-2 top-full z-20 mt-1 w-48 border border-white/10 bg-(--bg-elevated) py-1 shadow-xl"
                          >
                            <MenuItem
                              icon={<Eye size={14} />}
                              label="View details"
                              onClick={() => openSummary(order.id)}
                            />
                            <MenuItem
                              icon={<ExternalLink size={14} />}
                              label="Open in new tab"
                              onClick={() => {
                                setMenuId(null);
                                window.open(
                                  dashboardPath("orders", { orderId: order.id }),
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              }}
                            />
                            {canManage && next ? (
                              <MenuItem
                                label={`Mark ${STATUS_LABEL[next].toLowerCase()}`}
                                disabled={busyId === order.id}
                                onClick={() => void handleStatus(order, next)}
                              />
                            ) : null}
                            {canManage &&
                            canViewDeliveries &&
                            order.fulfillment === "delivery" ? (
                              <MenuItem
                                icon={<Truck size={14} />}
                                label="Open deliveries"
                                  onClick={() => {
                                    setMenuId(null);
                                    router.push(dashboardPath("deliveries"));
                                  }}
                              />
                            ) : null}
                            {canManage &&
                            order.status !== "cancelled" &&
                            order.status !== "delivered" ? (
                              <MenuItem
                                label="Cancel · restock"
                                danger
                                disabled={busyId === order.id}
                                onClick={() => void handleCancel(order)}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && sorted.length > 0 ? (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={setPage}
          className="mt-6"
        />
      ) : null}
    </section>
  );
}

function StatusBadge({ status }: { status: Order["status"] }) {
  return (
    <span className="inline-flex max-w-none items-center gap-1.5 whitespace-nowrap text-sm text-cream">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function TypePill({ type }: { type: Order["fulfillment"] }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-sm border px-2 py-0.5 text-[11px] font-medium",
        TYPE_PILL[type],
      )}
    >
      {FULFILLMENT_LABEL[type]}
    </span>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition disabled:opacity-40",
        danger ? "text-(--danger) hover:bg-(--danger)/10" : "text-cream hover:bg-white/5",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
