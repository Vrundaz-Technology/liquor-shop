"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OrderTrackingTimeline } from "@/components/orders/OrderTrackingTimeline";
import { formatPrice } from "@/lib/utils";
import type { Order } from "@/types";

type TrackResponse = {
  order: Order;
  statusLabel: string;
  etaLabel: string | null;
  store: { id: string; name: string; address: string } | null;
  error?: string;
};

export function TrackOrderForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TrackResponse | null>(null);

  const lookup = async (q: string) => {
    const value = q.trim();
    if (!value) {
      setError("Enter your tracking code (e.g. SDL-12345678) or order ID.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const looksLikeOrder = value.toUpperCase().startsWith("ORD-");
      const params = new URLSearchParams(
        looksLikeOrder ? { orderId: value } : { code: value },
      );
      const res = await fetch(`/api/orders/track?${params}`);
      const data = (await res.json()) as TrackResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Order not found.");
        return;
      }
      setResult(data);
    } catch {
      setError("Could not load tracking right now.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const preset = searchParams.get("code") ?? searchParams.get("orderId");
    if (preset) {
      setCode(preset);
      void lookup(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for query preset
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void lookup(code);
  };

  return (
    <div className="mx-auto max-w-2xl px-3 py-10 sm:px-4 sm:py-14 md:px-8">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Delivery</p>
      <h1 className="mt-2 font-display text-3xl text-cream sm:text-4xl">Track your order</h1>
      <p className="mt-2 text-sm text-muted">
        Follow confirmed → preparing → ready → driver → delivered. Enter the tracking code from
        your confirmation.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="SDL-######## or ORD-…"
          className="flex-1"
          aria-label="Tracking code"
        />
        <Button type="submit" loading={busy} className="sm:w-auto">
          <PackageSearch size={16} />
          Track
        </Button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {result ? (
        <div className="mt-8 space-y-5 rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-cream">{result.order.id}</p>
              <p className="mt-1 text-xs text-muted">
                {result.order.date}
                {result.store ? ` · ${result.store.name}` : ""}
                {" · "}
                {formatPrice(result.order.total)}
              </p>
            </div>
            <Link href="/account?tab=orders" className="text-xs text-gold hover:underline">
              Open in account
            </Link>
          </div>
          <OrderTrackingTimeline order={result.order} />
          {result.order.fulfillment === "delivery" && result.order.delivery ? (
            <p className="text-xs leading-relaxed text-muted">
              Delivering to {result.order.delivery.line1}, {result.order.delivery.city}{" "}
              {result.order.delivery.zip}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={<div className="px-4 py-24 text-center text-sm text-muted">Loading…</div>}>
      <TrackOrderForm />
    </Suspense>
  );
}
