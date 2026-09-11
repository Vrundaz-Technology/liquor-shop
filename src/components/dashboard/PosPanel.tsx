"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  MapPin,
  Minus,
  Plus,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { getCategories } from "@/data/categories";
import { getAllProducts, getProductById } from "@/data/products";
import { getLocationById, getPriceForLocation } from "@/data/locations";
import { useInventoryStore } from "@/store/inventory";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { useUserStore } from "@/store/user";
import { useBranchStore } from "@/store/branch";
import {
  getAvailableStock,
  otherLocationsForDemand,
} from "@/lib/cart-availability";
import { calculateShipping, calculateTax } from "@/lib/fulfillment-pricing";
import { getCouponDiscount } from "@/lib/commerce";
import { isDbConnected } from "@/lib/runtime-data";
import { apiPlacePosOrder, apiValidateCoupon } from "@/lib/api-mutations";
import { hasPermission } from "@/lib/auth/permissions";
import { accessibleLocations, canAccessLocation } from "@/lib/auth/location-access";
import { formatPrice, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { SmartImage } from "@/components/ui/SmartImage";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import type { CategorySlug, Order, OrderFulfillment, Product } from "@/types";

type TicketLine = {
  productId: string;
  quantity: number;
};

type StockFilter = "all" | "in" | "out";
type SortMode = "featured" | "name" | "price-asc" | "price-desc" | "stock";
type PaymentMethod = "cash" | "card" | "other";

type Props = {
  locationId: string;
  onLocationChange?: (id: string) => void;
};

type TicketLineView = {
  productId: string;
  quantity: number;
  product: Product;
  unitPrice: number;
  stock: number;
  lineTotal: number;
  available: boolean;
  shortfall: number;
};

function productImage(product: Product) {
  return product.images?.[0] || "";
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const STOCK_FILTERS = [
  { id: "all" as const, label: "All" },
  { id: "in" as const, label: "In stock" },
  { id: "out" as const, label: "Out here" },
];

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "name", label: "Name A–Z" },
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
  { value: "stock", label: "Most stock" },
];

