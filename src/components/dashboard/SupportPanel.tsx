"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Headphones, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { hasPermission } from "@/lib/auth/permissions";
import { accessibleLocations } from "@/lib/auth/location-access";
import { getAllLocations, getLocationById } from "@/data/locations";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
} from "@/lib/support/routing";
import { useUserStore } from "@/store/user";
import { cn } from "@/lib/utils";
import type {
  SupportCategory,
  SupportRouteScope,
  SupportTicket,
  SupportTicketStatus,
} from "@/types";

type Trends = {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  last7Days: number;
  byCategory: Record<string, number>;
};

const STATUS_OPTIONS: { value: SupportTicketStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export function SupportPanel() {
  const actor = useUserStore((s) => s.profile);
  const stores = accessibleLocations(actor, getAllLocations());
  const canManage = hasPermission(actor, "support.manage");

  const [status, setStatus] = useState<SupportTicketStatus | "all">("open");
  const [category, setCategory] = useState<SupportCategory | "all">("all");
  const [scope, setScope] = useState<SupportRouteScope | "all">("all");
  const [locationId, setLocationId] = useState("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ staff: "1" });
      if (status !== "all") params.set("status", status);
      if (category !== "all") params.set("category", category);
      if (scope !== "all") params.set("scope", scope);
      if (locationId !== "all") params.set("locationId", locationId);
      if (debouncedQ) params.set("q", debouncedQ);
      const [listRes, trendRes] = await Promise.all([
        fetch(`/api/support?${params}`),
        fetch(
          `/api/support?trends=1${locationId !== "all" ? `&locationId=${locationId}` : ""}`,
        ),
      ]);
      const listData = (await listRes.json()) as { tickets?: SupportTicket[]; error?: string };
      const trendData = (await trendRes.json()) as { trends?: Trends };
      if (!listRes.ok) throw new Error(listData.error ?? "Failed to load tickets.");
      setTickets(listData.tickets ?? []);
      if (trendRes.ok) setTrends(trendData.trends ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets.");
      setTickets([]);
      setTrends(null);
    } finally {
      setBusy(false);
    }
  }, [status, category, scope, locationId, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setStatus("open");
    setCategory("all");
    setScope("all");
    setLocationId("all");
    setQ("");
    setDebouncedQ("");
  };

  const openTicket = async (id: string) => {
    setSelectedId(id);
    setReply("");
    setMsg("");
    setError("");
    setDetailLoading(true);
    setMobileShowDetail(true);
    try {
      const res = await fetch(`/api/support?staff=1&id=${encodeURIComponent(id)}`);
      const data = (await res.json()) as { ticket?: SupportTicket; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not open ticket.");
      setDetail(data.ticket ?? null);
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Could not open ticket.");
    } finally {
      setDetailLoading(false);
    }
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail || !reply.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          ticketId: detail.id,
          body: reply.trim(),
        }),
      });
      const data = (await res.json()) as { ticket?: SupportTicket; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reply failed.");
      setDetail(data.ticket ?? null);
      setReply("");
      setMsg("Reply sent.");
      void load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Reply failed.");
    } finally {
      setBusy(false);
    }
  };

  const setTicketStatus = async (next: SupportTicketStatus) => {
    if (!detail) return;
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", ticketId: detail.id, status: next }),
    });
    const data = (await res.json()) as { ticket?: SupportTicket; error?: string };
    if (!res.ok) {
      setMsg(data.error ?? "Update failed.");
      return;
    }
    setDetail(data.ticket ?? null);
    setMsg(`Marked ${next}.`);
    void load();
  };

  const ticketList = (
    <ul className="space-y-2">
      {busy && !tickets.length ? (
        <p className="text-sm text-muted">Loading tickets…</p>
      ) : null}
      {tickets.map((ticket) => {
        const store = ticket.locationId ? getLocationById(ticket.locationId) : null;
        return (
          <li key={ticket.id}>
            <button
              type="button"
              onClick={() => void openTicket(ticket.id)}
              className={cn(
                "min-h-11 w-full rounded-sm border px-3 py-3 text-left transition touch-manipulation",
                selectedId === ticket.id
                  ? "border-(--gold)/40 bg-(--gold)/10"
                  : "border-white/10 bg-black/20 hover:border-white/20",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-cream">{ticket.subject}</p>
                <span className="text-[10px] uppercase tracking-[0.12em] text-gold">
                  {ticket.routeScope}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {ticket.id} · {SUPPORT_CATEGORY_LABELS[ticket.category]} · {ticket.status}
                {store ? ` · ${store.shortName}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted">
                {ticket.customerName} · {ticket.customerEmail}
              </p>
            </button>
          </li>
        );
      })}
      {!busy && !tickets.length && !error ? (
        <div className="rounded-sm border border-dashed border-white/10 px-3 py-10 text-center">
          <Headphones className="mx-auto mb-2 text-gold" size={20} aria-hidden />
          <p className="text-sm text-muted">No tickets match these filters.</p>
        </div>
      ) : null}
    </ul>
  );

  const ticketDetail = (
    <div className="rounded-sm border border-white/10 bg-black/20 p-4">
      {detailLoading ? (
        <p className="text-sm text-muted">Loading conversation…</p>
      ) : !detail ? (
        <div className="flex min-h-60 flex-col items-center justify-center text-center text-sm text-muted">
          <Headphones className="mb-3 text-gold" size={22} />
          Select a ticket to reply and update status.
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-gold lg:hidden"
            onClick={() => setMobileShowDetail(false)}
          >
            <ArrowLeft size={14} aria-hidden />
            Back to list
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-gold">
              {detail.id} · {detail.routeScope}
            </p>
            <h3 className="mt-1 font-display text-2xl text-cream">{detail.subject}</h3>
            <p className="mt-1 text-xs text-muted">
              {SUPPORT_CATEGORY_LABELS[detail.category]} · {detail.status}
              {detail.routeReason ? ` · ${detail.routeReason}` : ""}
            </p>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              {(["open", "pending", "resolved", "closed"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={detail.status === s ? "primary" : "secondary"}
                  onClick={() => void setTicketStatus(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="max-h-80 space-y-3 overflow-y-auto border-t border-white/10 pt-4">
            {(detail.messages ?? []).map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-sm border px-3 py-2 text-sm",
                  m.authorRole === "staff"
                    ? "border-(--gold)/25 bg-(--gold)/5"
                    : "border-white/10 bg-black/30",
                )}
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted">
                  {m.authorName} · {m.authorRole} ·{" "}
                  {new Date(m.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-cream">{m.body}</p>
              </div>
            ))}
            {!(detail.messages ?? []).length ? (
              <p className="text-sm text-muted">No messages yet.</p>
            ) : null}
          </div>

          {canManage && detail.status !== "closed" ? (
            <form onSubmit={(e) => void sendReply(e)} className="space-y-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Reply to customer…"
                className="w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-cream outline-none focus:border-(--gold)/40"
                required
              />
              <Button type="submit" size="sm" loading={busy}>
                <Send size={14} />
                Send reply
              </Button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <ConnectionNotice />
      {trends ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Open", value: trends.open },
            { label: "Pending", value: trends.pending },
            { label: "Resolved", value: trends.resolved },
            { label: "Closed", value: trends.closed },
            { label: "Last 7 days", value: trends.last7Days },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-sm border border-white/10 bg-black/20 px-3 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{card.label}</p>
              <p className="mt-1 text-xl tabular-nums text-cream">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as SupportTicketStatus | "all")}
          options={STATUS_OPTIONS}
        />
        <Select
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as SupportCategory | "all")}
          options={[
            { value: "all", label: "All categories" },
            ...SUPPORT_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
          ]}
        />
        <Select
          label="Routed to"
          value={scope}
          onChange={(v) => setScope(v as SupportRouteScope | "all")}
          options={[
            { value: "all", label: "All queues" },
            { value: "store", label: "Store" },
            { value: "owner", label: "Owner" },
            { value: "platform", label: "Platform" },
          ]}
        />
        <Select
          label="Store"
          value={locationId}
          onChange={setLocationId}
          options={[
            { value: "all", label: "All stores" },
            ...stores.map((s) => ({ value: s.id, label: s.shortName })),
          ]}
        />
        <label className="block text-xs text-muted">
          Search
          <SearchInput
            className="mt-1"
            value={q}
            onChange={setQ}
            placeholder="Ticket, customer, order…"
            aria-label="Search tickets"
          />
        </label>
      </div>

      <ActiveFiltersBar
        className="mt-3"
        resultCount={tickets.length}
        resultNoun="ticket"
        chips={[
          ...(status !== "open"
            ? [
                {
                  id: "status",
                  label: STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status,
                  onRemove: () => setStatus("open"),
                },
              ]
            : []),
          ...(category !== "all"
            ? [
                {
                  id: "category",
                  label: SUPPORT_CATEGORY_LABELS[category] ?? category,
                  onRemove: () => setCategory("all"),
                },
              ]
            : []),
          ...(scope !== "all"
            ? [
                {
                  id: "scope",
                  label:
                    scope === "store"
                      ? "Store"
                      : scope === "owner"
                        ? "Owner"
                        : "Platform",
                  onRemove: () => setScope("all"),
                },
              ]
            : []),
          ...(locationId !== "all"
            ? [
                {
                  id: "location",
                  label: stores.find((s) => s.id === locationId)?.shortName ?? locationId,
                  onRemove: () => setLocationId("all"),
                },
              ]
            : []),
          ...(q.trim()
            ? [
                {
                  id: "q",
                  label: `“${q.trim()}”`,
                  onRemove: () => {
                    setQ("");
                    setDebouncedQ("");
                  },
                },
              ]
            : []),
        ]}
        onClearAll={clearFilters}
      />

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {msg ? <p className="text-sm text-gold">{msg}</p> : null}

      <div className="lg:hidden">{mobileShowDetail ? ticketDetail : ticketList}</div>
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {ticketList}
        {ticketDetail}
      </div>
    </div>
  );
}
