"use client";

import { MapPin } from "lucide-react";
import type { StoreLocation } from "@/types";
import { NativeSelect } from "@/components/ui/NativeSelect";

export type LocationFilter = "all" | string;

type Option = {
  id: LocationFilter;
  label: string;
  sub: string;
};

type Props = {
  value: LocationFilter;
  onChange: (id: LocationFilter) => void;
  locations: StoreLocation[];
  allowAll: boolean;
  /** Per-location subtitle counts; falls back to empty. */
  counts?: Record<string, number>;
  label?: string;
  countNoun?: string;
};

export function LocationScopeBar({
  value,
  onChange,
  locations,
  allowAll,
  counts = {},
  label = "Store scope",
  countNoun = "orders",
}: Props) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const options: Option[] = [
    ...(allowAll
      ? [
          {
            id: "all" as const,
            label: "All locations",
            sub: counts && Object.keys(counts).length ? `${total} ${countNoun}` : "Every store",
          },
        ]
      : []),
    ...locations.map((l) => ({
      id: l.id,
      label: l.shortName,
      sub:
        counts[l.id] != null
          ? `${counts[l.id]} ${countNoun}`
          : l.city || "Store",
    })),
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-gold">
        <MapPin className="h-3.5 w-3.5" />
        {label}
      </div>

      <label className="relative block lg:hidden">
        <span className="sr-only">Choose location scope</span>
        <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-gold">
          <MapPin className="h-4 w-4" />
        </div>
        <NativeSelect
          value={value}
          onChange={(e) => onChange(e.target.value as LocationFilter)}
          className="border-(--gold)/40 py-3.5 pl-10 hover:border-(--gold)/40 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label} · {opt.sub}
            </option>
          ))}
        </NativeSelect>
      </label>

      <div className="hidden gap-2 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`min-h-[4.25rem] rounded-sm border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-(--gold)/55 bg-(--gold)/12 text-cream shadow-[inset_0_0_0_1px_rgba(197,163,104,0.12)]"
                  : "border-white/10 bg-white/[0.02] text-muted hover:border-white/20 hover:bg-white/[0.03] hover:text-cream"
              }`}
            >
              <span className="block text-sm font-medium tracking-wide">{opt.label}</span>
              <span className="mt-0.5 block text-[11px] opacity-70">{opt.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
