import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/require";
import { canAccessLocation, accessibleLocations } from "@/lib/auth/location-access";
import { loadLocationDispatch, saveLocationDispatch } from "@/lib/db/dispatch-settings";
import {
  loadLocationFulfillment,
  saveLocationFulfillment,
} from "@/lib/db/location-pricing";
import { isDbConfigured } from "@/lib/db/prisma";
import { getAllLocations } from "@/data/locations";
import { recordActivity } from "@/lib/db/activity";

const patchSchema = z.object({
  locationId: z.string().min(1),
  pickupAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
  internalDeliveryEnabled: z.boolean().optional(),
  shipdayEnabled: z.boolean().optional(),
  dispatchPolicy: z.enum(["manual", "internal_first", "shipday_always"]).optional(),
});

export async function GET() {
  const { user, error } = await requirePermission("deliveries.manage");
  if (error) return error;
  try {
    const stores = accessibleLocations(user, getAllLocations());
    const locations = await Promise.all(
      stores.map(async (loc) => {
        const fallbackDispatch = {
          internalDeliveryEnabled: loc.internalDeliveryEnabled !== false,
          shipdayEnabled: Boolean(loc.shipdayEnabled),
          dispatchPolicy: loc.dispatchPolicy ?? "internal_first",
        };
        const fallbackFulfillment = {
          pickupAvailable: loc.pickupAvailable !== false,
          deliveryAvailable: loc.deliveryAvailable !== false,
        };
        const dispatch = isDbConfigured()
          ? await loadLocationDispatch(loc.id)
          : fallbackDispatch;
        const fulfillment = isDbConfigured()
          ? await loadLocationFulfillment(loc.id)
          : fallbackFulfillment;
        return {
          id: loc.id,
          shortName: loc.shortName,
          name: loc.name,
          ...fulfillment,
          ...dispatch,
        };
      }),
    );
    return NextResponse.json({ locations });
  } catch (err) {
    console.error("[GET /api/deliveries/settings]", err);
    return NextResponse.json({ error: "Failed to load delivery settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { user, error } = await requirePermission("deliveries.manage");
  if (error) return error;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid delivery settings." }, { status: 400 });
    }
    if (!canAccessLocation(user, parsed.data.locationId)) {
      return NextResponse.json({ error: "You do not have access to that store." }, { status: 403 });
    }
    if (!isDbConfigured()) {
      return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
    }
    const { locationId, pickupAvailable, deliveryAvailable, ...dispatchPatch } = parsed.data;
    const fulfillmentTouched = pickupAvailable !== undefined || deliveryAvailable !== undefined;
    const dispatchTouched =
      dispatchPatch.internalDeliveryEnabled !== undefined ||
      dispatchPatch.shipdayEnabled !== undefined ||
      dispatchPatch.dispatchPolicy !== undefined;

    const fulfillment = fulfillmentTouched
      ? await saveLocationFulfillment(locationId, { pickupAvailable, deliveryAvailable })
      : await loadLocationFulfillment(locationId);
    const dispatch = dispatchTouched
      ? await saveLocationDispatch(locationId, dispatchPatch)
      : await loadLocationDispatch(locationId);

    if (fulfillmentTouched) {
      const store = getAllLocations().find((loc) => loc.id === locationId);
      const parts = [
        pickupAvailable !== undefined
          ? `pickup ${fulfillment.pickupAvailable ? "on" : "off"}`
          : null,
        deliveryAvailable !== undefined
          ? `delivery ${fulfillment.deliveryAvailable ? "on" : "off"}`
          : null,
      ].filter(Boolean);
      await recordActivity({
        actorUserId: user.id,
        action: "location.updated",
        entityType: "location",
        entityId: locationId,
        locationId,
        summary: `${user.name} set ${parts.join(" and ")} at ${store?.shortName ?? locationId}`,
        metadata: fulfillment,
      });
    }

    return NextResponse.json({ locationId, ...fulfillment, ...dispatch });
  } catch (err) {
    console.error("[PATCH /api/deliveries/settings]", err);
    return NextResponse.json({ error: "Failed to save delivery settings." }, { status: 500 });
  }
}
