"use client";

import dynamic from "next/dynamic";
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
import { MapPin, Phone, Clock, Car } from "lucide-react";
import { useRuntimeLocations } from "@/hooks/useRuntimeLocations";
import type { StoreLocation } from "@/types";
import { cn, publicFulfillmentSummary, publicStoreServices } from "@/lib/utils";

const LocationsMap = dynamic(
  () => import("@/components/locations/LocationsMap").then((m) => m.LocationsMap),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-[#0c0b09]" />,
  },
);

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

function useInView(threshold = 0.14) {
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
      { threshold, rootMargin: "0px 0px -6% 0px" },
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
        transform: show ? "translate3d(0,0,0)" : "translate3d(0,40px,0)",
        transition: `opacity 1.15s ${EASE} ${delay}s, transform 1.15s ${EASE} ${delay}s`,
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
    <div ref={ref} className={cn("overflow-hidden", className)}>
      <div
        style={{
          transform: show ? "translate3d(0,0,0)" : "translate3d(0,115%,0)",
          transition: `transform 1.3s ${EASE} ${delay}s`,
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
      className="pointer-events-none absolute inset-0 z-[1] opacity-[0.06] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "160px 160px",
      }}
    />
  );
}

function BreathingGlow({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-full blur-3xl premium-breathe",
        className,
      )}
      style={{
        background:
          "radial-gradient(circle, rgba(201,168,76,0.32) 0%, rgba(201,168,76,0.1) 40%, transparent 70%)",
      }}
    />
  );
}

function hoursSummary(loc: StoreLocation) {
  const first = loc.hours[0];
  const last = loc.hours[loc.hours.length - 1];
  if (!first) return "Hours on request";
  if (loc.hours.length === 1) {
    return `${first.day} ${first.open}–${first.close}`;
  }
  return `${first.day} ${first.open}–${first.close} · ${last.day} ${last.open}–${last.close}`;
}

function parkingSummary(loc: StoreLocation) {
  const text = loc.parking?.trim();
  if (!text) return "Parking details on request";
  return text.length > 72 ? `${text.slice(0, 69)}…` : text;
}