export function PosPanel({ locationId, onLocationChange }: Props) {
  const profile = useUserStore((s) => s.profile);
  const addOrder = useUserStore((s) => s.addOrder);
  const setBranch = useBranchStore((s) => s.setBranch);
  const revision = useInventoryStore((s) => s.revision);
  void revision;

  const stores = useMemo(() => accessibleLocations(profile), [profile]);
  const canOpen = hasPermission(profile, "pos.access");
  const canSell = hasPermission(profile, "pos.sell");

  const [category, setCategory] = useState<CategorySlug | "all">("all");
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("featured");
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [fulfillment, setFulfillment] = useState<OrderFulfillment>("pos");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [coupon, setCoupon] = useState("");
  const [deliveryLine1, setDeliveryLine1] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Order | null>(null);
  const [mobileTicketOpen, setMobileTicketOpen] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<{
    key: number;
    productId: string;
    name: string;
    quantity: number;
  } | null>(null);

  const location = getLocationById(locationId) ?? stores[0];
  const categories = getCategories();
  const products = getAllProducts();

  useEffect(() => {
    if (!location) return;
    if (!canAccessLocation(profile, location.id) && stores[0]) {
      onLocationChange?.(stores[0].id);
      setBranch(stores[0].id);
    }
  }, [location, onLocationChange, profile, setBranch, stores]);

  useEffect(() => {
    if (location && fulfillment === "pickup" && !location.pickupAvailable) {
      setFulfillment("pos");
    }
    if (location && fulfillment === "delivery" && !location.deliveryAvailable) {
      setFulfillment("pos");
    }
  }, [fulfillment, location]);

  useEffect(() => {
    if (fulfillment === "delivery") setCustomerOpen(true);
  }, [fulfillment]);

  useEffect(() => {
    if (!mobileTicketOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileTicketOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileTicketOpen]);

  useEffect(() => {
    if (!justAddedId) return;
    const t = window.setTimeout(() => setJustAddedId(null), 900);
    return () => window.clearTimeout(t);
  }, [justAddedId]);

  useEffect(() => {
    if (!addedToast) return;
    const t = window.setTimeout(() => setAddedToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [addedToast]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(null), 6000);
    return () => window.clearTimeout(t);
  }, [success]);

  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      const stock = getAvailableStock(locationId, p.id);
      if (stockFilter === "in" && stock <= 0) return false;
      if (stockFilter === "out" && stock > 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      const stockA = getAvailableStock(locationId, a.id);
      const stockB = getAvailableStock(locationId, b.id);
      if (sortMode === "name") return a.name.localeCompare(b.name);
      if (sortMode === "price-asc") {
        return (
          getPriceForLocation(locationId, a.id) - getPriceForLocation(locationId, b.id)
        );
      }
      if (sortMode === "price-desc") {
        return (
          getPriceForLocation(locationId, b.id) - getPriceForLocation(locationId, a.id)
        );
      }
      if (sortMode === "stock") return stockB - stockA;
      if ((stockA > 0) !== (stockB > 0)) return stockA > 0 ? -1 : 1;
      if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [category, locationId, products, query, sortMode, stockFilter]);

  const filtersActive =
    Boolean(query.trim()) || category !== "all" || stockFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setStockFilter("all");
  };

  const grouped = useMemo(() => {
    if (category !== "all") {
      const cat = categories.find((c) => c.slug === category);
      return [{ slug: category, name: cat?.name ?? category, items: catalog }];
    }
    const byCat = new Map<string, Product[]>();
    for (const p of catalog) {
      const list = byCat.get(p.category) ?? [];
      list.push(p);
      byCat.set(p.category, list);
    }
    return categories
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        items: byCat.get(c.slug) ?? [],
      }))
      .filter((g) => g.items.length > 0);
  }, [catalog, categories, category]);

  const ticketLines = useMemo(() => {
    return ticket
      .map((line) => {
        const product = getProductById(line.productId);
        if (!product) return null;
        const unitPrice = getPriceForLocation(locationId, product.id);
        const stock = getAvailableStock(locationId, product.id);
        return {
          ...line,
          product,
          unitPrice,
          stock,
          lineTotal: unitPrice * line.quantity,
          available: stock >= line.quantity,
          shortfall: Math.max(0, line.quantity - stock),
        };
      })
      .filter(Boolean) as TicketLineView[];
  }, [locationId, ticket]);

  const subtotal = ticketLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const promoItems = useMemo(
    () =>
      ticketLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        price: line.unitPrice,
        category: line.product.category,
        brand: line.product.brand,
      })),
    [ticketLines],
  );
  const couponQuery = useQuery({
    queryKey: [
      "pos-coupon",
      coupon,
      locationId,
      Math.round(subtotal * 100),
      promoItems.map((i) => `${i.productId}:${i.quantity}`).join("|"),
    ],
    enabled: Boolean(coupon.trim()) && subtotal > 0,
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      if (!isDbConnected()) {
        const amount = getCouponDiscount(coupon, subtotal);
        if (!amount) throw new Error("Invalid coupon");
        return { discount: amount, freeDelivery: false, name: coupon };
      }
      return apiValidateCoupon({
        code: coupon,
        locationId,
        subtotal,
        items: promoItems,
      });
    },
  });
  const discount = couponQuery.isError
    ? 0
    : (couponQuery.data?.discount ??
      (!isDbConnected() ? getCouponDiscount(coupon || null, subtotal) : 0));
  const shippingBase = location
    ? calculateShipping(subtotal - discount, fulfillment, location)
    : 0;
  const shipping = couponQuery.data?.freeDelivery ? 0 : shippingBase;
  const tax = location ? calculateTax(subtotal - discount, location) : 0;
  const total = subtotal - discount + shipping + tax;
  const hasConflicts = ticketLines.some((line) => !line.available);
  const itemCount = ticketLines.reduce((sum, line) => sum + line.quantity, 0);

  const setRegisterLocation = (id: string) => {
    onLocationChange?.(id);
    setBranch(id);
    setError("");
    setSuccess(null);
  };

  const addToTicket = (productId: string, qty = 1) => {
    const stock = getAvailableStock(locationId, productId);
    if (stock <= 0) {
      setError("Out of stock at this register. Switch store or pick another bottle.");
      return;
    }
    const product = getProductById(productId);
    const existing = ticket.find((l) => l.productId === productId);
    const nextQty = existing
      ? Math.min(stock, existing.quantity + qty)
      : Math.min(stock, qty);

    setSuccess(null);
    setError("");
    setJustAddedId(productId);
    setTicket((prev) => {
      const current = prev.find((l) => l.productId === productId);
      if (current) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, quantity: nextQty } : l,
        );
      }
      return [...prev, { productId, quantity: nextQty }];
    });
    if (product) {
      setAddedToast({
        key: Date.now(),
        productId,
        name: product.name,
        quantity: nextQty,
      });
    }
  };

  const setLineQty = (productId: string, quantity: number) => {
    const stock = getAvailableStock(locationId, productId);
    setTicket((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.productId !== productId);
      return prev.map((l) =>
        l.productId === productId
          ? { ...l, quantity: Math.min(stock, Math.max(1, quantity)) }
          : l,
      );
    });
  };

  const clearTicket = () => {
    setTicket([]);
    setCoupon("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setDeliveryLine1("");
    setDeliveryCity("");
    setDeliveryState("");
    setDeliveryZip("");
    setCustomerOpen(false);
    setError("");
  };

  const completeSale = async () => {
    if (!canSell || !location) return;
    if (!ticketLines.length) {
      setError("Add bottles to the ticket first.");
      return;
    }
    if (hasConflicts) {
      setError("Fix stock conflicts before completing the sale.");
      return;
    }

    const delivery =
      fulfillment === "delivery"
        ? {
            name: customerName.trim() || "Delivery Guest",
            phone: customerPhone.trim() || "(000) 000-0000",
            line1: deliveryLine1.trim(),
            city: deliveryCity.trim(),
            state: deliveryState.trim(),
            zip: deliveryZip.trim(),
          }
        : undefined;

    if (fulfillment === "delivery") {
      if (!delivery?.line1 || !delivery.city || !delivery.state || !delivery.zip) {
        setCustomerOpen(true);
        setError("Enter a delivery address for this order.");
        return;
      }
      if (!/^\(\d{3}\) \d{3}-\d{4}$/.test(delivery.phone)) {
        setCustomerOpen(true);
        setError("Enter a valid delivery phone like (212) 555-0100.");
        return;
      }
    }

    setSubmitting(true);
    setError("");
    try {
      if (isDbConnected()) {
        const result = await apiPlacePosOrder({
          locationId: location.id,
          fulfillment,
          paymentMethod,
          customerName: customerName.trim() || undefined,
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          coupon: coupon.trim() || null,
          delivery,
          items: ticketLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
        });
        useInventoryStore
          .getState()
          .syncFromServer(
            result.inventory.stocks,
            result.inventory.seats,
            result.inventory.hidden,
            result.inventory.reserved,
          );
        addOrder(result.order, { loyaltyPoints: result.loyaltyPoints });
        setSuccess(result.order);
        clearTicket();
        setMobileTicketOpen(false);
        return;
      }

      const orderId = `POS-${Date.now().toString(36).toUpperCase()}`;
      const deducted = useInventoryStore
        .getState()
        .deductOrder(
          location.id,
          ticketLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            fulfillment,
          })),
          orderId,
        );
      if (!deducted.ok) {
        setError("Stock changed while ringing up. Update quantities and try again.");
        return;
      }
      const order: Order = {
        id: orderId,
        date: new Date().toISOString().slice(0, 10),
        status:
          fulfillment === "pos"
            ? "delivered"
            : fulfillment === "pickup"
              ? "ready_for_pickup"
              : "new",
        items: ticketLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          price: l.unitPrice,
        })),
        total,
        fulfillment,
        locationId: location.id,
        delivery,
        deliveryStatus: fulfillment === "delivery" ? "unassigned" : undefined,
      };
      addOrder(order);
      setSuccess(order);
      clearTicket();
      setMobileTicketOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete the sale. Check stock and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!canOpen) {
    return (
      <div className="mt-4 rounded-sm border border-white/10 bg-white/[0.02] p-5 sm:p-6">
        <p className="text-sm text-muted">
          Point of sale is not enabled for this account. Ask an owner to grant{" "}
          <AbbrTooltip term="POS" /> access.
        </p>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="mt-4 rounded-sm border border-white/10 bg-white/[0.02] p-5 sm:p-6">
        <p className="text-sm text-muted">No accessible store for this account.</p>
      </div>
    );
  }

  const categoryChips = (
    <div className="h-scroll gap-2 pb-0.5" role="tablist" aria-label="Product categories">
      <button
        type="button"
        role="tab"
        aria-selected={category === "all"}
        onClick={() => setCategory("all")}
        className={cn(
          "min-h-10 shrink-0 rounded-sm border px-3.5 py-2 text-xs uppercase tracking-wider touch-manipulation transition",
          category === "all"
            ? "border-(--gold)/50 bg-(--gold)/12 text-gold"
            : "border-white/10 text-muted hover:border-white/20 hover:text-cream",
        )}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.slug}
          type="button"
          role="tab"
          aria-selected={category === cat.slug}
          onClick={() => setCategory(cat.slug)}
          className={cn(
            "min-h-10 shrink-0 rounded-sm border px-3.5 py-2 text-xs uppercase tracking-wider touch-manipulation transition",
            category === cat.slug
              ? "border-(--gold)/50 bg-(--gold)/12 text-gold"
              : "border-white/10 text-muted hover:border-white/20 hover:text-cream",
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );

  const catalogToolbar = (
    <div className="space-y-3">
      <SearchInput
        bare
        value={query}
        onChange={setQuery}
        placeholder="Search by name or brand…"
        aria-label="Search bottles"
        inputClassName="bg-white/[0.03]"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STOCK_FILTERS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStockFilter(opt.id)}
              className={cn(
                "min-h-9 rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-wider touch-manipulation transition",
                stockFilter === opt.id
                  ? "border-(--gold)/50 bg-(--gold)/12 text-gold"
                  : "border-white/10 text-muted hover:border-white/20 hover:text-cream",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:ml-auto sm:w-40">
          <Select
            ariaLabel="Sort products"
            value={sortMode}
            onChange={(v) => setSortMode(v as SortMode)}
            options={SORT_OPTIONS}
          />
        </div>
      </div>
      {filtersActive ? (
        <ActiveFiltersBar
          className="mt-1"
          resultCount={catalog.length}
          chips={[
            ...(query.trim()
              ? [
                  {
                    id: "q",
                    label: `“${query.trim()}”`,
                    onRemove: () => setQuery(""),
                  },
                ]
              : []),
            ...(category !== "all"
              ? [
                  {
                    id: "category",
                    label: categories.find((c) => c.slug === category)?.name ?? category,
                    onRemove: () => setCategory("all"),
                  },
                ]
              : []),
            ...(stockFilter !== "all"
              ? [
                  {
                    id: "stock",
                    label:
                      STOCK_FILTERS.find((o) => o.id === stockFilter)?.label ?? stockFilter,
                    onRemove: () => setStockFilter("all"),
                  },
                ]
              : []),
          ]}
          onClearAll={clearFilters}
        />
      ) : null}
    </div>
  );

  const ticketQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of ticket) {
      map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity);
    }
    return map;
  }, [ticket]);

  const productGrid = (columns: string) =>
    grouped.length === 0 ? (
      <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
        <Store size={28} className="text-muted/50" />
        <p className="mt-3 text-sm text-muted">No bottles match these filters.</p>
        <button
          type="button"
          onClick={clearFilters}
          className="mt-3 text-xs uppercase tracking-wider text-gold hover:underline"
        >
          Clear filters
        </button>
      </div>
    ) : (
      <div className="space-y-7 sm:space-y-8">
        {grouped.map((group) => (
          <div key={group.slug}>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-display text-base text-cream sm:text-lg">{group.name}</h3>
              <span className="text-[11px] tabular-nums text-muted">{group.items.length}</span>
            </div>
            <div className={cn("grid gap-2.5 sm:gap-3", columns)}>
              {group.items.map((product) => (
                <PosProductCard
                  key={product.id}
                  product={product}
                  locationId={locationId}
                  ticketQty={ticketQtyByProduct.get(product.id) ?? 0}
                  highlighted={justAddedId === product.id}
                  onAdd={() => addToTicket(product.id)}
                  onSwitchLocation={setRegisterLocation}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  const ticketPanel = (
    <TicketPanel
      location={location}
      fulfillment={fulfillment}
      setFulfillment={setFulfillment}
      paymentMethod={paymentMethod}
      setPaymentMethod={setPaymentMethod}
      ticketLines={ticketLines}
      locationId={locationId}
      setRegisterLocation={setRegisterLocation}
      setLineQty={setLineQty}
      customerOpen={customerOpen}
      setCustomerOpen={setCustomerOpen}
      customerName={customerName}
      setCustomerName={setCustomerName}
      customerEmail={customerEmail}
      setCustomerEmail={setCustomerEmail}
      customerPhone={customerPhone}
      setCustomerPhone={setCustomerPhone}
      coupon={coupon}
      setCoupon={setCoupon}
      deliveryLine1={deliveryLine1}
      setDeliveryLine1={setDeliveryLine1}
      deliveryCity={deliveryCity}
      setDeliveryCity={setDeliveryCity}
      deliveryState={deliveryState}
      setDeliveryState={setDeliveryState}
      deliveryZip={deliveryZip}
      setDeliveryZip={setDeliveryZip}
      subtotal={subtotal}
      discount={discount}
      shipping={shipping}
      tax={tax}
      total={total}
      error={error}
      hasConflicts={hasConflicts}
      submitting={submitting}
      canSell={canSell}
      onComplete={() => void completeSale()}
      onClear={clearTicket}
    />
  );

  return (
    <div className="relative mt-0 space-y-3 sm:mt-0 sm:space-y-4">
      <AnimatePresence>
        {addedToast ? (
          <motion.div
            key={addedToast.key}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed left-1/2 top-[calc(4.5rem+env(safe-area-inset-top,0px))] z-[80] w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 sm:top-[calc(5.25rem+env(safe-area-inset-top,0px))] lg:top-24"
          >
            <div className="pointer-events-auto flex items-start gap-3 rounded-sm border border-(--gold)/35 bg-(--bg-elevated) p-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--gold)/15 text-gold">
                <Check size={17} strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
                  Added to cart
                </p>
                <p className="mt-1 truncate font-display text-base leading-tight text-cream sm:text-lg">
                  {addedToast.name}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {addedToast.quantity} in cart
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setAddedToast(null)}
                className="shrink-0 cursor-pointer rounded-sm p-1 text-muted hover:bg-white/5 hover:text-cream"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!isDbConnected() ? (
        <ConnectionNotice feature="save point-of-sale sales to the server" preview />
      ) : null}

      {success ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-sm border border-(--success)/35 bg-(--success)/10 px-3 py-3 sm:px-4"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-(--success)">Sale complete</p>
            <p className="mt-0.5 text-xs text-cream/80">
              {success.id} · {formatPrice(success.total)} · stock updated at {location.shortName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setSuccess(null)}
            className="shrink-0 rounded-sm p-1.5 text-muted hover:bg-white/5 hover:text-cream"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {error && !mobileTicketOpen ? (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-sm border border-(--danger)/35 bg-(--danger)/10 px-3 py-3 sm:px-4"
        >
          <p className="text-xs text-(--danger) sm:text-sm">{error}</p>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
            className="shrink-0 rounded-sm p-1.5 text-muted hover:bg-white/5 hover:text-cream"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {/* Compact store switch — mobile / tablet (desktop uses page header) */}
      <div className="flex items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2.5 lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Selling from</p>
          <p className="truncate text-sm text-cream">
            {location.shortName}
            <span className="text-muted"> · {location.city}</span>
          </p>
        </div>
        <label className="w-[9.5rem] shrink-0 sm:w-[11rem]">
          <span className="sr-only">Change store</span>
          <NativeSelect
            value={location.id}
            onChange={(e) => setRegisterLocation(e.target.value)}
            className="border-white/15 py-2 pl-2.5 text-xs hover:border-white/15 focus:border-(--gold)/45"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shortName}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      {/* Desktop XL: 3 columns — uses full viewport width */}
      <div className="hidden overflow-hidden rounded-sm border border-white/10 bg-[#0c0c0c] xl:grid xl:h-[min(82vh,920px)] xl:grid-cols-[220px_minmax(0,1fr)_380px] 2xl:grid-cols-[240px_minmax(0,1fr)_400px]">
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-black/40">
          <div className="shrink-0 border-b border-white/10 px-4 py-3.5">
            <p className="flex items-center gap-2 font-display text-lg text-cream">
              <Store size={17} className="text-gold" />
              <AbbrTooltip term="POS" />
            </p>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" aria-label="POS categories">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={cn(
                "mb-1 w-full rounded-sm px-3 py-2.5 text-left text-sm touch-manipulation transition",
                category === "all"
                  ? "bg-(--gold)/15 text-gold"
                  : "text-muted hover:bg-white/5 hover:text-cream",
              )}
            >
              All bottles
            </button>
            {categories.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                onClick={() => setCategory(cat.slug)}
                className={cn(
                  "mb-1 w-full rounded-sm px-3 py-2.5 text-left text-sm touch-manipulation transition",
                  category === cat.slug
                    ? "bg-(--gold)/15 text-gold"
                    : "text-muted hover:bg-white/5 hover:text-cream",
                )}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-white/10 p-4">{catalogToolbar}</div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {productGrid("grid-cols-2 xl:grid-cols-3")}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-black/30">
          {ticketPanel}
        </aside>
      </div>

      {/* Tablet / laptop: products + sticky ticket */}
      <div className="hidden overflow-hidden rounded-sm border border-white/10 bg-[#0c0c0c] md:grid md:h-[min(80vh,860px)] md:grid-cols-[minmax(0,1fr)_300px] xl:hidden lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-0 flex-col border-r border-white/10">
          <div className="shrink-0 space-y-3 border-b border-white/10 p-3 lg:p-4">
            {categoryChips}
            {catalogToolbar}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 lg:p-4">
            {productGrid("grid-cols-2 lg:grid-cols-3 xl:grid-cols-3")}
          </div>
        </section>
        <aside className="flex min-h-0 flex-col bg-black/30">{ticketPanel}</aside>
      </div>

      {/* Phone */}
      <div className="space-y-3 md:hidden">
        <div className="rounded-sm border border-white/10 bg-[#0c0c0c] p-3">
          {categoryChips}
          <div className="mt-3">{catalogToolbar}</div>
        </div>

        <div className="pb-24">{productGrid("grid-cols-2")}</div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#070707] via-[#070707]/95 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 sm:px-5">
          <div className="pointer-events-auto w-full">
            <Button
              size="lg"
              className="w-full shadow-[0_10px_40px_rgba(0,0,0,0.55)]"
              onClick={() => setMobileTicketOpen(true)}
            >
              <ShoppingCart size={16} />
              {itemCount === 0
                ? "Open ticket"
                : `Ticket · ${itemCount} item${itemCount === 1 ? "" : "s"} · ${formatPrice(total)}`}
            </Button>
          </div>
        </div>

        {mobileTicketOpen ? (
          <div
            className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]"
            role="dialog"
            aria-modal="true"
            aria-label="Current ticket"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="min-w-0">
                <p className="font-display text-xl text-cream">Ticket</p>
                <p className="text-xs text-muted">
                  {itemCount} item{itemCount === 1 ? "" : "s"} · {location.shortName}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close ticket"
                onClick={() => setMobileTicketOpen(false)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-white/15 text-muted touch-manipulation hover:text-cream"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{ticketPanel}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TicketPanel({
  location,
  fulfillment,
  setFulfillment,
  paymentMethod,
  setPaymentMethod,
  ticketLines,
  locationId,
  setRegisterLocation,
  setLineQty,
  customerOpen,
  setCustomerOpen,
  customerName,
  setCustomerName,
  customerEmail,
  setCustomerEmail,
  customerPhone,
  setCustomerPhone,
  coupon,
  setCoupon,
  deliveryLine1,
  setDeliveryLine1,
  deliveryCity,
  setDeliveryCity,
  deliveryState,
  setDeliveryState,
  deliveryZip,
  setDeliveryZip,
  subtotal,
  discount,
  shipping,
  tax,
  total,
  error,
  hasConflicts,
  submitting,
  canSell,
  onComplete,
  onClear,
}: {
  location: NonNullable<ReturnType<typeof getLocationById>>;
  fulfillment: OrderFulfillment;
  setFulfillment: (v: OrderFulfillment) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (v: PaymentMethod) => void;
  ticketLines: TicketLineView[];
  locationId: string;
  setRegisterLocation: (id: string) => void;
  setLineQty: (productId: string, quantity: number) => void;
  customerOpen: boolean;
  setCustomerOpen: (v: boolean) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerEmail: string;
  setCustomerEmail: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  coupon: string;
  setCoupon: (v: string) => void;
  deliveryLine1: string;
  setDeliveryLine1: (v: string) => void;
  deliveryCity: string;
  setDeliveryCity: (v: string) => void;
  deliveryState: string;
  setDeliveryState: (v: string) => void;
  deliveryZip: string;
  setDeliveryZip: (v: string) => void;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  error: string;
  hasConflicts: boolean;
  submitting: boolean;
  canSell: boolean;
  onComplete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-white/10 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            label="Order type"
            value={fulfillment}
            onChange={(v) => setFulfillment(v as OrderFulfillment)}
            options={[
              { value: "pos", label: "In-store" },
              ...(location.pickupAvailable
                ? [{ value: "pickup", label: "Pickup" }]
                : []),
              ...(location.deliveryAvailable
                ? [{ value: "delivery", label: "Delivery" }]
                : []),
            ]}
          />
          <Select
            label="Payment"
            value={paymentMethod}
            onChange={(v) => setPaymentMethod(v as PaymentMethod)}
            options={[
              { value: "cash", label: "Cash" },
              { value: "card", label: "Card" },
              { value: "other", label: "Other" },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
        {ticketLines.length === 0 ? (
          <div className="flex min-h-[10rem] flex-col items-center justify-center px-3 py-8 text-center sm:min-h-[12rem]">
            <ShoppingCart size={32} className="text-muted/45" />
            <p className="mt-3 text-sm text-cream">Ticket is empty</p>
            <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted">
              Tap the + on any bottle to add it. Stock is checked for this store first.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {ticketLines.map((line) => {
              const alts =
                !line.available || line.stock < line.quantity
                  ? otherLocationsForDemand(line.productId, locationId, line.quantity)
                  : [];
              return (
                <li
                  key={line.productId}
                  className={cn(
                    "rounded-sm border p-2.5 sm:p-3",
                    line.available
                      ? "border-white/10 bg-white/[0.02]"
                      : "border-(--danger)/35 bg-(--danger)/8",
                  )}
                >
                  <div className="flex gap-2.5 sm:gap-3">
                    <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-sm bg-black/40">
                      {productImage(line.product) ? (
                        <SmartImage
                          src={productImage(line.product)}
                          alt=""
                          fill
                          className="object-contain p-1"
                          sizes="44px"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-cream">{line.product.name}</p>
                          <p className="text-[11px] text-muted">
                            {formatPrice(line.unitPrice)} each · {line.stock} here
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${line.product.name}`}
                          onClick={() => setLineQty(line.productId, 0)}
                          className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-sm text-muted touch-manipulation hover:bg-white/5 hover:text-(--danger)"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-sm border border-white/15">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => setLineQty(line.productId, line.quantity - 1)}
                            className="flex min-h-10 min-w-10 items-center justify-center text-cream touch-manipulation hover:bg-white/5"
                          >
                            <Minus size={15} />
                          </button>
                          <span className="w-8 text-center text-sm tabular-nums text-cream">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            disabled={line.quantity >= line.stock}
                            onClick={() => setLineQty(line.productId, line.quantity + 1)}
                            className="flex min-h-10 min-w-10 items-center justify-center text-cream touch-manipulation hover:bg-white/5 disabled:opacity-30"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <p className="text-sm font-medium tabular-nums text-cream">
                          {formatPrice(line.lineTotal)}
                        </p>
                      </div>
                      {!line.available ? (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-[11px] leading-snug text-(--danger)">
                            Need {line.shortfall} more — only {line.stock} at this store.
                          </p>
                          {alts.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {alts.slice(0, 3).map((row) => (
                                <button
                                  key={row.location.id}
                                  type="button"
                                  onClick={() => setRegisterLocation(row.location.id)}
                                  className="inline-flex min-h-9 items-center gap-1 border border-(--gold)/35 bg-(--gold)/8 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-gold touch-manipulation hover:bg-(--gold)/15"
                                >
                                  <MapPin size={10} />
                                  Use {row.location.shortName} ({row.stock})
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted">
                              Not available at other stores either.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setCustomerOpen(!customerOpen)}
            className="flex w-full min-h-11 items-center justify-between gap-2 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left touch-manipulation"
            aria-expanded={customerOpen}
          >
            <span>
              <span className="block text-sm text-cream">
                {fulfillment === "delivery" ? "Customer & delivery" : "Customer (optional)"}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {fulfillment === "delivery"
                  ? "Name, phone, and address required"
                  : "Name, email, phone, or coupon"}
              </span>
            </span>
            <ChevronDown
              size={16}
              className={cn("shrink-0 text-muted transition", customerOpen && "rotate-180")}
            />
          </button>

          {customerOpen ? (
            <div className="mt-2.5 grid gap-2.5">
              <label className="block text-xs text-muted">
                Name
                <Input
                  className="mt-1.5"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in Guest"
                  autoComplete="name"
                />
              </label>
              <label className="block text-xs text-muted">
                Email
                <Input
                  className="mt-1.5"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="loyalty@email.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </label>
              <label className="block text-xs text-muted">
                Phone{fulfillment === "delivery" ? " (required)" : ""}
                <Input
                  className="mt-1.5"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(formatPhoneInput(e.target.value))}
                  placeholder="(212) 555-0100"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </label>
              <label className="block text-xs text-muted">
                Coupon
                <Input
                  className="mt-1.5"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  placeholder="SAMS10"
                  autoCapitalize="characters"
                />
              </label>
              {fulfillment === "delivery" ? (
                <div className="space-y-2.5 rounded-sm border border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
                    Delivery address
                  </p>
                  <label className="block text-xs text-muted">
                    Street
                    <Input
                      className="mt-1.5"
                      value={deliveryLine1}
                      onChange={(e) => setDeliveryLine1(e.target.value)}
                      placeholder="123 Main St"
                      autoComplete="street-address"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs text-muted">
                      City
                      <Input
                        className="mt-1.5"
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        autoComplete="address-level2"
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      State
                      <Input
                        className="mt-1.5"
                        value={deliveryState}
                        onChange={(e) => setDeliveryState(e.target.value)}
                        autoComplete="address-level1"
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-muted">
                    ZIP
                    <Input
                      className="mt-1.5"
                      value={deliveryZip}
                      onChange={(e) => setDeliveryZip(e.target.value)}
                      placeholder="10001"
                      inputMode="numeric"
                      autoComplete="postal-code"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-white/10 bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums text-[var(--success)]">{formatPrice(subtotal)}</span>
          </div>
          {discount > 0 ? (
            <div className="flex justify-between text-muted">
              <span>Discount</span>
              <span className="tabular-nums text-gold">−{formatPrice(discount)}</span>
            </div>
          ) : null}
          {shipping > 0 ? (
            <div className="flex justify-between text-muted">
              <span>Delivery fee</span>
              <span className="tabular-nums">{formatPrice(shipping)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-muted">
            <span>Tax</span>
            <span className="tabular-nums">{formatPrice(tax)}</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-2 text-base text-cream">
            <span>Total</span>
            <span className="font-medium tabular-nums text-gold">{formatPrice(total)}</span>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-sm border border-(--danger)/30 bg-(--danger)/10 px-3 py-2 text-xs text-(--danger)"
          >
            {error}
          </p>
        ) : null}

        {!canSell ? (
          <p className="rounded-sm border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted">
            Browse-only <AbbrTooltip term="POS" />. Ask an owner to
            grant Complete sales to ring up orders.
          </p>
        ) : null}

        <Button
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={!canSell || !ticketLines.length || hasConflicts}
          onClick={onComplete}
        >
          {!submitting ? <Check size={16} aria-hidden /> : null}
          {!canSell
            ? "Sales not permitted"
            : submitting
              ? "Completing…"
              : hasConflicts
                ? "Fix stock to continue"
                : ticketLines.length === 0
                  ? "Add items to sell"
                  : `Complete sale · ${formatPrice(total)}`}
        </Button>
        {ticketLines.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="w-full min-h-10 text-center text-xs uppercase tracking-wider text-muted touch-manipulation hover:text-cream"
          >
            Clear ticket
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PosProductCard({
  product,
  locationId,
  ticketQty = 0,
  highlighted,
  onAdd,
  onSwitchLocation,
}: {
  product: Product;
  locationId: string;
  ticketQty?: number;
  highlighted?: boolean;
  onAdd: () => void;
  onSwitchLocation: (id: string) => void;
}) {
  const revision = useInventoryStore((s) => s.revision);
  void revision;
  const stock = getAvailableStock(locationId, product.id);
  const price = getPriceForLocation(locationId, product.id);
  const out = stock <= 0;
  const low = !out && stock <= 3;
  const inTicket = ticketQty > 0;
  const alts = out ? otherLocationsForDemand(product.id, locationId, 1) : [];
  const img = productImage(product);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-sm border bg-white/[0.02] transition",
        (highlighted || inTicket) && "border-(--gold)/55 ring-1 ring-(--gold)/30",
        !highlighted && !inTicket && (out ? "border-white/8" : "border-white/10 hover:border-(--gold)/35"),
      )}
    >
      <div className="relative aspect-[3/4] bg-black/50 sm:aspect-[4/5]">
        {img ? (
          <SmartImage
            src={img}
            alt={product.name}
            fill
            className="object-contain p-2.5 transition duration-300 group-hover:scale-[1.03] sm:p-3"
            sizes="(max-width: 768px) 45vw, (max-width: 1280px) 28vw, 18vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <Store size={24} />
          </div>
        )}
        {out ? (
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/75 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-(--danger) sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]">
            Out here
          </span>
        ) : low ? (
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/75 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gold sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]">
            Low · {stock}
          </span>
        ) : product.isPremium ? (
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-[#c45c26] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]">
            Popular
          </span>
        ) : !inTicket ? (
          <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/65 px-1.5 py-0.5 text-[9px] tabular-nums text-cream/80 sm:right-2 sm:top-2 sm:px-2 sm:text-[10px]">
            {stock} left
          </span>
        ) : (
          <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/65 px-1.5 py-0.5 text-[9px] tabular-nums text-cream/80 sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]">
            {stock} left
          </span>
        )}
        {inTicket ? (
          <span
            className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-(--gold) px-1.5 text-[11px] font-semibold tabular-nums text-[#0a0a0a] shadow-[0_2px_8px_rgba(0,0,0,0.35)] sm:right-2 sm:top-2 sm:h-7 sm:min-w-7 sm:text-xs"
            aria-label={`${ticketQty} in cart`}
            title={`${ticketQty} in cart`}
          >
            {ticketQty}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs leading-snug text-cream sm:text-sm">{product.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted sm:text-[11px]">
            {product.brand} · {product.volumeMl}ml
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <p className="text-sm font-medium tabular-nums text-cream sm:text-base">
            {formatPrice(price)}
          </p>
          <button
            type="button"
            aria-label={
              out
                ? `${product.name} unavailable here`
                : inTicket
                  ? `Add another ${product.name} (${ticketQty} in cart)`
                  : `Add ${product.name}`
            }
            disabled={out}
            onClick={onAdd}
            className={cn(
              "flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-full touch-manipulation transition sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9",
              out
                ? "cursor-not-allowed border border-white/10 bg-white/[0.04] text-white/30 shadow-none"
                : "border border-transparent bg-gradient-to-br from-[#9a8048] via-[#d4b56e] to-[#f0d48a] text-[#0a0a0a] shadow-[0_0_16px_rgba(201,169,98,0.35)] ring-1 ring-[#f0d48a]/30 hover:brightness-110 active:scale-95",
            )}
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>
        {out && alts.length > 0 ? (
          <div className="space-y-1.5 border-t border-white/8 pt-2">
            <p className="flex items-start gap-1 text-[10px] leading-snug text-gold">
              <MapPin size={11} className="mt-0.5 shrink-0" />
              <span>
                At{" "}
                {alts.slice(0, 2).map((row, i) => (
                  <span key={row.location.id}>
                    {i > 0 ? " · " : ""}
                    {row.location.shortName} ({row.stock})
                  </span>
                ))}
              </span>
            </p>
            <div className="flex flex-col gap-1">
              {alts.slice(0, 2).map((row) => (
                <button
                  key={row.location.id}
                  type="button"
                  onClick={() => onSwitchLocation(row.location.id)}
                  className="min-h-9 w-full border border-(--gold)/30 px-2 py-1.5 text-[10px] uppercase tracking-wider text-gold touch-manipulation hover:bg-(--gold)/10"
                >
                  Sell at {row.location.shortName}
                </button>
              ))}
            </div>
          </div>
        ) : out ? (
          <p className="border-t border-white/8 pt-2 text-[10px] text-muted">Out at every store</p>
        ) : null}
      </div>
    </article>
  );
}
