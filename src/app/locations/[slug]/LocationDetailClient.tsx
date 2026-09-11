"use client";

import { notFound, useParams } from "next/navigation";
import { SmartImage } from "@/components/ui/SmartImage";
import { getAllProducts } from "@/data/products";
import { usePublicEvents } from "@/hooks/useRuntimeEvents";
import { useRuntimeLocations } from "@/hooks/useRuntimeLocations";
import { ProductCard } from "@/components/product/ProductCard";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { switchShoppingStore } from "@/lib/switch-store";
import { useCatalogStore } from "@/store/catalog";
import { useInventoryStore } from "@/store/inventory";
import { useMemo, useEffect, useState } from "react";
import { ReviewForm, ReviewList } from "@/components/reviews/ReviewForm";
import type { PlatformReview } from "@/types";

export function LocationDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const locations = useRuntimeLocations();
  const loc = useMemo(() => locations.find((l) => l.slug === slug), [locations, slug]);
  const publicEvents = usePublicEvents();
  const catalogRevision = useCatalogStore((s) => s.revision);
  const isHidden = useInventoryStore((s) => s.isHidden);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  const [storeReviews, setStoreReviews] = useState<PlatformReview[]>([]);

  useEffect(() => {
    if (!loc) return;
    let cancelled = false;
    void fetch(`/api/reviews?locationId=${encodeURIComponent(loc.id)}&targetType=store`)
      .then((r) => r.json())
      .then((data: { reviews?: PlatformReview[] }) => {
        if (!cancelled) setStoreReviews(data.reviews ?? []);
      })
      .catch(() => {
        if (!cancelled) setStoreReviews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loc]);

  if (!loc) {
    notFound();
  }

  const featuredIds = loc.inventory.filter((i) => i.featured).map((i) => i.productId);
  void catalogRevision;
  void inventoryRevision;
  const featured = getAllProducts()
    .filter((p) => featuredIds.includes(p.id) && !isHidden(loc.id, p.id))
    .slice(0, 4);
  const locEvents = publicEvents.filter((e) => e.locationId === loc.id);

  return (
    <div>
      <div className="relative h-[50vh] min-h-80">
        <SmartImage src={loc.heroImage} alt={loc.name} fill className="object-cover" priority sizes="100vw" />
        <div className="absolute inset-0 bg-linear-to-t from-[#070707] via-black/40 to-black/30" />
        <div className="absolute bottom-10 left-0 right-0 mx-auto max-w-7xl px-3 sm:px-4 md:px-8">
          <p className="text-[10px] uppercase tracking-[0.28em] text-gold">Location</p>
          <h1 className="font-display text-[clamp(1.75rem,6vw,3.75rem)] leading-tight text-cream">
            {loc.shortName}
          </h1>
          <p className="mt-1 text-sm text-gold sm:text-base">Sam&apos;s Discount Liquor</p>
          <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">{loc.description}</p>
          <Button className="mt-6" onClick={() => switchShoppingStore(loc.id)}>
            Shop this branch
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-14 md:px-8 md:py-16">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl text-cream">Interior</h2>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {loc.gallery.map((g) => (
                <div key={g} className="relative aspect-4/3">
                  <SmartImage src={g} alt="" fill className="object-cover" sizes="40vw" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-3xl text-cream">Team</h2>
            <div className="mt-6 space-y-4">
              {loc.staff.map((s) => (
                <div key={s.name} className="flex items-center gap-4">
                  <div className="relative h-16 w-16 overflow-hidden rounded-sm">
                    <SmartImage src={s.image} alt={s.name} fill className="object-cover" sizes="64px" />
                  </div>
                  <div>
                    <p className="text-cream">{s.name}</p>
                    <p className="text-sm text-muted">{s.role}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 glass p-5 text-sm text-muted">
              <p>{loc.address}, {loc.city}, {loc.state} {loc.zip}</p>
              <p className="mt-2">{loc.phone}</p>
              <p className="mt-2">{loc.email}</p>
              <p className="mt-4 text-gold">Offers</p>
              <ul className="mt-2 list-disc pl-4">
                {loc.featuredOffers.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="font-display text-3xl text-cream">Featured here</h2>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {featured.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} locationId={loc.id} />
            ))}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="font-display text-3xl text-cream">Store reviews</h2>
          <p className="mt-2 text-sm text-muted">
            Rate your experience shopping at {loc.shortName}.
          </p>
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <ReviewForm
              targetType="store"
              locationId={loc.id}
              onCreated={(review) => setStoreReviews((prev) => [review, ...prev])}
            />
            <ReviewList reviews={storeReviews} />
          </div>
        </div>

        {locEvents.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display text-3xl text-cream">Events</h2>
            <div className="mt-6 space-y-3">
              {locEvents.map((e) => (
                <Link
                  key={e.id}
                  href={`/events/${e.slug}`}
                  className="flex flex-col gap-1 border border-white/5 p-4 hover:border-(--gold)/30 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0 text-cream wrap-break-word">{e.title}</span>
                  <span className="shrink-0 text-sm text-muted">{e.date}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
