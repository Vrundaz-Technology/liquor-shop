"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export function useTableSort<K extends string>(
  initialKey: K,
  initialDir: SortDir = "asc",
  descFirst: K[] = [],
) {
  const [sortKey, setSortKey] = useState<K>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const toggleSort = (key: K) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(descFirst.includes(key) ? "desc" : "asc");
  };

  return { sortKey, sortDir, toggleSort };
}

export function compareValues(a: string | number, b: string | number, dir: SortDir) {
  const result =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

export const tableWrapClass = "overflow-x-auto border border-white/10";
export const tableHeadRowClass =
  "border-b border-(--gold)/30 bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-muted";
export const tableRowClass = "border-b border-white/5 last:border-0 hover:bg-white/[0.02]";
export const tableCellClass = "px-4 py-3.5 align-middle";

export function SortableTh<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  column: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th
      className={cn(
        "px-4 py-3 font-medium whitespace-nowrap",
        align === "right" && "text-right",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap uppercase tracking-[inherit] transition-colors",
          align === "right" && "ml-auto",
          active ? "text-gold" : "hover:text-cream",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp size={11} strokeWidth={2.25} className="shrink-0 text-gold" />
          ) : (
            <ArrowDown size={11} strokeWidth={2.25} className="shrink-0 text-gold" />
          )
        ) : (
          <ArrowUpDown size={11} strokeWidth={2} className="shrink-0 opacity-45" />
        )}
      </button>
    </th>
  );
}

export function MobileSortBar<K extends string>({
  columns,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  columns: { key: K; label: string }[];
  sortKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  className?: string;
}) {
  return (
    <div className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {columns.map((col) => {
        const active = sortKey === col.key;
        return (
          <button
            key={col.key}
            type="button"
            onClick={() => onSort(col.key)}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 border px-3 py-2 text-[11px] uppercase tracking-[0.14em] transition-colors",
              active
                ? "border-gold/40 bg-gold/10 text-cream"
                : "border-white/10 text-muted hover:text-cream",
            )}
          >
            {col.label}
            {active ? (
              sortDir === "asc" ? (
                <ArrowUp size={12} className="text-gold" />
              ) : (
                <ArrowDown size={12} className="text-gold" />
              )
            ) : (
              <ArrowUpDown size={12} className="opacity-40" />
            )}
          </button>
        );
      })}
    </div>
  );
}
