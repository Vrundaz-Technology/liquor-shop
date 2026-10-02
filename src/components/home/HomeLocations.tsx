"use client";

import { SmartImage } from "@/components/ui/SmartImage";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { usePublicLocations } from "@/hooks/useRuntimeLocations";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useInView(threshold = 0.16) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView();
  const show = reduced || inView;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translate3d(0,0,0)" : "translate3d(0,36px,0)",
        transition: `opacity 1.1s ${EASE} ${delay}s, transform 1.1s ${EASE} ${delay}s`,
        willChange: "transform, opacity",
      }}
    >
      {children}
    </div>
  );
}

function LineReveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView(0.2);
  const show = reduced || inView;

  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <div
        style={{
          transform: show ? "translate3d(0,0,0)" : "translate3d(0,110%,0)",
          transition: `transform 1.25s ${EASE} ${delay}s`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] opacity-[0.05] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "180px 180px",
      }}
    />
  );
}

function StoreCard({
  index,
  shortName,
  address,
  city,
  phone,
  slug,
}: {
  index: number;
  shortName: string;
  address: string;
  city: string;
  phone: string;
  slug: string;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const raf = useRef(0);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, x: 50, y: 50, active: false });

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLAnchorElement>) => {
      if (reduced) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        setTilt({
          rx: (0.5 - py) * 11,
          ry: (px - 0.5) * 14,
          x: px * 100,
          y: py * 100,
          active: true,
        });
      });
    },
    [reduced],
  );

  const onLeave = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setTilt({ rx: 0, ry: 0, x: 50, y: 50, active: false });
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const lift = tilt.active && !reduced;

  return (
    <Reveal delay={0.1 + index * 0.1} className="h-full">
      <div className="h-full" style={{ perspective: "1200px" }}>
        <Link
          ref={ref}
          href={`/locations/${slug}`}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          className="group relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-sm md:min-h-[240px]"
          style={{
            transform: lift
              ? `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(16px) scale(1.02)`
              : "rotateX(0deg) rotateY(0deg) translateZ(0) scale(1)",
            transition: `transform 0.7s ${EASE}, box-shadow 0.7s ${EASE}`,
            transformStyle: "preserve-3d",
            willChange: "transform",
            background: `
              #0e0e0e padding-box,
              linear-gradient(
                140deg,
                ${lift ? "rgba(232,201,122,0.95)" : "rgba(201,168,76,0.7)"} 0%,
                rgba(201,168,76,0.2) 40%,
                rgba(255,255,255,0.1) 55%,
                ${lift ? "rgba(232,201,122,0.85)" : "rgba(201,168,76,0.5)"} 100%
              ) border-box
            `,
            border: "1px solid transparent",
            boxShadow: lift
              ? "0 28px 56px -22px rgba(0,0,0,0.9), 0 0 44px rgba(201,168,76,0.24)"
              : "0 12px 28px -18px rgba(0,0,0,0.75), 0 0 0 1px rgba(201,168,76,0.08)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: lift ? 1 : 0,
              transition: `opacity 0.5s ${EASE}`,
              background: `radial-gradient(320px circle at ${tilt.x}% ${tilt.y}%, rgba(232,201,122,0.18), transparent 50%)`,
            }}
          />

          <div className="relative z-10 flex flex-1 flex-col bg-[#0e0e0e] p-6 md:p-7">
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-[var(--gold)]">
              Store 0{index + 1}
            </p>
            <h3
              className="mt-2.5 font-display text-2xl md:text-[1.75rem]"
              style={{
                color: lift ? "var(--gold-bright)" : "var(--cream)",
                transform: lift
                  ? `translate3d(${(tilt.x - 50) * 0.05}px, ${(tilt.y - 50) * 0.04}px, 0)`
                  : undefined,
                transition: `transform 0.7s ${EASE}, color 0.5s ${EASE}`,
              }}
            >
              {shortName}
            </h3>
            <span
              aria-hidden
              className="mt-3 block h-px origin-left bg-gradient-to-r from-[var(--gold-bright)] via-[var(--gold)] to-transparent"
              style={{
                transform: lift || reduced ? "scaleX(1)" : "scaleX(0.35)",
                transition: `transform 0.7s ${EASE}`,
              }}
            />
            <p className="mt-4 text-sm leading-relaxed text-[var(--cream)]">
              {address}, {city}
            </p>
            <p className="mt-2 text-xs tracking-wide text-[var(--gold)]">{phone}</p>

            <span
              className="mt-auto inline-flex items-center gap-2 pt-8 text-[10px] uppercase tracking-[0.28em] text-[var(--gold)]"
              style={{
                transform: lift ? "translate3d(4px,0,0)" : "translate3d(0,0,0)",
                transition: `transform 0.7s ${EASE}`,
              }}
            >
              Visit store
              <span aria-hidden className="text-[var(--gold-bright)]">
                →
              </span>
            </span>
          </div>
        </Link>
      </div>
    </Reveal>
  );
}

export function HomeLocations() {
  const locations = usePublicLocations();
  const hero = locations[0]?.heroImage ?? "/store/downtown-maison.jpg";

  return (
    <section className="relative overflow-hidden py-24 md:py-28">
      <div className="absolute inset-0">
        <SmartImage
          src={hero}
          alt=""
          fill
          className="object-cover object-right opacity-40"
          sizes="100vw"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, #050505 0%, #050505 48%, rgba(5,5,5,0.88) 72%, rgba(5,5,5,0.55) 100%)",
          }}
        />
      </div>
      <Grain />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-10 h-[300px] w-[300px] rounded-full blur-3xl premium-breathe md:h-[400px] md:w-[400px]"
        style={{
          background:
            "radial-gradient(circle, rgba(201,168,76,0.28) 0%, rgba(201,168,76,0.08) 42%, transparent 70%)",
        }}
      />

      <div className="relative z-[2] mx-auto max-w-7xl px-3 sm:px-4 md:px-8">
        <div className="mb-12 max-w-3xl md:mb-14">
          <Reveal>
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--gold)]">
              Locations
            </p>
          </Reveal>
          <LineReveal delay={0.08} className="mt-4">
            <h2 className="font-display text-4xl leading-[1.1] text-[var(--cream)] md:text-5xl lg:text-[3.25rem]">
              {locations.length <= 1
                ? "Find your store"
                : `${locations.length} stores. One destination.`}
            </h2>
          </LineReveal>
          <Reveal delay={0.18}>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
              {locations.length === 0
                ? "New branches appear here as soon as they are added."
                : locations.map((loc) => loc.shortName).join(", ")}
            </p>
          </Reveal>
        </div>

        <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
          {locations.map((loc, i) => (
            <StoreCard
              key={loc.id}
              index={i}
              shortName={loc.shortName}
              address={loc.address}
              city={loc.city}
              phone={loc.phone}
              slug={loc.slug}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
