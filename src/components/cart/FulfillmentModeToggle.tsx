"use client";

import { cn } from "@/lib/utils";

type Mode = "delivery" | "pickup";

export function FulfillmentModeToggle({
  pickupAvailable,
  deliveryAvailable,
  value,
  onChange,
  className,
}: {
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  value: Mode;
  onChange: (mode: Mode) => void;
  className?: string;
}) {
  const modes: Mode[] = [
    ...(deliveryAvailable ? (["delivery"] as const) : []),
    ...(pickupAvailable ? (["pickup"] as const) : []),
  ];

  if (modes.length === 0) {
    return (
      <p className={cn("text-sm text-amber-200/90", className)}>
        This store is not taking pickup or delivery online right now.
      </p>
    );
  }

  if (modes.length === 1) {
    const only = modes[0];
    return (
      <p className={cn("text-sm text-cream", className)}>
        {only === "pickup" ? "Pickup at this store" : "Delivery from this store"}
      </p>
    );
  }

  return (
    <div className={cn("inline-flex w-full rounded-sm border border-white/10 p-0.5 sm:w-auto", className)}>
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "min-h-11 flex-1 rounded-sm px-4 py-2 text-sm capitalize touch-manipulation sm:flex-none",
            value === mode ? "bg-[var(--gold)]/20 text-cream" : "text-muted hover:text-cream",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
