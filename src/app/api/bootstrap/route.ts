import { NextResponse } from "next/server";
import { fetchBootstrapPayload } from "@/lib/db/queries";
import { isDbConfigured } from "@/lib/db/prisma";
import { getRequestUser } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/permissions";

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  ) as T;
}

export async function GET() {
  try {
    const payload = await fetchBootstrapPayload();
    const actor = await getRequestUser();
    const canSeeHiddenStores = Boolean(actor && hasPermission(actor, "locations.view"));
    const canSeeHiddenEvents = Boolean(actor && hasPermission(actor, "events.view"));
    const locations = canSeeHiddenStores
      ? payload.locations
      : payload.locations.filter((loc) => loc.active !== false);
    const publicStoreIds = new Set(
      payload.locations.filter((loc) => loc.active !== false).map((loc) => loc.id),
    );
    const events = canSeeHiddenEvents
      ? payload.events
      : payload.events.filter((event) => event.active !== false && publicStoreIds.has(event.locationId));
    return NextResponse.json(
      jsonSafe({
        ok: true,
        dbConnected: isDbConfigured(),
        ...payload,
        locations,
        events,
      }),
    );
  } catch (error) {
    console.error("[GET /api/bootstrap]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load store data from database." },
      { status: 500 },
    );
  }
}
