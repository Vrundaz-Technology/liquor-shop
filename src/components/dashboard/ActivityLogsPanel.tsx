"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Download,
  Maximize2,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiFetchActivity, apiFetchUsers } from "@/lib/api-mutations";
import {
  formatChangesPlain,
  parseActivityChanges,
  type ActivityChangeView,
} from "@/lib/activity/changes";
import { accessibleLocations } from "@/lib/auth/location-access";
import { useServerConnection } from "@/hooks/useServerConnection";
import { isConnectionError } from "@/lib/connection-messages";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { PanelLoading } from "@/components/dashboard/DashboardLoading";
import { hasPermission } from "@/lib/auth/permissions";
import { useUserStore } from "@/store/user";
import type { ActivityLogEntry } from "@/types";
import { Input } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { Tooltip } from "@/components/ui/Tooltip";
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import { Modal } from "@/components/ui/Modal";
import { MobileSortBar, SortableTh, tableCellClass, tableHeadRowClass, tableRowClass, tableWrapClass, useTableSort } from "@/components/ui/SortableTh";
import { cn } from "@/lib/utils";

const ENTITY_LABELS: Record<string, string> = {
  user: "User",
  order: "Order",
  product: "Product",
  category: "Category",
  inventory: "Inventory",
  event: "Event",
  location: "Location",
  profile: "Profile",
  driver: "Driver",
  delivery: "Delivery",
  role: "Role",
  promotion: "Promotion",
  customer: "Customer",
  loyalty: "Loyalty",
  review: "Review",
  support: "Support",
};

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Sign in",
  "auth.signup": "Signed up",
  "order.placed": "Order placed",
  "pos.sale": "Point of sale",
  "order.cancelled": "Order cancelled",
  "order.refunded": "Order refunded",
  "order.status": "Order status",
  "order.notify_resend": "Notification re-sent",
  "inventory.set": "Stock set",
  "inventory.adjust": "Stock adjusted",
  "inventory.restock": "Restocked",
  "inventory.reset": "Inventory reset",
  "inventory.visibility": "Bottle visibility",
  "inventory.transfer": "Stock transferred",
  "inventory.pricing": "Pricing updated",
  "inventory.import": "Inventory imported",
  "inventory.export": "Inventory exported",
  "catalog.created": "Bottle added",
  "catalog.updated": "Bottle updated",
  "catalog.deleted": "Bottle removed",
  "category.created": "Category added",
  "category.updated": "Category updated",
  "category.deleted": "Category removed",
  "event.booked": "Event booked",
  "user.created": "User created",
  "user.role_updated": "Role changed",
  "role.created": "Role created",
  "role.updated": "Role updated",
  "role.deleted": "Role deleted",
  "user.deactivated": "User deactivated",
  "user.activated": "User activated",
  "user.password_reset": "Password reset",
  "user.profile_updated": "Profile updated",
  "user.permissions_updated": "Permissions updated",
  "user.points_redeemed": "Points redeemed",
  "location.created": "Store added",
  "location.updated": "Store updated",
  "location.deleted": "Store removed",
  "event.created": "Event added",
  "event.updated": "Event updated",
  "event.deleted": "Event removed",
  "delivery.assigned": "Driver assigned",
  "delivery.status": "Delivery status",
  "delivery.shipday_sent": "Sent to Shipday",
  "delivery.shipday_status": "Shipday status",
  "delivery.shipday_failed": "Shipday failed",
  "driver.created": "Driver added",
  "driver.updated": "Driver updated",
  "driver.deactivated": "Driver deactivated",
  "promotion.created": "Promotion created",
  "promotion.updated": "Promotion updated",
  "promotion.deleted": "Promotion deleted",
  "crm.updated": "Customer updated",
  "loyalty.updated": "Loyalty updated",
  "loyalty.birthday_claimed": "Birthday bonus claimed",
  "review.created": "Review submitted",
  "review.moderate": "Review moderated",
  "review.respond": "Review replied",
  "support.ticket_created": "Ticket opened",
  "support.ticket_updated": "Ticket updated",
  "support.reply": "Support reply",
};