function LocationCard({ loc, index }: { loc: StoreLocation; index: number }) {
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, x: 50, y: 50, active: false });

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reduced) return;
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        setTilt({
          rx: (0.5 - py) * 12,
          ry: (px - 0.5) * 16,
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
  const services = [
    ...publicStoreServices(loc.services, loc.deliveryAvailable, loc.pickupAvailable).slice(0, 4),
  ];
  while (services.length < 4) services.push("");

  return (
    <Reveal delay={0.08 + index * 0.1} className="h-full min-h-0">
      <div
        id={`store-card-${loc.id}`}
        className="h-full scroll-mt-24"
        style={{ perspective: "1400px", transformStyle: "preserve-3d" }}
      >
        <div
          ref={cardRef}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          className="group relative flex h-full flex-col overflow-hidden rounded-sm"
          style={{
            transform: lift
              ? `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(20px) scale(1.02)`
              : "rotateX(0deg) rotateY(0deg) translateZ(0) scale(1)",
            transition: `transform 0.75s ${EASE}, box-shadow 0.75s ${EASE}`,
            transformStyle: "preserve-3d",
            willChange: "transform",
            background: `
              #0b0b0b padding-box,
              linear-gradient(
                135deg,
                ${lift ? "rgba(232,201,122,0.95)" : "rgba(201,168,76,0.7)"} 0%,
                rgba(201,168,76,0.22) 38%,
                rgba(255,255,255,0.1) 52%,
                ${lift ? "rgba(232,201,122,0.85)" : "rgba(201,168,76,0.5)"} 100%
              ) border-box
            `,
            border: "1px solid transparent",
            boxShadow: lift
              ? "0 32px 64px -24px rgba(0,0,0,0.9), 0 0 48px rgba(201,168,76,0.22)"
              : "0 14px 36px -20px rgba(0,0,0,0.75)",
          }}
        >
          <div className="relative h-52 shrink-0 overflow-hidden">
            <SmartImage
              src={loc.heroImage}
              alt={loc.name}
              fill
              className="object-cover object-center"
              style={{
                transform: lift
                  ? `scale(1.06) translate3d(${(tilt.x - 50) * 0.04}px, ${(tilt.y - 50) * 0.03}px, 0)`
                  : "scale(1)",
                transition: `transform 0.75s ${EASE}`,
              }}
              sizes="(max-width: 768px) 100vw, 33vw"
              quality={92}
              priority={index === 0}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(11,11,11,0.88) 0%, rgba(11,11,11,0.25) 45%, transparent 72%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: lift ? 1 : 0,
                transition: `opacity 0.5s ${EASE}`,
                background: `radial-gradient(280px circle at ${tilt.x}% ${tilt.y}%, rgba(232,201,122,0.35), transparent 55%)`,
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-6 h-36 w-36 rounded-full blur-2xl"
              style={{
                background: "radial-gradient(circle, rgba(201,168,76,0.35), transparent 70%)",
                transform: `translate3d(${(tilt.x - 50) * -0.12}px, ${(tilt.y - 50) * -0.1}px, 0)`,
                transition: `transform 0.75s ${EASE}`,
                opacity: lift ? 0.9 : 0.35,
              }}
            />
            <div
              className="absolute bottom-0 left-0 right-0 p-5"
              style={{
                transform: lift
                  ? `translate3d(${(tilt.x - 50) * 0.05}px, ${(tilt.y - 50) * 0.03}px, 0)`
                  : undefined,
                transition: `transform 0.75s ${EASE}`,
              }}
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--gold-bright)]">
                Store {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-1.5 font-display text-[1.85rem] leading-none text-[var(--cream)] drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] md:text-[2rem]">
                {loc.shortName}
              </h2>
              <span
                aria-hidden
                className="mt-3 block h-px origin-left bg-gradient-to-r from-[var(--gold-bright)] via-[var(--gold)] to-transparent"
                style={{
                  transform: lift || reduced ? "scaleX(1)" : "scaleX(0.4)",
                  transition: `transform 0.75s ${EASE}`,
                }}
              />
            </div>
          </div>

          <div className="relative z-10 flex flex-1 flex-col bg-[#0b0b0b] px-5 pb-5 pt-1 md:px-6 md:pb-6">
            <ul className="grid gap-0 text-[13px] leading-snug text-[var(--cream)]">
              <li className="flex min-h-11 items-center gap-2.5 border-b border-white/10 py-2.5">
                <MapPin size={14} className="shrink-0 text-[var(--gold)]" />
                <span className="line-clamp-2">
                  {loc.address}, {loc.city}
                </span>
              </li>
              <li className="flex min-h-11 items-center gap-2.5 border-b border-white/10 py-2.5">
                <Phone size={14} className="shrink-0 text-[var(--gold)]" />
                <span className="truncate">{loc.phone}</span>
              </li>
              <li className="flex min-h-11 items-center gap-2.5 border-b border-white/10 py-2.5">
                <Clock size={14} className="shrink-0 text-[var(--gold)]" />
                <span className="line-clamp-2">{hoursSummary(loc)}</span>
              </li>
              <li className="flex min-h-11 items-center gap-2.5 py-2.5">
                <Car size={14} className="shrink-0 text-[var(--gold)]" />
                <span className="line-clamp-2">{parkingSummary(loc)}</span>
              </li>
            </ul>

            <p className="mt-3 h-5 text-[12px] tracking-wide text-[var(--muted)]">
              {publicFulfillmentSummary(loc)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-1.5">
              {services.map((s, i) => (
                <span
                  key={`${loc.id}-svc-${i}`}
                  className="flex h-9 items-center truncate border border-[var(--gold)]/35 bg-[#121212] px-2.5 text-[11px] tracking-wide text-[var(--cream)]"
                  style={{ visibility: s ? "visible" : "hidden" }}
                >
                  {s || "—"}
                </span>
              ))}
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2.5 pt-6">
              <Link
                href={`/locations/${loc.slug}`}
                className="inline-flex h-10 items-center justify-center rounded-sm bg-gradient-to-r from-[#8a7340] via-[#c9a962] to-[#e4c878] text-xs font-medium tracking-wide text-[#0a0a0a] transition-[filter] duration-500 hover:brightness-110"
                style={{ transitionTimingFunction: EASE }}
              >
                Details
              </Link>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-sm border border-[var(--gold)]/60 text-xs tracking-wide text-[var(--gold)] transition-colors duration-500 hover:bg-[var(--gold)]/10"
                style={{ transitionTimingFunction: EASE }}
              >
                Directions
              </a>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function LocationsShowcase() {
  const locations = useRuntimeLocations();
  const [activeBranch, setActiveBranch] = useState<string | null>(null);

  const focusStore = useCallback((id: string) => {
    setActiveBranch(id);
    document.getElementById(`store-card-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, []);

  const storeCountLabel =
    locations.length === 0
      ? "Stores will appear here once added."
      : locations.length === 1
        ? "One branch with location-based inventory, pickup, and delivery."
        : `${locations.length} branches with location-based inventory, pickup, and delivery.`;

  return (
    <section className="relative overflow-hidden pb-8">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 18% -5%, rgba(201,168,76,0.09), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 30%, rgba(201,168,76,0.04), transparent 50%), #050505",
        }}
      />
      <Grain />
      <BreathingGlow className="-left-20 top-6 h-[340px] w-[340px] md:h-[460px] md:w-[460px]" />
      <BreathingGlow className="right-[-80px] top-40 h-[280px] w-[280px] opacity-60 md:h-[380px] md:w-[380px]" />

      <div className="relative z-[2] mx-auto max-w-7xl px-3 py-12 sm:px-4 md:px-8 md:py-24">
        <div className="relative mb-12 max-w-3xl md:mb-16">
          <BreathingGlow className="-left-10 -top-8 h-48 w-72 opacity-80" />
          <Reveal>
            <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--gold)]">Stores</p>
          </Reveal>
          <LineReveal delay={0.08} className="mt-4">
            <h1 className="font-display text-4xl leading-[1.08] text-[var(--cream)] md:text-5xl lg:text-[3.5rem]">
              Find your store
            </h1>
          </LineReveal>
          <Reveal delay={0.18}>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
              {storeCountLabel}
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <div
            className="relative mb-6 overflow-hidden rounded-sm md:mb-8"
            style={{
              background: `
                linear-gradient(#0c0b09, #0c0b09) padding-box,
                linear-gradient(135deg, rgba(232,201,122,0.7), rgba(201,168,76,0.15) 40%, rgba(255,255,255,0.06) 55%, rgba(201,168,76,0.5)) border-box
              `,
              border: "1px solid transparent",
              boxShadow: "0 24px 60px -28px rgba(0,0,0,0.85), 0 0 40px rgba(201,168,76,0.08)",
            }}
          >
            <div className="relative aspect-[16/10] w-full min-h-64 sm:min-h-72 md:aspect-[21/9] md:min-h-80">
              <LocationsMap
                className="absolute inset-0"
                locations={locations}
                activeId={activeBranch}
                onActiveChange={setActiveBranch}
                onSelect={focusStore}
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-10 sm:px-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                  Interactive map
                </p>
                <div className="pointer-events-auto flex flex-wrap gap-1.5">
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onMouseEnter={() => setActiveBranch(loc.id)}
                      onMouseLeave={() => setActiveBranch(null)}
                      onClick={() => focusStore(loc.id)}
                      className="whitespace-nowrap px-2.5 py-1 text-[11px] tracking-wide transition-[color,box-shadow,background] duration-500"
                      style={{
                        color:
                          activeBranch === loc.id
                            ? "var(--gold-bright)"
                            : "var(--cream)",
                        boxShadow:
                          activeBranch === loc.id
                            ? "inset 0 0 0 1px rgba(232,201,122,0.65)"
                            : "inset 0 0 0 1px rgba(201,168,76,0.28)",
                        background:
                          activeBranch === loc.id
                            ? "rgba(201,168,76,0.14)"
                            : "rgba(7,7,7,0.72)",
                        transitionTimingFunction: EASE,
                      }}
                    >
                      {loc.shortName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {locations.length === 0 ? (
          <div className="border border-white/10 px-4 py-16 text-center text-sm text-muted">
            No stores yet. Add a location from the dashboard to show it here.
          </div>
        ) : (
          <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {locations.map((loc, i) => (
              <LocationCard key={loc.id} loc={loc} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
