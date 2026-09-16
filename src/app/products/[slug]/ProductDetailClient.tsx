"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { SmartImage } from "@/components/ui/SmartImage";
import Link from "next/link";
import { getProductBySlug, getSimilarProducts } from "@/data/products";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { addToCart } from "@/lib/add-to-cart";
import { useWishlistStore } from "@/store/wishlist";
import { useUserStore } from "@/store/user";
import { useBranchStore } from "@/store/branch";
import { useInventoryStore } from "@/store/inventory";
import { useLiveOnHand } from "@/hooks/useHydratedInventory";
import { getLocationById, getPriceForLocation } from "@/data/locations";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import { maxStockAnywhere } from "@/lib/cart-availability";
import { Button } from "@/components/ui/Button";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { Badge } from "@/components/ui/Badge";
import { ProductCard } from "@/components/product/ProductCard";
import { OtherBranchStock } from "@/components/inventory/OtherBranchStock";
import { LocationStockStrip } from "@/components/inventory/LocationStockStrip";
import { ProductAlertButtons } from "@/components/product/ProductAlertButtons";
import { ReviewForm, ReviewList } from "@/components/reviews/ReviewForm";
import type { PlatformReview } from "@/types";
import { useCatalogStore } from "@/store/catalog";
import { Heart, Star, View } from "lucide-react";
import dynamic from "next/dynamic";

