import { NextResponse } from "next/server";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { mapOrder } from "@/lib/db/mappers";
import { hydrateOrderDelivery } from "@/lib/db/delivery";
import {
  buildTrackingSteps,
  trackingEtaLabel,
  customerStatusLabel,
  withComputedEta,
} from "@/lib/commerce/order-tracking";
import { getLocationById } from "@/data/locations";

export async function GET(request: Request) {
  try {
    if (!isDbConfigured()) {
      return NextResponse.json({ error: "Tracking unavailable." }, { status: 503 });
    }
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") ?? searchParams.get("tracking") ?? "")
      .trim()
      .toUpperCase();
    const orderId = (searchParams.get("orderId") ?? "").trim();

    if (!code && !orderId) {
      return NextResponse.json(
        { error: "Provide a tracking code or order id." },
        { status: 400 },
      );
    }

    const order = await prisma.order.findFirst({
      where: code ? { tracking: { equals: code } } : { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    let mapped = mapOrder(order);
    mapped = await hydrateOrderDelivery(mapped);
    mapped = withComputedEta(mapped);

    const store = getLocationById(mapped.locationId);

    return NextResponse.json({
      order: mapped,
      statusLabel: customerStatusLabel(mapped),
      steps: buildTrackingSteps(mapped),
      etaLabel: trackingEtaLabel(mapped),
      store: store
        ? {
            id: store.id,
            name: store.shortName,
            address: `${store.address}, ${store.city}`,
          }
        : null,
    });
  } catch (error) {
    console.error("[GET /api/orders/track]", error);
    return NextResponse.json({ error: "Failed to load tracking." }, { status: 500 });
  }
}
