"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCartStore, getCouponDiscount } from "@/store/cart";
import { useShallow } from "zustand/react/shallow";
import { useBranchStore } from "@/store/branch";
import { useUserStore } from "@/store/user";
import { getProductById } from "@/data/products";
import { getPriceForLocation } from "@/data/locations";
import { useRuntimeLocations } from "@/hooks/useRuntimeLocations";
import { analyzeCartAvailability } from "@/lib/cart-availability";
import { useInventoryStore } from "@/store/inventory";
import { calculateShipping, calculateTax, formatPrice, amountUntilFreeDelivery, publicFulfillmentSummary, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { BranchAvailabilityPanel } from "@/components/cart/BranchAvailabilityPanel";
import { CartRewardsPanel } from "@/components/cart/CartRewardsPanel";
import { FulfillmentModeToggle } from "@/components/cart/FulfillmentModeToggle";
import { OrderSummaryCard } from "@/components/cart/OrderSummaryCard";
import { OtherBranchStock } from "@/components/inventory/OtherBranchStock";
import { LocationStockStrip } from "@/components/inventory/LocationStockStrip";
import { apiLoyaltyMember, apiValidateCoupon } from "@/lib/api-mutations";
import { isDbConnected } from "@/lib/runtime-data";
import {
  loyaltyDiscountFromPoints,
  maxRedeemablePoints,
} from "@/lib/commerce/cart-pricing";
import { deliveryEtaForStore, pickupEtaForStore } from "@/lib/order-eta";
import { switchShoppingStore } from "@/lib/switch-store";

export default function CartPage() {
  const {
    items,
    savedForLater,
    coupon,
    loyaltyPointsRedeem,
    fulfillment,
    setQuantity,
    removeItem,
    saveForLater,
    moveToCart,
    applyCoupon,
    setLoyaltyPointsRedeem,
    setFulfillment,
    clear,
  } = useCartStore(
    useShallow((s) => ({
      items: s.items,
      savedForLater: s.savedForLater,
      coupon: s.coupon,
      loyaltyPointsRedeem: s.loyaltyPointsRedeem,
      fulfillment: s.fulfillment,
      setQuantity: s.setQuantity,
      removeItem: s.removeItem,
      saveForLater: s.saveForLater,
      moveToCart: s.moveToCart,
      applyCoupon: s.applyCoupon,
      setLoyaltyPointsRedeem: s.setLoyaltyPointsRedeem,
      setFulfillment: s.setFulfillment,
      clear: s.clear,
    })),
  );
  const branchId = useBranchStore((s) => s.branchId);
  const locations = useRuntimeLocations();
  const customerZip = useBranchStore((s) => s.customerZip);
  const customerLat = useBranchStore((s) => s.customerLat);
  const customerLng = useBranchStore((s) => s.customerLng);
  const branch = locations.find((l) => l.id === branchId) ?? locations[0];
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const profile = useUserStore((s) => s.profile);
  const [confirmClear, setConfirmClear] = useState(false);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  const getAvailable = useInventoryStore((s) => s.getAvailable);

  const availability = analyzeCartAvailability(items, branchId);
  void inventoryRevision;

  const lines = items
    .map((item) => {
      const product = getProductById(item.productId);
      if (!product) return null;
      const price = getPriceForLocation(branchId, product.id);
      const stock = getAvailable(branchId, product.id);
      const inStock = stock >= item.quantity;
      return { item, product, price, lineTotal: price * item.quantity, stock, inStock };
    })
    .filter(Boolean) as {
    item: (typeof items)[0];
    product: NonNullable<ReturnType<typeof getProductById>>;
    price: number;
    lineTotal: number;
    stock: number;
    inStock: boolean;
  }[];

  const checkoutLines = lines.filter((l) => l.inStock);
  const subtotal = checkoutLines.reduce((n, l) => n + l.lineTotal, 0);
  const promoItems = useMemo(
    () =>
      checkoutLines.map((l) => ({
        productId: l.product.id,
        quantity: l.item.quantity,
        price: l.price,
        category: l.product.category,
        brand: l.product.brand,
      })),
    // checkoutLines identity changes each render; key off cart contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, branchId, inventoryRevision, subtotal],
  );

  const couponQuery = useQuery({
    queryKey: [
      "cart-coupon",
      coupon,
      branchId,
      Math.round(subtotal * 100),
      promoItems.map((i) => `${i.productId}:${i.quantity}`).join("|"),
    ],
    enabled: subtotal > 0,
    staleTime: 30_000,
    queryFn: async () => {
      if (!isDbConnected()) {
        if (!coupon) {
          return {
            ok: true as const,
            code: null,
            name: null,
            discount: 0,
            freeDelivery: false,
            promotionId: null,
            autoApplied: true,
          };
        }
        const discount = getCouponDiscount(coupon, subtotal);
        if (!discount) throw new Error("That code is not valid.");
        return {
          ok: true as const,
          code: coupon,
          name: coupon,
          discount,
          freeDelivery: false,
          promotionId: null,
          autoApplied: false,
        };
      }
      return apiValidateCoupon({
        code: coupon,
        auto: !coupon,
        locationId: branchId,
        subtotal,
        items: promoItems,
      });
    },
    retry: false,
  });

  useEffect(() => {
    if (couponQuery.isError && coupon) {
      applyCoupon(null);
    }
  }, [couponQuery.isError, coupon, applyCoupon]);

  const loyaltyQuery = useQuery({
    queryKey: ["loyalty-member", branchId],
    enabled: isLoggedIn && isDbConnected(),
    staleTime: 60_000,
    queryFn: () => apiLoyaltyMember({ locationId: branchId }),
  });

  const redeemRate = loyaltyQuery.data?.program?.redeemRate ?? 0.02;
  const loyaltyRewards = useMemo(() => {
    const raw = loyaltyQuery.data?.program?.rewards;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const row = r as { points?: number; value?: number; label?: string };
        if (!row.points || !row.value) return null;
        return { points: Number(row.points), value: Number(row.value), label: row.label };
      })
      .filter(Boolean) as { points: number; value: number; label?: string }[];
  }, [loyaltyQuery.data?.program?.rewards]);
  const balance = isLoggedIn
    ? (loyaltyQuery.data?.balance ?? profile.loyaltyPoints)
    : 0;
  const couponDiscount = couponQuery.isError
    ? 0
    : (couponQuery.data?.discount ??
      (!isDbConnected() && coupon ? getCouponDiscount(coupon, subtotal) : 0));
  const maxLoyaltyDiscount = Math.max(0, subtotal - couponDiscount);
  const maxRedeemPoints = maxRedeemablePoints({
    balance,
    redeemRate,
    maxDiscount: maxLoyaltyDiscount,
    rewards: loyaltyRewards,
  });
  const loyalty = loyaltyDiscountFromPoints({
    points: Math.min(loyaltyPointsRedeem, maxRedeemPoints),
    redeemRate,
    maxDiscount: maxLoyaltyDiscount,
    rewards: loyaltyRewards,
  });
  const loyaltyDiscount = loyalty.discount;
  const discount = couponDiscount + loyaltyDiscount;
  const activeFulfillment: "delivery" | "pickup" | null =
    fulfillment === "delivery" && branch?.deliveryAvailable
      ? "delivery"
      : fulfillment === "pickup" && branch?.pickupAvailable
        ? "pickup"
        : branch?.deliveryAvailable
          ? "delivery"
          : branch?.pickupAvailable
            ? "pickup"
            : null;
  const shippingBase = calculateShipping(
    subtotal - discount,
    activeFulfillment ?? "pickup",
    branch,
  );
  const shipping =
    couponQuery.data?.freeDelivery && activeFulfillment === "delivery" ? 0 : shippingBase;
  const tax = calculateTax(subtotal - discount, branch);
  const freeDeliveryGap =
    activeFulfillment === "delivery"
      ? amountUntilFreeDelivery(subtotal - discount, branch)
      : null;
  const total = Math.max(0, subtotal - discount + shipping + tax);
  const canCheckout =
    lines.length > 0 &&
    !availability.hasConflicts &&
    activeFulfillment != null;

  useEffect(() => {
    if (loyaltyPointsRedeem > maxRedeemPoints) {
      setLoyaltyPointsRedeem(maxRedeemPoints);
    }
  }, [loyaltyPointsRedeem, maxRedeemPoints, setLoyaltyPointsRedeem]);

  useEffect(() => {
    if (!branch) return;
    if (fulfillment === "delivery" && !branch.deliveryAvailable && branch.pickupAvailable) {
      setFulfillment("pickup");
    } else if (fulfillment === "pickup" && !branch.pickupAvailable && branch.deliveryAvailable) {
      setFulfillment("delivery");
    }
  }, [branch, fulfillment, setFulfillment]);

  useEffect(() => {
    const pref = profile.preferences?.defaultFulfillment;
    if (!isLoggedIn || !pref) return;
    if (pref === "delivery" && branch.deliveryAvailable) setFulfillment("delivery");
    if (pref === "pickup" && branch.pickupAvailable) setFulfillment("pickup");
    // only on mount / login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, profile.id]);

  return (
    <div className={cn("mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-14 md:px-8 md:py-16", lines.length ? "pb-24 lg:pb-16" : "")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-3xl text-cream sm:text-4xl md:text-5xl">Your Cart</h1>
        {lines.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
            Clear cart
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-gold">
          Shopping at
        </p>
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => switchShoppingStore(loc.id)}
              className={`min-h-11 border px-3 py-2 text-sm transition ${
                branchId === loc.id
                  ? "border-(--gold)/50 bg-(--gold)/10 text-cream"
                  : "border-white/10 text-muted hover:border-white/25"
              }`}
            >
              {loc.shortName}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Prices and stock update for {branch.shortName}.
        </p>
      </div>

      <div className="mt-8">
        <BranchAvailabilityPanel />
      </div>

      <div className="mt-10 grid gap-8 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div>
          {!lines.length && (
            <p className="text-muted">
              Cart is empty.{" "}
              <Link href="/shop" className="text-gold">
                Browse collections
              </Link>
            </p>
          )}
          <ul className="space-y-4">
            {lines.map(({ item, product, price, lineTotal, stock, inStock }) => (
              <li
                key={product.id}
                className={`flex flex-col gap-4 border p-3 sm:flex-row sm:gap-4 sm:p-4 ${
                  inStock ? "border-white/5" : "border-(--danger)/35 bg-[#1a1010]/40"
                }`}
              >
                <div className="flex gap-3 sm:contents">
                <Link
                  href={`/products/${product.slug}`}
                  className="relative h-24 w-16 shrink-0 bg-white/5 sm:h-28 sm:w-20"
                >
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    className="object-contain p-1"
                    sizes="80px"
                  />
                </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${product.slug}`}
                      className="font-display text-lg text-cream wrap-break-word hover:text-gold sm:text-xl"
                    >
                      {product.name}
                    </Link>
                    <p className="text-sm text-muted">{formatPrice(price)}</p>
                    <p
                      className={`mt-1 text-xs ${
                        inStock ? "text-muted" : "text-(--danger)"
                      }`}
                    >
                      {inStock
                        ? `${stock} in stock at ${branch.shortName}`
                        : stock === 0
                          ? `0 at ${branch.shortName}`
                          : `Only ${stock} at ${branch.shortName} (you have ${item.quantity})`}
                    </p>
                    <LocationStockStrip
                      className="mt-2"
                      productId={product.id}
                      needed={item.quantity}
                      compact
                    />
                    {(!inStock || item.quantity >= stock) && (
                      <OtherBranchStock
                        className="mt-2"
                        productId={product.id}
                        branchId={branchId}
                        quantity={item.quantity + (item.quantity >= stock ? 1 : 0)}
                        localStock={stock}
                        compact
                      />
                    )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                      <div className="flex items-center border border-white/10">
                        <button
                          className="min-h-11 px-3.5 py-2 text-muted touch-manipulation"
                          onClick={() => setQuantity(product.id, item.quantity - 1)}
                        >
                          −
                        </button>
                        <span className="min-w-8 px-2 text-center text-sm">{item.quantity}</span>
                        <button
                          className="min-h-11 px-3.5 py-2 text-muted touch-manipulation disabled:opacity-30"
                          onClick={() => setQuantity(product.id, item.quantity + 1)}
                          disabled={item.quantity >= stock}
                          title={
                            item.quantity >= stock
                              ? "This store is at max — switch branch below to add more"
                              : undefined
                          }
                        >
                          +
                        </button>
                      </div>
                      <button
                        className="min-h-11 px-2 py-2 text-xs text-muted touch-manipulation hover:text-cream"
                        onClick={() => saveForLater(product.id)}
                      >
                        Save for later
                      </button>
                      <button
                        className="min-h-11 px-2 py-2 text-xs text-muted touch-manipulation hover:text-red-300"
                        onClick={() => removeItem(product.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 self-start text-gold sm:ml-0">
                    {formatPrice(lineTotal)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {savedForLater.length > 0 && (
            <div className="mt-12">
              <h2 className="font-display text-2xl text-cream">Saved for later</h2>
              <ul className="mt-4 space-y-3">
                {savedForLater.map((id) => {
                  const p = getProductById(id);
                  if (!p) return null;
                  const savedStock = getAvailable(branchId, id);
                  return (
                    <li
                      key={id}
                      className="flex flex-col gap-3 border border-white/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <Link href={`/products/${p.slug}`} className="text-cream hover:text-gold">
                          {p.name}
                        </Link>
                        <p className="text-xs text-muted">
                          {savedStock} at {branch.shortName}
                        </p>
                        <LocationStockStrip
                          className="mt-2"
                          productId={id}
                          needed={1}
                          compact
                        />
                        {savedStock <= 0 && (
                          <OtherBranchStock
                            className="mt-2"
                            productId={id}
                            branchId={branchId}
                            quantity={1}
                            localStock={savedStock}
                            compact
                          />
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full shrink-0 sm:w-auto"
                        disabled={savedStock <= 0}
                        onClick={() => moveToCart(id)}
                      >
                        {savedStock <= 0 ? "Unavailable" : "Move to cart"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <aside className="glass-gold h-fit p-4 sm:p-6 lg:sticky lg:top-[calc(4.5rem+env(safe-area-inset-top,0px))]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Summary</p>
          <p className="mt-2 text-xs text-muted">
            Branch: {branch.shortName} · {publicFulfillmentSummary(branch)}
          </p>
          <div className="mt-4">
            <FulfillmentModeToggle
              pickupAvailable={Boolean(branch.pickupAvailable)}
              deliveryAvailable={Boolean(branch.deliveryAvailable)}
              value={activeFulfillment === "delivery" ? "delivery" : "pickup"}
              onChange={setFulfillment}
            />
          </div>
          <div className="mt-4">
            <CartRewardsPanel
              locationId={branchId}
              subtotal={subtotal}
              promoItems={promoItems}
              couponDiscount={couponDiscount}
              loginNext="/cart"
            />
          </div>

          <OrderSummaryCard
            store={branch}
            fulfillment={activeFulfillment ?? "pickup"}
            etaLabel={
              activeFulfillment === "delivery"
                ? deliveryEtaForStore(branch, {
                    lat: customerLat,
                    lng: customerLng,
                    zip: customerZip,
                  })
                : activeFulfillment === "pickup"
                  ? pickupEtaForStore(branch)
                  : null
            }
            addressSummary={
              activeFulfillment === "delivery"
                ? customerZip
                  ? `Delivering near ZIP ${customerZip}`
                  : "Add your ZIP in Find store for a tighter ETA"
                : activeFulfillment === "pickup"
                  ? `Pickup at ${branch.address}, ${branch.city}`
                  : "Online pickup and delivery are off for this store"
            }
            paymentSummary="Collected at checkout"
            lines={[
              { label: "Subtotal", value: formatPrice(subtotal) },
              ...(couponDiscount > 0
                ? [
                    {
                      label: couponQuery.data?.autoApplied
                        ? couponQuery.data.name
                          ? `Offer · ${couponQuery.data.name}`
                          : "Offer"
                        : "Coupon",
                      value: `−${formatPrice(couponDiscount)}`,
                    },
                  ]
                : couponQuery.data?.freeDelivery && activeFulfillment === "delivery"
                  ? [{ label: "Delivery", value: "Free with offer", muted: true }]
                  : []),
              ...(loyaltyDiscount > 0
                ? [{ label: "Loyalty", value: `−${formatPrice(loyaltyDiscount)}` }]
                : couponDiscount > 0
                  ? []
                  : [{ label: "Discounts", value: formatPrice(0), muted: true }]),
              {
                label:
                  activeFulfillment === "delivery"
                    ? "Delivery fee"
                    : activeFulfillment === "pickup"
                      ? "Pickup fee"
                      : "Fulfillment",
                value:
                  activeFulfillment == null
                    ? "Unavailable"
                    : shipping === 0
                      ? "Free"
                      : formatPrice(shipping),
              },
              { label: "Tax", value: formatPrice(tax) },
              { label: "Total", value: formatPrice(total), emphasis: true },
            ]}
            footer={
              <>
                {activeFulfillment === "delivery" && branch?.deliveryAvailable ? (
                  <p className="text-[10px] leading-relaxed text-muted">
                    {publicFulfillmentSummary(branch)}
                    {freeDeliveryGap != null
                      ? ` · Add ${formatPrice(freeDeliveryGap)} for free delivery`
                      : ""}
                  </p>
                ) : null}
                {activeFulfillment == null ? (
                  <p className="mt-4 text-xs leading-relaxed text-amber-200/90">
                    This store is not taking pickup or delivery online. Choose another branch or
                    shop in person.
                  </p>
                ) : null}
                {availability.hasConflicts ? (
                  <p className="mt-4 text-xs leading-relaxed text-(--danger)">
                    Resolve stock conflicts above before checkout — one store must
                    fulfill the full order.
                  </p>
                ) : null}
                <Link
                  href={canCheckout ? "/checkout" : "#"}
                  className="mt-6 block"
                  onClick={(e) => {
                    if (!canCheckout) e.preventDefault();
                  }}
                  aria-disabled={!canCheckout}
                >
                  <Button className="w-full min-h-12" size="lg" disabled={!canCheckout}>
                    Checkout
                  </Button>
                </Link>
              </>
            }
          />
        </aside>
      </div>

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#070707]/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <p className="min-w-0">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-muted">Total</span>
              <span className="text-base font-medium tabular-nums text-cream">{formatPrice(total)}</span>
            </p>
            <Link
              href={canCheckout ? "/checkout" : "#"}
              onClick={(e) => {
                if (!canCheckout) e.preventDefault();
              }}
              aria-disabled={!canCheckout}
              className="shrink-0"
            >
              <Button className="min-h-12 min-w-[9rem]" size="lg" disabled={!canCheckout}>
                Checkout
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmClear}
        title="Clear your cart?"
        subtitle="This removes every bottle from the bag. Saved-for-later items stay."
        onClose={() => setConfirmClear(false)}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmClear(false)}>
            Keep items
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clear();
              setConfirmClear(false);
            }}
          >
            Clear cart
          </Button>
        </div>
      </Modal>
    </div>
  );
}
