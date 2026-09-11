"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ShoppingBag, X } from "lucide-react";
import { useCartFeedbackStore } from "@/store/cart-feedback";
import { useWishlistFeedbackStore } from "@/store/wishlist-feedback";
import { getProductById } from "@/data/products";
import { Button } from "@/components/ui/Button";

export function CartAddedToast() {
  const notice = useCartFeedbackStore((s) => s.notice);
  const warning = useCartFeedbackStore((s) => s.warning);
  const info = useCartFeedbackStore((s) => s.info);
  const dismiss = useCartFeedbackStore((s) => s.dismiss);
  const dismissWarning = useCartFeedbackStore((s) => s.dismissWarning);
  const dismissInfo = useCartFeedbackStore((s) => s.dismissInfo);
  const product = notice ? getProductById(notice.productId) : null;

  useEffect(() => {
    if (!notice) return;
    useWishlistFeedbackStore.getState().dismiss();
    const timer = window.setTimeout(() => dismiss(), 4200);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  useEffect(() => {
    if (!warning) return;
    const timer = window.setTimeout(() => dismissWarning(), 5600);
    return () => window.clearTimeout(timer);
  }, [warning, dismissWarning]);

  useEffect(() => {
    if (!info) return;
    const timer = window.setTimeout(() => dismissInfo(), 4800);
    return () => window.clearTimeout(timer);
  }, [info, dismissInfo]);

  return (
    <AnimatePresence>
      {notice && product ? (
        <motion.div
          key={notice.id}
          initial={{ opacity: 0, y: 16, x: 12 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-3 z-[90] w-[min(22rem,calc(100vw-1.5rem))] border border-white/10 bg-(--bg-elevated) p-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] sm:right-6"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="relative h-16 w-12 shrink-0 bg-white/5">
              <Image
                src={product.images[0]}
                alt=""
                fill
                className="object-contain p-1"
                sizes="48px"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Added to cart</p>
              <p className="mt-1 truncate font-display text-lg leading-tight text-cream">
                {product.name}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {notice.added} added · {notice.quantity} in bag
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-sm p-1 text-muted hover:bg-white/5 hover:text-cream"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/cart" className="flex-1" onClick={dismiss}>
              <Button size="sm" variant="secondary" className="w-full">
                <ShoppingBag size={14} />
                View cart
              </Button>
            </Link>
            <Link href="/checkout" className="flex-1" onClick={dismiss}>
              <Button size="sm" className="w-full">
                Checkout
              </Button>
            </Link>
          </div>
        </motion.div>
      ) : null}

      {warning && !notice ? (
        <motion.div
          key={warning}
          initial={{ opacity: 0, y: 16, x: 12 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-3 z-[90] w-[min(22rem,calc(100vw-1.5rem))] border border-(--danger)/35 bg-[#1a1010] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] sm:right-6"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-(--danger)" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-(--danger)">
                One store per order
              </p>
              <p className="mt-1 text-sm leading-relaxed text-cream">{warning}</p>
            </div>
            <button
              type="button"
              onClick={dismissWarning}
              className="rounded-sm p-1 text-muted hover:bg-white/5 hover:text-cream"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <Link href="/cart" className="mt-3 block" onClick={dismissWarning}>
            <Button size="sm" variant="secondary" className="w-full">
              Review cart
            </Button>
          </Link>
        </motion.div>
      ) : null}

      {info && !notice && !warning ? (
        <motion.div
          key={info}
          initial={{ opacity: 0, y: 16, x: 12 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-3 z-[90] w-[min(22rem,calc(100vw-1.5rem))] border border-(--gold)/35 bg-(--bg-elevated) p-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] sm:right-6"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <ShoppingBag size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Cart updated</p>
              <p className="mt-1 text-sm leading-relaxed text-cream">{info}</p>
            </div>
            <button
              type="button"
              onClick={dismissInfo}
              className="rounded-sm p-1 text-muted hover:bg-white/5 hover:text-cream"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
