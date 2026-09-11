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
import { getAllLocations, getPriceForLocation } from "@/data/locations";
import { analyzeCartAvailability } from "@/lib/cart-availability";
import { useInventoryStore } from "@/store/inventory";
import { calculateShipping, calculateTax, formatPrice, amountUntilFreeDelivery, formatDeliveryPricingSummary } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { BranchAvailabilityPanel } from "@/components/cart/BranchAvailabilityPanel";
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
  const customerZip = useBranchStore((s) => s.customerZip);
  const customerLat = useBranchStore((s) => s.customerLat);
  const customerLng = useBranchStore((s) => s.customerLng);
  const branch = getAllLocations().find((l) => l.id === branchId) ?? getAllLocations()[0];
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const profile = useUserStore((s) => s.profile);
  const [code, setCode] = useState(coupon ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
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
      setCouponMessage("That code is not valid for this cart.");
    }
  }, [couponQuery.isError, coupon, applyCoupon]);

  const loyaltyQuery = useQuery({
    queryKey: ["loyalty-member-cart", branchId],
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
  const shippingBase = calculateShipping(subtotal - discount, fulfillment, branch);
  const shipping = couponQuery.data?.freeDelivery ? 0 : shippingBase;
  const tax = calculateTax(subtotal - discount, branch);
  const freeDeliveryGap = amountUntilFreeDelivery(subtotal - discount, branch);
  const total = Math.max(0, subtotal - discount + shipping + tax);
  const canCheckout = lines.length > 0 && !availability.hasConflicts;

  useEffect(() => {
    if (loyaltyPointsRedeem > maxRedeemPoints) {
      setLoyaltyPointsRedeem(maxRedeemPoints);
    }
  }, [loyaltyPointsRedeem, maxRedeemPoints, setLoyaltyPointsRedeem]);

  const rewardHints = useMemo(() => {
    const raw = loyaltyQuery.data?.program?.rewards;
    if (!Array.isArray(raw)) return [] as { points: number; label: string }[];
    return raw
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const row = r as { points?: unknown; label?: unknown };
        const points = typeof row.points === "number" ? row.points : 0;
        const label = typeof row.label === "string" ? row.label : "";
        if (!points || !label) return null;
        return { points, label };
      })
      .filter(Boolean) as { points: number; label: string }[];
  }, [loyaltyQuery.data?.program?.rewards]);

  useEffect(() => {
    if (fulfillment === "delivery" && !branch.deliveryAvailable) {
      setFulfillment("pickup");
    } else if (fulfillment === "pickup" && !branch.pickupAvailable && branch.deliveryAvailable) {
      setFulfillment("delivery");
    }
  }, [branch.deliveryAvailable, branch.pickupAvailable, fulfillment, setFulfillment]);

  useEffect(() => {
    const pref = profile.preferences?.defaultFulfillment;
    if (!isLoggedIn || !pref) return;
    if (pref === "delivery" && branch.deliveryAvailable) setFulfillment("delivery");
    if (pref === "pickup" && branch.pickupAvailable) setFulfillment("pickup");
    // only on mount / login
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, profile.id]);

  const applyCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      applyCoupon(null);
      setCouponMessage("Coupon cleared.");
      return;
    }
    setCouponBusy(true);
    setCouponMessage("");
    try {
      applyCoupon(trimmed);
      if (isDbConnected() && subtotal > 0) {
        const result = await apiValidateCoupon({
          code: trimmed,
          locationId: branchId,
          subtotal,
          items: promoItems,
        });
        setCode(result.code ?? trimmed);
        if (result.freeDelivery && result.discount <= 0) {
          setCouponMessage(`${result.name ?? trimmed} applied — free delivery.`);
        } else {
          setCouponMessage(
            `${result.name ?? trimmed} applied (−${formatPrice(result.discount)}).`,
          );
        }
      } else {
        const discountAmt = getCouponDiscount(trimmed, subtotal);
        if (!discountAmt) {
          applyCoupon(null);
          setCouponMessage("That code is not valid.");
        } else {
          setCode(trimmed.toUpperCase());
          setCouponMessage(`Coupon applied (−${formatPrice(discountAmt)}).`);
        }
      }
    } catch (err) {
      applyCoupon(null);
      setCouponMessage(err instanceof Error ? err.message : "That code is not valid.");
    } finally {
      setCouponBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-14 md:px-8 md:py-16">
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
          {getAllLocations().map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => switchShoppingStore(loc.id)}
              className={`border px-3 py-2 text-sm transition ${
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
            Branch: {branch.shortName} · {formatDeliveryPricingSummary(branch)}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!branch.deliveryAvailable}
              onClick={() => setFulfillment("delivery")}
              className={`flex-1 py-2 text-xs uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40 ${
                fulfillment === "delivery"
                  ? "bg-gold text-black"
                  : "border border-white/10 text-muted"
              }`}
            >
              Delivery
            </button>
            <button
              type="button"
              disabled={!branch.pickupAvailable}
              onClick={() => setFulfillment("pickup")}
              className={`flex-1 py-2 text-xs uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40 ${
                fulfillment === "pickup"
                  ? "bg-gold text-black"
                  : "border border-white/10 text-muted"
              }`}
            >
              Pickup
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Coupon code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (couponMessage) setCouponMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void applyCode();
                }
              }}
            />
            <Button
              variant="secondary"
              className="w-full shrink-0 sm:w-auto"
              loading={couponBusy}
              onClick={() => void applyCode()}
            >
              Apply
            </Button>
          </div>
          {couponMessage ? (
            <p
              className={`mt-2 text-[10px] ${
                couponMessage.toLowerCase().includes("not valid")
                  ? "text-red-300"
                  : "text-gold"
              }`}
            >
              {couponMessage}
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-muted">
              Enter a store promotion code from your email or receipt.
            </p>
          )}

          {isLoggedIn ? (
            <div className="mt-4 rounded-sm border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
                  Redeem loyalty
                </p>
                <p className="text-xs tabular-nums text-gold">
                  {balance.toLocaleString()} pts
                </p>
              </div>
              <label className="mt-2 block text-xs text-muted">
                Points to redeem
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={loyaltyPointsRedeem ? String(loyaltyPointsRedeem) : ""}
                  placeholder="0"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, "") || 0);
                    setLoyaltyPointsRedeem(Math.min(n, maxRedeemPoints));
                  }}
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted hover:border-(--gold)/35 hover:text-gold"
                  onClick={() => setLoyaltyPointsRedeem(0)}
                >
                  None
                </button>
                {maxRedeemPoints > 0 ? (
                  <button
                    type="button"
                    className="rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted hover:border-(--gold)/35 hover:text-gold"
                    onClick={() => setLoyaltyPointsRedeem(maxRedeemPoints)}
                  >
                    Max ({maxRedeemPoints})
                  </button>
                ) : null}
                {rewardHints
                  .filter((r) => r.points <= maxRedeemPoints)
                  .slice(0, 3)
                  .map((r) => (
                    <button
                      key={r.points}
                      type="button"
                      className="rounded-sm border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted hover:border-(--gold)/35 hover:text-gold"
                      onClick={() => setLoyaltyPointsRedeem(r.points)}
                    >
                      {r.label}
                    </button>
                  ))}
              </div>
              <p className="mt-2 text-[11px] text-white/40">
                {((redeemRate || 0) * 100).toFixed(0)}¢ per point
                {loyaltyDiscount > 0 ? ` · −${formatPrice(loyaltyDiscount)}` : ""}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-muted">
              <Link href="/login?next=/cart" className="text-gold hover:underline">
                Sign in
              </Link>{" "}
              to redeem loyalty points.
            </p>
          )}

          <OrderSummaryCard
            store={branch}
            fulfillment={fulfillment}
            etaLabel={
              fulfillment === "delivery"
                ? deliveryEtaForStore(branch, {
                    lat: customerLat,
                    lng: customerLng,
                    zip: customerZip,
                  })
                : pickupEtaForStore(branch)
            }
            addressSummary={
              fulfillment === "delivery"
                ? customerZip
                  ? `Delivering near ZIP ${customerZip}`
                  : "Add your ZIP in Find store for a tighter ETA"
                : `Pickup at ${branch.address}, ${branch.city}`
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
                : couponQuery.data?.freeDelivery
                  ? [{ label: "Delivery", value: "Free with offer", muted: true }]
                  : []),
              ...(loyaltyDiscount > 0
                ? [{ label: "Loyalty", value: `−${formatPrice(loyaltyDiscount)}` }]
                : [{ label: "Discounts", value: formatPrice(0), muted: true }]),
              {
                label: fulfillment === "delivery" ? "Delivery fee" : "Pickup fee",
                value: shipping === 0 ? "Free" : formatPrice(shipping),
              },
              { label: "Tax", value: formatPrice(tax) },
              { label: "Total", value: formatPrice(total), emphasis: true },
            ]}
            footer={
              <>
                {fulfillment === "delivery" && branch ? (
                  <p className="text-[10px] leading-relaxed text-muted">
                    {formatDeliveryPricingSummary(branch)}
                    {freeDeliveryGap != null
                      ? ` · Add ${formatPrice(freeDeliveryGap)} for free delivery`
                      : ""}
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