const BottleViewer3D = dynamic(
  () => import("@/components/store/BottleViewer3D").then((m) => m.BottleViewer3D),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-gold">Loading 3D…</div> },
);

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const catalogRevision = useCatalogStore((s) => s.revision);
  const product = getProductBySlug(slug);
  void catalogRevision;
  const [tab, setTab] = useState<"story" | "tech" | "cocktails" | "reviews">("story");
  const [activeImage, setActiveImage] = useState(0);
  const [mediaMode, setMediaMode] = useState<"photo" | "3d">("photo");
  const cartQty = useCartStore((s) =>
    product ? (s.items.find((i) => i.productId === product.id)?.quantity ?? 0) : 0,
  );
  const toggleWish = useWishlistStore((s) => s.toggle);
  const wished = useWishlistStore((s) => (product ? s.ids.includes(product.id) : false));
  const addViewed = useUserStore((s) => s.addViewed);
  const branchId = useBranchStore((s) => s.branchId);
  const onHand = useLiveOnHand(branchId, product?.id ?? "");
  const hiddenHere = useInventoryStore((s) =>
    product ? s.isHidden(branchId, product.id) : false,
  );
  const [qty, setQty] = useState(1);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  const [reviews, setReviews] = useState<PlatformReview[]>([]);

  useEffect(() => {
    if (product) addViewed(product.id);
  }, [product, addViewed]);

  useEffect(() => {
    if (!product) return;
    const cap = Math.max(1, maxStockAnywhere(product.id));
    setQty((n) => Math.min(Math.max(1, n), cap));
  }, [onHand, cartQty, product, inventoryRevision]);

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    void fetch(`/api/reviews?productId=${encodeURIComponent(product.id)}`)
      .then((r) => r.json())
      .then((data: { reviews?: PlatformReview[] }) => {
        if (!cancelled) setReviews(data.reviews ?? []);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

  if (!product) {
    notFound();
  }

  const price = getPriceForLocation(branchId, product.id);
  const remaining = hiddenHere ? 0 : Math.max(0, onHand - cartQty);
  const outOfStock = hiddenHere || onHand <= 0;
  const atCartMax = !outOfStock && remaining <= 0;
  const maxAnywhere = Math.max(1, maxStockAnywhere(product.id));
  const wantsMore = qty > remaining || outOfStock || atCartMax;
  const addQty = Math.min(qty, remaining || qty);
  const branchName = getLocationById(branchId)?.shortName ?? "this store";
  const similar = getSimilarProducts(product).filter(
    (item) => !useInventoryStore.getState().isHidden(branchId, item.id),
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-12 md:px-8">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMediaMode("3d")}
              className={`min-h-10 rounded-sm border px-3 py-2 text-xs touch-manipulation ${
                mediaMode === "3d"
                  ? "border-(--gold)/40 text-gold"
                  : "border-white/10 text-muted"
              }`}
            >
              3D Bottle
            </button>
            <button
              type="button"
              onClick={() => setMediaMode("photo")}
              className={`min-h-10 rounded-sm border px-3 py-2 text-xs touch-manipulation ${
                mediaMode === "photo"
                  ? "border-(--gold)/40 text-gold"
                  : "border-white/10 text-muted"
              }`}
            >
              Photo
            </button>
            <Link
              href={`/ar/${product.slug}`}
              className="inline-flex min-h-10 items-center rounded-sm border border-white/10 px-3 py-2 text-xs text-muted hover:border-gold hover:text-gold"
            >
              View in AR
            </Link>
          </div>
          <div className="relative aspect-4/5 overflow-hidden border border-white/5 bg-linear-to-b from-[#1a1610] to-[#0a0908]">
            {mediaMode === "3d" ? (
              <BottleViewer3D product={product} className="h-full min-h-70 w-full md:min-h-105" />
            ) : (
              <>
                <div
                  className="absolute inset-0 opacity-35"
                  style={{
                    background: `radial-gradient(circle at 50% 35%, ${product.accentColor}66, transparent 55%)`,
                  }}
                />
                <SmartImage
                  src={product.images[activeImage] ?? product.images[0]}
                  alt={product.name}
                  fill
                  className="object-contain p-8"
                  sizes="(max-width:1024px) 100vw, 50vw"
                  priority
                />
              </>
            )}
          </div>
          {mediaMode === "photo" && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {product.images.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`relative aspect-3/4 bg-white/5 ${
                    activeImage === i ? "ring-1 ring-gold" : ""
                  }`}
                >
                  <SmartImage src={img} alt="" fill className="object-cover" sizes="120px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            {product.isPremium && <Badge>Premium</Badge>}
            {product.isImported && <Badge>Imported</Badge>}
            <Badge
              className={
                hiddenHere || outOfStock
                  ? "border-red-400/40 text-red-300"
                  : onHand <= LOW_STOCK_THRESHOLD
                    ? "border-amber-400/40 text-amber-200"
                    : "border-white/20 text-muted"
              }
            >
              {hiddenHere
                ? `Hidden at ${branchName}`
                : outOfStock
                  ? `0 at ${branchName}`
                  : `${onHand} at ${branchName}${cartQty ? ` · ${cartQty} in cart` : ""}`}
            </Badge>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted">
              Stock at every store
            </p>
            <LocationStockStrip productId={product.id} needed={qty} />
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.24em] text-gold">
            {product.brand}
          </p>
          <h1 className="mt-2 font-display text-3xl text-cream wrap-break-word sm:text-4xl md:text-5xl">
            {product.name}
          </h1>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Star size={14} className="fill-gold text-gold" />
            {product.rating} · {product.reviewCount} reviews
          </div>
          <p className="mt-4 text-3xl text-gold">{formatPrice(price)}</p>
          <p className="mt-4 leading-relaxed text-muted">{product.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Origin</dt>
              <dd className="text-cream">{product.origin}</dd>
            </div>
            <div>
              <dt className="text-muted">Alcohol</dt>
              <dd className="text-cream">
                {product.abv}% <AbbrTooltip term="ABV" />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Volume</dt>
              <dd className="text-cream">{product.volumeMl}ml</dd>
            </div>
            <div>
              <dt className="text-muted">Category</dt>
              <dd className="capitalize text-cream">{product.category}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {product.tastingNotes.map((n) => (
              <span key={n} className="border border-white/10 px-2 py-1 text-xs">
                {n}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex w-fit items-center border border-white/10">
              <button
                type="button"
                className="min-h-10 px-4 py-2 text-muted touch-manipulation disabled:opacity-30"
                disabled={qty <= 1}
                onClick={() => setQty((n) => Math.max(1, n - 1))}
              >
                −
              </button>
              <span className="min-w-8 px-2 text-center text-sm tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                className="min-h-10 px-4 py-2 text-muted touch-manipulation disabled:opacity-30"
                disabled={qty >= maxAnywhere}
                onClick={() => setQty((n) => Math.min(maxAnywhere, n + 1))}
              >
                +
              </button>
            </div>
            <p className="text-xs text-muted">
              {hiddenHere
                ? `Not listed on the website for ${branchName}. Switch store or ask staff to show it.`
                : outOfStock
                  ? `None left at ${branchName}`
                  : qty > remaining
                    ? `Only ${remaining} more here · other stores may have the rest`
                    : `Up to ${remaining} more at ${branchName}`}
            </p>
          </div>
          {wantsMore ? (
            <OtherBranchStock
              className="mt-4"
              productId={product.id}
              branchId={branchId}
              quantity={qty}
              localStock={onHand}
              addOnSwitch={qty}
            />
          ) : null}
          <div className="mt-6 grid grid-cols-1 gap-2 sm:mt-8 sm:flex sm:flex-wrap sm:gap-3">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={outOfStock || atCartMax}
              onClick={() => addToCart(product.id, addQty)}
            >
              {hiddenHere
                ? "Not listed here"
                : outOfStock
                  ? "Out of stock here"
                  : atCartMax
                    ? "Max at this store"
                    : qty > remaining
                      ? `Add ${remaining} here`
                      : "Add to Cart"}
            </Button>
            <Link
              href={outOfStock && cartQty === 0 ? "#" : "/checkout"}
              className="w-full sm:w-auto"
            >
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                disabled={outOfStock && cartQty === 0}
                onClick={() => {
                  if (remaining > 0) addToCart(product.id, addQty);
                }}
              >
                Buy Now
              </Button>
            </Link>
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:contents">
              <Link href={`/ar/${product.slug}`} className="min-w-0">
                <Button size="lg" variant="outline" className="w-full">
                  <View size={16} />
                  <span className="truncate">View in Your Space</span>
                </Button>
              </Link>
              <Button
                size="lg"
                variant="ghost"
                className="min-w-12"
                onClick={() => toggleWish(product.id)}
                aria-label="Wishlist"
              >
                <Heart size={16} fill={wished ? "currentColor" : "none"} />
              </Button>
            </div>
          </div>
          <ProductAlertButtons
            className="mt-4"
            productId={product.id}
            productName={product.name}
            locationId={branchId}
            price={price}
          />
        </div>
      </div>

        <div className="mt-16">
        <div className="-mx-3 h-scroll gap-4 border-b border-white/10 px-3 pb-3 sm:mx-0 sm:flex sm:flex-wrap sm:overflow-visible sm:px-0">
          {(
            [
              ["story", "Brand Story"],
              ["tech", "Technical"],
              ["cocktails", "Cocktails"],
              ["reviews", "Reviews"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 text-xs uppercase tracking-[0.18em] ${
                tab === id ? "text-gold" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-6 max-w-3xl text-muted leading-relaxed">
          {tab === "story" && (
            <>
              <p>{product.brandStory}</p>
              <p className="mt-4">
                <span className="text-gold">Food pairing: </span>
                {product.foodPairings.join(", ")}
              </p>
            </>
          )}
          {tab === "tech" && (
            <ul className="space-y-2 text-sm">
              <li>
                <AbbrTooltip term="ABV" />: {product.abv}%
              </li>
              <li>Volume: {product.volumeMl}ml</li>
              <li>Country: {product.country}</li>
              {product.nutrition && (
                <>
                  <li>Calories / serving: {product.nutrition.calories}</li>
                  <li>Carbs: {product.nutrition.carbs}g</li>
                  <li>Sugar: {product.nutrition.sugar}g</li>
                </>
              )}
            </ul>
          )}
          {tab === "cocktails" &&
            (product.cocktails.length ? (
              product.cocktails.map((c) => (
                <div key={c.name} className="mb-6">
                  <h3 className="font-display text-2xl text-cream">{c.name}</h3>
                  <p className="mt-2 text-sm">{c.ingredients.join(" · ")}</p>
                  <p className="mt-1 text-sm">{c.method}</p>
                </div>
              ))
            ) : (
              <p>Best enjoyed neat or lightly chilled.</p>
            ))}
          {tab === "reviews" && (
            <div className="space-y-8">
              <ReviewForm
                targetType="product"
                productId={product.id}
                locationId={branchId}
                onCreated={(review) => setReviews((prev) => [review, ...prev])}
              />
              <ReviewList reviews={reviews} />
            </div>
          )}
        </div>
      </div>

      <div className="mt-20">
        <h2 className="font-display text-3xl text-cream">Similar bottles</h2>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {similar.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
