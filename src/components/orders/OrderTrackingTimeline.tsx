"use client";

import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildTrackingSteps,
  trackingEtaLabel,
  customerStatusLabel,
  withComputedEta,
} from "@/lib/commerce/order-tracking";
import type { Order } from "@/types";

type Props = {
  order: Order;
  compact?: boolean;
  className?: string;
};

export function OrderTrackingTimeline({ order, compact = false, className }: Props) {
  const enriched = withComputedEta(order);
  const steps = buildTrackingSteps(enriched);
  const eta = trackingEtaLabel(enriched);
  const currentLabel = customerStatusLabel(enriched);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-cream">
          Status · <span className="text-gold">{currentLabel}</span>
        </p>
        {enriched.tracking ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {enriched.tracking}
          </p>
        ) : null}
      </div>

      {eta ? (
        <p className="flex items-start gap-1.5 rounded-sm border border-white/8 bg-white/[0.03] px-2.5 py-2 text-xs text-muted">
          <Clock size={12} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          <span>
            {eta}
            {enriched.fulfillment === "delivery" ? (
              <span className="mt-0.5 block text-[10px] text-muted/80">
                Estimate based on store delivery zone — not live GPS.
              </span>
            ) : null}
          </span>
        </p>
      ) : null}

      {enriched.fulfillment === "delivery" && enriched.driver ? (
        <p className="text-xs text-muted">
          Driver · <span className="text-cream">{enriched.driver.name}</span>
          {enriched.driver.vehicle ? ` · ${enriched.driver.vehicle}` : ""}
        </p>
      ) : null}

      <ol className={cn("relative", compact ? "space-y-0" : "space-y-0")}>
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast ? (
                <span
                  className={cn(
                    "absolute left-[9px] top-5 h-[calc(100%-8px)] w-px",
                    step.done ? "bg-(--gold)/40" : "bg-white/10",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-1 mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border",
                  step.current
                    ? "border-(--gold) bg-(--gold)/20 text-gold ring-2 ring-(--gold)/20"
                    : step.done
                      ? "border-(--gold)/50 bg-(--gold)/15 text-gold"
                      : "border-white/15 bg-black/30 text-transparent",
                )}
                aria-hidden
              >
                {step.done ? <Check size={10} strokeWidth={3} /> : null}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={cn(
                    "text-sm leading-tight",
                    step.current
                      ? "font-medium text-gold"
                      : step.done
                        ? "text-cream"
                        : "text-muted",
                  )}
                >
                  {step.label}
                </p>
                {!compact && step.description ? (
                  <p
                    className={cn(
                      "mt-0.5 text-[11px] leading-snug",
                      step.current ? "text-muted" : "text-muted/70",
                    )}
                  >
                    {step.description}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
