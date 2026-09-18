"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { apiAvailableCoupons, type AvailableCoupon } from "@/lib/api-mutations";
import { COUPONS } from "@/lib/commerce";
import { isDbConnected } from "@/lib/runtime-data";
import { formatPrice } from "@/lib/utils";

export type OfferLine = {
  productId: string;
  quantity: number;
  price: number;
  category?: string;
  brand?: string;
};

type Props = {
  locationId: string;
  subtotal: number;
  promoItems: OfferLine[];
  appliedCode?: string | null;
  applyBusy?: boolean;
  onApply: (code: string) => void;
};

export function AvailableOffersList({
  locationId,
  subtotal,
  promoItems,
  appliedCode,
  applyBusy,
  onApply,
}: Props) {
  const [open, setOpen] = useState(true);
  const offersQuery = useQuery({
    queryKey: [
      "available-coupons",
      locationId,
      Math.round(subtotal * 100),
      promoItems.map((i) => `${i.productId}:${i.quantity}`).join("|"),
    ],
    staleTime: 30_000,
    queryFn: async () => {
      if (!isDbConnected()) {
        return {
          ok: true as const,
          coupons: Object.entries(COUPONS).map(([offerCode, rate]) => {
            const discount = Math.round(subtotal * rate * 100) / 100;
            return {
              id: `legacy-${offerCode}`,
              code: offerCode,
              name: offerCode,
              type: "percent",
              label: `${Math.round(rate * 100)}% off`,
              discount,
              freeDelivery: false,
              minSubtotal: null,
              eligible: discount > 0,
              reason: discount > 0 ? `Save ${formatPrice(discount)}` : "Add items to use this offer",
              endsAt: null,
            } satisfies AvailableCoupon;
          }),
        };
      }
      return apiAvailableCoupons({
        locationId,
        subtotal,
        items: promoItems,
      });
    },
  });

  const offers = offersQuery.data?.coupons ?? [];
  const active = appliedCode?.trim().toUpperCase() ?? "";

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-[11px] text-muted">Available offers</span>
        <span className="text-[11px] text-gold">
          {offersQuery.isLoading
            ? "Loading…"
            : open
              ? "Hide"
              : `${offers.length} ${offers.length === 1 ? "offer" : "offers"}`}
        </span>
      </button>
      {open ? (
        offersQuery.isError ? (
          <p className="mt-2 text-[11px] text-red-300">Could not load offers right now.</p>
        ) : offers.length === 0 && !offersQuery.isLoading ? (
          <p className="mt-2 text-[11px] text-muted">No store coupons are available for this bag.</p>
        ) : (
          <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-0.5">
            {offers.map((offer) => {
              const applied = active === offer.code;
              return (
                <li
                  key={offer.id}
                  className={`rounded-sm border p-2.5 ${
                    applied
                      ? "border-(--gold)/45 bg-(--gold)/8"
                      : offer.eligible
                        ? "border-white/10 bg-white/[0.03]"
                        : "border-white/8 bg-transparent opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium tracking-[0.08em] text-cream">{offer.code}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">
                        {offer.name && offer.name !== offer.code ? `${offer.name} · ` : ""}
                        {offer.label}
                      </p>
                      {offer.reason ? (
                        <p
                          className={`mt-1 text-[11px] ${
                            offer.eligible ? "text-gold" : "text-white/40"
                          }`}
                        >
                          {offer.reason}
                          {offer.endsAt
                            ? ` · Ends ${new Date(offer.endsAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={applied ? "secondary" : "outline"}
                      className="shrink-0"
                      disabled={applyBusy || applied || !offer.eligible}
                      loading={applyBusy && active === offer.code}
                      onClick={() => onApply(offer.code)}
                    >
                      {applied ? "Applied" : "Apply"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
