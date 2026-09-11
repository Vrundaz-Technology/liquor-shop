"use client";

import { getAllLocations } from "@/data/locations";
import { getCategories } from "@/data/categories";
import { Select } from "@/components/ui/Select";
import {
  DELIVERY_TIME_OPTIONS,
  SIZE_OPTIONS,
  SORT_OPTIONS,
  type ShopFilters,
  type ShopSort,
} from "@/lib/shop-catalog";
import { cn } from "@/lib/utils";

type Props = {
  value: ShopFilters;
  onChange: (next: ShopFilters) => void;
  brands: string[];
  types: string[];
  className?: string;
  /** Show category filter (shop all page). */
  showCategory?: boolean;
  showStore?: boolean;
  /** True when ZIP/coords are set so delivery-time filter can apply. */
  hasDeliveryLocation?: boolean;
  onNeedDeliveryLocation?: () => void;
};

export function ShopFiltersPanel({
  value,
  onChange,
  brands,
  types,
  className,
  showCategory = true,
  showStore = true,
  hasDeliveryLocation = false,
  onNeedDeliveryLocation,
}: Props) {
  const patch = (partial: Partial<ShopFilters>) => onChange({ ...value, ...partial });
  const minPrice = value.minPrice ?? 0;
  const maxPrice = value.maxPrice ?? 5000;

  return (
    <div className={cn("space-y-4", className)}>
      {showCategory ? (
        <Select
          label="Category"
          value={value.category ?? "all"}
          onChange={(category) => patch({ category })}
          options={[
            { value: "all", label: "All categories" },
            ...getCategories().map((c) => ({ value: c.slug, label: c.name })),
          ]}
        />
      ) : null}

      <Select
        label="Brand"
        value={value.brand ?? "all"}
        onChange={(brand) => patch({ brand })}
        options={[
          { value: "all", label: "All brands" },
          ...brands.map((b) => ({ value: b, label: b })),
        ]}
      />

      <Select
        label="Type"
        value={value.type ?? "all"}
        onChange={(type) => patch({ type })}
        options={[
          { value: "all", label: "All types" },
          ...types.map((t) => ({ value: t, label: t })),
        ]}
      />

      <Select
        label="Size"
        value={value.size ?? "all"}
        onChange={(size) => patch({ size })}
        options={SIZE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />

      <div className="space-y-3">
        <p className="text-xs text-muted">Price</p>
        <label className="block text-xs text-muted">
          Min ${minPrice}
          <input
            type="range"
            min={0}
            max={Math.max(10, maxPrice - 5)}
            step={5}
            value={minPrice}
            onChange={(e) => {
              const next = Number(e.target.value);
              patch({ minPrice: Math.min(next, maxPrice) });
            }}
            className="mt-2 w-full accent-[var(--gold)]"
          />
        </label>
        <label className="block text-xs text-muted">
          Max ${maxPrice}
          <input
            type="range"
            min={Math.min(5000, minPrice + 5)}
            max={5000}
            step={5}
            value={maxPrice}
            onChange={(e) => {
              const next = Number(e.target.value);
              patch({ maxPrice: Math.max(next, minPrice) });
            }}
            className="mt-2 w-full accent-[var(--gold)]"
          />
        </label>
      </div>

      <label className="block text-xs text-muted">
        Rating {(value.minRating ?? 0).toFixed(1)}+
        <input
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={value.minRating ?? 0}
          onChange={(e) => patch({ minRating: Number(e.target.value) })}
          className="mt-2 w-full accent-[var(--gold)]"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-cream">
        <input
          type="checkbox"
          checked={Boolean(value.inStockOnly)}
          onChange={(e) => patch({ inStockOnly: e.target.checked })}
        />
        Available at selected store
      </label>

      {showStore ? (
        <Select
          label="Store"
          value={value.storeId ?? "current"}
          onChange={(storeId) =>
            patch({ storeId: storeId === "current" ? undefined : storeId })
          }
          options={[
            { value: "current", label: "Current store" },
            ...getAllLocations().map((l) => ({
              value: l.id,
              label: `${l.shortName} · ${l.city}`,
            })),
          ]}
        />
      ) : null}

      <div className="space-y-2">
        <Select
          label="Delivery time"
          value={String(value.maxDeliveryMinutes ?? 0)}
          onChange={(v) => {
            const minutes = Number(v) || 0;
            patch({ maxDeliveryMinutes: minutes });
            if (minutes > 0 && !hasDeliveryLocation) {
              onNeedDeliveryLocation?.();
            }
          }}
          options={DELIVERY_TIME_OPTIONS.map((o) => ({
            value: String(o.value),
            label: o.label,
          }))}
        />
        {(value.maxDeliveryMinutes ?? 0) > 0 && !hasDeliveryLocation ? (
          <p className="text-[11px] leading-snug text-amber-200/90">
            Set your ZIP to apply delivery-time estimates.{" "}
            {onNeedDeliveryLocation ? (
              <button
                type="button"
                className="underline decoration-amber-200/50 underline-offset-2 hover:text-amber-100"
                onClick={onNeedDeliveryLocation}
              >
                Find store by ZIP
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      <Select
        label="Sort by"
        value={value.sort ?? "popular"}
        onChange={(sort) => patch({ sort: sort as ShopSort })}
        options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />

      <button
        type="button"
        className="text-[11px] uppercase tracking-[0.14em] text-muted hover:text-gold"
        onClick={() =>
          onChange({
            q: "",
            category: showCategory ? "all" : value.category,
            brand: "all",
            type: "all",
            size: "all",
            minPrice: 0,
            maxPrice: 5000,
            minRating: 0,
            inStockOnly: true,
            storeId: undefined,
            maxDeliveryMinutes: 0,
            sort: "popular",
          })
        }
      >
        Clear filters
      </button>
    </div>
  );
}
