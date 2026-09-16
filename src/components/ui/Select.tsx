"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
};

type Props = {
  label?: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  /** Extra classes on the trigger button (e.g. fixed toolbar height). */
  triggerClassName?: string;
  id?: string;
};

export function Select({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  className,
  triggerClassName,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listId = id ?? autoId;
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <span
          className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-gold"
          id={`${listId}-label`}
        >
          {label}
        </span>
      ) : null}

      {/* Relative shell wraps only the control + menu so the panel aligns 1:1 with the trigger */}
      <div ref={rootRef} className="relative w-full min-w-0">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={label ? `${listId}-label` : undefined}
          aria-label={!label ? ariaLabel : undefined}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-sm border bg-white/5 px-3.5 text-left text-sm text-cream outline-none transition focus:border-(--gold)/50 focus:bg-white/[0.07]",
            open
              ? "border-(--gold)/50 bg-white/[0.07]"
              : "border-white/10 hover:border-white/20",
            triggerClassName,
          )}
        >
          <span className="min-w-0 truncate">{selected?.label}</span>
          <ChevronDown
            size={14}
            className={cn("shrink-0 text-muted transition", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={label ?? ariaLabel}
            className="absolute top-[calc(100%+0.25rem)] left-0 right-0 z-[90] m-0 max-h-64 list-none overflow-y-auto overscroll-contain rounded-sm border border-(--gold)/35 bg-(--bg-elevated) p-1 shadow-[0_16px_48px_rgba(0,0,0,0.65)]"
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={active} className="m-0 p-0">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2.5 text-left text-sm transition",
                      active
                        ? "bg-(--gold)/15 text-gold"
                        : "text-cream hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {active ? <Check size={14} className="shrink-0" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
