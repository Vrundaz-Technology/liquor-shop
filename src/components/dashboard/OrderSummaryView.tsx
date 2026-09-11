"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Package,
  Printer,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { getLocationById } from "@/data/locations";
import { getProductById } from "@/data/products";
import { pricingFromLocation } from "@/lib/fulfillment-pricing";
import { cn, formatPrice } from "@/lib/utils";
import { buildTrackingSteps } from "@/lib/commerce/order-tracking";
import type { Order } from "@/types";

export type SummaryOrder = Order & {
  customerId?: string;
  customerName: string;
  customerEmail: string;
};

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

const STATUS_LABEL: Record<Order["status"], string> = {
  new: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Assigned",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  completed: "Completed",
  cancelled: "Cancelled",
  processing: "Processing",
  shipped: "Out for delivery",
};

const FULFILLMENT_LABEL: Record<Order["fulfillment"], string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  pos: "In-store",
};

function FulfillmentLabel({ type }: { type: Order["fulfillment"] }) {
  if (type === "pos") {
    return (
      <>
        In-store / <AbbrTooltip term="POS" />
      </>
    );
  }
  return <>{FULFILLMENT_LABEL[type]}</>;
}

function bottleCount(order: Order) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function formatAddress(order: Order) {
  if (!order.delivery) return null;
  const line2 = order.delivery.line2 ? `, ${order.delivery.line2}` : "";
  return `${order.delivery.line1}${line2}, ${order.delivery.city}, ${order.delivery.state} ${order.delivery.zip}`;
}

function activitySteps(order: Order) {
  return buildTrackingSteps(order).map((step) => ({
    label: step.label,
    done: step.done,
    current: step.current,
    note: step.current && order.driver ? `Driver ${order.driver.name}` : undefined,
  }));
}

function paymentCopy(order: Order) {
  if (order.status === "cancelled") return "Payment reversed / cancelled";
  if (order.fulfillment === "pos") return "Paid at register";
  if (order.status === "delivered") return "Paid · Order complete";
  return "Payment captured at checkout";
}

type Props = {
  order: SummaryOrder;
  onBack: () => void;
  canManage?: boolean;
  actions?: React.ReactNode;
};

