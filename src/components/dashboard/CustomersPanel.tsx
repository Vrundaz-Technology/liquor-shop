"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import type { CrmCustomer } from "@/lib/db/crm";
import { Save } from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  compareValues,
  SortableTh,
  useTableSort,
} from "@/components/ui/SortableTh";

type CustomerOrder = {
  id: string;
  date: string;
  status: string;
  fulfillment: string;
  locationId: string;
  total: number;
  itemCount: number;
  paymentStatus: string;
};

type SortKey = "customer" | "segment" | "orders" | "spent" | "aov" | "marketing";

async function fetchCustomers(segment: string, q: string) {
  const params = new URLSearchParams();
  if (segment !== "all") params.set("segment", segment);
  if (q.trim()) params.set("q", q.trim());
  const data = await apiFetch<{ ok: true; customers: CrmCustomer[] }>(`/api/customers?${params}`);
  return data.customers;
}

async function fetchCustomerOrders(customerId: string) {
  const data = await apiFetch<{ ok: true; orders: CustomerOrder[] }>(
    `/api/customers?customerId=${encodeURIComponent(customerId)}`,
  );
  return data.orders;
}

export function CustomersPanel() {
  const [segment, setSegment] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CrmCustomer | null>(null);
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState("");
  const qc = useQueryClient();
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("customer", "asc", [
    "orders",
    "spent",
    "aov",
  ]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["crm-customers", segment, q],
    queryFn: () => fetchCustomers(segment, q),
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
    data: orders = [],
    isLoading: ordersLoading,
  } = useQuery({
    queryKey: ["crm-customer-orders", selected?.id],
    queryFn: () => fetchCustomerOrders(selected!.id),
    enabled: Boolean(selected?.id),
  });

  const openCustomer = (c: CrmCustomer) => {
    setSelected(c);
    setNotes(c.notes ?? "");
    setMarketingConsent(c.marketingConsent);
    setFormError("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      if (notes.length > 5000) {
        throw new Error("Notes must be 5000 characters or less.");
      }
      await apiFetch("/api/customers", {
        method: "PATCH",
        body: JSON.stringify({
          customerId: selected.id,
          notes,
          marketingConsent,
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-customers"] });
      setBanner(`Saved notes for ${selected?.name ?? "customer"}.`);
      setSelected(null);
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

  return (
    <div className="min-w-0 space-y-4">
      <div className="border-b border-white/10 pb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gold">CRM</p>
        <h3 className="mt-1 font-display text-xl text-cream sm:text-2xl">Customers</h3>
        <p className="mt-1 text-sm text-muted">
          Segments, spend, notes, and marketing consent for your organization.
        </p>
      </div>

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
              <li
                key={c.id}
                className="rounded-sm border border-white/10 bg-black/20 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-cream">{c.name}</p>
                    <p className="truncate text-xs text-muted">{c.email}</p>
                  </div>
                  <span className="shrink-0 text-xs text-gold">{c.segment}</span>
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
                    <p className="text-muted">AOV</p>
                    <p className="mt-0.5 truncate text-cream">
                      {formatPrice(c.averageOrderValue)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Marketing: {c.marketingConsent ? "opted in" : "opted out"}
                  {c.lastOrderAt
                    ? ` · Last order ${new Date(c.lastOrderAt).toLocaleDateString()}`
                    : ""}
                </p>
                <button
                  type="button"
                  className="mt-3 min-h-10 w-full rounded-sm border border-white/10 text-xs uppercase tracking-[0.14em] text-gold"
                  onClick={() => openCustomer(c)}
                >
                  Edit notes
                </button>
              </li>
            ))}
            {!sortedCustomers.length ? (
              <li className="rounded-sm border border-dashed border-white/10 px-3 py-6 text-sm text-muted">
                No customers yet. They appear after orders are placed.
              </li>
            ) : null}
          </ul>

          <div className="hidden overflow-x-auto rounded-sm border border-white/10 lg:block">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead className="bg-cream/5 text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <SortableTh
                    label="Customer"
                    column="customer"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Segment"
                    column="segment"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Orders"
                    column="orders"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Spent"
                    column="spent"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="AOV"
                    column="aov"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Marketing"
                    column="marketing"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map((c) => (
                  <tr key={c.id} className="border-t border-cream/10">
                    <td className="max-w-[16rem] px-3 py-2.5">
                      <div className="truncate text-cream">{c.name}</div>
                      <div className="truncate text-xs text-muted">{c.email}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gold">{c.segment}</td>
                    <td className="px-3 py-2.5 tabular-nums">{c.orderCount}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      {formatPrice(c.totalSpent)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      {formatPrice(c.averageOrderValue)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">
                      {c.marketingConsent ? "Opted in" : "Opted out"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        className="text-xs text-gold underline"
                        onClick={() => openCustomer(c)}
                      >
                        Notes
                      </button>
                    </td>
                  </tr>
                ))}
                {!sortedCustomers.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-muted">
                      No customers yet. They appear after orders are placed.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-sm border border-white/15 bg-[#121212] p-4 sm:p-5">
            <h3 className="font-display text-xl text-cream">{selected.name}</h3>
            <p className="mt-1 text-xs text-muted">{selected.email}</p>
            <label className="mt-4 block text-[10px] uppercase tracking-[0.16em] text-muted">
              Internal notes
              <textarea
                value={notes}
                maxLength={5000}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setFormError("");
                }}
                rows={5}
                className="mt-1.5 w-full rounded-sm border border-white/10 bg-black/30 p-3 text-sm normal-case tracking-normal text-cream outline-none focus:border-(--gold)/40"
              />
            </label>
            <p className="mt-1 text-right text-[11px] text-muted">{notes.length}/5000</p>
            <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-cream">
              <input
                type="checkbox"
                className="h-5 w-5 accent-(--gold)"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
              />
              Marketing consent (email / offers)
            </label>

            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Order history</p>
              {ordersLoading ? (
                <p className="mt-3 text-sm text-muted">Loading orders…</p>
              ) : !orders.length ? (
                <p className="mt-3 text-sm text-muted">No orders for this customer yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {orders.map((order) => (
                    <li
                      key={order.id}
                      className="rounded-sm border border-white/10 bg-black/20 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-cream">{order.id}</p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {new Date(order.date).toLocaleDateString()} · {order.status} ·{" "}
                            {order.fulfillment}
                          </p>
                        </div>
                        <p className="shrink-0 tabular-nums text-sm text-cream">
                          {formatPrice(order.total)}
                        </p>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted">
                        {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {formError ? <p className="mt-3 text-sm text-(--danger)">{formError}</p> : null}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected(null)}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                loading={save.isPending}
                disabled={notes.length > 5000}
                onClick={() => save.mutate()}
              >
                {!save.isPending ? <Save size={16} aria-hidden /> : null}
                {save.isPending ? "Saving…" : "Save notes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
