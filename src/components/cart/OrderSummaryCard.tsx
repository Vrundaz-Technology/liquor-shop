"use client";

import type { ReactNode } from "react";
import { Clock, MapPin, Store, Truck } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import type { StoreLocation } from "@/types";

export type OrderSummaryLine = {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
};

type Props = {
  store: StoreLocation;
  fulfillment: "delivery" | "pickup";
  lines: OrderSummaryLine[];
  etaLabel?: string | null;
  addressSummary?: string | null;
  paymentSummary?: string | null;
  footer?: ReactNode;
  className?: string;
};

export function OrderSummaryCard({
  store,
  fulfillment,
  lines,
  etaLabel,
  addressSummary,
  paymentSummary,
  footer,
  className,
}: Props) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Store</p>
        <p className="mt-1.5 flex items-start gap-2 text-sm text-cream">
          <Store size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          <span>
            <span className="font-medium">{store.shortName}</span>
            <span className="mt-0.5 block text-xs text-muted">
              {store.address}, {store.city}
            </span>
          </span>
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          {fulfillment === "delivery" ? (
            <Truck size={12} className="text-gold" aria-hidden />
          ) : (
            <MapPin size={12} className="text-gold" aria-hidden />
          )}
          {fulfillment === "delivery" ? "Delivery" : "Pickup"}
          {etaLabel ? (
            <>
              <span aria-hidden>·</span>
              <Clock size={12} aria-hidden />
              {etaLabel}
            </>
          ) : null}
        </p>
        {addressSummary ? (
          <p className="mt-2 text-xs leading-relaxed text-muted">{addressSummary}</p>
        ) : null}
        {paymentSummary ? (
          <p className="mt-2 text-xs text-muted">Payment · {paymentSummary}</p>
        ) : null}
      </div>

      <dl className="space-y-2 text-sm">
        {lines.map((line) => (
          <div
            key={line.label}
            className={cn(
              "flex justify-between gap-3",
              line.emphasis && "border-t border-white/10 pt-3 text-base",
            )}
          >
            <dt className={line.emphasis ? "text-cream" : "text-muted"}>{line.label}</dt>
            <dd
              className={cn(
                "tabular-nums",
                line.emphasis ? "text-gold" : line.muted ? "text-muted" : "text-cream",
              )}
            >
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
      {footer}
    </div>
  );
}

export function moneyLine(amount: number, empty = "$0.00") {
  if (amount === 0) return empty === "Free" ? "Free" : formatPrice(0);
  return formatPrice(amount);
}
