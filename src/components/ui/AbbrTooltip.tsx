"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/** Short labels shown in the UI → full form for hover tooltips. */
export const ABBR_FULL_NAMES = {
  ABV: "Alcohol By Volume",
  SKU: "Stock Keeping Unit",
  UPC: "Universal Product Code",
  Rsv: "Reserved",
  Avail: "Available",
  Qty: "Quantity",
  COGS: "Cost of Goods Sold",
  POS: "Point of Sale",
  USD: "United States Dollar",
  ml: "Milliliters",
} as const;

export type AbbrTerm = keyof typeof ABBR_FULL_NAMES;

type Props = {
  term: AbbrTerm;
  /** Overrides the visible short text (e.g. "SKUs"). */
  children?: ReactNode;
  suffix?: ReactNode;
  full?: string;
  className?: string;
  abbrClassName?: string;
};

/** Dotted-underline abbreviation; hover shows themed full-form tooltip. */
export function AbbrTooltip({
  term,
  children,
  suffix,
  full,
  className,
  abbrClassName,
}: Props) {
  const meaning = full ?? ABBR_FULL_NAMES[term];

  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <Tooltip content={meaning}>
        <abbr
          className={cn(
            "cursor-default no-underline underline decoration-dotted decoration-current/40 underline-offset-2",
            abbrClassName,
          )}
        >
          {children ?? term}
        </abbr>
      </Tooltip>
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}
