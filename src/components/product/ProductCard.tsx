"use client";

import Link from "next/link";
import { SmartImage } from "@/components/ui/SmartImage";
import { Heart, View } from "lucide-react";
import { motion } from "framer-motion";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/utils";
import { useWishlistStore } from "@/store/wishlist";
import { useCartStore } from "@/store/cart";
import { addToCart } from "@/lib/add-to-cart";
import { switchShoppingStore } from "@/lib/switch-store";
import { useBranchStore } from "@/store/branch";
import { useLiveOnHand } from "@/hooks/useHydratedInventory";
import { getLocationById, getPriceForLocation } from "@/data/locations";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { OtherBranchStock } from "@/components/inventory/OtherBranchStock";
import { LocationStockStrip } from "@/components/inventory/LocationStockStrip";
import { cn } from "@/lib/utils";

export function ProductCard({
  product,
  index = 0,
  locationId,
}: {
  product: Product;
  index?: number;
  /** When set, stock and price follow this branch instead of the global selection. */
  locationId?: string;
}) {
  const toggle = useWishlistStore((s) => s.toggle);
  const wished = useWishlistStore((s) => s.ids.includes(product.id));
  const cartQty = useCartStore(
    (s) => s.items.find((i) => i.productId === product.id)?.quantity ?? 0,
  );
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = locationId ?? selectedBranch;
  const onHand = useLiveOnHand(branchId, product.id);
  const price = getPriceForLocation(branchId, product.id);
  const remaining = Math.max(0, onHand - cartQty);
  const outOfStock = onHand <= 0;
  const atCartMax = !outOfStock && remaining <= 0;
  const wantsMore = outOfStock || atCartMax;
  const branchName = getLocationById(branchId)?.shortName ?? "this store";
  const onSale = price < product.price;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05, duration: 0.5 }}
      className="group relative flex h-full flex-col"
    >
      <div className="relative mb-3 aspect-[3/4] shrink-0 overflow-hidden bg-gradient-to-b from-[#1a1610] to-[#0a0a0a] sm:mb-4">
        <Link
          href={`/products/${product.slug}`}
          className="absolute inset-0 z-[1]"
          aria-label={product.name}
        />
        <div
          className="absolute inset-0 opacity-40 transition duration-700 group-hover:opacity-70"
          style={{
            background: `radial-gradient(circle at 50% 30%, ${product.accentColor}55, transparent 60%)`,
          }}
        />
        <SmartImage
          src={product.images[0]}
          alt={product.name}
          fill
          className="object-contain p-3 transition duration-700 group-hover:scale-105 sm:p-6"
          sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
        />
        <div className="absolute left-1.5 top-1.5 flex max-w-[75%] flex-col gap-1 sm:left-3 sm:top-3">
          {product.isPremium && <Badge>Premium</Badge>}
          {onSale && <Badge className="border-emerald-500/40 text-emerald-300">Offer</Badge>}
          {outOfStock ? (
            <Badge className="border-red-400/40 text-red-300">Out of stock</Badge>
          ) : onHand <= LOW_STOCK_THRESHOLD ? (
            <Badge className="border-amber-400/40 text-amber-200">
              {onHand} left
            </Badge>
          ) : (
            <Badge className="hidden border-white/20 text-cream/80 sm:inline-flex">
              {onHand} in stock
            </Badge>
          )}
        </div>
        <div className="absolute right-1.5 top-1.5 z-[2] flex flex-col gap-1.5 opacity-100 transition sm:right-2 sm:top-2 sm:gap-2 md:right-3 md:top-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(product.id);
            }}
            className={cn(
              "rounded-sm bg-black/50 p-2.5 backdrop-blur touch-manipulation sm:p-2",
              wished ? "text-[var(--gold)]" : "text-white",
            )}
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart size={16} fill={wished ? "currentColor" : "none"} />
          </button>
          <Link
            href={`/ar/${product.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-sm bg-black/50 p-2.5 text-white backdrop-blur touch-manipulation sm:p-2"
            aria-label="View in AR"
          >
            <View size={16} />
          </Link>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
        <Link href={`/products/${product.slug}`} className="block flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
            {product.brand}
          </p>
          <h3 className="mt-1 line-clamp-2 min-h-[2.4rem] font-display text-[0.95rem] leading-snug text-[var(--cream)] transition group-hover:text-[var(--gold-bright)] sm:min-h-[2.75rem] sm:text-xl">
            {product.name}
          </h3>
          <p className="mt-1 hidden text-xs text-[var(--muted)] sm:block">
            {product.origin} · {product.abv}%{" "}
            <AbbrTooltip term="ABV" />
          </p>
          <div className="mt-1.5 flex items-baseline gap-2 sm:mt-2">
            <span className="text-sm text-[var(--gold)] sm:text-base">
              {formatPrice(price)}
            </span>
            {onSale && (
              <span className="text-xs text-[var(--muted)] line-through">
                {formatPrice(product.price)}
              </span>
            )}
          </div>
          {product.reviewCount > 0 ? (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              ★ {product.rating.toFixed(1)} · {product.reviewCount} review
              {product.reviewCount === 1 ? "" : "s"}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {onHand} at {branchName}
            {cartQty ? ` · ${cartQty} in cart` : ""}
          </p>
        </Link>

        {/* Full branch strip from tablet up — keeps 2-col mobile cards short */}
        <LocationStockStrip
          className="hidden sm:flex"
          productId={product.id}
          needed={Math.max(1, cartQty + 1)}
          compact
        />

        {wantsMore ? (
          <div className="shrink-0 space-y-2">
            <p className="text-[11px] text-red-300">
              {outOfStock
                ? `0 at ${branchName}`
                : `Only ${onHand} at ${branchName}`}
            </p>
            <OtherBranchStock
              productId={product.id}
              branchId={branchId}
              quantity={cartQty + 1}
              localStock={onHand}
              compact
              addOnSwitch={1}
            />
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="min-h-10 w-full shrink-0 touch-manipulation sm:min-h-0"
            onClick={() => {
              if (locationId && locationId !== selectedBranch) {
                switchShoppingStore(locationId);
              }
              addToCart(product.id);
            }}
          >
            Add to Cart
          </Button>
        )}
      </div>
    </motion.article>
  );
}
