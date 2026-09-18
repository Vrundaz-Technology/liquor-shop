"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Headphones, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SupportAttachmentField } from "@/components/support/SupportAttachments";
import { SupportThread } from "@/components/support/SupportThread";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_ROUTE_LABELS,
  SUPPORT_STATUS_LABELS,
  SUPPORT_STATUS_STYLES,
  routeSupportTicket,
} from "@/lib/support/routing";
import { getAllLocations, getLocationById } from "@/data/locations";
import { useBranchStore } from "@/store/branch";
import { useUserStore } from "@/store/user";
import { cn, formatPrice } from "@/lib/utils";
import type { SupportAttachment, SupportCategory, SupportTicket, SupportTicketStatus } from "@/types";

const DEFAULT_ORG = "org-sams-discount-liquor";

const INBOX_GROUPS: { status: SupportTicketStatus; hint: string }[] = [
  { status: "open", hint: "The store is working on these." },
  { status: "pending", hint: "A reply is waiting for you." },
  { status: "resolved", hint: "Marked resolved — reply if it isn’t." },
  { status: "closed", hint: "Closed tickets stay here for your records." },
];

type View = "inbox" | "compose" | "ticket";

type Props = {
  defaultOrderId?: string;
  defaultCategory?: SupportCategory;
  compact?: boolean;
};

function StatusBadge({ status }: { status: SupportTicketStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
        SUPPORT_STATUS_STYLES[status],
      )}
    >
      {SUPPORT_STATUS_LABELS[status]}
    </span>
  );
}

