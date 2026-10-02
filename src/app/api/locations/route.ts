import { NextResponse } from "next/server";
import { fetchAllLocations, fetchLocationBySlug } from "@/lib/db/queries";
import { locationPatchSchema, locationWriteSchema } from "@/lib/db/validators";
import {
  createStoreLocation,
  deleteStoreLocation,
  updateStoreLocation,
} from "@/lib/db/store-admin";
import { getRequestUser, requirePermission } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const actor = await getRequestUser();
    const canSeeHidden = Boolean(actor && hasPermission(actor, "locations.view"));
    const slug = searchParams.get("slug");
    if (slug) {
      const location = await fetchLocationBySlug(slug);
      if (!location || (!canSeeHidden && location.active === false)) {
        return NextResponse.json({ error: "Location not found." }, { status: 404 });
      }
      return NextResponse.json({ location });
    }
    const locations = await fetchAllLocations();
    return NextResponse.json({
      locations: canSeeHidden ? locations : locations.filter((loc) => loc.active !== false),
    });
  } catch (error) {
    console.error("[GET /api/locations]", error);
    return NextResponse.json({ error: "Failed to fetch locations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await requirePermission("locations.create");
    if (error) return error;
    const parsed = locationWriteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Store name, address, and contact details are required.",
        },
        { status: 400 },
      );
    }
    const result = await createStoreLocation(user, parsed.data);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ location: result.location });
  } catch (error) {
    console.error("[POST /api/locations]", error);
    return NextResponse.json({ error: "Failed to create location." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, error } = await requirePermission("locations.edit");
    if (error) return error;
    const parsed = locationPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid location update." },
        { status: 400 },
      );
    }
    const result = await updateStoreLocation(user, parsed.data.locationId, parsed.data.patch);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ location: result.location });
  } catch (error) {
    console.error("[PATCH /api/locations]", error);
    return NextResponse.json({ error: "Failed to update location." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, error } = await requirePermission("locations.delete");
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("id");
    if (!locationId) {
      return NextResponse.json({ error: "Location id is required." }, { status: 400 });
    }
    const result = await deleteStoreLocation(user, locationId);
    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    console.error("[DELETE /api/locations]", error);
    return NextResponse.json({ error: "Failed to delete location." }, { status: 500 });
  }
}
