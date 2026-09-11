"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the scrollable body — use for Cancel/Save so actions never cover fields. */
  footer?: ReactNode;
  className?: string;
};

export function Modal({ open, title, subtitle, onClose, children, footer, className }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = dialogRef.current;
    const focusable = root
      ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => !el.hasAttribute("disabled"),
        )
      : [];
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (focusable[0] ?? root)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 md:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-full flex-col rounded-t-xl border border-white/10 bg-(--bg-elevated) pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:rounded-sm sm:max-w-xl sm:pt-0",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:gap-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="modal-title" className="font-display text-xl text-cream wrap-break-word sm:text-2xl">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm p-2 text-muted transition hover:bg-white/5 hover:text-cream"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-white/10 bg-(--bg-elevated) px-4 py-3 sm:px-5 sm:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