export function CustomerSupportCenter({
  defaultOrderId,
  defaultCategory = "order_issue",
  compact = false,
}: Props) {
  const { isLoggedIn, profile } = useUserStore();
  const branchId = useBranchStore((s) => s.branchId);
  const stores = getAllLocations();

  const [view, setView] = useState<View>(() => (defaultOrderId ? "compose" : "inbox"));
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [category, setCategory] = useState<SupportCategory>(defaultCategory);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [orderId, setOrderId] = useState(defaultOrderId ?? "");
  const [locationId, setLocationId] = useState(branchId);
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<SupportAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [reply, setReply] = useState("");

  const previewRoute = useMemo(
    () =>
      routeSupportTicket({
        category,
        organizationId: profile.organizationId || DEFAULT_ORG,
        orderLocationId: profile.orders.find((order) => order.id === orderId)?.locationId ?? null,
        preferredLocationId: profile.preferredBranchId || branchId,
        selectedLocationId: locationId,
      }),
    [category, profile.organizationId, profile.orders, profile.preferredBranchId, branchId, locationId, orderId],
  );

  const grouped = useMemo(() => {
    return INBOX_GROUPS.map((group) => ({
      ...group,
      tickets: tickets.filter((ticket) => ticket.status === group.status),
    })).filter((group) => group.tickets.length > 0);
  }, [tickets]);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    setListLoading(true);
    setError("");
    try {
      const res = await fetch("/api/support");
      const data = (await res.json()) as { tickets?: SupportTicket[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load tickets.");
      setTickets(data.tickets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tickets.");
    } finally {
      setListLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (defaultOrderId) {
      setOrderId(defaultOrderId);
      setView("compose");
      const order = profile.orders.find((item) => item.id === defaultOrderId);
      if (order?.locationId) setLocationId(order.locationId);
    }
  }, [defaultOrderId, profile.orders]);

  const openTicket = async (id: string) => {
    setReply("");
    setReplyAttachments([]);
    setError("");
    setView("ticket");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/support?id=${encodeURIComponent(id)}`);
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

  const resetCompose = () => {
    setSubject("");
    setBody("");
    setOrderId(defaultOrderId ?? "");
    setAttachments([]);
    setCategory(defaultCategory);
  };

  const createTicket = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          body,
          orderId: orderId.trim() || null,
          locationId: locationId || null,
          attachments,
        }),
      });
      const data = (await res.json()) as { ticket?: SupportTicket; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create ticket.");
      resetCompose();
      setMsg(`Ticket ${data.ticket?.id} opened.`);
      await load();
      if (data.ticket) {
        setDetail(data.ticket);
        setView("ticket");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create ticket.");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail || (!reply.trim() && !replyAttachments.length)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          ticketId: detail.id,
          body: reply.trim(),
          attachments: replyAttachments,
        }),
      });
      const data = (await res.json()) as { ticket?: SupportTicket; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reply failed.");
      setDetail(data.ticket ?? null);
      setReply("");
      setReplyAttachments([]);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reply failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <p className="text-sm text-muted">
        <Link href="/login?next=/account?tab=support" className="text-gold hover:underline">
          Sign in
        </Link>{" "}
        to open a support ticket.
      </p>
    );
  }

  const orderOptions = [
    { value: "", label: "No related order" },
    ...profile.orders.slice(0, 20).map((order) => ({
      value: order.id,
      label: `${order.id} · ${order.date} · ${formatPrice(order.total)}`,
    })),
  ];

  const inbox = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Inbox</p>
          <p className="mt-1 text-sm text-muted">
            {tickets.length
              ? `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} · grouped by status`
              : "No tickets yet"}
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => { setView("compose"); setError(""); setMsg(""); }}>
          <Plus size={14} />
          New ticket
        </Button>
      </div>

      {listLoading && !tickets.length ? (
        <p className="text-sm text-muted">Loading tickets…</p>
      ) : null}

      {!listLoading && !tickets.length ? (
        <div className="rounded-sm border border-dashed border-white/10 px-3 py-10 text-center">
          <Headphones className="mx-auto mb-2 text-gold" size={20} aria-hidden />
          <p className="text-sm text-cream">No support history yet</p>
          <p className="mt-1 text-xs text-muted">Open a ticket for orders, delivery, refunds, or account help.</p>
          <Button type="button" size="sm" className="mt-4" onClick={() => setView("compose")}>
            Start a ticket
          </Button>
        </div>
      ) : null}

      {grouped.map((group) => (
        <section key={group.status}>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-gold">
                {SUPPORT_STATUS_LABELS[group.status]}
              </p>
              <p className="mt-0.5 text-xs text-muted">{group.hint}</p>
            </div>
            <span className="text-xs tabular-nums text-muted">{group.tickets.length}</span>
          </div>
          <ul className="space-y-2">
            {group.tickets.map((ticket) => {
              const store = ticket.locationId ? getLocationById(ticket.locationId) : null;
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => void openTicket(ticket.id)}
                    className="flex min-h-11 w-full items-start justify-between gap-3 rounded-sm border border-white/10 bg-black/20 px-3 py-3 text-left transition hover:border-white/20"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-cream">{ticket.subject}</p>
                      <p className="mt-1 text-xs text-muted">
                        {ticket.id}
                        {" · "}
                        {SUPPORT_CATEGORY_LABELS[ticket.category]}
                        {store ? ` · ${store.shortName}` : ""}
                        {ticket.orderId ? ` · ${ticket.orderId}` : ""}
                      </p>
                      {ticket.lastMessagePreview ? (
                        <p className="mt-1 truncate text-xs text-muted">{ticket.lastMessagePreview}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StatusBadge status={ticket.status} />
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-gold">
                        Open
                        <ChevronRight size={12} />
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  const compose = (
    <form onSubmit={(e) => void createTicket(e)} className="space-y-4">
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-2 text-sm text-muted hover:text-cream"
        onClick={() => { setView("inbox"); setError(""); }}
      >
        <ArrowLeft size={14} />
        Back to inbox
      </button>
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-gold">New ticket</p>
        <h3 className="mt-1 font-display text-xl text-cream">Tell us what happened</h3>
        <p className="mt-1 text-sm text-muted">
          Attach a receipt or photo if you have one. We’ll route this to the right team.
        </p>
      </div>
      <Select
        label="Category"
        value={category}
        onChange={(v) => setCategory(v as SupportCategory)}
        options={SUPPORT_CATEGORIES.map((c) => ({
          value: c.value,
          label: `${c.label} — ${c.description}`,
        }))}
      />
      <Select
        label="Store"
        value={locationId}
        onChange={setLocationId}
        options={stores.map((s) => ({ value: s.id, label: `${s.shortName} · ${s.city}` }))}
      />
      <Select
        label="Related order"
        value={orderId}
        onChange={setOrderId}
        options={orderOptions}
      />
      <label className="block text-xs text-muted">
        Subject
        <Input
          className="mt-1"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary"
          required
          minLength={3}
        />
      </label>
      <label className="block text-xs text-muted">
        Details
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What went wrong, when, and what you need…"
          required
          minLength={8}
          rows={5}
          className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-cream outline-none focus:border-(--gold)/40"
        />
      </label>
      <SupportAttachmentField value={attachments} onChange={setAttachments} disabled={busy} />
      <p className="text-xs text-muted">
        Routes to <span className="text-gold">{SUPPORT_ROUTE_LABELS[previewRoute.scope]}</span>
        {previewRoute.locationId
          ? ` · ${stores.find((s) => s.id === previewRoute.locationId)?.shortName ?? previewRoute.locationId}`
          : ""}
        . {previewRoute.reason}
      </p>
      <Button type="submit" size="sm" loading={busy}>
        Submit ticket
      </Button>
    </form>
  );

  const ticketView = (
    <div className="space-y-5">
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-2 text-sm text-muted hover:text-cream"
        onClick={() => { setView("inbox"); setDetail(null); }}
      >
        <ArrowLeft size={14} />
        Back to inbox
      </button>

      {detailLoading ? (
        <p className="text-sm text-muted">Loading conversation…</p>
      ) : !detail ? (
        <p className="text-sm text-muted">Ticket not found.</p>
      ) : (
        <>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-gold">
              Support · {detail.id}
            </p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-display text-2xl text-cream">{detail.subject}</h3>
              <StatusBadge status={detail.status} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Category</dt>
                <dd className="mt-1 text-cream">{SUPPORT_CATEGORY_LABELS[detail.category]}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Routed to</dt>
                <dd className="mt-1 text-cream">{SUPPORT_ROUTE_LABELS[detail.routeScope]}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Store</dt>
                <dd className="mt-1 text-cream">
                  {detail.locationId
                    ? (getLocationById(detail.locationId)?.name ?? detail.locationId)
                    : "Not store-specific"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Order</dt>
                <dd className="mt-1 text-cream">
                  {detail.orderId ? (
                    <Link
                      href={`/account?tab=orders&order=${encodeURIComponent(detail.orderId)}`}
                      className="text-gold hover:underline"
                    >
                      {detail.orderId}
                    </Link>
                  ) : (
                    "None"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Opened</dt>
                <dd className="mt-1 text-cream">{new Date(detail.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">Last update</dt>
                <dd className="mt-1 text-cream">{new Date(detail.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
            {detail.routeReason ? (
              <p className="mt-3 text-xs text-muted">{detail.routeReason}</p>
            ) : null}
          </div>

          <section className="border-t border-white/10 pt-4">
            <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-gold">Conversation</p>
            <SupportThread messages={detail.messages} />
          </section>

          {detail.status !== "closed" ? (
            <form onSubmit={(e) => void sendReply(e)} className="space-y-3 border-t border-white/10 pt-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gold">Reply</p>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Add a reply or attach another photo…"
                className="w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-cream outline-none focus:border-(--gold)/40"
              />
              <SupportAttachmentField
                value={replyAttachments}
                onChange={setReplyAttachments}
                disabled={busy}
              />
              <Button type="submit" size="sm" loading={busy}>
                Send reply
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted">This ticket is closed. Open a new one if you still need help.</p>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {msg && view !== "compose" ? <p className="text-sm text-gold">{msg}</p> : null}
      {view === "compose" ? compose : view === "ticket" ? ticketView : inbox}
    </div>
  );
}
