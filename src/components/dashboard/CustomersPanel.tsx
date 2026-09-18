"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CircleHelp,
  Mail,
  MapPin,
  Megaphone,
  Package,
  Phone,
  Save,
  Star,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { formatPrice, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import {
  SortableTh,
  compareValues,
  MobileSortBar,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import { dashboardPath, parseDashboardPath } from "@/lib/dashboard/routes";
import { hasPermission } from "@/lib/auth/permissions";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { NotifyChannelsEditor } from "@/components/dashboard/NotifyChannelsEditor";
import {
  seedNotifyEmails,
  seedNotifyPhones,
  validateNotifyDestinations,
} from "@/lib/notifications/destinations";
import type { NotifyEmailDestination, NotifyPhoneDestination } from "@/types";
import { useUserStore } from "@/store/user";
import { formatOrderPlaced } from "@/lib/commerce/order-tracking";
import type {
  CrmCustomer,
  CrmCustomerDetail,
  CustomerSegment,
} from "@/lib/db/crm";
import { CUSTOMER_METRIC_GUIDE, CUSTOMER_SEGMENT_GUIDE } from "@/lib/db/crm";

type SortKey = "customer" | "segment" | "orders" | "spent" | "aov" | "loyalty" | "lastOrder" | "marketing";

async function fetchCustomers(segment: string, q: string) {
  const params = new URLSearchParams();
  if (segment !== "all") params.set("segment", segment);
  if (q.trim()) params.set("q", q.trim());
  const data = await apiFetch<{ ok: true; customers: CrmCustomer[] }>(`/api/customers?${params}`);
  return data.customers;
}

async function fetchCustomerProfile(customerId: string) {
  const data = await apiFetch<{ ok: true; customer: CrmCustomerDetail }>(
    `/api/customers?customerId=${encodeURIComponent(customerId)}`,
  );
  return data.customer;
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function orderOffer(order: {
  couponCode: string | null;
  promotionName?: string | null;
  discountAmount: number;
}) {
  const code = order.couponCode?.trim() || "";
  const name = order.promotionName?.trim() || "";
  if (code && name && name.toLowerCase() !== code.toLowerCase()) {
    return { title: code, subtitle: name };
  }
  if (code) return { title: code, subtitle: "" };
  if (name) return { title: name, subtitle: "" };
  if (order.discountAmount > 0) return { title: "Promotion", subtitle: "" };
  return { title: "", subtitle: "" };
}

const AOV_HINT = "Average Order Value — lifetime spend divided by number of orders.";

function notifyTone(status?: "sent" | "skipped" | "failed") {
  if (status === "sent") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  if (status === "failed") return "border-(--danger)/35 bg-(--danger)/10 text-(--danger)";
  if (status === "skipped") return "border-white/15 bg-white/5 text-muted";
  return "";
}

function OrderNotifyMarks({
  notify,
}: {
  notify?: { email?: "sent" | "skipped" | "failed"; sms?: "sent" | "skipped" | "failed" };
}) {
  if (!notify?.email && !notify?.sms) {
    return <span className="text-muted">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {notify.email ? (
        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", notifyTone(notify.email))}>
          Email {notify.email}
        </span>
      ) : null}
      {notify.sms ? (
        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", notifyTone(notify.sms))}>
          SMS {notify.sms}
        </span>
      ) : null}
    </span>
  );
}

function AovLabel({ className }: { className?: string }) {
  return <AbbrTooltip term="AOV" full={AOV_HINT} abbrClassName={className} />;
}

const SEGMENT_STYLES: Record<CustomerSegment, { wrap: string; dot: string }> = {
  VIP: {
    wrap: "border-[#e2c57a]/50 bg-[#e2c57a]/12 text-[#f4dd9a] shadow-[inset_0_0_0_1px_rgba(226,197,122,0.08)]",
    dot: "bg-[#f4dd9a] shadow-[0_0_6px_rgba(244,221,154,0.65)]",
  },
  Frequent: {
    wrap: "border-violet-400/45 bg-violet-500/12 text-violet-100",
    dot: "bg-violet-300 shadow-[0_0_6px_rgba(196,181,253,0.45)]",
  },
  New: {
    wrap: "border-teal-400/45 bg-teal-500/12 text-teal-100",
    dot: "bg-teal-300 shadow-[0_0_6px_rgba(94,234,212,0.4)]",
  },
  Inactive: {
    wrap: "border-zinc-500/40 bg-zinc-500/[0.12] text-zinc-400",
    dot: "bg-zinc-500",
  },
  Regular: {
    wrap: "border-sky-400/40 bg-sky-500/12 text-sky-100",
    dot: "bg-sky-300 shadow-[0_0_6px_rgba(125,211,252,0.4)]",
  },
};

function segmentBadgeClass(segment: CustomerSegment) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
    SEGMENT_STYLES[segment].wrap,
  );
}

function SegmentBadge({ segment }: { segment: CrmCustomer["segment"] }) {
  return (
    <span className={segmentBadgeClass(segment)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", SEGMENT_STYLES[segment].dot)} aria-hidden />
      {segment}
    </span>
  );
}

function CrmScoringModal({
  open,
  onClose,
  onSelectSegment,
}: {
  open: boolean;
  onClose: () => void;
  onSelectSegment: (segment: string) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How scoring works"
      subtitle="Segments are assigned automatically from spend and recency — not a tag you pick."
      className="sm:max-w-3xl"
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-gold">
            Segments · checked in this order
          </p>
          <ul className="mt-3 space-y-3">
            {CUSTOMER_SEGMENT_GUIDE.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full gap-3 rounded-sm border border-transparent p-2 text-left transition hover:border-white/10 hover:bg-white/[0.03]"
                  onClick={() => {
                    onSelectSegment(item.id);
                    onClose();
                  }}
                >
                  <span className="mt-0.5 w-4 shrink-0 text-xs tabular-nums text-muted">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SegmentBadge segment={item.id} />
                      <span className="text-xs text-gold">{item.rule}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{item.detail}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Table columns</p>
          <ul className="mt-3 space-y-3">
            {CUSTOMER_METRIC_GUIDE.map((item) => (
              <li key={item.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                <p className="text-sm text-cream">{item.label}</p>
                <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

export function CustomersPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const selectedId = parseDashboardPath(pathname).customerId;
  const [segment, setSegment] = useState("all");
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [channelPrefs, setChannelPrefs] = useState({ emails: true, sms: true, push: false });
  const [notifyEmails, setNotifyEmails] = useState<NotifyEmailDestination[]>([]);
  const [notifyPhones, setNotifyPhones] = useState<NotifyPhoneDestination[]>([]);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const qc = useQueryClient();
  const canViewOrders = hasPermission(useUserStore((s) => s.profile), "orders.view");
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("customer", "asc", [
    "orders",
    "spent",
    "aov",
    "loyalty",
    "lastOrder",
  ]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["crm-customers", segment, q],
    queryFn: () => fetchCustomers(segment, q),
    staleTime: 15_000,
  });

  const sortedCustomers = useMemo(() => {
    return [...data].sort((a, b) => {
      switch (sortKey) {
        case "segment":
          return compareValues(a.segment, b.segment, sortDir);
        case "orders":
          return compareValues(a.orderCount, b.orderCount, sortDir);
        case "spent":
          return compareValues(a.totalSpent, b.totalSpent, sortDir);
        case "aov":
          return compareValues(a.averageOrderValue, b.averageOrderValue, sortDir);
        case "loyalty":
          return compareValues(a.loyaltyPoints, b.loyaltyPoints, sortDir);
        case "lastOrder": {
          const av = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
          const bv = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
          return compareValues(av, bv, sortDir);
        }
        case "marketing":
          return compareValues(
            a.marketingConsent ? "Opted in" : "Opted out",
            b.marketingConsent ? "Opted in" : "Opted out",
            sortDir,
          );
        case "customer":
        default:
          return compareValues(a.name, b.name, sortDir);
      }
    });
  }, [data, sortDir, sortKey]);

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ["crm-customer-detail", selectedId],
    queryFn: () => fetchCustomerProfile(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!detail) return;
    setNotes(detail.notes ?? "");
    setMarketingConsent(detail.marketingConsent);
    setChannelPrefs({
      emails: detail.marketingPrefs.emails,
      sms: detail.marketingPrefs.sms,
      push: detail.marketingPrefs.push,
    });
    setNotifyEmails(seedNotifyEmails(detail.email, detail.marketingPrefs.notifyEmails));
    setNotifyPhones(seedNotifyPhones(detail.marketingPrefs.notifyPhones));
  }, [detail]);

  const openCustomer = (c: CrmCustomer) => {
    setNotes(c.notes ?? "");
    setMarketingConsent(c.marketingConsent);
    setFormError("");
    router.push(dashboardPath("customers", { customerId: c.id }), { scroll: false });
  };

  const closeCustomer = useCallback(() => {
    router.push(dashboardPath("customers"), { scroll: false });
  }, [router]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      if (notes.length > 5000) {
        throw new Error("Notes must be 5000 characters or less.");
      }
      const emails = notifyEmails.filter((row) => row.locked || row.email.trim());
      const phones = notifyPhones.filter((row) => row.phone.trim());
      const destinationError = validateNotifyDestinations(emails, phones);
      if (destinationError) throw new Error(destinationError);
      await apiFetch("/api/customers", {
        method: "PATCH",
        body: JSON.stringify({
          customerId: selectedId,
          notes,
          marketingConsent,
          orderEmailUpdates: channelPrefs.emails,
          smsUpdates: channelPrefs.sms,
          pushUpdates: channelPrefs.push,
          notifyEmails: emails,
          notifyPhones: phones,
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-customers"] });
      void qc.invalidateQueries({ queryKey: ["crm-customer-detail", selectedId] });
      setBanner(`Saved notes for ${detail?.name ?? "customer"}.`);
      setFormError("");
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Could not save notes.");
    },
  });

  const segmentLabel =
    (
      [
        { value: "VIP", label: "VIP" },
        { value: "Frequent", label: "Frequent" },
        { value: "Inactive", label: "Inactive" },
        { value: "New", label: "New" },
        { value: "Regular", label: "Regular" },
      ] as const
    ).find((o) => o.value === segment)?.label ?? segment;

  const clearFilters = () => {
    setQ("");
    setSegment("all");
  };

  if (selectedId) {
    return (
      <CustomerRecord
        customer={detail}
        loading={detailLoading}
        notes={notes}
        marketingConsent={marketingConsent}
        channelPrefs={channelPrefs}
        notifyEmails={notifyEmails}
        notifyPhones={notifyPhones}
        formError={formError}
        busy={save.isPending}
        canViewOrders={canViewOrders}
        onNotes={setNotes}
        onConsent={setMarketingConsent}
        onChannelPrefs={setChannelPrefs}
        onNotifyEmails={setNotifyEmails}
        onNotifyPhones={setNotifyPhones}
        onBack={closeCustomer}
        onSave={() => save.mutate()}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold">CRM</p>
          <h3 className="mt-1 font-display text-xl text-cream sm:text-2xl">Customers</h3>
          <p className="mt-1 text-sm text-muted">
            Owner customer database: spend, loyalty, favorites, and marketing consent.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => setGuideOpen(true)}
        >
          <CircleHelp size={14} />
          How scoring works
        </Button>
      </div>

      <CrmScoringModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        onSelectSegment={setSegment}
      />

      {banner ? (
        <p className="rounded-sm border border-(--success)/30 bg-(--success)/10 px-3 py-2 text-sm text-(--success)">
          {banner}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <SearchInput
          className="min-w-0 flex-1"
          value={q}
          onChange={setQ}
          placeholder="Search name or email"
          aria-label="Search customers"
        />
        <Select
          ariaLabel="Customer segment"
          value={segment}
          onChange={setSegment}
          className="w-full sm:w-auto sm:min-w-[11rem]"
          options={[
            { value: "all", label: "All segments" },
            { value: "VIP", label: "VIP" },
            { value: "Frequent", label: "Frequent" },
            { value: "Inactive", label: "Inactive" },
            { value: "New", label: "New" },
            { value: "Regular", label: "Regular" },
          ]}
        />
      </div>

      <ActiveFiltersBar
        className="mt-3"
        resultCount={sortedCustomers.length}
        resultNoun="customer"
        chips={[
          ...(q.trim()
            ? [
                {
                  id: "q",
                  label: `“${q.trim()}”`,
                  onRemove: () => setQ(""),
                },
              ]
            : []),
          ...(segment !== "all"
            ? [
                {
                  id: "segment",
                  label: segmentLabel,
                  onRemove: () => setSegment("all"),
                },
              ]
            : []),
        ]}
        onClearAll={clearFilters}
      />

      {isLoading ? (
        <p className="text-sm text-muted">Loading customers…</p>
      ) : (
        <>
          <ul className="space-y-2 lg:hidden">
            {sortedCustomers.map((c) => (
              <li key={c.id} className="rounded-sm border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-cream">{c.name}</p>
                    <p className="truncate text-xs text-muted">{c.email}</p>
                    {c.phone ? <p className="mt-0.5 text-xs text-muted">{c.phone}</p> : null}
                  </div>
                  <SegmentBadge segment={c.segment} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-sm border border-white/5 px-2 py-1.5">
                    <p className="text-muted">Orders</p>
                    <p className="mt-0.5 text-cream">{c.orderCount}</p>
                  </div>
                  <div className="rounded-sm border border-white/5 px-2 py-1.5">
                    <p className="text-muted">Spent</p>
                    <p className="mt-0.5 truncate text-cream">{formatPrice(c.totalSpent)}</p>
                  </div>
                  <div className="rounded-sm border border-white/5 px-2 py-1.5">
                    <p className="text-muted">
                      <AovLabel />
                    </p>
                    <p className="mt-0.5 truncate text-cream">{formatPrice(c.averageOrderValue)}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {c.loyaltyPoints.toLocaleString()} pts · {c.loyaltyTier}
                  {c.lastOrderAt ? ` · Last ${formatShortDate(c.lastOrderAt)}` : ""}
                </p>
                <button
                  type="button"
                  className="mt-3 min-h-10 w-full rounded-sm border border-white/10 text-xs uppercase tracking-[0.14em] text-gold"
                  onClick={() => openCustomer(c)}
                >
                  Open record
                </button>
              </li>
            ))}
            {!sortedCustomers.length ? (
              <li className="rounded-sm border border-dashed border-white/10 px-3 py-6 text-sm text-muted">
                No customers yet. They appear after orders are placed.
              </li>
            ) : null}
          </ul>

          <div className={cn(tableWrapClass, "hidden lg:block")}>
            <table className="w-full min-w-[72rem] text-left text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <SortableTh label="Customer" column="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Segment" column="segment" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Orders" column="orders" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Spent" column="spent" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh
                    label="AOV"
                    column="aov"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    tooltip={AOV_HINT}
                  />
                  <SortableTh label="Loyalty" column="loyalty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Last order" column="lastOrder" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Marketing" column="marketing" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className={cn(tableCellClass, "text-right font-medium")}> </th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(tableRowClass, "cursor-pointer")}
                    onClick={() => openCustomer(c)}
                  >
                    <td className={cn(tableCellClass, "max-w-[16rem]")}>
                      <p className="truncate text-cream">{c.name}</p>
                      <p className="truncate text-xs text-muted">{c.email}</p>
                      {c.phone ? <p className="truncate text-xs text-muted">{c.phone}</p> : null}
                    </td>
                    <td className={tableCellClass}>
                      <SegmentBadge segment={c.segment} />
                    </td>
                    <td className={cn(tableCellClass, "tabular-nums")}>{c.orderCount}</td>
                    <td className={cn(tableCellClass, "tabular-nums")}>{formatPrice(c.totalSpent)}</td>
                    <td className={cn(tableCellClass, "tabular-nums")}>
                      {formatPrice(c.averageOrderValue)}
                    </td>
                    <td className={tableCellClass}>
                      <p className="tabular-nums text-cream">{c.loyaltyPoints.toLocaleString()} pts</p>
                      <p className="text-xs text-muted">{c.loyaltyTier}</p>
                    </td>
                    <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                      {formatShortDate(c.lastOrderAt)}
                    </td>
                    <td className={cn(tableCellClass, "text-xs text-muted")}>
                      {c.marketingConsent ? "Opted in" : "Opted out"}
                    </td>
                    <td className={cn(tableCellClass, "text-right")}>
                      <button type="button" className="text-xs text-gold underline">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {!sortedCustomers.length ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-muted">
                      No customers yet. They appear after orders are placed.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function CustomerRecord({
  customer,
  loading,
  notes,
  marketingConsent,
  channelPrefs,
  notifyEmails,
  notifyPhones,
  formError,
  busy,
  canViewOrders,
  onNotes,
  onConsent,
  onChannelPrefs,
  onNotifyEmails,
  onNotifyPhones,
  onBack,
  onSave,
}: {
  customer?: CrmCustomerDetail;
  loading: boolean;
  notes: string;
  marketingConsent: boolean;
  channelPrefs: { emails: boolean; sms: boolean; push: boolean };
  notifyEmails: NotifyEmailDestination[];
  notifyPhones: NotifyPhoneDestination[];
  formError: string;
  busy: boolean;
  canViewOrders: boolean;
  onNotes: (value: string) => void;
  onConsent: (value: boolean) => void;
  onChannelPrefs: (value: { emails: boolean; sms: boolean; push: boolean }) => void;
  onNotifyEmails: (value: NotifyEmailDestination[]) => void;
  onNotifyPhones: (value: NotifyPhoneDestination[]) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const {
    sortKey: orderSortKey,
    sortDir: orderSortDir,
    toggleSort: toggleOrderSort,
  } = useTableSort<"id" | "date" | "type" | "status" | "offer" | "total" | "discount" | "notify">(
    "date",
    "desc",
    ["date", "total", "discount"],
  );

  const [orderQuery, setOrderQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const orders = customer?.orders ?? [];

  const filteredOrders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const offer = orderOffer(order);
      const hay = [
        order.id,
        order.fulfillment,
        order.status.replaceAll("_", " "),
        offer.title,
        offer.subtitle,
        order.couponCode ?? "",
        order.promotionName ?? "",
        formatPrice(order.total),
        formatPrice(order.discountAmount),
        order.notify?.email ?? "",
        order.notify?.sms ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orderQuery, orders]);

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      switch (orderSortKey) {
        case "id":
          return compareValues(a.id, b.id, orderSortDir);
        case "type":
          return compareValues(a.fulfillment, b.fulfillment, orderSortDir);
        case "status":
          return compareValues(a.status, b.status, orderSortDir);
        case "offer":
          return compareValues(
            orderOffer(a).title || orderOffer(a).subtitle,
            orderOffer(b).title || orderOffer(b).subtitle,
            orderSortDir,
          );
        case "total":
          return compareValues(a.total, b.total, orderSortDir);
        case "discount":
          return compareValues(a.discountAmount, b.discountAmount, orderSortDir);
        case "notify":
          return compareValues(
            `${a.notify?.email ?? "none"} ${a.notify?.sms ?? "none"}`,
            `${b.notify?.email ?? "none"} ${b.notify?.sms ?? "none"}`,
            orderSortDir,
          );
        case "date":
        default: {
          const av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return compareValues(av, bv, orderSortDir);
        }
      }
    });
  }, [filteredOrders, orderSortDir, orderSortKey]);

  useEffect(() => {
    setPage(1);
    setOrderQuery("");
  }, [customer?.id]);

  useEffect(() => {
    setPage(1);
  }, [orderSortKey, orderSortDir, pageSize, orderQuery]);

  const total = sortedOrders.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const pageOrders = useMemo(
    () => sortedOrders.slice((safePage - 1) * pageSize, (safePage - 1) * pageSize + pageSize),
    [pageSize, safePage, sortedOrders],
  );

  return (
    <div className="min-w-0 space-y-5">
      <Button type="button" variant="ghost" size="sm" className="w-fit gap-2 px-0" onClick={onBack}>
        <ArrowLeft size={14} />
        Back to customers
      </Button>

      {loading && !customer ? (
        <p className="text-sm text-muted">Loading customer…</p>
      ) : !customer ? (
        <p className="text-sm text-muted">Customer not found.</p>
      ) : (
        <>
          <div className="rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.05] to-black/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Customer record</p>
                <h3 className="mt-1 font-display text-2xl text-cream">{customer.name}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={13} />
                    {customer.email}
                  </span>
                  {customer.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone size={13} />
                      {customer.phone}
                    </span>
                  ) : (
                    <span>No phone on file</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <SegmentBadge segment={customer.segment} />
                <p className="mt-1.5 max-w-[14rem] text-xs text-muted">
                  {CUSTOMER_SEGMENT_GUIDE.find((item) => item.id === customer.segment)?.rule}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { key: "orders", label: "Orders", value: String(customer.orderCount) },
              { key: "spent", label: "Total spent", value: formatPrice(customer.totalSpent) },
              { key: "aov", label: "AOV", value: formatPrice(customer.averageOrderValue) },
              {
                key: "current",
                label: "Current points",
                value: customer.loyaltyPoints.toLocaleString(),
                hint: customer.loyaltyTier,
              },
              {
                key: "used",
                label: "Used points",
                value: (customer.loyaltyPointsUsed ?? 0).toLocaleString(),
                hint: "Redeemed",
              },
              { key: "last", label: "Last order", value: formatShortDate(customer.lastOrderAt) },
            ].map((card) => (
              <div key={card.key} className="rounded-sm border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-gold">
                  {card.key === "aov" ? <AovLabel className="text-gold" /> : card.label}
                </p>
                <p className="mt-1.5 font-price text-xl text-cream">
                  {card.value}
                  {card.key === "current" || card.key === "used" ? (
                    <span className="ml-1 text-sm font-sans text-muted">pts</span>
                  ) : null}
                </p>
                {"hint" in card && card.hint ? <p className="mt-0.5 text-xs text-muted">{card.hint}</p> : null}
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-sm border border-white/10 bg-black/20 p-4">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-gold">
                <MapPin size={12} />
                Delivery addresses
              </p>
              {customer.addresses.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No saved addresses.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {customer.addresses.map((address, index) => (
                    <li key={`${address.line1}-${index}`} className="rounded-sm border border-white/10 px-3 py-2.5">
                      <p className="text-sm text-cream">
                        {address.label}
                        {address.isDefault ? (
                          <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-gold">Default</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {address.line1}, {address.city}, {address.state} {address.zip}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-sm border border-white/10 bg-black/20 p-4">
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-gold">
                <Star size={12} />
                Favorites
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted">Products</p>
                  {customer.favoriteProducts.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No bottles yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {customer.favoriteProducts.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-cream">{item.name}</span>
                          <span className="shrink-0 tabular-nums text-muted">{item.count}×</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted">Categories</p>
                  {customer.favoriteCategories.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No categories yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {customer.favoriteCategories.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-cream">{item.name}</span>
                          <span className="shrink-0 tabular-nums text-muted">{item.count}×</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </div>

          <section className="rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="flex items-center gap-2 font-display text-xl text-cream">
                  <Package size={16} className="text-gold" />
                  Order history
                </h4>
                <p className="mt-1 text-xs text-muted">
                  {orders.length === 0
                    ? "Orders, offers, and totals in one place."
                    : total === 0
                      ? "No matching orders"
                      : `Showing ${from}–${to} of ${total}`}
                </p>
              </div>
              {orders.length > 0 ? (
                <PageSizeSelect
                  className="shrink-0 self-start sm:mt-1"
                  value={pageSize}
                  onChange={setPageSize}
                  options={[5, 10, 20, 50]}
                  aria-label="Orders per page"
                />
              ) : null}
            </div>

            {orders.length > 0 ? (
              <SearchInput
                className="mt-4"
                inputClassName="h-11"
                value={orderQuery}
                onChange={setOrderQuery}
                placeholder="Search orders…"
                aria-label="Search order history"
              />
            ) : null}

            {orders.length === 0 ? (
              <p className="mt-4 rounded-sm border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted">
                No orders for this customer yet.
              </p>
            ) : total === 0 ? (
              <p className="mt-4 rounded-sm border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted">
                No orders match “{orderQuery.trim()}”.
              </p>
            ) : (
              <>
                <MobileSortBar
                  className="mt-4 lg:hidden"
                  columns={[
                    { key: "id", label: "Order" },
                    { key: "date", label: "Placed" },
                    { key: "type", label: "Type" },
                    { key: "status", label: "Status" },
                    { key: "notify", label: "Notify" },
                    { key: "offer", label: "Offer" },
                    { key: "discount", label: "Discount" },
                    { key: "total", label: "Total" },
                  ]}
                  sortKey={orderSortKey}
                  sortDir={orderSortDir}
                  onSort={toggleOrderSort}
                />
                <ul className="mt-3 space-y-2 lg:hidden">
                  {pageOrders.map((order) => {
                    const placed = formatOrderPlaced({
                      date: order.date,
                      createdAt: order.createdAt ?? undefined,
                    });
                    const offer = orderOffer(order);
                    return (
                      <li key={order.id} className="rounded-sm border border-white/10 bg-black/20 p-3">
                        <p className="truncate text-sm font-medium text-cream">{order.id}</p>
                        <p className="mt-1 text-xs capitalize text-muted">
                          {placed.label} · {order.fulfillment} · {order.status.replaceAll("_", " ")}
                        </p>
                        <div className="mt-2">
                          <OrderNotifyMarks notify={order.notify} />
                        </div>
                        {offer.title ? (
                          <p className="mt-2 text-sm text-cream">
                            {offer.title}
                            {offer.subtitle ? (
                              <span className="text-muted"> · {offer.subtitle}</span>
                            ) : null}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm tabular-nums text-cream">
                          {formatPrice(order.total)}
                          {order.discountAmount > 0 ? (
                            <span className="text-muted"> · −{formatPrice(order.discountAmount)}</span>
                          ) : null}
                        </p>
                        {canViewOrders ? (
                          <Link
                            href={dashboardPath("orders", { orderId: order.id })}
                            className="mt-2 inline-flex min-h-11 items-center text-xs uppercase tracking-[0.14em] text-gold"
                          >
                            Open order
                          </Link>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <div className={cn("mt-4 hidden lg:block", tableWrapClass)}>
                <table className="w-full min-w-[58rem] text-left text-sm">
                  <thead>
                    <tr className={tableHeadRowClass}>
                      <SortableTh label="Order" column="id" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} />
                      <SortableTh label="Placed" column="date" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} />
                      <SortableTh label="Type" column="type" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} />
                      <SortableTh label="Status" column="status" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} />
                      <SortableTh label="Notify" column="notify" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} />
                      <SortableTh label="Offer" column="offer" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} />
                      <SortableTh label="Discount" column="discount" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} align="right" />
                      <SortableTh label="Total" column="total" sortKey={orderSortKey} sortDir={orderSortDir} onSort={toggleOrderSort} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageOrders.map((order) => {
                      const placed = formatOrderPlaced({
                        date: order.date,
                        createdAt: order.createdAt ?? undefined,
                      });
                      const offer = orderOffer(order);
                      return (
                        <tr key={order.id} className={tableRowClass}>
                          <td className={tableCellClass}>
                            {canViewOrders ? (
                              <Link
                                href={dashboardPath("orders", { orderId: order.id })}
                                className="text-gold hover:underline"
                              >
                                {order.id}
                              </Link>
                            ) : (
                              order.id
                            )}
                          </td>
                          <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                            {placed.label}
                          </td>
                          <td className={cn(tableCellClass, "capitalize")}>{order.fulfillment}</td>
                          <td className={cn(tableCellClass, "capitalize")}>
                            {order.status.replaceAll("_", " ")}
                          </td>
                          <td className={tableCellClass}>
                            <OrderNotifyMarks notify={order.notify} />
                          </td>
                          <td className={tableCellClass}>
                            {offer.title ? (
                              <>
                                <p className="text-cream">{offer.title}</p>
                                {offer.subtitle ? (
                                  <p className="text-xs text-muted">{offer.subtitle}</p>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className={cn(tableCellClass, "text-right tabular-nums")}>
                            {order.discountAmount > 0 ? formatPrice(order.discountAmount) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className={cn(tableCellClass, "text-right tabular-nums")}>
                            {formatPrice(order.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} className="mt-6" />
              </>
            )}
          </section>

          <section className="rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Notes & marketing</p>
            <label className="mt-3 block text-xs text-muted">
              Internal notes
              <textarea
                value={notes}
                maxLength={5000}
                onChange={(e) => onNotes(e.target.value)}
                rows={5}
                className="mt-1.5 w-full rounded-sm border border-white/10 bg-black/30 p-3 text-sm normal-case tracking-normal text-cream outline-none focus:border-(--gold)/40"
              />
            </label>
            <p className="mt-1 text-right text-[11px] text-muted">{notes.length}/5000</p>

            <div className="mt-5 border-t border-white/10 pt-5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Preferences</p>
              <p className="mt-1 text-xs text-muted">
                Channel switches match the customer’s Account page. Recipients below are where
                messages actually go.
              </p>
              <div className="mt-3">
                <PrefCard
                  icon={Megaphone}
                  title="Marketing consent"
                  description="Allowed to receive promotional offers and new arrivals."
                  checked={marketingConsent}
                  onChange={onConsent}
                />
              </div>
              <div className="mt-4">
                <NotifyChannelsEditor
                  channels={channelPrefs}
                  emails={notifyEmails}
                  phones={notifyPhones}
                  receiptPhone={customer.phone}
                  onChannels={onChannelPrefs}
                  onEmails={onNotifyEmails}
                  onPhones={onNotifyPhones}
                />
              </div>
            </div>
            {formError ? <p className="mt-3 text-sm text-(--danger)">{formError}</p> : null}
            <div className="mt-4 flex justify-end">
              <Button type="button" loading={busy} disabled={notes.length > 5000} onClick={onSave}>
                {!busy ? <Save size={16} /> : null}
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PrefCard({
  icon: Icon,
  title,
  description,
  destination,
  checked,
  onChange,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  destination?: string | null;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-[6.25rem] w-full items-start justify-between gap-3 rounded-sm border px-3.5 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)",
        checked
          ? "border-(--gold)/35 bg-(--gold)/[0.07]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <Icon size={14} className={checked ? "text-gold" : "text-muted"} aria-hidden />
          <span className="text-sm font-medium text-cream">{title}</span>
        </span>
        {destination ? (
          <span className="mt-1.5 block truncate text-xs text-cream">{destination}</span>
        ) : destination === null || destination === "" ? (
          <span className="mt-1.5 block text-xs text-muted">No number on file</span>
        ) : null}
        <span className="mt-1 block text-xs leading-relaxed text-muted">{description}</span>
      </span>
      <span className="mt-0.5 flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors duration-200",
            checked ? "bg-(--gold)" : "bg-white/20",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-sm transition-all duration-200 ease-out",
              checked ? "translate-x-4 bg-[#1a1408]" : "bg-cream",
            )}
          />
        </span>
        <span
          className={cn(
            "text-[10px] uppercase tracking-[0.14em]",
            checked ? "text-gold" : "text-muted",
          )}
        >
          {checked ? "On" : "Off"}
        </span>
      </span>
    </button>
  );
}
