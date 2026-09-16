"use client";

import { MapPin } from "lucide-react";
import { addToCart } from "@/lib/add-to-cart";
import { switchShoppingStore } from "@/lib/switch-store";
import { useInventoryStore } from "@/store/inventory";
import { otherLocationsForDemand } from "@/lib/cart-availability";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  branchId: string;
  /** Bottles the shopper wants */
  quantity?: number;
  /** On-hand at the current branch */
  localStock?: number;
  compact?: boolean;
  /** After switching branch, add this many to cart */
  addOnSwitch?: number;
  className?: string;
};

export function OtherBranchStock({
  productId,
  branchId,
  quantity = 1,
  localStock,
  compact = false,
  addOnSwitch,
  className,
}: Props) {
  const revision = useInventoryStore((s) => s.revision);
  const onHand =
    localStock ?? useInventoryStore.getState().getAvailable(branchId, productId);
  void revision;

  const needed = Math.max(1, quantity);
  const alts = otherLocationsForDemand(productId, branchId, needed);
  if (!alts.length) return null;

  const switchTo = (locationId: string) => {
    switchShoppingStore(locationId);
    if (addOnSwitch && addOnSwitch > 0) addToCart(productId, addOnSwitch);
  };

  const headline =
    onHand <= 0
      ? "Out of stock here"
      : `Only ${onHand} here · you need ${needed}`;

  if (compact) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <p className="flex items-start gap-1 text-[10px] leading-snug text-gold">
          <MapPin size={11} className="mt-0.5 shrink-0" />
          <span>
            {headline}. Try{" "}
            {alts.map((row, i) => (
              <span key={row.location.id}>
                {i > 0 ? " · " : ""}
                {row.location.shortName} ({row.stock}
                {row.canFulfill ? "" : " — short"})
              </span>
            ))}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {alts.map((row) => (
            <button
              key={row.location.id}
              type="button"
              onClick={() => switchTo(row.location.id)}
              className="min-h-9 border border-(--gold)/35 bg-(--gold)/8 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-gold touch-manipulation hover:border-(--gold)/60 hover:bg-(--gold)/15"
            >
              Shop {row.location.shortName}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border border-(--gold)/30 bg-(--gold)/8 p-3 sm:p-4",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-gold">
        <MapPin size={12} />
        {onHand <= 0 ? "In stock at another store" : "Need more than this store has"}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-cream">
        {onHand <= 0
          ? "This bottle is not on the shelf here."
          : `This store has ${onHand}, but you want ${needed}.`}{" "}
        {alts.map((row, i) => (
          <span key={row.location.id}>
            {i > 0 ? (i === alts.length - 1 ? " and " : ", ") : ""}
            <span className="text-gold-bright">
              {row.location.shortName} has {row.stock}
              {row.canFulfill ? "" : " (still short of your qty)"}
            </span>
          </span>
        ))}
        . Switch store to continue from there.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {alts.map((row) => (
          <button
            key={row.location.id}
            type="button"
            onClick={() => switchTo(row.location.id)}
            className="min-h-10 border border-(--gold)/40 bg-(--gold)/10 px-3 py-2 text-xs uppercase tracking-wider text-gold touch-manipulation hover:border-(--gold)/70 hover:bg-(--gold)/18"
          >
            Shop {row.location.shortName}
            {row.canFulfill && addOnSwitch ? " & add" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
