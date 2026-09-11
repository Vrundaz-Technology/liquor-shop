import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require";
import {
  getLoyaltyProgram,
  getOrgLoyaltyBalance,
  listLoyaltyHistory,
  resolveMemberOrganizationId,
  loyaltyReasonLabel,
} from "@/lib/db/loyalty";

/** Member-facing loyalty program summary (rates + rewards + history). */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const orgId = await resolveMemberOrganizationId({
    preferredBranchId: auth.user.preferredBranchId,
    organizationId: auth.user.organizationId,
    locationId,
  });

  const program = await getLoyaltyProgram(orgId);
  const balance = await getOrgLoyaltyBalance(orgId, auth.user.id);

  if (searchParams.get("history") === "1") {
    const limit = Number(searchParams.get("limit") ?? 25);
    const offset = Number(searchParams.get("offset") ?? 0);
    const data = await listLoyaltyHistory(orgId, {
      userId: auth.user.id,
      limit: Number.isFinite(limit) ? limit : 25,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return NextResponse.json({
      ok: true,
      organizationId: orgId,
      balance: balance.points,
      tier: balance.tier,
      ...data,
      entries: data.entries.map((e) => ({
        ...e,
        reasonLabel: loyaltyReasonLabel(e.reason),
      })),
    });
  }

  if (!program) {
    return NextResponse.json({
      ok: true,
      program: null,
      balance: balance.points,
      tier: balance.tier,
      organizationId: orgId,
    });
  }

  return NextResponse.json({
    ok: true,
    organizationId: orgId,
    program: {
      name: program.name,
      pointsPerDollar: program.pointsPerDollar,
      redeemRate: program.redeemRate,
      birthdayPoints: program.birthdayPoints,
      referralPoints: program.referralPoints,
      referralSignupPoints: program.referralSignupPoints,
      rewards: program.rewards,
      tiers: program.tiers,
      active: program.active,
    },
    balance: balance.points,
    tier: balance.tier,
  });
}
