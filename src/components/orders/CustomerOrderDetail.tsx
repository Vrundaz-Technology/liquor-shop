"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Headphones,
  MapPin,
  Package,
  Printer,
  RotateCcw,
  Store,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OrderChargeLines, OrderRewardsCard } from "@/components/orders/OrderCharges";
import { OrderTrackingTimeline } from "@/components/orders/OrderTrackingTimeline";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { getLocationById } from "@/data/locations";
import { getProductById } from "@/data/products";
import { customerStatusLabel, formatOrderPlaced } from "@/lib/commerce/order-tracking";
import { orderPaymentCopy } from "@/lib/commerce/payments";
import { cn, formatPrice } from "@/lib/utils";
import type { Order } from "@/types";

const STATUS_STYLES: Record<Order["status"], string> = {
  new: "bg-amber-500/15 text-amber-200 border-amber-500/35",
  accepted: "bg-amber-500/15 text-amber-200 border-amber-500/35",
  preparing: "bg-orange-500/15 text-orange-200 border-orange-500/35",
  ready: "bg-emerald-500/15 text-emerald-200 border-emerald-500/35",
  assigned: "bg-sky-500/15 text-sky-200 border-sky-500/35",
  out_for_delivery: "bg-sky-500/15 text-sky-200 border-sky-500/35",
  delivered: "bg-(--gold)/15 text-gold border-(--gold)/40",
  ready_for_pickup: "bg-emerald-500/15 text-emerald-200 border-emerald-500/35",
  picked_up: "bg-(--gold)/15 text-gold border-(--gold)/40",
  completed: "bg-(--gold)/15 text-gold border-(--gold)/40",
  cancelled: "bg-(--danger)/15 text-(--danger) border-(--danger)/35",
  processing: "bg-amber-500/15 text-amber-200 border-amber-500/35",
  shipped: "bg-sky-500/15 text-sky-200 border-sky-500/35",
};

const FULFILLMENT_LABEL: Record<Order["fulfillment"], string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  pos: "In-store",
};

function bottleCount(order: Order) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function formatDeliveryAddress(order: Order) {
  if (!order.delivery) return null;
  const line2 = order.delivery.line2 ? `, ${order.delivery.line2}` : "";
  return `${order.delivery.line1}${line2}, ${order.delivery.city}, ${order.delivery.state} ${order.delivery.zip}`;
}

function formatStoreAddress(location: NonNullable<ReturnType<typeof getLocationById>>) {
  return `${location.address}, ${location.city}, ${location.state} ${location.zip}`;
}

type Props = {
  order: Order;
  onBack: () => void;
  onReorder: () => void;
  onHelp: () => void;
};

