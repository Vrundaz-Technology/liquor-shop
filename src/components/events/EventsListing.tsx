"use client";

import { SmartImage } from "@/components/ui/SmartImage";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePublicEvents } from "@/hooks/useRuntimeEvents";
import { usePublicLocations } from "@/hooks/useRuntimeLocations";
import {
  isRuntimeDataLoaded,
  subscribeRuntimeCatalog,
} from "@/lib/runtime-data";
import { formatPrice } from "@/lib/utils";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { EventSeatCount } from "@/components/events/EventSeatCount";

const SERVER_CATALOG_LOADED = false;

function catalogLoadedSnapshot() {
  return isRuntimeDataLoaded();
}

function serverCatalogLoadedSnapshot() {
  return SERVER_CATALOG_LOADED;
}

function useCatalogLoaded() {
  return useSyncExternalStore(
    subscribeRuntimeCatalog,
    catalogLoadedSnapshot,
    serverCatalogLoadedSnapshot,
  );
}

export function EventsListing() {
  const loaded = useCatalogLoaded();
  const events = usePublicEvents();
  const locations = usePublicLocations();

  return (
    <div className="mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-14 md:px-8 md:py-16">
      <SectionHeading
        eyebrow="Calendar"
        title="Upcoming experiences"
        description="Book seats for tastings, launches, and festivals across our stores."
      />
      {!loaded ? (
        <p className="mt-10 text-sm text-muted">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="mt-10 text-sm text-muted">No upcoming events right now. Check back soon.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {events.map((ev) => {
            const loc = locations.find((l) => l.id === ev.locationId);
            return (
              <Link
                key={ev.id}
                href={`/events/${ev.slug}`}
                className="group overflow-hidden border border-white/5"
              >
                <div className="relative h-44 sm:h-52">
                  <SmartImage
                    src={ev.image}
                    alt={ev.title}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-105"
                    sizes="(max-width:768px) 100vw, 50vw"
                  />
                </div>
                <div className="p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold">
                    {ev.type.replace("-", " ")} · {ev.date}
                  </p>
                  <h2 className="mt-2 font-display text-2xl text-cream">{ev.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{ev.description}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted">{loc?.shortName}</span>
                    <span className="text-gold">
                      {formatPrice(ev.price)} ·{" "}
                      <EventSeatCount eventId={ev.id} seatsTotal={ev.seatsTotal} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