const ACTION_TONE: Record<string, string> = {
  "auth.login": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "auth.signup": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "order.placed": "border-(--success)/30 bg-(--success)/10 text-(--success)",
  "pos.sale": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "order.cancelled": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "order.refunded": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "order.status": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "order.notify_resend": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "inventory.set": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "inventory.adjust": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "inventory.restock": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "inventory.reset": "border-white/20 bg-white/5 text-cream",
  "inventory.visibility": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "inventory.transfer": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "inventory.pricing": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "inventory.import": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "inventory.export": "border-white/20 bg-white/5 text-cream",
  "catalog.created": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "catalog.updated": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "catalog.deleted": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "category.created": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "category.updated": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "category.deleted": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "event.booked": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "user.created": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "user.role_updated": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "role.created": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "role.updated": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "role.deleted": "border-red-400/30 bg-red-400/10 text-red-200",
  "user.deactivated": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "user.activated": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "user.password_reset": "border-white/20 bg-white/5 text-muted",
  "user.profile_updated": "border-white/20 bg-white/5 text-muted",
  "user.permissions_updated": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "user.points_redeemed": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "location.created": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "location.updated": "border-white/20 bg-white/5 text-muted",
  "location.deleted": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "event.created": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "event.updated": "border-white/20 bg-white/5 text-muted",
  "event.deleted": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "delivery.assigned": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "delivery.status": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "delivery.shipday_sent": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "delivery.shipday_status": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "delivery.shipday_failed": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "driver.created": "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  "driver.updated": "border-white/20 bg-white/5 text-muted",
  "driver.deactivated": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "promotion.created": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "promotion.updated": "border-violet-400/30 bg-violet-400/10 text-violet-200",
  "promotion.deleted": "border-(--danger)/30 bg-(--danger)/10 text-(--danger)",
  "crm.updated": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "loyalty.updated": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "loyalty.birthday_claimed": "border-(--gold)/30 bg-(--gold)/10 text-gold",
  "review.created": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "review.moderate": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "review.respond": "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "support.ticket_created": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "support.ticket_updated": "border-sky-400/30 bg-sky-400/10 text-sky-200",
  "support.reply": "border-sky-400/30 bg-sky-400/10 text-sky-200",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/\./g, " ");
}

function ActionLabel({ action }: { action: string }) {
  if (action === "pos.sale") {
    return <AbbrTooltip term="POS" suffix="sale" />;
  }
  return <>{actionLabel(action)}</>;
}

function entityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? entityType;
}

function roleLabel(role: string) {
  if (role === "owner" || role === "admin" || role === "staff" || role === "guest") {
    return role;
  }
  return "customer";
}

