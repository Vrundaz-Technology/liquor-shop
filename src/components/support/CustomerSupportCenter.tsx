"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Headphones } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, routeSupportTicket } from "@/lib/support/routing";
import { getAllLocations } from "@/data/locations";
import { useBranchStore } from "@/store/branch";
import { useUserStore } from "@/store/user";
import { cn } from "@/lib/utils";
import type { SupportCategory, SupportTicket } from "@/types";

const DEFAULT_ORG = "org-sams-discount-liquor";

type Props = {
  /** Prefill from account order actions */
  defaultOrderId?: string;
  defaultCategory?: SupportCategory;
  compact?: boolean;
};

export function CustomerSupportCenter({
  defaultOrderId,
  defaultCategory = "order_issue",
  compact = false,
}: Props) {
  const { isLoggedIn, profile } = useUserStore();
  const branchId = useBranchStore((s) => s.branchId);
  const stores = getAllLocations();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [category, setCategory] = useState<SupportCategory>(defaultCategory);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [orderId, setOrderId] = useState(defaultOrderId ?? "");
  const [locationId, setLocationId] = useState(branchId);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [reply, setReply] = useState("");
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const previewRoute = useMemo(
    () =>
      routeSupportTicket({
        category,
        organizationId: profile.organizationId || DEFAULT_ORG,
        orderLocationId: null,
        preferredLocationId: profile.preferredBranchId || branchId,
        selectedLocationId: locationId,
      }),
    [category, profile.organizationId, profile.preferredBranchId, branchId, locationId],
  );

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
    if (defaultOrderId) setOrderId(defaultOrderId);
  }, [defaultOrderId]);

  const openTicket = async (id: string) => {
    setSelectedId(id);
    setReply("");
    setError("");
    setDetailLoading(true);
    setMobileShowDetail(true);
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
        }),
      });
      const data = (await res.json()) as { ticket?: SupportTicket; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create ticket.");
      setMsg(`Ticket ${data.ticket?.id} opened · routed to ${data.ticket?.routeScope}.`);
      setSubject("");
      setBody("");
      setOrderId("");
      await load();
      if (data.ticket) {
        setSelectedId(data.ticket.id);
        setDetail(data.ticket);
        setMobileShowDetail(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create ticket.");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!detail || !reply.trim()) return;
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
        }),
      });
      const data = (await res.json()) as { ticket?: SupportTicket; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Reply failed.");
      setDetail(data.ticket ?? null);
      setReply("");
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
        <Link href="/login?next=/support" className="text-gold hover:underline">
          Sign in
        </Link>{" "}
        to open a support ticket.
      </p>
    );
  }

  const ticketList = (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-gold">Your tickets</p>
      {listLoading && !tickets.length ? (
        <p className="text-sm text-muted">Loading tickets…</p>
      ) : null}
      <ul className="space-y-2">
        {tickets.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => void openTicket(t.id)}
              className={cn(
                "min-h-11 w-full rounded-sm border px-3 py-3 text-left touch-manipulation",
                selectedId === t.id
                  ? "border-(--gold)/40 bg-(--gold)/10"
                  : "border-white/10 bg-black/20",
              )}
            >
              <p className="text-sm text-cream">{t.subject}</p>
              <p className="mt-1 text-xs text-muted">
                {t.id} · {SUPPORT_CATEGORY_LABELS[t.category]} · {t.status} · {t.routeScope}
              </p>
            </button>
          </li>
        ))}
        {!listLoading && !tickets.length ? (
          <div className="rounded-sm border border-dashed border-white/10 px-3 py-8 text-center">
            <Headphones className="mx-auto mb-2 text-gold" size={20} aria-hidden />
            <p className="text-sm text-muted">No tickets yet. Open one above when you need help.</p>
          </div>
        ) : null}
      </ul>
    </div>
  );

  const ticketDetail = (
    <div className="rounded-sm border border-white/10 bg-black/20 p-4">
      {detailLoading ? (
        <p className="text-sm text-muted">Loading conversation…</p>
      ) : !detail ? (
        <div className="flex min-h-40 flex-col items-center justify-center text-center text-sm text-muted">
          <Headphones className="mb-3 text-gold" size={22} aria-hidden />
          Select a ticket to view the conversation.
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-gold lg:hidden"
            onClick={() => setMobileShowDetail(false)}
          >
            <ArrowLeft size={14} aria-hidden />
            Back to tickets
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-gold">
              {detail.id} · {detail.routeScope}
            </p>
            <h3 className="mt-1 text-lg text-cream">{detail.subject}</h3>
            <p className="mt-1 text-xs text-muted">
              {SUPPORT_CATEGORY_LABELS[detail.category]} · {detail.status}
            </p>
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {(detail.messages ?? []).map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-sm border px-3 py-2 text-sm",
                  m.authorRole === "staff"
                    ? "border-(--gold)/25 bg-(--gold)/5"
                    : "border-white/10",
                )}
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted">
                  {m.authorName} · {m.authorRole}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-cream">{m.body}</p>
              </div>
            ))}
            {!(detail.messages ?? []).length ? (
              <p className="text-sm text-muted">No messages yet.</p>
            ) : null}
          </div>
          {detail.status !== "closed" ? (
            <form onSubmit={(e) => void sendReply(e)} className="space-y-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Add a reply…"
                className="w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-cream outline-none focus:border-(--gold)/40"
                required
              />
              <Button type="submit" size="sm" loading={busy}>
                Send reply
              </Button>
            </form>
          ) : (
            <p className="text-xs text-muted">This ticket is closed.</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("space-y-6", compact && "space-y-4")}>
      <form
        onSubmit={(e) => void createTicket(e)}
        className="space-y-3 rounded-sm border border-white/10 bg-black/20 p-4"
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-gold">New ticket</p>
        <Select
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as SupportCategory)}
          options={SUPPORT_CATEGORIES.map((c) => ({
            value: c.value,
            label: c.label,
          }))}
        />
        <Select
          label="Store (for routing)"
          value={locationId}
          onChange={setLocationId}
          options={stores.map((s) => ({ value: s.id, label: s.shortName }))}
        />
        <Input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Related order ID (optional)"
        />
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          required
          minLength={3}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe the issue…"
          required
          minLength={8}
          rows={4}
          className="w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-cream outline-none focus:border-(--gold)/40"
        />
        <p className="text-xs text-muted">
          Auto-routes to <span className="text-gold">{previewRoute.scope}</span>
          {previewRoute.locationId
            ? ` · ${stores.find((s) => s.id === previewRoute.locationId)?.shortName ?? previewRoute.locationId}`
            : ""}
          . {previewRoute.reason}
        </p>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {msg ? <p className="text-sm text-gold">{msg}</p> : null}
        <Button type="submit" size="sm" loading={busy}>
          Submit ticket
        </Button>
      </form>

      {/* Mobile: list OR detail */}
      <div className="lg:hidden">
        {mobileShowDetail ? ticketDetail : ticketList}
      </div>

      {/* Desktop: side-by-side */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-2">
        {ticketList}
        {ticketDetail}
      </div>
    </div>
  );
}
