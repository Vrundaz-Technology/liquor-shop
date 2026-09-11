"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, AlertTriangle, PackageMinus, ArrowRightLeft } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { addToCart } from "@/lib/add-to-cart";
import { useBranchStore } from "@/store/branch";
import { switchShoppingStore } from "@/lib/switch-store";
import {
  analyzeCartAvailability,
  locationsWithProduct,
  suggestAlternatives,
} from "@/lib/cart-availability";
import { getPriceForLocation } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useInventoryStore } from "@/store/inventory";

type Props = {
  /** Compact layout for checkout sidebar */
  compact?: boolean;
};

export function BranchAvailabilityPanel({ compact = false }: Props) {
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const branchId = useBranchStore((s) => s.branchId);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  void inventoryRevision;

  if (!items.length) return null;

  const analysis = analyzeCartAvailability(items, branchId);
  if (!analysis.hasConflicts) {
    return (
      <div
        className={`border border-(--gold)/25 bg-(--gold)/5 ${
          compact ? "p-4" : "p-5"
        }`}
      >
        <p className="text-[10px] uppercase tracking-[0.22em] text-gold">
          Branch stock
        </p>
        <p className="mt-2 text-sm text-cream">
          All {analysis.lines.length} bottle
          {analysis.lines.length === 1 ? "" : "s"} in your cart are available at{" "}
          <span className="text-gold-bright">{analysis.branch.shortName}</span>.
        </p>
      </div>
    );
  }

  const suggestions = suggestAlternatives(
    branchId,
    items.map((i) => i.productId),
    analysis.unavailable,
    compact ? 3 : 4,
  );

  const removeUnavailable = () => {
    analysis.unavailable.forEach((u) => removeItem(u.productId));
  };

  const best = analysis.fullCoverageLocation ?? analysis.betterLocations[0]?.location;

  return (
    <div
      className={`border border-(--danger)/40 bg-[#1a1010] ${
        compact ? "space-y-4 p-4" : "space-y-5 p-5 md:p-6"
      }`}
    >
      <div className="flex gap-3">
        <AlertTriangle
          className="mt-0.5 shrink-0 text-(--danger)"
          size={18}
        />
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-(--danger)">
            Stock conflict · {analysis.branch.shortName}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-cream">
            {analysis.unavailable.length} bottle
            {analysis.unavailable.length === 1 ? "" : "s"} in your cart{" "}
            {analysis.unavailable.length === 1 ? "is" : "are"} not available at this
            store. One order can only ship from one store — switch branch, remove
            unavailable bottles, or choose a store that can fulfill everything.
          </p>
          {!analysis.fullCoverageLocation &&
          !analysis.betterLocations.some((c) => c.coversAll) ? (
            <p className="mt-2 text-xs text-(--danger)">
              No single store can fulfill this entire mix. Remove conflicting items
              before checkout.
            </p>
          ) : null}
        </div>
      </div>

      <ul className="space-y-3">
        {analysis.unavailable.map((line) => {
          const alts = locationsWithProduct(
            line.productId,
            line.quantity,
            branchId,
          );
          return (
            <li
              key={line.productId}
              className="flex gap-3 border border-white/10 bg-black/30 p-3"
            >
              <div className="relative h-16 w-12 shrink-0 bg-white/5">
                <Image
                  src={line.product.images[0]}
                  alt={line.product.name}
                  fill
                  className="object-contain p-0.5"
                  sizes="48px"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base text-cream">
                  {line.product.name}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Need {line.quantity} ·{" "}
                  {line.stock === 0
                    ? "Out of stock here"
                    : `Only ${line.stock} left here`}
                </p>
                {alts.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gold">
                    <MapPin size={12} className="shrink-0" />
                    Order from{" "}
                    {alts.map((loc, i) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => switchShoppingStore(loc.id)}
                        className="underline decoration-(--gold)/40 underline-offset-2 hover:text-gold-bright"
                      >
                        {loc.shortName}
                        {i < alts.length - 1 ? "," : ""}
                      </button>
                    ))}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeItem(line.productId)}
                className="shrink-0 self-start text-[10px] uppercase tracking-wider text-muted hover:text-red-300"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>

      <div className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {best && (
          <Button
            type="button"
            className="w-full"
            size={compact ? "sm" : "md"}
            onClick={() => switchShoppingStore(best.id)}
          >
            <ArrowRightLeft size={14} />
            Switch to {best.shortName}
            <span className="hidden sm:inline">
              {analysis.fullCoverageLocation ? " · all in stock" : ""}
            </span>
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          className="w-full whitespace-normal text-left"
          size={compact ? "sm" : "md"}
          onClick={removeUnavailable}
        >
          <PackageMinus size={14} />
          <span className="sm:hidden">Remove unavailable</span>
          <span className="hidden sm:inline">
            Remove unavailable · checkout at {analysis.branch.shortName}
          </span>
        </Button>
      </div>

      {analysis.available.length > 0 && (
        <p className="text-xs text-muted">
          {analysis.available.length} item
          {analysis.available.length === 1 ? "" : "s"} still available at{" "}
          {analysis.branch.shortName} if you remove the rest.
        </p>
      )}

      {suggestions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold">
            Suggestions at {analysis.branch.shortName}
          </p>
          <p className="mt-1 text-xs text-muted">
            In-stock alternatives — add one and keep shopping this store.
          </p>
          <ul className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
            {suggestions.map((p) => {
              const price = getPriceForLocation(branchId, p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border border-white/10 bg-black/20 p-2.5"
                >
                  <div className="relative h-12 w-9 shrink-0 bg-white/5">
                    <Image
                      src={p.images[0]}
                      alt={p.name}
                      fill
                      className="object-contain p-0.5"
                      sizes="36px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${p.slug}`}
                      className="block truncate text-sm text-cream hover:text-gold"
                    >
                      {p.name}
                    </Link>
                    <p className="text-xs text-gold">{formatPrice(price)}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addToCart(p.id, 1)}
                  >
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
