"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AvailableOffersList } from "@/components/cart/AvailableOffersList";
import { apiLoyaltyMember, apiValidateCoupon } from "@/lib/api-mutations";
import { getCouponDiscount } from "@/lib/commerce";
import { loyaltyDiscountFromPoints, maxRedeemablePoints } from "@/lib/commerce/cart-pricing";
import { isDbConnected } from "@/lib/runtime-data";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { useUserStore } from "@/store/user";

export type PromoLine = {
  productId: string;
  quantity: number;
  price: number;
  category?: string;
  brand?: string;
};

type Props = {
  locationId: string;
  subtotal: number;
  promoItems: PromoLine[];
  couponDiscount?: number;
  loginNext?: string;
};

export function CartRewardsPanel({
  locationId,
  subtotal,
  promoItems,
  couponDiscount = 0,
  loginNext = "/checkout",
}: Props) {
  const coupon = useCartStore((s) => s.coupon);
  const loyaltyPointsRedeem = useCartStore((s) => s.loyaltyPointsRedeem);
  const applyCoupon = useCartStore((s) => s.applyCoupon);
  const setLoyaltyPointsRedeem = useCartStore((s) => s.setLoyaltyPointsRedeem);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const profile = useUserStore((s) => s.profile);

  const [code, setCode] = useState(coupon ?? "");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    setCode(coupon ?? "");
  }, [coupon]);

  const loyaltyQuery = useQuery({
    queryKey: ["loyalty-member", locationId],
    enabled: isLoggedIn && isDbConnected(),
    staleTime: 60_000,
    queryFn: () => apiLoyaltyMember({ locationId }),
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

  const balance = isLoggedIn ? (loyaltyQuery.data?.balance ?? profile.loyaltyPoints) : 0;
  const resolvedCouponDiscount =
    couponDiscount > 0
      ? couponDiscount
      : coupon && !isDbConnected()
        ? getCouponDiscount(coupon, subtotal)
        : 0;
  const maxLoyalty = Math.max(0, subtotal - resolvedCouponDiscount);
  const maxRedeemPoints = maxRedeemablePoints({
    balance,
    redeemRate,
    maxDiscount: maxLoyalty,
    rewards: loyaltyRewards,
  });
  const loyalty = loyaltyDiscountFromPoints({
    points: Math.min(loyaltyPointsRedeem, maxRedeemPoints),
    redeemRate,
    maxDiscount: maxLoyalty,
    rewards: loyaltyRewards,
  });

  const rewardHints = useMemo(() => {
    return loyaltyRewards
      .filter((r) => r.points <= maxRedeemPoints)
      .slice(0, 3)
      .map((r) => ({
        points: r.points,
        label: r.label || `${r.points} pts`,
      }));
  }, [loyaltyRewards, maxRedeemPoints]);

  const applyCodeValue = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      applyCoupon(null);
      setCouponMessage("Coupon cleared.");
      return;
    }
    setCouponBusy(true);
    setCouponMessage("");
    setCode(trimmed);
    try {
      applyCoupon(trimmed);
      if (isDbConnected() && subtotal > 0) {
        const result = await apiValidateCoupon({
          code: trimmed,
          locationId,
          subtotal,
          items: promoItems,
        });
        setCode(result.code ?? trimmed);
        if (result.freeDelivery && result.discount <= 0) {
          setCouponMessage(`${result.name ?? trimmed} applied — free delivery.`);
        } else {
          setCouponMessage(`${result.name ?? trimmed} applied (−${formatPrice(result.discount)}).`);
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

  const applyCode = () => applyCodeValue(code);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Coupon</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            className="min-w-0"
            placeholder="WELCOME20"
            value={code}
            autoComplete="off"
            aria-label="Coupon code"
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
            type="button"
            variant="secondary"
            className="w-full shrink-0 sm:w-auto"
            loading={couponBusy}
            onClick={() => void applyCode()}
          >
            {code.trim() && coupon === code.trim().toUpperCase() ? "Update" : "Apply"}
          </Button>
        </div>
        {couponMessage ? (
          <p
            className={`mt-2 text-[11px] ${
              couponMessage.toLowerCase().includes("not valid") ? "text-red-300" : "text-gold"
            }`}
          >
            {couponMessage}
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-muted">
            Have a code from email or a receipt? Apply it here before you pay.
          </p>
        )}
        {coupon ? (
          <button
            type="button"
            className="mt-1 text-[11px] text-muted hover:text-cream"
            onClick={() => {
              applyCoupon(null);
              setCode("");
              setCouponMessage("Coupon cleared.");
            }}
          >
            Remove coupon
          </button>
        ) : null}

        <div className="mt-3">
          <AvailableOffersList
            locationId={locationId}
            subtotal={subtotal}
            promoItems={promoItems}
            appliedCode={coupon}
            applyBusy={couponBusy}
            onApply={(offerCode) => void applyCodeValue(offerCode)}
          />
        </div>
      </div>

      {isLoggedIn ? (
        <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Redeem loyalty</p>
            <p className="text-xs tabular-nums text-gold">{balance.toLocaleString()} pts</p>
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
                Max ({maxRedeemPoints.toLocaleString()})
              </button>
            ) : null}
            {rewardHints.map((r) => (
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
            {loyalty.discount > 0 ? ` · −${formatPrice(loyalty.discount)}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-muted">
          <Link href={`/login?next=${encodeURIComponent(loginNext)}`} className="text-gold hover:underline">
            Sign in
          </Link>{" "}
          to redeem loyalty points at checkout.
        </p>
      )}
    </div>
  );
}
