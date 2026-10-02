"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import Link from "next/link";
import { products } from "@/data/products";
import { Button } from "@/components/ui/Button";
import { ArrowRight, View } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const HERO_PRODUCT =
  products.find((p) => p.slug === "buffalo-trace-bourbon") ?? products[0];

/** Floating gold dust — cinematic particle field over the bar scene */
function GoldParticles() {
  const dots = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: `${8 + ((i * 37) % 84)}%`,
    top: `${12 + ((i * 53) % 76)}%`,
    size: 1.5 + (i % 4),
    delay: (i % 9) * 0.45,
    duration: 4.5 + (i % 5),
  }));

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <span
          key={d.id}
          className="hero-particle absolute rounded-full bg-[var(--gold-bright)]"
          style={{
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            opacity: 0.35,
            boxShadow: "0 0 8px rgba(228,200,120,0.55)",
            animation: `heroFloat ${d.duration}s ease-in-out ${d.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function LandingHero() {
  const root = useRef<HTMLElement>(null);
  const x = useMotionValue(70);
  const y = useMotionValue(40);
  const spotlight = useMotionTemplate`radial-gradient(720px circle at ${x}% ${y}%, rgba(201,169,98,0.16), transparent 48%)`;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(
        ".hero-brand",
        { opacity: 0, y: 40, filter: "blur(12px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.4 },
      )
        .fromTo(
          ".hero-line",
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 1 },
          "-=0.75",
        )
        .fromTo(
          ".hero-cta",
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.9 },
          "-=0.55",
        )
        .fromTo(
          ".hero-scene",
          { opacity: 0, scale: 1.06 },
          { opacity: 1, scale: 1, duration: 1.6, ease: "power2.out" },
          0,
        );

      gsap.to(".hero-smoke", {
        x: 40,
        opacity: 0.22,
        duration: 8,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      gsap.to(".hero-scene", {
        scale: 1.08,
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={root}
      className="relative flex min-h-[100svh] items-end overflow-hidden pb-20 pt-28 md:items-center md:pb-0"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        x.set(((e.clientX - rect.left) / rect.width) * 100);
        y.set(((e.clientY - rect.top) / rect.height) * 100);
      }}
    >
      {/* Full-bleed photoreal bar — shelves, hero bottle, bokeh */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="hero-scene absolute inset-0 scale-100">
          <Image
            src="/hero-maison-bar.png"
            alt=""
            fill
            priority
            className="object-cover object-[68%_center] md:object-[72%_center]"
            sizes="100vw"
          />
        </div>

        {/* Readability veil — keeps left copy clean */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050403] via-[#050403]/88 to-[#050403]/15 md:via-[#050403]/78 md:to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-[#070707]/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_45%,transparent_20%,rgba(5,4,3,0.45)_100%)]" />

        {/* Amber volumetric bloom */}
        <div className="pointer-events-none absolute right-[18%] top-[10%] h-[50vmin] w-[50vmin] rounded-full bg-[radial-gradient(circle,rgba(201,169,98,0.18),transparent_70%)] blur-3xl" />

        {/* Soft smoke drifts */}
        <div className="hero-smoke pointer-events-none absolute bottom-[8%] right-[5%] h-[40%] w-[55%] rounded-[100%] bg-[radial-gradient(ellipse,rgba(243,234,215,0.08),transparent_70%)] opacity-30 blur-3xl" />
        <div className="hero-smoke pointer-events-none absolute bottom-[18%] right-[28%] h-[28%] w-[35%] rounded-[100%] bg-[radial-gradient(ellipse,rgba(201,169,98,0.1),transparent_70%)] opacity-25 blur-2xl [animation-delay:2s]" />

        <GoldParticles />
        <motion.div className="absolute inset-0" style={{ background: spotlight }} />
      </div>

      {/* Left copy — brand, line, CTAs only */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-8">
        <div className="max-w-xl">
          <p className="hero-brand mb-5 text-[11px] uppercase tracking-[0.42em] text-[var(--gold)]">
            Est. New York · Three Stores
          </p>
          <h1 className="hero-brand font-display text-[clamp(2.1rem,9vw,4.5rem)] leading-[1.02] text-[var(--cream)]">
            <span className="gold-text animate-shimmer">Sam&apos;s Discount Liquor</span>
          </h1>
          <p className="hero-line mt-5 max-w-md text-sm leading-relaxed text-[var(--muted)] sm:mt-6 sm:text-base md:text-lg">
            Walk the aisles. Lift every bottle in AR. Reserve rarities at your preferred branch.
          </p>
          <div className="hero-cta mt-8 flex w-full flex-col gap-3 sm:mt-10 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link href="/virtual-store" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                Enter the Store <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href={`/ar/${HERO_PRODUCT.slug}`} className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <View size={16} /> View in Your Space
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 hidden -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] md:block">
        Scroll to explore
      </div>
    </section>
  );
}
