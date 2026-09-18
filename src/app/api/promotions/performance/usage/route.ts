import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import { actorOrganizationId, SAMS_ORG_ID } from "@/lib/db/organization";
import { fetchPromotionUsage } from "@/lib/db/promotions-performance";

export async function GET(request: Request) {
  const auth = await requirePermission("promotions.view");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const promoId = searchParams.get("promoId")?.trim();
  if (!promoId) {
    return NextResponse.json({ error: "Offer id is required." }, { status: 400 });
  }

  try {
    const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;
    const locationId = searchParams.get("locationId") || undefined;
    const detail = await fetchPromotionUsage(auth.user, {
      organizationId: orgId,
      promoId,
      fromDate,
      toDate,
      locationId,
    });
    if (!detail.offer) {
      return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    console.error("[GET /api/promotions/performance/usage]", error);
    return NextResponse.json({ error: "Could not load offer usage." }, { status: 500 });
  }
}