export function OrderSummaryView({ order, onBack, actions }: Props) {
  const backRef = useRef<HTMLButtonElement>(null);
  const location = getLocationById(order.locationId);
  const pricing = pricingFromLocation(location);
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * pricing.taxRate * 100) / 100;
  const bottles = bottleCount(order);
  const address = formatAddress(order);
  const phone = order.delivery?.phone;
  const steps = activitySteps(order);
  const completed = order.status === "delivered";
  const cancelled = order.status === "cancelled";

  useEffect(() => {
    backRef.current?.focus();
  }, [order.id]);

  return (
    <div className="min-w-0 space-y-5 print:space-y-4">
      {/* Top bar */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 print:border-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            ref={backRef}
            onClick={onBack}
            className="inline-flex min-h-10 items-center gap-2 text-sm text-muted transition hover:text-cream print:hidden"
          >
            <ArrowLeft size={16} />
            Back to orders
          </button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="print:hidden"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            Print
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Order summary</p>
            <h2 className="mt-1 font-display text-3xl text-cream wrap-break-word sm:text-4xl">
              {order.id}
            </h2>
            <p className="mt-2 text-sm text-muted">
              <FulfillmentLabel type={order.fulfillment} />
              {location ? ` · ${location.shortName}` : ""}
              {" · Placed "}
              {order.date}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-sm border px-3 py-1.5 text-sm font-medium",
                STATUS_STYLES[order.status],
              )}
            >
              {STATUS_LABEL[order.status]}
            </span>
            {completed ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-gold">
                <CheckCircle2 size={15} />
                Order is completed
              </span>
            ) : null}
            {cancelled ? (
              <span className="text-sm text-(--danger)">Order cancelled</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        {/* Left: details */}
        <div className="space-y-4">
          <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gold">
              <UserRound size={12} />
              Customer details
            </p>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" value={order.customerName} />
              <Field label="Email" value={order.customerEmail} />
              {phone ? <Field label="Phone" value={phone} /> : null}
              {address ? (
                <div className="sm:col-span-2">
                  <Field label="Delivery address" value={address} />
                </div>
              ) : null}
            </dl>
            <p className="mt-4 border-t border-white/10 pt-3 text-[12px] text-muted">
              Invoice {order.id}
              {order.customerId ? ` · Customer ${order.customerId}` : ""}
            </p>
          </section>

          <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gold">
              <MapPin size={12} />
              Fulfillment
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-gold">
                  {order.fulfillment === "delivery" ? <Truck size={18} /> : <Store size={18} />}
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Type</p>
                  <p className="mt-1 text-sm text-cream">
                    <FulfillmentLabel type={order.fulfillment} />
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Store</p>
                <p className="mt-1 text-sm text-cream">
                  {location?.name ?? order.locationId}
                </p>
              </div>
              {order.tracking ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Tracking</p>
                  <p className="mt-1 text-sm text-cream">{order.tracking}</p>
                </div>
              ) : null}
              {order.driver ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Driver</p>
                  <p className="mt-1 text-sm text-cream">
                    {order.driver.name}
                    {order.deliveryStatus
                      ? ` · ${order.deliveryStatus.replace("_", " ")}`
                      : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Order activity</p>
            <ol className="relative mt-5 space-y-0">
              {steps.map((step, index) => {
                const last = index === steps.length - 1;
                return (
                  <li key={step.label} className="relative flex gap-4 pb-5 last:pb-0">
                    {!last ? (
                      <span
                        className="absolute left-[5px] top-3 h-[calc(100%-0.35rem)] w-px bg-white/10"
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative z-[1] mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                        step.current
                          ? "bg-gold ring-4 ring-(--gold)/20"
                          : step.done
                            ? "bg-emerald-400/90"
                            : "bg-white/25",
                      )}
                    />
                    <div className="min-w-0 pt-0.5">
                      <p
                        className={cn(
                          "text-sm",
                          step.done || step.current ? "text-cream" : "text-muted",
                        )}
                      >
                        {step.label}
                      </p>
                      {step.note ? (
                        <p className="mt-0.5 text-[12px] text-muted">{step.note}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {actions ? (
            <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5 print:hidden">
              <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-gold">
                Manage order
              </p>
              {actions}
            </section>
          ) : null}
        </div>

        {/* Right: receipt */}
        <aside className="border border-white/10 bg-black/30 p-4 sm:p-5 xl:sticky xl:top-[calc(4.5rem+env(safe-area-inset-top,0px)+1rem)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gold">
                <Package size={12} />
                Bottles · {bottles} item{bottles === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs text-muted">{order.id}</p>
            </div>
            <p className="font-display text-xl tabular-nums text-gold sm:text-2xl">
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
                    <p className="text-sm leading-snug text-cream">
                      {product?.name ?? item.productId}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      <AbbrTooltip term="Qty" /> {item.quantity}
                      {product?.brand ? ` · ${product.brand}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums text-sm text-cream">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 space-y-2.5 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums text-cream">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Tax (est. {(pricing.taxRate * 100).toFixed(2)}%)</span>
              <span className="tabular-nums text-cream">{formatPrice(tax)}</span>
            </div>
            <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-3">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted">Total</span>
              <span className="font-display text-3xl tabular-nums text-gold">
                {formatPrice(order.total)}
              </span>
            </div>
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
            <span>{paymentCopy(order)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm leading-5 text-cream wrap-break-word">{value}</dd>
    </div>
  );
}

/** @deprecated Use OrderSummaryView — kept for any lingering imports */
export { OrderSummaryView as OrderSummaryModal };
