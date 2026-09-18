import { NextResponse } from "next/server";
import { listCustomerCoupons, parsePromoLineItems } from "@/lib/commerce/promotions";
import { SAMS_ORG_ID, resolveLocationOrganizationId } from "@/lib/db/organization";
import { isDbConfigured } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import { getRequestUser } from "@/lib/auth/require";
import { isStaffRole } from "@/lib/auth/roles";

async function resolveFirstOrder(
  userId: string | undefined,
  organizationId: string,
): Promise<boolean | undefined> {
  if (!userId || !isDbConfigured()) return undefined;
  const count = await prisma.order.count({
    where: { userId, organizationId, status: { not: "cancelled" } },
  });
  return count === 0;
}

/**
 * Public catalog of coded coupons for the current store and bag.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId") ?? undefined;
  const subtotal = Number(searchParams.get("subtotal") ?? 0);
  let items: ReturnType<typeof parsePromoLineItems>;
  try {
    items = parsePromoLineItems(JSON.parse(searchParams.get("items") ?? "null"));
  } catch {
    items = undefined;
  }

  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return NextResponse.json({ ok: false, error: "Invalid subtotal." }, { status: 400 });
  }

  try {
    const user = await getRequestUser();
    const shopperId = user && !isStaffRole(user) ? user.id : undefined;
    const organizationId = locationId
      ? ((await resolveLocationOrganizationId(locationId)) ?? SAMS_ORG_ID)
      : SAMS_ORG_ID;
    const isFirstOrder = await resolveFirstOrder(shopperId, organizationId);

    const coupons = await listCustomerCoupons({
      organizationId,
      locationId,
      subtotal,
      items,
      isFirstOrder,
      userId: shopperId,
    });

    return NextResponse.json({ ok: true, coupons });
  } catch (error) {
    console.error("[GET /api/promotions/available]", error);
    return NextResponse.json({ error: "Could not load offers." }, { status: 500 });
  }
}
