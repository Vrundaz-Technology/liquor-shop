"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActiveFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
  /** When set, shows a gold result count pill next to Active. */
  resultCount?: number;
  resultNoun?: string;
  className?: string;
};

/**
 * Shared “Active” filter summary: removable chips + Clear all.
 * Render only when filters are non-default (pass chips for active filters).
 */
export function ActiveFiltersBar({
  chips,
  onClearAll,
  resultCount,
  resultNoun = "result",
  className,
}: Props) {
  if (chips.length === 0) return null;

  const noun =
    resultCount === 1 ? resultNoun : resultNoun.endsWith("s") ? resultNoun : `${resultNoun}s`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-sm border border-white/[0.08] bg-white/[0.025] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4",
        className,
      )}
      role="status"
      aria-label="Active filters"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted">Active</span>
        {typeof resultCount === "number" ? (
          <span className="inline-flex items-center rounded-sm bg-(--gold)/12 px-2 py-1 text-xs tabular-nums text-gold">
            {resultCount} {noun}
          </span>
        ) : null}
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={chip.onRemove}
            className="group inline-flex max-w-[14rem] items-center gap-1.5 rounded-sm border border-white/10 bg-black/30 px-2 py-1 text-xs text-cream transition hover:border-white/20 hover:bg-white/[0.04]"
            aria-label={`Remove filter ${chip.label}`}
          >
            <span className="truncate">{chip.label}</span>
            <X
              size={12}
              className="shrink-0 text-muted transition group-hover:text-cream"
              aria-hidden
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-sm border border-(--gold)/35 bg-(--gold)/10 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-gold transition hover:border-(--gold)/55 hover:bg-(--gold)/16 sm:self-auto"
      >
        <X size={13} aria-hidden />
        Clear all
      </button>
    </div>
  );
}
