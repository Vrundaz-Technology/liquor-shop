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
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  const show = useCallback(() => {
    if (disabled || content == null || content === false || content === "") return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), delayMs);
  }, [content, delayMs, disabled]);

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
    const onMove = () => updatePos();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, updatePos, content]);

  useEffect(() => () => clearTimer(), []);

  if (disabled || content == null || content === false || content === "") {
    return <>{children}</>;
  }

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex max-w-full", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {mounted && open
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
