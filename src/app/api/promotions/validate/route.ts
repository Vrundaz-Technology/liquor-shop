import { NextResponse } from "next/server";
import { parsePromoLineItems, PromotionUsageLimitError, resolvePromotionDiscount } from "@/lib/commerce/promotions";
import { SAMS_ORG_ID, resolveLocationOrganizationId } from "@/lib/db/organization";
import { isDbConfigured } from "@/lib/db/prisma";
import { COUPONS, getCouponDiscount } from "@/lib/commerce";
import { prisma } from "@/lib/db/prisma";
import { getRequestUser } from "@/lib/auth/require";
import { isStaffRole } from "@/lib/auth/roles";

function parseItems(raw: string | null): ReturnType<typeof parsePromoLineItems> {
  if (!raw) return undefined;
  try {
    return parsePromoLineItems(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

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
 * Public promo resolve for cart/checkout.
 * - With `code`: validate that coupon
 * - With `auto=1` (no code): auto-apply best code-less offer
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim().toUpperCase() ?? "";
  const auto = searchParams.get("auto") === "1";
  const locationId = searchParams.get("locationId") ?? undefined;
  const subtotal = Number(searchParams.get("subtotal") ?? 0);
  const items = parseItems(searchParams.get("items"));

  if (!code && !auto) {
    return NextResponse.json(
      { ok: false, error: "Enter a coupon code or request auto=1." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return NextResponse.json({ ok: false, error: "Invalid subtotal." }, { status: 400 });
  }

  try {
    const user = await getRequestUser();
    const shopperId = user && !isStaffRole(user) ? user.id : undefined;

    if (isDbConfigured()) {
      const organizationId = locationId
        ? ((await resolveLocationOrganizationId(locationId)) ?? SAMS_ORG_ID)
        : SAMS_ORG_ID;
      const isFirstOrder = await resolveFirstOrder(shopperId, organizationId);
      const promo = await resolvePromotionDiscount({
        code: code || null,
        subtotal,
        organizationId,
        locationId,
        items,
        isFirstOrder,
        userId: shopperId,
      });
      if (promo && (promo.discount > 0 || promo.freeDelivery)) {
        return NextResponse.json({
          ok: true,
          code: promo.code,
          name: promo.name,
          discount: promo.discount,
          freeDelivery: promo.freeDelivery,
          promotionId: promo.id,
          autoApplied: !code,
          type: promo.type,
        });
      }
      if (code) {
        return NextResponse.json({ ok: false, error: "That code is not valid." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        code: null,
        name: null,
        discount: 0,
        freeDelivery: false,
        promotionId: null,
        autoApplied: true,
      });
    }

    if (code && COUPONS[code]) {
      return NextResponse.json({
        ok: true,
        code,
        name: code,
        discount: getCouponDiscount(code, subtotal),
        freeDelivery: false,
        promotionId: null,
        autoApplied: false,
      });
    }

    if (!code && auto) {
      return NextResponse.json({
        ok: true,
        code: null,
        name: null,
        discount: 0,
        freeDelivery: false,
        promotionId: null,
        autoApplied: true,
      });
    }

    return NextResponse.json({ ok: false, error: "That code is not valid." }, { status: 404 });
  } catch (error) {
    if (error instanceof PromotionUsageLimitError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error("[GET /api/promotions/validate]", error);
    return NextResponse.json({ error: "Could not validate coupon." }, { status: 500 });
  }
}
