import { NextResponse } from "next/server";
import { bookEventSeats, fetchAllLocations, fetchEventBySlug, fetchEvents, fetchInventoryState } from "@/lib/db/queries";
import { bookSeatsSchema, eventPatchSchema, eventWriteSchema } from "@/lib/db/validators";
import { getRequestUser, requirePermission } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/permissions";
import { createStoreEvent, deleteStoreEvent, updateStoreEvent } from "@/lib/db/store-admin";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { asBool } from "@/lib/db/location-pricing";

function isEventPublic(
  event: { active?: boolean; locationId: string },
  stores: { id: string; active?: boolean }[],
) {
  if (!asBool(event.active, true)) return false;
  const store = stores.find((loc) => loc.id === event.locationId);
  return asBool(store?.active, true);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const actor = await getRequestUser();
    const canSeeHidden = Boolean(actor && hasPermission(actor, "events.view"));
    const slug = searchParams.get("slug");
    if (slug) {
      const event = await fetchEventBySlug(slug);
      if (!event) {
        return NextResponse.json({ error: "Event not found." }, { status: 404 });
      }
      if (!canSeeHidden) {
        const stores = await fetchAllLocations();
        if (!isEventPublic(event, stores)) {
          return NextResponse.json({ error: "Event not found." }, { status: 404 });
        }
      }
      return NextResponse.json({ event });
    }
    const events = await fetchEvents();
    if (canSeeHidden) {
      return NextResponse.json({ events });
    }
    const stores = await fetchAllLocations();
    return NextResponse.json({
      events: events.filter((event) => isEventPublic(event, stores)),
    });
  } catch (error) {
    console.error("[GET /api/events]", error);
    return NextResponse.json({ error: "Failed to fetch events." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const limited = rateLimit(`events-book:${clientIp(request)}`, { limit: 8, windowMs: 60_000 });
    if (!limited.ok) {
      return tooManyRequests(limited.retryAfter, "Too many booking attempts. Try again shortly.");
    }
    const parsed = bookSeatsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid booking payload." }, { status: 400 });
    }
    const actor = await getRequestUser();
    // Ignore spoofable body actorUserId — guests book as anonymous.
    const ok = await bookEventSeats(parsed.data.eventId, parsed.data.qty, actor?.id);
    if (!ok) {
      return NextResponse.json({ error: "Not enough seats available." }, { status: 409 });
    }
    const inventory = await fetchInventoryState();
    return NextResponse.json({ ok: true, inventory });
  } catch (error) {
    console.error("[POST /api/events]", error);
    return NextResponse.json({ error: "Failed to book seats." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { user, error } = await requirePermission("events.create");
    if (error) return error;
    const parsed = eventWriteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Event title, store, date, and seats are required." },
        { status: 400 },
      );
    }
    const result = await createStoreEvent(user, parsed.data);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ event: result.event });
  } catch (error) {
    console.error("[PUT /api/events]", error);
    return NextResponse.json({ error: "Failed to create event." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, error } = await requirePermission("events.edit");
    if (error) return error;
    const parsed = eventPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid event update." },
        { status: 400 },
      );
    }
    const result = await updateStoreEvent(user, parsed.data.eventId, parsed.data.patch);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ event: result.event });
  } catch (error) {
    console.error("[PATCH /api/events]", error);
    return NextResponse.json({ error: "Failed to update event." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, error } = await requirePermission("events.delete");
    if (error) return error;
    const eventId = new URL(request.url).searchParams.get("id");
    if (!eventId) {
      return NextResponse.json({ error: "Event id is required." }, { status: 400 });
    }
    const result = await deleteStoreEvent(user, eventId);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    console.error("[DELETE /api/events]", error);
    return NextResponse.json({ error: "Failed to delete event." }, { status: 500 });
  }
}
