import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import { actorOrganizationId, SAMS_ORG_ID } from "@/lib/db/organization";
import {
  fetchPromotionPerformance,
  type PromoPerformanceSort,
} from "@/lib/db/promotions-performance";

const SORTS = new Set<PromoPerformanceSort>([
  "spent",
  "discount",
  "orders",
  "customers",
  "lastUsed",
  "name",
]);

export async function GET(request: Request) {
  const auth = await requirePermission("promotions.view");
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;
    const promoId = searchParams.get("promoId") || undefined;
    const type = searchParams.get("type") || "all";
    const status = (searchParams.get("status") || "all") as
      | "all"
      | "active"
      | "inactive"
      | "expired";
    const sortParam = (searchParams.get("sort") || "spent") as PromoPerformanceSort;
    const sort = SORTS.has(sortParam) ? sortParam : "spent";
    const locationId = searchParams.get("locationId") || undefined;

    const { summary, offers } = await fetchPromotionPerformance(auth.user, {
      organizationId: orgId,
      fromDate,
      toDate,
      promoId,
      type,
      status,
      sort,
      locationId,
    });

    return NextResponse.json({
      ok: true,
      range: { from: fromDate ?? null, to: toDate ?? null },
      summary,
      offers,
    });
  } catch (error) {
    console.error("[GET /api/promotions/performance]", error);
    return NextResponse.json({ error: "Failed to load promotion performance." }, { status: 500 });
  }
}
