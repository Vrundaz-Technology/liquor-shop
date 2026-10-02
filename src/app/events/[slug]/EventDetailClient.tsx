"use client";

import { notFound, useParams } from "next/navigation";
import { SmartImage } from "@/components/ui/SmartImage";
import { useMemo, useState } from "react";
import { getLocationById } from "@/data/locations";
import { usePublicEvents } from "@/hooks/useRuntimeEvents";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useLiveSeats } from "@/hooks/useHydratedInventory";
import { useInventoryStore } from "@/store/inventory";

export function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const events = usePublicEvents();
  const event = useMemo(() => events.find((item) => item.slug === slug), [events, slug]);
  const [seats, setSeats] = useState(1);
  const [booked, setBooked] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const seatsAvailable = useLiveSeats(event?.id ?? "");
  const [booking, setBooking] = useState(false);
  const bookSeats = useInventoryStore((s) => s.bookSeats);

  if (!event) {
    notFound();
  }

  const loc = getLocationById(event.locationId);

  return (
    <div>
      <div className="relative h-[45vh] min-h-70">
        <SmartImage src={event.image} alt={event.title} fill className="object-cover" priority sizes="100vw" />
        <div className="absolute inset-0 bg-linear-to-t from-[#070707] to-black/40" />
        <div className="absolute bottom-8 left-0 right-0 mx-auto w-full max-w-7xl px-3 pb-2 sm:px-4 md:bottom-10 md:px-8">
          <p className="text-[10px] uppercase tracking-[0.28em] text-gold">
            {event.type.replace("-", " ")}
          </p>
          <h1 className="mt-1 font-display text-[clamp(1.75rem,6vw,3rem)] leading-tight text-cream">
            {event.title}
          </h1>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-3 py-10 sm:px-4 sm:py-12 md:grid-cols-2 md:px-8">
        <div>
          <p className="leading-relaxed text-muted">{event.description}</p>
          <dl className="mt-8 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <dt className="shrink-0 text-muted">Date</dt>
              <dd className="min-w-0 text-right">{event.date}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <dt className="shrink-0 text-muted">Time</dt>
              <dd className="min-w-0 text-right">
                {event.startTime} – {event.endTime}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <dt className="shrink-0 text-muted">Location</dt>
              <dd className="min-w-0 text-right wrap-break-word">{loc?.shortName ?? loc?.name}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <dt className="shrink-0 text-muted">Hosts</dt>
              <dd className="min-w-0 text-right wrap-break-word">{event.hosts.join(", ")}</dd>
            </div>
            <div className="flex justify-between border-b border-white/5 py-2">
              <dt className="text-muted">Seats available</dt>
              <dd>
                {seatsAvailable} / {event.seatsTotal}
              </dd>
            </div>
          </dl>
        </div>
        <div className="glass-gold h-fit p-6">
          {booked ? (
            <div className="text-center">
              <p className="text-gold">Reservation confirmed</p>
              <p className="mt-2 text-sm text-muted">
                See you on {event.date}. A calendar invite would be emailed in production.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Book seats</p>
              <p className="mt-2 font-display text-3xl text-cream">
                {formatPrice(event.price)}
                <span className="text-base text-muted"> / guest</span>
              </p>
              <Input
                className="mt-4"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="mt-3 block text-xs text-muted">
                Guests
                <input
                  type="number"
                  min={1}
                  max={Math.min(6, seatsAvailable)}
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className="mt-1 w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-cream"
                />
              </label>
              <p className="mt-3 text-sm text-muted">
                Total {formatPrice(event.price * seats)}
              </p>
              {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
              <Button
                className="mt-4 w-full"
                disabled={!name.trim() || seatsAvailable <= 0 || seats > seatsAvailable || booking}
                onClick={() => {
                  void (async () => {
                    setBooking(true);
                    setError("");
                    const ok = await bookSeats(event.id, seats);
                    setBooking(false);
                    if (!ok) {
                      setError("Not enough seats remaining. Try fewer guests.");
                      return;
                    }
                    setBooked(true);
                  })();
                }}
              >
                {seatsAvailable <= 0 ? "Sold out" : booking ? "Reserving…" : "Reserve"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
