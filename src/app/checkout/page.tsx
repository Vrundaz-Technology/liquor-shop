"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useCartStore } from "@/store/cart";
import { useShallow } from "zustand/react/shallow";
import { useBranchStore } from "@/store/branch";
import { useUserStore } from "@/store/user";
import { getPriceForLocation, getAllLocations } from "@/data/locations";
import { getProductById } from "@/data/products";
import { analyzeCartAvailability } from "@/lib/cart-availability";
import { calculateShipping, calculateTax, formatPrice, formatUsPhone, isUsPhone, amountUntilFreeDelivery, formatDeliveryPricingSummary } from "@/lib/utils";
import { useInventoryStore } from "@/store/inventory";
import type { DeliveryAddress, Order } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BranchAvailabilityPanel } from "@/components/cart/BranchAvailabilityPanel";
import { OrderSummaryCard } from "@/components/cart/OrderSummaryCard";
import { isDbConnected } from "@/lib/runtime-data";
import { useQuery } from "@tanstack/react-query";
import { apiLoyaltyMember, apiPlaceOrder, apiValidateCoupon } from "@/lib/api-mutations";
import {
  loyaltyDiscountFromPoints,
  maxRedeemablePoints,
} from "@/lib/commerce/cart-pricing";
import { getCouponDiscount } from "@/lib/commerce";
import { useDeliveryStore } from "@/store/delivery";
import { deliveryEtaForStore, pickupEtaForStore } from "@/lib/order-eta";
import { switchShoppingStore } from "@/lib/switch-store";

const usPhone = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Enter a valid phone like (212) 555-0100");

const zipSchema = z
  .string()
  .trim()
  .min(1, "ZIP code is required")
  .regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP");

function isFutureExpiry(value: string) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return end.getTime() >= Date.now();
}

const expirySchema = z
  .string()
  .regex(/^\d{2}\/\d{2}$/, "Use MM/YY")
  .refine(isFutureExpiry, "Card expiry must be in the future");

const deliverySchema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().trim().min(2, "Enter your full name"),
  phone: usPhone,
  line1: z.string().trim().min(3, "Enter a street address"),
  line2: z.string().optional(),
  city: z.string().trim().min(2, "Enter a city"),
  state: z.string().trim().min(2, "Enter a state"),
  zip: zipSchema,
  notes: z.string().optional(),
  card: z
    .string()
    .min(12, "Enter a valid card number")
    .max(19, "Enter a valid card number"),
  expiry: expirySchema,
  cvc: z
    .string()
    .min(3, "Enter a 3 or 4 digit CVC")
    .max(4, "Enter a 3 or 4 digit CVC"),
  ageConfirmed: z.literal(true, {
    error: "Confirm you are 21 or older to continue.",
  }),
});

const pickupSchema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().trim().min(2, "Enter your full name"),
  phone: usPhone,
  card: z
    .string()
    .min(12, "Enter a valid card number")
    .max(19, "Enter a valid card number"),
  expiry: expirySchema,
  cvc: z
    .string()
    .min(3, "Enter a 3 or 4 digit CVC")
    .max(4, "Enter a 3 or 4 digit CVC"),
  ageConfirmed: z.literal(true, {
    error: "Confirm you are 21 or older to continue.",
  }),
});

const fieldClass =
  "!min-h-11 h-11 py-2.5 px-3 text-sm placeholder:not-italic placeholder:text-white/25";
const fieldErrorClass = "border-red-400/50";

type CheckoutField =
  | "email"
  | "name"
  | "phone"
  | "line1"
  | "city"
  | "state"
  | "zip"
  | "card"
  | "expiry"
  | "cvc"
  | "ageConfirmed";

