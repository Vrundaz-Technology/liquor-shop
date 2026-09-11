"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/types";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";

type Props = {
  products: Product[];
  eyebrow?: string;
  title?: string;
};

const AUTO_MS = 4500;
const VISIBLE = 2;

/**
 * Jack Daniel's–style bottle rail.
 * @see https://www.jackdaniels.com/
 */
export function BottleCarousel({
  products,
  eyebrow = "Our whiskeys",
  title = "Explore the collection",
}: Props) {
  const list = products.filter((p) => p.images[0]);
  const count = list.length;
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [step, setStep] = useState(220);
  const [bottleW, setBottleW] = useState(180);
  const bottleH = Math.round(bottleW * 2.15);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragging = useRef(false);
  const activeRef = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualPause, setManualPause] = useState(false);

  activeRef.current = active;

  const goTo = useCallback(
    (index: number, fromUser = false) => {
      if (!count) return;
      const next = ((index % count) + count) % count;
      setActive(next);
      if (fromUser) {
        setManualPause(true);
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
        resumeTimer.current = setTimeout(() => setManualPause(false), AUTO_MS);
      }
    },
    [count],
  );

  const go = useCallback(
    (dir: -1 | 1, fromUser = true) => {
      goTo(activeRef.current + dir, fromUser);
    },
    [goTo],
  );

  // Responsive spacing — keep bottles mostly side-by-side, not stacked.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const bw = w < 640 ? 120 : w < 900 ? 150 : 180;
      setBottleW(bw);
      setStep(Math.round(bw * 1.22));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Autoplay — skips while hovering or after a manual action
  useEffect(() => {
    if (!count || hovering || manualPause) return;
    const id = window.setInterval(() => go(1, false), AUTO_MS);
    return () => window.clearInterval(id);
  }, [count, hovering, manualPause, go]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  if (!count) return null;

  const current = list[active];

  const offsetOf = (index: number) => {
    let d = ((index - active) % count + count) % count;
    if (d > Math.floor(count / 2)) d -= count;
    return d;
  };

  return (
    <section className="relative overflow-hidden bg-black py-20 md:py-28">
      <p
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[42%] hidden -translate-x-1/2 -translate-y-1/2 select-none font-display text-[min(28vw,420px)] leading-none text-white/4 md:block"
      >
        {current.brand.split(" ")[0].toUpperCase()}
      </p>

      <div className="relative z-10 mx-auto mb-10 max-w-7xl px-3 text-center sm:px-4 md:px-8">
        <p className="text-[11px] uppercase tracking-[0.35em] text-gold">{eyebrow}</p>
        <h2 className="mt-3 font-display text-3xl text-cream md:text-5xl">{title}</h2>
      </div>

      <div
        ref={stageRef}
        className="relative mx-auto h-80 max-w-6xl select-none sm:h-100 md:h-125"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onPointerDown={(e) => {
          // Ignore presses on controls
          if ((e.target as HTMLElement).closest("[data-carousel-control]")) return;
          dragging.current = true;
          dragStartX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          if ((e.target as HTMLElement).closest("[data-carousel-control]")) return;
          const dx = e.clientX - dragStartX.current;
          if (dx < -50) go(1, true);
          else if (dx > 50) go(-1, true);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          {list.map((p, i) => {
            const offset = offsetOf(i);
            const abs = Math.abs(offset);
            const hidden = abs > VISIBLE;
            const isCenter = offset === 0;
            const scale = isCenter ? 1 : Math.max(0.55, 1 - abs * 0.18);
            const opacity = hidden ? 0 : isCenter ? 1 : Math.max(0.28, 1 - abs * 0.32);
            const z = hidden ? 0 : 50 - abs;
            const y = isCenter ? 0 : abs * 14;

            return (
              <motion.button
                key={p.id}
                type="button"
                aria-label={isCenter ? `View ${p.name}` : `Show ${p.name}`}
                aria-hidden={hidden}
                tabIndex={isCenter ? 0 : -1}
                disabled={hidden}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isCenter) {
                    goTo(i, true);
                    return;
                  }
                  router.push(`/products/${p.slug}`);
                }}
                className="absolute bottom-14 cursor-pointer border-0 bg-transparent p-0 outline-none md:bottom-16"
                style={{
                  left: "50%",
                  width: bottleW,
                  marginLeft: -bottleW / 2,
                  zIndex: z,
                  pointerEvents: hidden ? "none" : "auto",
                  transformOrigin: "50% 100%",
                }}
                initial={false}
                animate={{
                  x: offset * step,
                  y,
                  scale,
                  opacity,
                  filter: isCenter ? "brightness(1)" : "brightness(0.55)",
                }}
                transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.7 }}
              >
                <div
                  className="relative w-full overflow-hidden"
                  style={{ height: bottleH }}
                >
                  <Image
                    src={p.images[0]}
                    alt={p.name}
                    fill
                    className="pointer-events-none object-contain object-bottom drop-shadow-[0_24px_40px_rgba(0,0,0,0.65)]"
                    sizes="200px"
                    priority={abs <= 1}
                    draggable={false}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 -bottom-12 h-12 overflow-hidden opacity-30 md:-bottom-14 md:h-14"
                    style={{
                      maskImage: "linear-gradient(to bottom, black, transparent)",
                      WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
                    }}
                  >
                    <div
                      className="relative w-full -scale-y-100 opacity-40"
                      style={{ height: bottleH }}
                    >
                      <Image
                        src={p.images[0]}
                        alt=""
                        fill
                        className="object-contain object-top blur-[1px]"
                        sizes="200px"
                        draggable={false}
                      />
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <button
          type="button"
          data-carousel-control
          aria-label="Previous bottle"
          onClick={(e) => {
            e.stopPropagation();
            go(-1, true);
          }}
          className="absolute left-2 top-1/2 z-60 -translate-y-1/2 rounded-full border border-white/20 bg-black/70 p-3 text-cream backdrop-blur transition hover:border-[var(--gold)]/60 hover:text-gold md:left-6"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          data-carousel-control
          aria-label="Next bottle"
          onClick={(e) => {
            e.stopPropagation();
            go(1, true);
          }}
          className="absolute right-2 top-1/2 z-60 -translate-y-1/2 rounded-full border border-white/20 bg-black/70 p-3 text-cream backdrop-blur transition hover:border-[var(--gold)]/60 hover:text-gold md:right-6"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="relative z-10 mx-auto mt-2 max-w-xl px-4 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <Link
              href={`/products/${current.slug}`}
              className="break-words font-display text-lg uppercase tracking-[0.06em] text-white transition hover:text-gold sm:text-xl md:text-2xl"
            >
              <span className="block sm:inline">{current.brand}</span>
              <span className="mx-2 hidden text-white/30 sm:inline">/</span>
              <span className="mt-1 block font-normal normal-case tracking-normal text-cream sm:mt-0 sm:inline sm:uppercase sm:tracking-[0.06em]">
                {current.name.replace(current.brand, "").trim() || current.name}
              </span>
            </Link>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {current.origin} · {current.abv}%{" "}
              <AbbrTooltip term="ABV" />
            </p>
            <Link
              href={`/products/${current.slug}`}
              className="mt-5 inline-block text-[11px] uppercase tracking-[0.28em] text-gold transition hover:text-[var(--gold-bright)]"
            >
              Learn more
            </Link>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {list.map((p, i) => (
            <button
              key={p.id}
              type="button"
              data-carousel-control
              aria-label={`Show ${p.name}`}
              aria-current={i === active}
              onClick={() => goTo(i, true)}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-8 bg-[var(--gold)]" : "w-1.5 bg-white/25 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