export function CustomerOrderDetail({ order, onBack, onReorder, onHelp }: Props) {
  const backRef = useRef<HTMLButtonElement>(null);
  const location = getLocationById(order.locationId);
  const bottles = bottleCount(order);
  const deliveryAddress = formatDeliveryAddress(order);
  const storeAddress = location ? formatStoreAddress(location) : null;
  const statusLabel = customerStatusLabel(order);
  const completed =
    order.status === "delivered" || order.status === "picked_up" || order.status === "completed";
  const cancelled = order.status === "cancelled";

  useEffect(() => {
    backRef.current?.focus();
  }, [order.id]);

  return (
    <div className="min-w-0 space-y-5 print:space-y-4">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 print:border-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            ref={backRef}
            onClick={onBack}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-muted transition hover:text-cream print:hidden"
          >
            <ArrowLeft size={16} />
            Back to orders
          </button>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer size={14} />
              Print
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onReorder}>
              <RotateCcw size={14} />
              Reorder
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onHelp}>
              <Headphones size={14} />
              Help
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Order details</p>
            <h2 className="mt-1 text-2xl font-medium tracking-tight text-cream wrap-break-word sm:text-3xl">
              {order.id}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {FULFILLMENT_LABEL[order.fulfillment]}
              {location ? ` · ${location.shortName}` : ""}
              {" · Placed "}
              {formatOrderPlaced(order).label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-sm border px-3 py-1.5 text-sm font-medium",
                STATUS_STYLES[order.status],
              )}
            >
              {statusLabel}
            </span>
            {completed ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-gold">
                <CheckCircle2 size={15} />
                Order is complete
              </span>
            ) : null}
            {cancelled ? <span className="text-sm text-(--danger)">Order cancelled</span> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="space-y-4">
          <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gold">
              <MapPin size={12} />
              {order.fulfillment === "delivery" ? "Delivery" : "Pickup"}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-gold">
                  {order.fulfillment === "delivery" ? <Truck size={18} /> : <Store size={18} />}
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Type</p>
                  <p className="mt-1 text-sm text-cream">{FULFILLMENT_LABEL[order.fulfillment]}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Store</p>
                <p className="mt-1 text-sm text-cream">{location?.name ?? order.locationId}</p>
                {location?.phone ? <p className="mt-1 text-xs text-muted">{location.phone}</p> : null}
              </div>
              {order.fulfillment === "delivery" && deliveryAddress ? (
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Deliver to</p>
                  <p className="mt-1 text-sm text-cream">{deliveryAddress}</p>
                  {order.delivery?.phone ? (
                    <p className="mt-1 text-xs text-muted">{order.delivery.phone}</p>
                  ) : null}
                </div>
              ) : storeAddress ? (
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
                    {order.fulfillment === "pos" ? "Store address" : "Pickup address"}
                  </p>
                  <p className="mt-1 text-sm text-cream">{storeAddress}</p>
                </div>
              ) : null}
              {location?.hours?.length ? (
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Store hours</p>
                  <ul className="mt-2 space-y-1 text-sm text-cream">
                    {location.hours.map((slot) => (
                      <li key={slot.day} className="flex justify-between gap-4 text-muted">
                        <span>{slot.day}</span>
                        <span className="tabular-nums text-cream">
                          {slot.open}–{slot.close}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {order.tracking ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Tracking</p>
                  <p className="mt-1 text-sm text-cream">{order.tracking}</p>
                  <Link
                    href={`/track?orderId=${encodeURIComponent(order.id)}`}
                    className="mt-1 inline-block text-xs text-gold hover:underline"
                  >
                    Open live tracking
                  </Link>
                </div>
              ) : null}
              {order.driver ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Driver</p>
                  <p className="mt-1 text-sm text-cream">
                    {order.driver.name}
                    {order.driver.vehicle ? ` · ${order.driver.vehicle}` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          {order.fulfillment !== "pos" ? (
            <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Order activity</p>
              <div className="mt-4">
                <OrderTrackingTimeline order={order} />
              </div>
            </section>
          ) : null}

          <OrderRewardsCard order={order} />

          {completed ? (
            <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5 print:hidden">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Leave a review</p>
              <div className="mt-4 space-y-4">
                {order.fulfillment === "delivery" ? (
                  <ReviewForm targetType="delivery" orderId={order.id} locationId={order.locationId} />
                ) : null}
                <ReviewForm targetType="store" locationId={order.locationId} />
                {order.items[0] ? (
                  <p className="text-xs text-muted">
                    Rate a bottle:{" "}
                    {order.items.slice(0, 3).map((item, idx) => {
                      const product = getProductById(item.productId);
                      if (!product) return null;
                      return (
                        <span key={item.productId}>
                          {idx > 0 ? " · " : ""}
                          <Link href={`/products/${product.slug}`} className="text-gold hover:underline">
                            {product.name}
                          </Link>
                        </span>
                      );
                    })}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="border border-white/10 bg-black/30 p-4 sm:p-5 xl:sticky xl:top-[calc(4.5rem+env(safe-area-inset-top,0px)+1rem)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gold">
                <Package size={12} />
                Bottles · {bottles} item{bottles === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs text-muted">{order.id}</p>
            </div>
            <p className="font-price text-xl text-gold sm:text-2xl">
              {formatPrice(order.total)}
            </p>
          </div>

          <ul className="mt-5 space-y-3 border-t border-white/10 pt-4">
            {order.items.map((item) => {
              const product = getProductById(item.productId);
              const image = product?.images?.[0];
              return (
                <li
                  key={`${order.id}-${item.productId}`}
                  className="flex items-center gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-white/5">
                    {image ? (
                      <Image src={image} alt="" fill className="object-cover" sizes="56px" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted">
                        <Package size={16} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {product ? (
                      <Link
                        href={`/products/${product.slug}`}
                        className="text-sm leading-snug text-cream hover:text-gold"
                      >
                        {product.name}
                      </Link>
                    ) : (
                      <p className="text-sm leading-snug text-cream">{item.productId}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted">
                      Qty {item.quantity}
                      {product?.brand ? ` · ${product.brand}` : ""}
                      {" · "}
                      {formatPrice(item.price)} each
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums text-sm text-cream">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 border-t border-white/10 pt-4">
            <OrderChargeLines order={order} />
          </div>

          <div
            className={cn(
              "mt-5 flex items-start gap-2.5 border px-3 py-3 text-sm",
              cancelled
                ? "border-(--danger)/30 bg-(--danger)/10 text-(--danger)"
                : completed || order.fulfillment === "pos"
                  ? "border-(--gold)/35 bg-(--gold)/10 text-gold"
                  : "border-white/10 bg-white/[0.03] text-muted",
            )}
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              {orderPaymentCopy(order)}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
