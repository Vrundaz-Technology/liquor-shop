import { NextResponse } from "next/server";
import { findStoresForZip } from "@/lib/store-finder";

/** Public: ZIP → eligible nearby stores with distance + delivery ETA. */
export async function GET(request: Request) {
  const zip = new URL(request.url).searchParams.get("zip")?.trim() ?? "";
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    return NextResponse.json(
      { error: "Enter a valid 5-digit US ZIP code." },
      { status: 400 },
    );
  }

  try {
    const result = await findStoresForZip(zip.slice(0, 5));
    return NextResponse.json({
      ok: true,
      zip: zip.slice(0, 5),
      point: result.point,
      source: result.source,
      stores: result.stores.map((row) => ({
        id: row.store.id,
        slug: row.store.slug,
        name: row.store.name,
        shortName: row.store.shortName,
        address: row.store.address,
        city: row.store.city,
        state: row.store.state,
        zip: row.store.zip,
        miles: Math.round(row.miles * 10) / 10,
        milesLabel: row.milesLabel,
        canDeliver: row.canDeliver,
        canPickup: row.canPickup,
        deliveryEta: row.deliveryEta,
        deliveryFee: row.store.deliveryFee,
        deliveryFreeMinimum: row.store.deliveryFreeMinimum,
        deliveryRadiusKm: row.store.deliveryRadiusKm,
      })),
    });
  } catch (error) {
    console.error("[GET /api/locations/nearby]", error);
    return NextResponse.json({ error: "Could not find nearby stores." }, { status: 500 });
  }
}