function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function Field({
  label,
  hint,
  className,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`block min-w-0 text-[11px] ${invalid ? "text-red-300" : "text-muted"} ${className ?? ""}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint ? (
          <span className={`truncate text-[10px] ${invalid ? "text-red-300/80" : "text-white/30"}`}>
            {hint}
          </span>
        ) : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-sm border border-white/10 bg-white/[0.02] p-4">
      <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-gold">{title}</p>
      {children}
    </section>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const {
    items,
    coupon,
    loyaltyPointsRedeem,
    fulfillment,
    clear,
    setFulfillment,
    removeItem,
    applyCoupon,
    setLoyaltyPointsRedeem,
  } = useCartStore(
    useShallow((s) => ({
      items: s.items,
      coupon: s.coupon,
      loyaltyPointsRedeem: s.loyaltyPointsRedeem,
      fulfillment: s.fulfillment,
      clear: s.clear,
      setFulfillment: s.setFulfillment,
      removeItem: s.removeItem,
      applyCoupon: s.applyCoupon,
      setLoyaltyPointsRedeem: s.setLoyaltyPointsRedeem,
    })),
  );
  const branchId = useBranchStore((s) => s.branchId);
  const customerZip = useBranchStore((s) => s.customerZip);
  const customerLat = useBranchStore((s) => s.customerLat);
  const customerLng = useBranchStore((s) => s.customerLng);
  const branch = getAllLocations().find((l) => l.id === branchId) ?? getAllLocations()[0];
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const profile = useUserStore((s) => s.profile);
  const addOrder = useUserStore((s) => s.addOrder);
  const updateProfile = useUserStore((s) => s.updateProfile);
  const authReady = useUserStore((s) => s.authReady);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  const getAvailable = useInventoryStore((s) => s.getAvailable);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/28");
  const [cvc, setCvc] = useState("123");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CheckoutField, string>>>({});
  const [confirmed, setConfirmed] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydratedFields, setHydratedFields] = useState(false);

  const clearFieldError = (field: CheckoutField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const inputClass = (field: CheckoutField) =>
    `${fieldClass} ${fieldErrors[field] ? fieldErrorClass : ""}`;

  useEffect(() => {
    if (!authReady || hydratedFields) return;
    if (isLoggedIn) {
      setEmail(profile.email);
      setName(profile.name);
      const address = profile.addresses[0];
      if (address) {
        setLine1(address.line1);
        setCity(address.city);
        setState(address.state);
        setZip(address.zip);
      }
    }
    setHydratedFields(true);
  }, [authReady, hydratedFields, isLoggedIn, profile]);

  useEffect(() => {
    if (confirmed) return;
    if (items.length === 0) {
      router.replace("/cart");
    }
  }, [items.length, confirmed, router]);

  useEffect(() => {
    if (fulfillment === "delivery" && !branch.deliveryAvailable) {
      setFulfillment("pickup");
    } else if (fulfillment === "pickup" && !branch.pickupAvailable && branch.deliveryAvailable) {
      setFulfillment("delivery");
    }
  }, [branch.deliveryAvailable, branch.pickupAvailable, fulfillment, setFulfillment]);

  const availability = analyzeCartAvailability(items, branchId);
  void inventoryRevision;

  const billableItems = items.filter((i) => {
    const stock = getAvailable(branchId, i.productId);
    return stock >= i.quantity;
  });

  const subtotal = billableItems.reduce((n, i) => {
    const p = getProductById(i.productId);
    if (!p) return n;
    return n + getPriceForLocation(branchId, p.id) * i.quantity;
  }, 0);

  const promoItems = useMemo(
    () =>
      items
        .filter((i) => getAvailable(branchId, i.productId) >= i.quantity)
        .map((i) => {
          const p = getProductById(i.productId);
          if (!p) return null;
          return {
            productId: p.id,
            quantity: i.quantity,
            price: getPriceForLocation(branchId, p.id),
            category: p.category,
            brand: p.brand,
          };
        })
        .filter(Boolean) as {
        productId: string;
        quantity: number;
        price: number;
        category: string;
        brand: string;
      }[],
    [items, branchId, inventoryRevision, getAvailable],
  );

  const couponQuery = useQuery({
    queryKey: [
      "checkout-coupon",
      coupon,
      branchId,
      Math.round(subtotal * 100),
      promoItems.map((i) => `${i.productId}:${i.quantity}`).join("|"),
    ],
    enabled: subtotal > 0,
    staleTime: 30_000,
    retry: false,
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
        const amount = getCouponDiscount(coupon, subtotal);
        if (!amount) throw new Error("Invalid coupon");
        return {
          ok: true as const,
          code: coupon,
          name: coupon,
          discount: amount,
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
  });

  useEffect(() => {
    if (couponQuery.isError && coupon) {
      applyCoupon(null);
    }
  }, [couponQuery.isError, coupon, applyCoupon]);

  const loyaltyQuery = useQuery({
    queryKey: ["loyalty-member-checkout", branchId],
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
  const maxLoyalty = Math.max(0, subtotal - couponDiscount);
  const maxPoints = maxRedeemablePoints({
    balance,
    redeemRate,
    maxDiscount: maxLoyalty,
    rewards: loyaltyRewards,
  });
  const loyalty = loyaltyDiscountFromPoints({
    points: Math.min(loyaltyPointsRedeem, maxPoints),
    redeemRate,
    maxDiscount: maxLoyalty,
    rewards: loyaltyRewards,
  });
  const discount = couponDiscount + loyalty.discount;
  const shippingBase = calculateShipping(subtotal - discount, fulfillment, branch);
  const shipping = couponQuery.data?.freeDelivery ? 0 : shippingBase;
  const tax = calculateTax(subtotal - discount, branch);
  const freeDeliveryGap = amountUntilFreeDelivery(subtotal - discount, branch);
  const total = Math.max(0, subtotal - discount + shipping + tax);

  useEffect(() => {
    if (loyaltyPointsRedeem > maxPoints) {
      setLoyaltyPointsRedeem(maxPoints);
    }
  }, [loyaltyPointsRedeem, maxPoints, setLoyaltyPointsRedeem]);

  const delivery: DeliveryAddress = useMemo(
    () => ({
      name,
      phone,
      line1,
      line2: line2.trim() || undefined,
      city,
      state,
      zip,
      notes: notes.trim() || undefined,
    }),
    [name, phone, line1, line2, city, state, zip, notes],
  );

  const applySavedAddress = (address: (typeof profile.addresses)[number]) => {
    setLine1(address.line1);
    setCity(address.city);
    setState(address.state);
    setZip(address.zip);
  };

  const placeOrder = async () => {
    const latest = analyzeCartAvailability(
      useCartStore.getState().items,
      useBranchStore.getState().branchId,
    );
    if (latest.hasConflicts) {
      setError(
        "Some bottles are not available at this store. Switch location or remove them to continue.",
      );
      return;
    }
    if (!items.length) {
      setError("Your cart is empty.");
      return;
    }
    const payload = {
      email,
      name,
      phone,
      line1,
      line2,
      city,
      state,
      zip,
      notes,
      card: card.replace(/\s/g, ""),
      expiry,
      cvc,
      ageConfirmed,
    };
    const parsed =
      fulfillment === "delivery" ? deliverySchema.safeParse(payload) : pickupSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Partial<Record<CheckoutField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in nextErrors)) {
          nextErrors[key as CheckoutField] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      const firstKey = Object.keys(nextErrors)[0] as CheckoutField | undefined;
      const firstMessage = firstKey ? nextErrors[firstKey] : undefined;
      setError(
        firstMessage ||
          (fulfillment === "delivery"
            ? "Check contact, delivery address, and card details."
            : "Check contact and card details."),
      );
      if (firstKey && firstKey !== "ageConfirmed") {
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(`[data-checkout-field="${firstKey}"]`)
            ?.focus();
        });
      }
      return;
    }
    setFieldErrors({});
    setError("");

    if (isDbConnected()) {
      setSubmitting(true);
      try {
        const result = await apiPlaceOrder({
          email,
          name,
          phone,
          userId: isLoggedIn ? profile.id : undefined,
          locationId: branchId,
          fulfillment,
          coupon,
          loyaltyPointsRedeem: isLoggedIn ? loyalty.points : 0,
          ageConfirmed: true,
          delivery: fulfillment === "delivery" ? delivery : undefined,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        });
        useInventoryStore
          .getState()
          .syncFromServer(result.inventory.stocks, result.inventory.seats, result.inventory.hidden, result.inventory.reserved);
        addOrder(result.order, { loyaltyPoints: result.loyaltyPoints });
        if (
          isLoggedIn &&
          saveAddress &&
          fulfillment === "delivery" &&
          delivery
        ) {
          const nextAddresses = [
            ...profile.addresses.filter(
              (a) =>
                a.line1.toLowerCase() !== delivery.line1.toLowerCase() ||
                a.zip !== delivery.zip,
            ),
            {
              id: `addr-${crypto.randomUUID()}`,
              label: "Delivery",
              line1: delivery.line1,
              city: delivery.city,
              state: delivery.state,
              zip: delivery.zip,
              isDefault: profile.addresses.length === 0,
            },
          ].slice(0, 12);
          void updateProfile({ addresses: nextAddresses }).catch(console.error);
        }
        if (result.order.fulfillment === "delivery") {
          useDeliveryStore.getState().attach(result.order.id, delivery);
        }
        clear();
        setConfirmed(result.order);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not place the order. Check stock and try again.",
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const orderId = `ORD-${Math.floor(Math.random() * 90000 + 10000)}`;
    const deducted = useInventoryStore.getState().deductOrder(branchId, items, orderId);
    if (!deducted.ok) {
      setError("Stock changed while you were checking out. Update quantities and try again.");
      return;
    }
    const orderItems = items
      .map((i) => {
        const product = getProductById(i.productId);
        if (!product) return null;
        return {
          productId: i.productId,
          quantity: i.quantity,
          price: getPriceForLocation(branchId, product.id),
        };
      })
      .filter(Boolean) as Order["items"];
    const order: Order = {
      id: orderId,
      date: new Date().toISOString().slice(0, 10),
      status: fulfillment === "pickup" ? "ready" : "processing",
      items: orderItems,
      total,
      fulfillment,
      locationId: branchId,
      tracking:
        fulfillment === "delivery"
          ? `SDL-${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`
          : undefined,
      delivery: fulfillment === "delivery" ? delivery : undefined,
      deliveryStatus: fulfillment === "delivery" ? "unassigned" : undefined,
    };
    addOrder(order);
    if (order.fulfillment === "delivery") {
      useDeliveryStore.getState().attach(order.id, delivery);
    }
    clear();
    setConfirmed(order);
  };

  const canPlace = items.length > 0 && !availability.hasConflicts && !submitting && ageConfirmed;
  const placeLabel = availability.hasConflicts
    ? "Resolve stock to continue"
    : submitting
      ? "Placing order…"
      : `Place order · ${formatPrice(total)}`;

  if (confirmed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 sm:py-16">
        <p className="text-[10px] uppercase tracking-[0.28em] text-gold">Order confirmed</p>
        <h1 className="mt-3 font-display text-4xl text-cream">Thank you</h1>
        <p className="mt-4 text-sm text-muted">
          Order <span className="text-gold">{confirmed.id}</span> is{" "}
          {confirmed.fulfillment === "pickup"
            ? `ready for pickup at ${branch.shortName}`
            : `being packed at ${branch.shortName}`}
          .
        </p>
        {confirmed.fulfillment === "delivery" && confirmed.delivery ? (
          <div className="mt-6 rounded-sm border border-white/10 bg-white/[0.02] p-4 text-left">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Delivery</p>
            <p className="mt-2 text-sm text-cream">{confirmed.delivery.name}</p>
            <p className="text-sm text-muted">
              {confirmed.delivery.line1}
              {confirmed.delivery.line2 ? `, ${confirmed.delivery.line2}` : ""}
            </p>
            <p className="text-sm text-muted">
              {confirmed.delivery.city}, {confirmed.delivery.state} {confirmed.delivery.zip}
            </p>
            <p className="mt-3 text-xs text-muted">
              A Sam&apos;s driver from {branch.shortName} will be assigned next. Track progress on
              your account or with your tracking code.
            </p>
            {confirmed.tracking ? (
              <p className="mt-2 text-xs uppercase tracking-wider text-gold">
                Tracking {confirmed.tracking}
              </p>
            ) : null}
            {confirmed.tracking ? (
              <Link
                href={`/track?code=${encodeURIComponent(confirmed.tracking)}`}
                className="mt-3 inline-block text-xs text-gold hover:underline"
              >
                Open live tracking
              </Link>
            ) : null}
          </div>
        ) : null}
        <Button className="mt-8" onClick={() => router.push("/shop")}>
          Continue shopping
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-24 text-center text-sm text-muted">Returning to cart…</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-10 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-cream sm:text-4xl">Checkout</h1>
          <p className="mt-1.5 text-sm text-muted">
            {isLoggedIn ? (
              <>
                Checking out as <span className="text-cream">{profile.name || profile.email}</span>
              </>
            ) : (
              <>
                Guest checkout ·{" "}
                <Link href="/login?next=/checkout" className="text-gold hover:text-gold-bright">
                  Sign in
                </Link>
                {" · "}
                <Link href="/signup?next=/checkout" className="text-gold hover:text-gold-bright">
                  Create account
                </Link>
              </>
            )}
          </p>
        </div>
        <Link href="/cart" className="text-sm text-muted hover:text-cream">
          Back to cart
        </Link>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Section title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" invalid={Boolean(fieldErrors.name)} hint={fieldErrors.name}>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError("name");
                  }}
                  autoComplete="name"
                  data-checkout-field="name"
                  aria-invalid={fieldErrors.name ? true : undefined}
                  className={inputClass("name")}
                />
              </Field>
              <Field
                label="Phone"
                invalid={Boolean(fieldErrors.phone)}
                hint={fieldErrors.phone || "10-digit US number"}
              >
                <Input
                  value={phone}
                  onChange={(e) => {
                    const next = formatUsPhone(e.target.value);
                    setPhone(next);
                    if (fieldErrors.phone && (next === "" || isUsPhone(next))) {
                      clearFieldError("phone");
                    }
                  }}
                  onBlur={() => {
                    if (!phone.trim()) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        phone: "Phone number is required",
                      }));
                    } else if (!isUsPhone(phone)) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        phone: "Enter a valid phone like (212) 555-0100",
                      }));
                    }
                  }}
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={14}
                  data-checkout-field="phone"
                  aria-invalid={fieldErrors.phone ? true : undefined}
                  className={inputClass("phone")}
                />
              </Field>
              <Field
                label="Email"
                className="sm:col-span-2"
                invalid={Boolean(fieldErrors.email)}
                hint={fieldErrors.email}
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  autoComplete="email"
                  data-checkout-field="email"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  className={inputClass("email")}
                />
              </Field>
            </div>
          </Section>

          <Section title="Fulfillment">
            <div className="inline-flex w-full rounded-sm border border-white/10 p-0.5 sm:w-auto">
              {(["delivery", "pickup"] as const).map((mode) => {
                const disabled =
                  mode === "delivery" ? !branch.deliveryAvailable : !branch.pickupAvailable;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => setFulfillment(mode)}
                    className={`flex-1 min-h-11 rounded-sm px-4 py-2 text-sm capitalize touch-manipulation sm:flex-none disabled:cursor-not-allowed disabled:opacity-40 ${
                      fulfillment === mode
                        ? "bg-[var(--gold)]/20 text-cream"
                        : "text-muted hover:text-cream"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              {branch.shortName}: {formatDeliveryPricingSummary(branch)}
              {branch.deliveryAvailable && branch.taxRate
                ? ` · Tax ${(branch.taxRate * 100).toFixed(3).replace(/\.?0+$/, "")}%`
                : ""}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {getAllLocations().map((loc) => {
                const cover = analyzeCartAvailability(items, loc.id);
                const ok = !cover.hasConflicts && items.length > 0;
                const selected = branchId === loc.id;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => switchShoppingStore(loc.id)}
                    className={`min-h-11 rounded-sm border px-3 py-2 text-left text-sm transition touch-manipulation ${
                      selected
                        ? "border-(--gold)/50 bg-(--gold)/10 text-cream"
                        : "border-white/10 text-muted hover:border-white/25 hover:text-cream"
                    }`}
                  >
                    <span className="block">{loc.shortName}</span>
                    {items.length > 0 ? (
                      <span
                        className={`text-[10px] uppercase tracking-wider ${
                          ok ? "text-(--success)" : "text-(--danger)"
                        }`}
                      >
                        {ok ? "In stock" : `${cover.unavailable.length} missing`}
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/35">{loc.city}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {fulfillment === "pickup" ? (
              <p className="mt-3 text-xs text-muted">
                Pickup at {branch.address}, {branch.city}. Bring ID matching the name on the order.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted">
                Sam&apos;s drivers run this order from {branch.shortName}.
              </p>
            )}

            {!availability.hasConflicts && items.length > 0 ? (
              <p className="mt-2 text-xs text-gold">
                All {availability.lines.length} bottle
                {availability.lines.length === 1 ? "" : "s"} available at {branch.shortName}.
              </p>
            ) : null}
          </Section>

          {availability.hasConflicts ? <BranchAvailabilityPanel compact /> : null}

          {fulfillment === "delivery" ? (
            <Section title="Delivery address">
              {isLoggedIn && profile.addresses.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {profile.addresses.map((address) => (
                    <button
                      key={address.id}
                      type="button"
                      onClick={() => applySavedAddress(address)}
                      className="rounded-sm border border-white/10 px-2.5 py-1.5 text-left text-xs text-muted hover:border-(--gold)/40 hover:text-cream"
                    >
                      <span className="mr-1.5 uppercase tracking-wider text-gold">{address.label}</span>
                      {address.line1}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  label="Street address"
                  className="sm:col-span-2"
                  invalid={Boolean(fieldErrors.line1)}
                  hint={fieldErrors.line1}
                >
                  <Input
                    value={line1}
                    onChange={(e) => {
                      setLine1(e.target.value);
                      clearFieldError("line1");
                    }}
                    autoComplete="address-line1"
                    data-checkout-field="line1"
                    aria-invalid={fieldErrors.line1 ? true : undefined}
                    className={inputClass("line1")}
                  />
                </Field>
                <Field label="Apt / suite">
                  <Input
                    value={line2}
                    onChange={(e) => setLine2(e.target.value)}
                    autoComplete="address-line2"
                    className={fieldClass}
                  />
                </Field>
                <Field
                  label="City"
                  className="sm:col-span-1"
                  invalid={Boolean(fieldErrors.city)}
                  hint={fieldErrors.city}
                >
                  <Input
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      clearFieldError("city");
                    }}
                    autoComplete="address-level2"
                    data-checkout-field="city"
                    aria-invalid={fieldErrors.city ? true : undefined}
                    className={inputClass("city")}
                  />
                </Field>
                <Field label="State" invalid={Boolean(fieldErrors.state)} hint={fieldErrors.state}>
                  <Input
                    value={state}
                    onChange={(e) => {
                      setState(e.target.value);
                      clearFieldError("state");
                    }}
                    autoComplete="address-level1"
                    data-checkout-field="state"
                    aria-invalid={fieldErrors.state ? true : undefined}
                    className={inputClass("state")}
                  />
                </Field>
                <Field label="ZIP" invalid={Boolean(fieldErrors.zip)} hint={fieldErrors.zip}>
                  <Input
                    value={zip}
                    onChange={(e) => {
                      setZip(e.target.value.replace(/[^\d-]/g, "").slice(0, 10));
                      clearFieldError("zip");
                    }}
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength={10}
                    data-checkout-field="zip"
                    aria-invalid={fieldErrors.zip ? true : undefined}
                    className={inputClass("zip")}
                  />
                </Field>
                <Field label="Delivery notes" className="sm:col-span-3">
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={fieldClass}
                  />
                </Field>
              </div>
              {isLoggedIn ? (
                <label className="mt-3 flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                  />
                  Save this address to my account
                </label>
              ) : null}
            </Section>
          ) : null}

          <Section title="Payment">
            <p className="mb-3 text-[11px] text-white/35">Stripe demo — no real charges. Test card 4242…</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Card number"
                className="sm:col-span-3"
                invalid={Boolean(fieldErrors.card)}
                hint={fieldErrors.card}
              >
                <Input
                  value={card}
                  onChange={(e) => {
                    setCard(formatCardNumber(e.target.value));
                    clearFieldError("card");
                  }}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  data-checkout-field="card"
                  aria-invalid={fieldErrors.card ? true : undefined}
                  className={inputClass("card")}
                />
              </Field>
              <Field label="Expiry" invalid={Boolean(fieldErrors.expiry)} hint={fieldErrors.expiry}>
                <Input
                  value={expiry}
                  onChange={(e) => {
                    setExpiry(formatExpiry(e.target.value));
                    clearFieldError("expiry");
                  }}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  maxLength={5}
                  data-checkout-field="expiry"
                  aria-invalid={fieldErrors.expiry ? true : undefined}
                  className={inputClass("expiry")}
                />
              </Field>
              <Field label="CVC" invalid={Boolean(fieldErrors.cvc)} hint={fieldErrors.cvc}>
                <Input
                  value={cvc}
                  onChange={(e) => {
                    setCvc(e.target.value.replace(/\D/g, "").slice(0, 4));
                    clearFieldError("cvc");
                  }}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  maxLength={4}
                  data-checkout-field="cvc"
                  aria-invalid={fieldErrors.cvc ? true : undefined}
                  className={inputClass("cvc")}
                />
              </Field>
            </div>
          </Section>

          <label
            className={`flex min-h-11 items-start gap-3 rounded-sm border px-3 py-3 text-sm touch-manipulation ${
              fieldErrors.ageConfirmed
                ? "border-red-400/50 bg-red-400/5 text-red-200"
                : "border-white/10 bg-white/[0.02] text-muted"
            }`}
          >
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => {
                setAgeConfirmed(e.target.checked);
                clearFieldError("ageConfirmed");
              }}
              className="mt-0.5 h-4 w-4 accent-[var(--gold)]"
            />
            <span>
              I confirm I am 21 years of age or older and will present valid ID on pickup or delivery.
            </span>
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <Button
            className="w-full min-h-12 lg:hidden"
            size="lg"
            onClick={() => void placeOrder()}
            disabled={!canPlace}
          >
            {placeLabel}
          </Button>
        </div>

        <aside className="glass sticky top-[calc(4.5rem+env(safe-area-inset-top,0px))] h-fit p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
            Order · {branch.shortName}
          </p>
          <ul className="mt-3 space-y-2.5 text-sm">
            {items.map((i) => {
              const p = getProductById(i.productId);
              if (!p) return null;
              const price = getPriceForLocation(branchId, p.id);
              const stock = getAvailable(branchId, p.id);
              const ok = stock >= i.quantity;
              return (
                <li
                  key={i.productId}
                  className={`flex items-start justify-between gap-3 border-b border-white/5 pb-2.5 ${
                    ok ? "" : "opacity-80"
                  }`}
                >
                  <Link href={`/products/${p.slug}`} className="flex min-w-0 items-start gap-2.5">
                    <span className="relative h-12 w-8 shrink-0 bg-white/5">
                      <Image
                        src={p.images[0]}
                        alt={p.name}
                        fill
                        className="object-contain p-0.5"
                        sizes="32px"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className={`block leading-snug ${ok ? "text-cream" : "text-(--danger)"}`}>
                        {p.name}
                      </span>
                      <span className="text-xs text-muted">× {i.quantity}</span>
                    </span>
                  </Link>
                  <div className="shrink-0 text-right">
                    <span className={ok ? "text-gold" : "text-(--danger) line-through"}>
                      {formatPrice(price * i.quantity)}
                    </span>
                    {!ok && (
                      <button
                        type="button"
                        className="mt-1 block text-[10px] uppercase tracking-wider text-muted hover:text-red-300"
                        onClick={() => removeItem(i.productId)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-sm">
            <OrderSummaryCard
              store={branch}
              fulfillment={fulfillment}
              etaLabel={
                fulfillment === "delivery"
                  ? deliveryEtaForStore(branch, {
                      lat: customerLat,
                      lng: customerLng,
                      zip: customerZip || zip,
                    })
                  : pickupEtaForStore(branch)
              }
              addressSummary={
                fulfillment === "delivery"
                  ? line1
                    ? `${line1}${city ? `, ${city}` : ""}${zip ? ` ${zip}` : ""}`
                    : "Enter delivery address below"
                  : `Pickup at ${branch.address}, ${branch.city}`
              }
              paymentSummary={
                card.replace(/\s/g, "").length >= 4
                  ? `Card ···· ${card.replace(/\s/g, "").slice(-4)}`
                  : "Card at payment step"
              }
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
                  : []),
                ...(loyalty.discount > 0
                  ? [
                      {
                        label: `Loyalty (${loyalty.points} pts)`,
                        value: `−${formatPrice(loyalty.discount)}`,
                      },
                    ]
                  : [{ label: "Discounts", value: formatPrice(0), muted: true }]),
                {
                  label: fulfillment === "delivery" ? "Delivery fee" : "Pickup fee",
                  value: shipping === 0 ? "Free" : formatPrice(shipping),
                },
                { label: "Tax", value: formatPrice(tax) },
                { label: "Total", value: formatPrice(total), emphasis: true },
              ]}
            />
            {coupon && couponQuery.isFetching ? (
              <p className="text-[10px] text-muted">Checking coupon…</p>
            ) : null}
            {fulfillment === "delivery" && freeDeliveryGap != null ? (
              <p className="text-[10px] leading-relaxed text-muted">
                Add {formatPrice(freeDeliveryGap)} more for free delivery from {branch.shortName}.
              </p>
            ) : null}
          </div>
          {error ? <p className="mt-3 hidden text-sm text-red-300 lg:block">{error}</p> : null}
          <Button
            className="mt-4 hidden w-full min-h-12 lg:inline-flex"
            size="lg"
            onClick={() => void placeOrder()}
            disabled={!canPlace}
          >
            {placeLabel}
          </Button>
        </aside>
      </div>
    </div>
  );
}
