"use client";

import { Star } from "lucide-react";
import { getLocationById } from "@/data/locations";
import { buildOrderCharges } from "@/lib/commerce/order-charges";
import { formatPrice } from "@/lib/utils";
import type { Order } from "@/types";

export function OrderChargeLines({ order }: { order: Order }) {
  const { lines } = buildOrderCharges(order, getLocationById(order.locationId));
  const moneyLines = lines.filter((line) => line.kind !== "total");
  const total = lines.find((line) => line.kind === "total");

  return (
    <div className="space-y-2.5 text-sm">
      {moneyLines.map((line) => (
        <div key={line.key} className="flex justify-between gap-3 text-muted">
          <span>{line.label}</span>
          <span
            className={
              line.kind === "credit" ? "tabular-nums text-gold" : "tabular-nums text-cream"
            }
          >
            {line.free ? "Free" : line.kind === "credit" ? `−${formatPrice(Math.abs(line.amount))}` : formatPrice(line.amount)}
          </span>
        </div>
      ))}
      {total ? (
        <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-3">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted">{total.label}</span>
          <span className="font-price text-3xl text-gold">
            {formatPrice(total.amount)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function OrderRewardsCard({ order }: { order: Order }) {
  const { rewards } = buildOrderCharges(order, getLocationById(order.locationId));
  if (!rewards.length) return null;

  return (
    <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gold">
        <Star size={12} />
        Rewards on this order
      </p>
      <ul className="mt-4 space-y-3">
        {rewards.map((fact) => (
          <li key={fact.key}>
            <p className="text-sm text-cream">{fact.label}</p>
            <p className="mt-0.5 text-xs text-muted">{fact.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