function ChangeLines({ changes }: { changes: ActivityChangeView[] }) {
  return (
    <ul className="space-y-1.5">
      {changes.map((change, index) => (
        <li
          key={`${change.field}-${index}`}
          className="rounded-sm border border-white/8 bg-white/[0.03] px-2 py-1.5"
        >
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted">{change.field}</p>
          <p className="mt-0.5 flex flex-wrap items-start gap-x-1.5 gap-y-0.5 text-xs leading-snug">
            {change.from != null ? (
              <span className="min-w-0 max-w-full break-words text-red-300/90 line-through decoration-red-300/70">
                {change.from}
              </span>
            ) : null}
            {change.from != null && change.to != null ? (
              <span className="shrink-0 text-muted" aria-hidden>
                →
              </span>
            ) : null}
            {change.to != null ? (
              <span className="min-w-0 max-w-full break-words font-medium text-emerald-300">
                {change.to}
              </span>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ChangesCell({ changes, summary }: { changes: ActivityChangeView[]; summary: string }) {
  const [open, setOpen] = useState(false);
  if (!changes.length) {
    return <p className="text-sm text-cream/90">{summary}</p>;
  }
  const overflow = changes.length > 2;
  return (
    <div>
      <ChangeLines changes={overflow ? changes.slice(0, 2) : changes} />
      {overflow ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setOpen(true)}
          >
            <Maximize2 size={13} aria-hidden />
            View all {changes.length} changes
          </Button>
        </div>
      ) : null}
      <Modal
        open={open}
        title="Activity changes"
        subtitle={summary}
        className="sm:max-w-2xl"
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <ChangeLines changes={changes} />
      </Modal>
    </div>
  );
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportActivityCsv(
  logs: ActivityLogEntry[],
  locationName: (id?: string) => string,
) {
  const header = [
    "when",
    "who",
    "email",
    "role",
    "location",
    "action",
    "entity",
    "entity_id",
    "summary",
    "changes",
  ];
  const lines = [
    header.join(","),
    ...logs.map((log) => {
      const changes = parseActivityChanges({
        action: log.action,
        entityId: log.entityId,
        summary: log.summary,
        metadata: log.metadata,
      });
      return [
        format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss"),
        log.actorName,
        log.actorEmail ?? "",
        roleLabel(log.actorRole),
        locationName(log.locationId),
        actionLabel(log.action),
        entityLabel(log.entityType),
        log.entityId ?? "",
        log.summary,
        formatChangesPlain(changes) || log.summary,
      ]
        .map((cell) => csvEscape(String(cell)))
        .join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `activity-${toYmd(new Date())}.csv`;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 0);
}

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

function endOfLocalDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

type DatePreset = "all" | "today" | "7d" | "30d" | "month" | "custom";

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  custom: "Custom range",
};

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

export function ActivityLogsPanel() {
  const profile = useUserStore((s) => s.profile);
  const { ready: dbReady } = useServerConnection();
  const canListUsers = hasPermission(profile, "users.view");
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [actor, setActor] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort<
    "when" | "user" | "location" | "action" | "entity" | "changes"
  >("when", "desc", ["when"]);
  const [knownActors, setKnownActors] = useState<Map<string, string>>(
    () => new Map(profile.id ? [[profile.id, profile.name]] : []),
  );

  const filtersActive =
    action !== "all" ||
    entityType !== "all" ||
    locationId !== "all" ||
    actor !== "all" ||
    datePreset !== "all" ||
    Boolean(q.trim());

  const clearFilters = () => {
    setQ("");
    setAction("all");
    setEntityType("all");
    setActor("all");
    setLocationId("all");
    setDatePreset("all");
    setFromDate("");
    setToDate("");
    setFiltersOpen(false);
    setPage(1);
  };

  useEffect(() => {
    if (!canListUsers || !dbReady) return;
    let cancelled = false;
    void apiFetchUsers({ limit: 100 })
      .then(({ users }) => {
        if (cancelled) return;
        setKnownActors((prev) => {
          const next = new Map(prev);
          for (const user of users) next.set(user.id, user.name);
          return next;
        });
      })
      .catch(() => {
        /* Directory is optional for the user filter. */
      });
    return () => {
      cancelled = true;
    };
  }, [canListUsers, dbReady]);

  const load = async (pageOverride?: number) => {
    const activePage = pageOverride ?? page;
    if (!dbReady) {
      setLogs([]);
      setTotal(0);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rangeStart = fromDate ? startOfLocalDay(fromDate <= (toDate || fromDate) ? fromDate : toDate) : undefined;
      const rangeEnd = toDate ? endOfLocalDay(toDate >= (fromDate || toDate) ? toDate : fromDate) : undefined;
      const data = await apiFetchActivity({
        q: q.trim() || undefined,
        action: action === "all" ? undefined : action,
        entityType: entityType === "all" ? undefined : entityType,
        actorUserId: actor === "all" ? undefined : actor,
        locationId: locationId === "all" ? undefined : locationId,
        from: rangeStart,
        to: rangeEnd,
        limit: pageSize,
        offset: (activePage - 1) * pageSize,
        sortKey,
        sortDir,
      });
      setLogs(data.logs);
      setTotal(data.total);
      setKnownActors((prev) => {
        const next = new Map(prev);
        for (const log of data.logs) {
          if (log.actorUserId) next.set(log.actorUserId, log.actorName);
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load activity.";
      setError(isConnectionError(message) ? "" : message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [action, entityType, actor, locationId, pageSize, sortKey, sortDir, fromDate, toDate, q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, entityType, actor, locationId, page, pageSize, sortKey, sortDir, fromDate, toDate, q, dbReady]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const actors = useMemo(() => [...knownActors.entries()], [knownActors]);

  const locations = useMemo(() => accessibleLocations(profile), [profile]);

  const locationName = (id?: string) => {
    if (!id) return "All stores";
    return locations.find((l) => l.id === id)?.shortName ?? id;
  };

  const handleExport = async () => {
    if (!dbReady || exporting) return;
    setExporting(true);
    setError("");
    try {
      const rangeStart = fromDate
        ? startOfLocalDay(fromDate <= (toDate || fromDate) ? fromDate : toDate)
        : undefined;
      const rangeEnd = toDate
        ? endOfLocalDay(toDate >= (fromDate || toDate) ? toDate : fromDate)
        : undefined;
      const data = await apiFetchActivity({
        q: q.trim() || undefined,
        action: action === "all" ? undefined : action,
        entityType: entityType === "all" ? undefined : entityType,
        actorUserId: actor === "all" ? undefined : actor,
        locationId: locationId === "all" ? undefined : locationId,
        from: rangeStart,
        to: rangeEnd,
        limit: 2000,
        offset: 0,
        sortKey,
        sortDir,
      });
      if (!data.logs.length) {
        setError("Nothing to export for the current filters.");
        return;
      }
      exportActivityCsv(data.logs, locationName);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed.";
      setError(isConnectionError(message) ? "Could not export — check your connection." : message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="mt-0">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
        <div className="min-w-0">
          <p className="hidden text-[10px] uppercase tracking-[0.22em] text-gold lg:flex lg:items-center lg:gap-2">
            <ClipboardList size={12} className="text-gold" />
            Activity
          </p>
          <h2 className="hidden font-display text-3xl text-cream lg:mt-2 lg:block xl:text-4xl">
            Activity
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted lg:mt-2">
            Who changed what across stock, orders, catalog, and accounts — with before and after values.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:justify-end">
          <Button
            size="sm"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => void handleExport()}
            disabled={loading || exporting || !dbReady}
          >
            <Download size={14} />
            {exporting ? "Exporting…" : "Export"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <ConnectionNotice className="mt-5" feature="view activity history" />

      <div className="mt-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="min-w-0 w-full sm:min-w-[16rem] sm:flex-1">
            <span className="sr-only">Search</span>
            <SearchInput
              placeholder="Search activity…"
              value={q}
              onChange={setQ}
              aria-label="Search activity"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  void load(1);
                }
              }}
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:contents">
            <Select
              className="min-w-0 sm:w-[11.5rem]"
              value={datePreset}
              ariaLabel="Date range"
              onChange={(value) => {
                const preset = value as DatePreset;
                setDatePreset(preset);
                if (preset === "custom") {
                  setFiltersOpen(true);
                  return;
                }
                const next = rangeForPreset(preset);
                setFromDate(next.fromDate);
                setToDate(next.toDate);
              }}
              options={[
                { value: "all", label: "All time" },
                { value: "today", label: "Today" },
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
                { value: "month", label: "This month" },
                { value: "custom", label: "Custom range" },
              ]}
            />
            <div className="hidden xl:contents">
              <Select
                className="xl:w-[12.5rem]"
                value={action}
                onChange={setAction}
                ariaLabel="Action"
                options={[
                  { value: "all", label: "All actions" },
                  ...Object.entries(ACTION_LABELS).map(([id, label]) => ({
                    value: id,
                    label,
                  })),
                ]}
              />
              <Select
                className="xl:w-[11rem]"
                value={entityType}
                onChange={setEntityType}
                ariaLabel="Entity"
                options={[
                  { value: "all", label: "All entities" },
                  ...Object.entries(ENTITY_LABELS).map(([id, label]) => ({
                    value: id,
                    label,
                  })),
                ]}
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-1.5 rounded-sm border border-white/10 px-3.5 text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-(--gold)/40 hover:text-cream sm:flex-none",
                filtersOpen && "border-(--gold)/40 text-cream",
              )}
            >
              {filtersOpen ? "Less" : "Filters"}
              {filtersActive && !filtersOpen ? (
                <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
              ) : null}
            </button>
          </div>
        </div>

        {filtersOpen || datePreset === "custom" ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {datePreset === "custom" ? (
              <>
                <label className="block text-xs text-muted">
                  From
                  <Input
                    className="mt-1 py-2 scheme-dark"
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setDatePreset("custom");
                    }}
                  />
                </label>
                <label className="block text-xs text-muted">
                  To
                  <Input
                    className="mt-1 py-2 scheme-dark"
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setDatePreset("custom");
                    }}
                  />
                </label>
              </>
            ) : null}
            <div className="contents xl:hidden">
              <Select
                label="Action"
                value={action}
                onChange={setAction}
                options={[
                  { value: "all", label: "All actions" },
                  ...Object.entries(ACTION_LABELS).map(([id, label]) => ({
                    value: id,
                    label,
                  })),
                ]}
              />
              <Select
                label="Entity"
                value={entityType}
                onChange={setEntityType}
                options={[
                  { value: "all", label: "All entities" },
                  ...Object.entries(ENTITY_LABELS).map(([id, label]) => ({
                    value: id,
                    label,
                  })),
                ]}
              />
            </div>
            <Select
              label="Location"
              value={locationId}
              onChange={setLocationId}
              options={[
                { value: "all", label: "All branches" },
                ...locations.map((loc) => ({
                  value: loc.id,
                  label: loc.shortName,
                })),
              ]}
            />
            <Select
              label="User"
              value={actor}
              onChange={setActor}
              options={[
                { value: "all", label: "Everyone" },
                ...actors
                  .slice()
                  .sort((a, b) => a[1].localeCompare(b[1]))
                  .map(([id, name]) => ({
                    value: id,
                    label: name,
                  })),
              ]}
            />
          </div>
        ) : null}

        <ActiveFiltersBar
          className="mt-3"
          resultCount={total}
          resultNoun="event"
          chips={[
            ...(q.trim()
              ? [
                  {
                    id: "q",
                    label: `“${q.trim()}”`,
                    onRemove: () => {
                      setQ("");
                      setPage(1);
                    },
                  },
                ]
              : []),
            ...(datePreset !== "all"
              ? [
                  {
                    id: "date",
                    label:
                      datePreset === "custom" && (fromDate || toDate)
                        ? [fromDate, toDate].filter(Boolean).join(" → ")
                        : DATE_PRESET_LABELS[datePreset],
                    onRemove: () => {
                      setDatePreset("all");
                      setFromDate("");
                      setToDate("");
                      setPage(1);
                    },
                  },
                ]
              : []),
            ...(action !== "all"
              ? [
                  {
                    id: "action",
                    label: ACTION_LABELS[action] ?? action,
                    onRemove: () => {
                      setAction("all");
                      setPage(1);
                    },
                  },
                ]
              : []),
            ...(entityType !== "all"
              ? [
                  {
                    id: "entity",
                    label: ENTITY_LABELS[entityType] ?? entityType,
                    onRemove: () => {
                      setEntityType("all");
                      setPage(1);
                    },
                  },
                ]
              : []),
            ...(locationId !== "all"
              ? [
                  {
                    id: "location",
                    label:
                      locations.find((l) => l.id === locationId)?.shortName ?? locationId,
                    onRemove: () => {
                      setLocationId("all");
                      setPage(1);
                    },
                  },
                ]
              : []),
            ...(actor !== "all"
              ? [
                  {
                    id: "actor",
                    label: knownActors.get(actor) ?? actor,
                    onRemove: () => {
                      setActor("all");
                      setPage(1);
                    },
                  },
                ]
              : []),
          ]}
          onClearAll={clearFilters}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          {loading
            ? "Loading…"
            : total === 0
              ? "No events"
              : `Showing ${from}–${to} of ${total} event${total === 1 ? "" : "s"}`}
        </p>
        <PageSizeSelect value={pageSize} onChange={setPageSize} options={[5, 10, 20, 50]} />
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {loading && logs.length === 0 ? (
        <PanelLoading label="Loading activity…" />
      ) : (
      <>
      <MobileSortBar
        className="mt-4 xl:hidden"
        columns={[
          { key: "when", label: "When" },
          { key: "user", label: "Who" },
          { key: "location", label: "Location" },
          { key: "action", label: "Action" },
          { key: "entity", label: "Entity" },
          { key: "changes", label: "Changes" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />

      <div className={`mt-4 hidden max-w-full xl:block ${tableWrapClass}`}>
        <table className="w-max min-w-full text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <SortableTh label="When" column="when" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="whitespace-nowrap" />
              <SortableTh label="Who" column="user" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Location" column="location" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Action" column="action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh
                label="Entity"
                column="entity"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="min-w-[12rem]"
              />
              <th className="min-w-[16rem] px-4 py-3 font-medium whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-muted">
                Changes
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const loc = locations.find((l) => l.id === log.locationId);
              const when = new Date(log.createdAt);
              const changes = parseActivityChanges({
                action: log.action,
                entityId: log.entityId,
                summary: log.summary,
                metadata: log.metadata,
              });
              return (
                <tr key={log.id} className={tableRowClass}>
                  <td className={`${tableCellClass} align-top whitespace-nowrap text-xs text-muted`}>
                    <Tooltip content={format(when, "PPpp")} className="block">
                    <time dateTime={log.createdAt}>
                      <span className="block text-cream/90">{format(when, "MMM d, yyyy")}</span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wider">
                        {format(when, "h:mm:ss a")}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted">
                        {formatDistanceToNow(when, { addSuffix: true })}
                      </span>
                    </time>
                    </Tooltip>
                  </td>
                  <td className="min-w-[10rem] max-w-[16rem] px-4 py-3 align-top">
                    <p className="text-cream">{log.actorName}</p>
                    {log.actorEmail ? (
                      <p className="mt-0.5 break-all text-[11px] text-muted">{log.actorEmail}</p>
                    ) : (
                      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-gold/80">
                        {roleLabel(log.actorRole)}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted">
                    {loc?.shortName ?? "All stores"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex max-w-full flex-wrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                        ACTION_TONE[log.action] ?? "border-white/15 text-muted"
                      }`}
                    >
                      <ActionLabel action={log.action} />
                    </span>
                  </td>
                  <td className="min-w-[12rem] px-4 py-3 align-top text-xs text-muted">
                    <p className="text-cream/90">{entityLabel(log.entityType)}</p>
                    {log.entityId ? (
                      <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] leading-snug text-white/55">
                        {log.entityId}
                      </p>
                    ) : null}
                  </td>
                  <td className="min-w-[16rem] max-w-[28rem] px-4 py-3 align-top">
                    <ChangesCell changes={changes} summary={log.summary} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ol className="mt-4 space-y-3 xl:hidden">
        {logs.map((log) => {
          const loc = locations.find((l) => l.id === log.locationId);
          const when = new Date(log.createdAt);
          const changes = parseActivityChanges({
            action: log.action,
            entityId: log.entityId,
            summary: log.summary,
            metadata: log.metadata,
          });
          return (
            <li
              key={log.id}
              className="glass min-w-0 border border-white/5 p-3.5 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex max-w-full flex-wrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                      ACTION_TONE[log.action] ?? "border-white/15 text-muted"
                    }`}
                  >
                    <ActionLabel action={log.action} />
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                    {entityLabel(log.entityType)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted">
                    {loc?.shortName ?? "All stores"}
                  </span>
                </div>
                <Tooltip content={format(when, "PPpp")}>
                <time
                  dateTime={log.createdAt}
                  className="shrink-0 text-right text-xs text-muted"
                >
                  <span className="block whitespace-nowrap text-cream/90">
                    {format(when, "MMM d")}
                  </span>
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wider">
                    {format(when, "h:mm a")}
                  </span>
                </time>
                </Tooltip>
              </div>
              <div className="mt-3 min-w-0">
                <ChangesCell changes={changes} summary={log.summary} />
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1 text-cream/85">
                    <UserRound size={12} className="shrink-0" />
                    {log.actorName}
                  </span>
                  {log.actorEmail ? (
                    <span className="min-w-0 break-all">{log.actorEmail}</span>
                  ) : null}
                </p>
                {log.entityId ? (
                  <p className="break-all font-mono text-[11px] text-white/50">
                    {log.entityId}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        onChange={setPage}
        className="mt-8"
      />

      {!loading && logs.length === 0 && !error && (
        <div className="mt-10 text-center text-sm text-muted">
          <ClipboardList className="mx-auto mb-3 text-gold/70" size={28} />
          No activity yet. Place an order, restock a bottle, or sign in as owner to start the trail.
        </div>
      )}
      </>
      )}
    </section>
  );
}
