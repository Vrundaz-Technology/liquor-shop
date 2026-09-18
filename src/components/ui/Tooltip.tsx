"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export const tooltipPanelClass =
  "pointer-events-none z-[90] max-w-[min(20rem,calc(100vw-1.5rem))] rounded-sm border border-gold/30 bg-[#121212] px-2.5 py-1.5 font-sans text-[11px] font-normal leading-snug tracking-normal text-cream shadow-[0_8px_24px_rgba(0,0,0,0.45)]";

export type TooltipSide = "top" | "bottom" | "left" | "right";

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
  delayMs?: number;
  disabled?: boolean;
};

type Pos = { top: number; left: number };

function place(rect: DOMRect, side: TooltipSide, tip: DOMRect | null): Pos {
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = tip?.width ?? 0;
  const th = tip?.height ?? 0;

  let top = 0;
  let left = 0;

  if (side === "right") {
    top = rect.top + rect.height / 2 - th / 2;
    left = rect.right + gap;
  } else if (side === "left") {
    top = rect.top + rect.height / 2 - th / 2;
    left = rect.left - gap - tw;
  } else if (side === "top") {
    top = rect.top - gap - th;
    left = rect.left + rect.width / 2 - tw / 2;
  } else {
    top = rect.bottom + gap;
    left = rect.left + rect.width / 2 - tw / 2;
  }

  const pad = 8;
  left = Math.min(Math.max(left, pad), vw - tw - pad);
  top = Math.min(Math.max(top, pad), vh - th - pad);
  return { top, left };
}

/** Themed hover/focus tooltip. Portals to body so overflow parents cannot clip it. */
export function Tooltip({
  content,
  children,
  side = "bottom",
  className,
  delayMs = 120,
  disabled,
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const pointerIntentRef = useRef(false);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);

  const canShow = !disabled && content != null && content !== false && content !== "";

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = useCallback(() => {
    activeRef.current = false;
    clearTimer();
    setOpen(false);
  }, []);

  const show = useCallback(() => {
    if (!canShow) return;
    activeRef.current = true;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      if (!activeRef.current) return;
      setOpen(true);
    }, delayMs);
  }, [canShow, delayMs]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!canShow) hide();
  }, [canShow, hide]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    const onPointer = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      hide();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("blur", hide);
    };
  }, [open, hide]);

  const updatePos = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPos(place(trigger.getBoundingClientRect(), side, tipRef.current?.getBoundingClientRect() ?? null));
  }, [side]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const frame = window.requestAnimationFrame(updatePos);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, updatePos, hide, content]);

  useEffect(() => () => clearTimer(), []);

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex max-w-full", className)}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        pointerIntentRef.current = false;
        show();
      }}
      onPointerLeave={hide}
      onPointerDown={() => {
        pointerIntentRef.current = true;
        hide();
      }}
      onFocusCapture={() => {
        if (pointerIntentRef.current) return;
        show();
      }}
      onBlurCapture={(event) => {
        pointerIntentRef.current = false;
        const next = event.relatedTarget as Node | null;
        if (next && triggerRef.current?.contains(next)) return;
        hide();
      }}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {mounted && open && canShow
        ? createPortal(
            <span
              ref={tipRef}
              id={tooltipId}
              role="tooltip"
              className={tooltipPanelClass}
              style={{
                position: "fixed",
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                visibility: pos ? "visible" : "hidden",
              }}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
