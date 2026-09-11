"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { getCategories } from "@/data/categories";
import { products } from "@/data/products";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const EXPERIENCES = [
  {
    title: "Virtual Showroom",
    copy: "Walk whiskey, vodka, rum, gin, wine, and premium collections in 3D.",
    href: "/virtual-store",
  },
  {
    title: "AR in Your Space",
    copy: "Place bottles on your table with WebXR, Scene Viewer, and Quick Look.",
    href: `/ar/${products[0].slug}`,
  },
  {
    title: "Branch-aware inventory",
    copy: "Switch Downtown, Waterfront, or Uptown — stock and offers update live.",
    href: "/locations",
  },
] as const;

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

function useInView(threshold = 0.18) {
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
      className="pointer-events-none absolute inset-0 z-[1] opacity-[0.055] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "180px 180px",
      }}
    />
  );
}

function BreathingGlow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full blur-3xl premium-breathe ${className}`}
      style={{
        background:
          "radial-gradient(circle, rgba(201,168,76,0.28) 0%, rgba(201,168,76,0.08) 42%, transparent 70%)",
      }}
    />
  );
}

function TiltCard({
  href,
  index,
  title,
  copy,
}: {
  href: string;
  index: number;
  title: string;
  copy: string;
}) {
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLAnchorElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, x: 50, y: 50, active: false });

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLAnchorElement>) => {
      if (reduced) return;
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      setTilt({
        rx: (0.5 - py) * 14,
        ry: (px - 0.5) * 18,
        x: px * 100,
        y: py * 100,
        active: true,
      });
    },
    [reduced],
  );

  const onLeave = useCallback(() => {
    setTilt({ rx: 0, ry: 0, x: 50, y: 50, active: false });
  }, []);

  const lift = tilt.active && !reduced;

  return (
    <Link
      ref={cardRef}
      href={href}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="group relative block h-full"
      style={{
        perspective: "1200px",
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className="relative h-full overflow-hidden rounded-sm p-8 md:p-9"
        style={{
          transform: lift
            ? `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(18px) scale(1.02)`
            : "rotateX(0deg) rotateY(0deg) translateZ(0) scale(1)",
          transition: `transform 0.7s ${EASE}, box-shadow 0.7s ${EASE}`,
          transformStyle: "preserve-3d",
          willChange: "transform",
          background:
            "linear-gradient(165deg, rgba(255,255,255,0.045) 0%, rgba(12,12,12,0.92) 48%, rgba(8,8,8,0.98) 100%)",
          boxShadow: lift
            ? "0 28px 56px -20px rgba(0,0,0,0.85), 0 0 48px rgba(201,168,76,0.22), 0 0 2px rgba(201,168,76,0.45)"
            : "0 10px 28px -18px rgba(0,0,0,0.7), 0 0 0 1px rgba(201,168,76,0.08)",
        }}
      >
        {/* Gradient gold border */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-sm"
          style={{
            padding: "1px",
            background: lift
              ? "linear-gradient(135deg, rgba(232,201,122,0.95), rgba(201,168,76,0.35) 40%, rgba(255,255,255,0.08) 55%, rgba(201,168,76,0.75))"
              : "linear-gradient(145deg, rgba(201,168,76,0.55), rgba(201,168,76,0.12) 45%, rgba(255,255,255,0.06) 60%, rgba(201,168,76,0.4))",
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            transition: `opacity 0.7s ${EASE}`,
          }}
        />

        {/* Mouse-following gold sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: lift ? 1 : 0,
            transition: `opacity 0.55s ${EASE}`,
            background: `radial-gradient(520px circle at ${tilt.x}% ${tilt.y}%, rgba(232,201,122,0.28), transparent 42%)`,
          }}
        />

        {/* Parallax depth layers */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(circle, rgba(201,168,76,0.2), transparent 70%)",
            transform: `translate3d(${(tilt.x - 50) * -0.12}px, ${(tilt.y - 50) * -0.1}px, 24px)`,
            transition: `transform 0.7s ${EASE}`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-12 -left-6 h-36 w-36 rounded-full blur-2xl"
          style={{
            background: "radial-gradient(circle, rgba(201,168,76,0.12), transparent 70%)",
            transform: `translate3d(${(tilt.x - 50) * 0.08}px, ${(tilt.y - 50) * 0.08}px, 12px)`,
            transition: `transform 0.7s ${EASE}`,
          }}
        />

        <div style={{ transform: "translateZ(28px)", transformStyle: "preserve-3d" }}>
          <p
            className="font-sans text-[11px] uppercase tracking-[0.32em]"
            style={{
              color: "var(--gold)",
              transform: lift
                ? `translate3d(${(tilt.x - 50) * 0.04}px, ${(tilt.y - 50) * 0.03}px, 0)`
                : undefined,
              transition: `transform 0.7s ${EASE}`,
            }}
          >
            0{index + 1}
          </p>
          <h3
            className="mt-5 font-display text-2xl text-[var(--cream)] transition-colors duration-500 group-hover:text-[var(--gold-bright)] md:text-[1.7rem]"
            style={{
              transform: lift
                ? `translate3d(${(tilt.x - 50) * 0.06}px, ${(tilt.y - 50) * 0.05}px, 0)`
                : undefined,
              transition: `transform 0.7s ${EASE}, color 0.5s ${EASE}`,
            }}
          >
            {title}
          </h3>
          <p
            className="mt-3 max-w-[28ch] text-sm leading-relaxed text-[var(--muted)]"
            style={{
              transform: lift
                ? `translate3d(${(tilt.x - 50) * 0.03}px, ${(tilt.y - 50) * 0.025}px, 0)`
                : undefined,
              transition: `transform 0.7s ${EASE}`,
            }}
          >
            {copy}
          </p>
          <span
            className="mt-8 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[var(--gold)]"
            style={{
              opacity: lift ? 1 : 0.65,
              transform: lift ? "translate3d(4px,0,0)" : "translate3d(0,0,0)",
              transition: `opacity 0.7s ${EASE}, transform 0.7s ${EASE}`,
            }}
          >
            Enter
            <span aria-hidden className="text-[var(--gold-bright)]">
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function CollectionTile({
  name,
  tagline,
  slug,
  color,
  index,
}: {
  name: string;
  tagline: string;
  slug: string;
  color: string;
  index: number;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLAnchorElement>(null);
  const [spot, setSpot] = useState({ x: 50, y: 50, on: false });

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLAnchorElement>) => {
      if (reduced) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSpot({
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
        on: true,
      });
    },
    [reduced],
  );

  return (
    <Reveal delay={0.08 + index * 0.05} className="h-full">
      <Link
        ref={ref}
        href={`/shop/${slug}`}
        onPointerMove={onMove}
        onPointerLeave={() => setSpot((s) => ({ ...s, on: false }))}
        className="group relative flex h-full min-h-[120px] flex-col justify-end overflow-hidden rounded-sm p-4 sm:min-h-[132px] sm:p-5 md:min-h-[148px] md:p-6"
        style={
          {
            "--tile": color,
            transform: spot.on && !reduced ? "scale(1.045)" : "scale(1)",
            transition: `transform 0.75s ${EASE}, box-shadow 0.75s ${EASE}`,
            willChange: "transform",
            background: `linear-gradient(165deg, color-mix(in srgb, ${color} 28%, #0a0a0a) 0%, #080808 72%)`,
            boxShadow:
              spot.on && !reduced
                ? `0 22px 44px -18px rgba(0,0,0,0.8), 0 0 36px color-mix(in srgb, ${color} 35%, transparent)`
                : "0 8px 22px -16px rgba(0,0,0,0.65)",
          } as CSSProperties
        }
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-sm"
          style={{
            padding: "1px",
            background:
              "linear-gradient(140deg, rgba(232,201,122,0.7), rgba(201,168,76,0.15) 40%, rgba(255,255,255,0.05) 55%, rgba(201,168,76,0.45))",
            WebkitMask:
              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            opacity: spot.on ? 1 : 0.55,
            transition: `opacity 0.7s ${EASE}`,
          }}
        />

        {/* Spotlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: spot.on ? 1 : 0.35,
            transition: `opacity 0.65s ${EASE}`,
            background: `radial-gradient(280px circle at ${spot.x}% ${spot.y}%, color-mix(in srgb, ${color} 55%, rgba(232,201,122,0.45)), transparent 55%)`,
          }}
        />

        <div className="relative z-[1]">
          <p className="font-display text-xl text-[var(--cream)] transition-colors duration-500 group-hover:text-[var(--gold-bright)] md:text-[1.35rem]">
            {name}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{tagline}</p>
          <span
            aria-hidden
            className="mt-3 block h-px origin-left bg-gradient-to-r from-[var(--gold-bright)] via-[var(--gold)] to-transparent"
            style={{
              transform: spot.on || reduced ? "scaleX(1)" : "scaleX(0)",
              opacity: spot.on || reduced ? 1 : 0,
              transition: `transform 0.75s ${EASE}, opacity 0.75s ${EASE}`,
            }}
          />
        </div>
      </Link>
    </Reveal>
  );
}

export function ExperienceCollections() {
  return (
    <>
      {/* ——— The Experience ——— */}
      <section className="relative overflow-hidden py-28 md:py-32">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 55% at 50% -10%, rgba(201,168,76,0.07), transparent 55%), #050505",
          }}
        />
        <Grain />
        <BreathingGlow className="-left-20 top-16 h-[320px] w-[320px] md:h-[420px] md:w-[420px]" />
        <BreathingGlow className="right-[-80px] top-40 h-[280px] w-[280px] opacity-70 md:h-[360px] md:w-[360px]" />

        <div className="relative z-[2] mx-auto max-w-7xl px-3 sm:px-4 md:px-8">
          <div className="mb-14 max-w-3xl md:mb-16">
            <Reveal>
              <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--gold)]">
                The Experience
              </p>
            </Reveal>
            <LineReveal delay={0.08} className="mt-4">
              <h2 className="font-display text-4xl leading-[1.1] text-[var(--cream)] md:text-5xl lg:text-[3.4rem]">
                Not a catalog. A store worth browsing.
              </h2>
            </LineReveal>
            <Reveal delay={0.2}>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
                From cinematic entrance to aisle navigation and AR placement — every
                interaction is designed like a private tasting room.
              </p>
            </Reveal>
          </div>

          <div className="grid gap-5 md:grid-cols-3 md:gap-6">
            {EXPERIENCES.map((item, i) => (
              <Reveal key={item.title} delay={0.12 + i * 0.12}>
                <TiltCard
                  href={item.href}
                  index={i}
                  title={item.title}
                  copy={item.copy}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ——— Collections ——— */}
      <section className="relative overflow-hidden py-28 md:py-32">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 80% 0%, rgba(201,168,76,0.06), transparent 50%), #070707",
          }}
        />
        <Grain />
        <BreathingGlow className="left-1/2 top-8 h-[300px] w-[480px] -translate-x-1/2 md:h-[380px] md:w-[560px]" />

        <div className="relative z-[2] mx-auto max-w-7xl px-3 sm:px-4 md:px-8">
          <div className="mb-14 max-w-3xl md:mb-16">
            <Reveal>
              <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--gold)]">
                Collections
              </p>
            </Reveal>
            <LineReveal delay={0.08} className="mt-4">
              <h2 className="font-display text-4xl leading-[1.1] text-[var(--cream)] md:text-5xl lg:text-[3.4rem]">
                Curated by craft
              </h2>
            </LineReveal>
            <Reveal delay={0.2}>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
                Explore categories with filters for brand, country, price, rating, and{" "}
                <AbbrTooltip term="ABV" />.
              </p>
            </Reveal>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
            {getCategories().slice(0, 10).map((c, i) => (
              <CollectionTile
                key={c.slug}
                name={c.name}
                tagline={c.tagline}
                slug={c.slug}
                color={c.color}
                index={i}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
