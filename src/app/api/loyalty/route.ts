import { NextResponse } from "next/server";
import { requirePermission, requireUser } from "@/lib/auth/require";
import {
  getLoyaltyProgram,
  ensureLoyaltyProgram,
  listLoyaltyHistory,
  claimBirthdayReward,
  grantPromotionalPoints,
  resolveMemberOrganizationId,
} from "@/lib/db/loyalty";
import { actorOrganizationId, ensureOrganizationSchema, SAMS_ORG_ID } from "@/lib/db/organization";
import { prisma } from "@/lib/db/prisma";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges, onlyChanged } from "@/lib/activity/changes";
import {
  pointsPerDollarSchema,
  redeemRateSchema,
  roundMoney,
} from "@/lib/validation/money";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const history = searchParams.get("history") === "1";

  if (history) {
    const auth = await requirePermission("loyalty.view");
    if (auth.error) return auth.error;
    const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
    const limit = Number(searchParams.get("limit") ?? 25);
    const offset = Number(searchParams.get("offset") ?? 0);
    const data = await listLoyaltyHistory(orgId, {
      limit: Number.isFinite(limit) ? limit : 25,
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return NextResponse.json({ ok: true, ...data });
  }

  const auth = await requirePermission("loyalty.view");
  if (auth.error) return auth.error;
  const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
  const program = await getLoyaltyProgram(orgId);
  return NextResponse.json({ ok: true, program });
}

const tierSchema = z.object({
  name: z.string().trim().min(1).max(40),
  minPoints: z.number().int().min(0).max(1_000_000),
});

const rewardSchema = z.object({
  points: z.number().int().min(1).max(1_000_000),
  value: z.number().finite().min(0).max(10_000),
  label: z.string().trim().min(1).max(80),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120).optional(),
    pointsPerDollar: pointsPerDollarSchema.optional(),
    redeemRate: redeemRateSchema.optional(),
    birthdayPoints: z.number().int().min(0).max(100_000).optional(),
    referralPoints: z.number().int().min(0).max(100_000).optional(),
    referralSignupPoints: z.number().int().min(0).max(100_000).optional(),
    active: z.boolean().optional(),
    tiers: z.array(tierSchema).min(1).max(12).optional(),
    rewards: z.array(rewardSchema).max(24).optional(),
  })
  .transform((data) => ({
    ...data,
    pointsPerDollar:
      data.pointsPerDollar == null ? undefined : roundMoney(data.pointsPerDollar, 4),
    redeemRate: data.redeemRate == null ? undefined : roundMoney(data.redeemRate, 4),
    rewards: data.rewards?.map((r) => ({ ...r, value: roundMoney(r.value, 2) })),
  }));

export async function PATCH(request: Request) {
  const auth = await requirePermission("loyalty.manage");
  if (auth.error) return auth.error;

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    const message = body.error.issues[0]?.message ?? "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await ensureOrganizationSchema();
  const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
  const programId = await ensureLoyaltyProgram(orgId);
  if (!programId) {
    return NextResponse.json({ error: "Could not load loyalty program" }, { status: 500 });
  }

  const current = await getLoyaltyProgram(orgId);
  const nextName = body.data.name ?? current?.name ?? "Store Loyalty";
  const nextPointsPerDollar = body.data.pointsPerDollar ?? current?.pointsPerDollar ?? 1;
  const nextRedeemRate = body.data.redeemRate ?? current?.redeemRate ?? 0.02;
  const nextBirthdayPoints = body.data.birthdayPoints ?? current?.birthdayPoints ?? 100;
  const nextReferralPoints = body.data.referralPoints ?? current?.referralPoints ?? 100;
  const nextReferralSignupPoints =
    body.data.referralSignupPoints ?? current?.referralSignupPoints ?? 50;
  const nextActive = body.data.active ?? current?.active ?? true;
  const nextTiers = body.data.tiers ?? current?.tiers ?? [];
  const nextRewards = body.data.rewards ?? current?.rewards ?? [];

  const changes = onlyChanged([
    { field: "name", from: current?.name ?? "Store Loyalty", to: nextName },
    {
      field: "pointsPerDollar",
      from: current?.pointsPerDollar ?? 1,
      to: nextPointsPerDollar,
    },
    { field: "redeemRate", from: current?.redeemRate ?? 0.02, to: nextRedeemRate },
    {
      field: "birthdayPoints",
      from: current?.birthdayPoints ?? 100,
      to: nextBirthdayPoints,
    },
    {
      field: "referralPoints",
      from: current?.referralPoints ?? 100,
      to: nextReferralPoints,
    },
    {
      field: "referralSignupPoints",
      from: current?.referralSignupPoints ?? 50,
      to: nextReferralSignupPoints,
    },
    {
      field: "active",
      from: (current?.active ?? true) ? "Yes" : "No",
      to: nextActive ? "Yes" : "No",
    },
    { field: "tiers", from: current?.tiers ?? [], to: nextTiers },
    { field: "rewards", from: current?.rewards ?? [], to: nextRewards },
  ]);

  await prisma.$executeRawUnsafe(
    `UPDATE loyalty_programs
     SET name = ?,
         points_per_dollar = ?,
         redeem_rate = ?,
         birthday_points = ?,
         referral_points = ?,
         referral_signup_points = ?,
         active = ?,
         tiers = CAST(? AS JSON),
         rewards = CAST(? AS JSON),
         updated_at = NOW(3)
     WHERE id = ?`,
    nextName,
    nextPointsPerDollar,
    nextRedeemRate,
    nextBirthdayPoints,
    nextReferralPoints,
    nextReferralSignupPoints,
    nextActive,
    JSON.stringify(nextTiers),
    JSON.stringify(nextRewards),
    programId,
  );

  if (changes.length) {
    await recordActivity({
      actorUserId: auth.user.id,
      action: "loyalty.updated",
      entityType: "loyalty",
      entityId: programId,
      summary: `${auth.user.name} updated loyalty program settings`,
      metadata: activityChanges(changes),
    });
  }

  return NextResponse.json({ ok: true, program: await getLoyaltyProgram(orgId) });
}

/** Members claim birthday bonus; staff can grant promotional points. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* empty body ok */
  }
  const action = typeof body.action === "string" ? body.action : "claim-birthday";

  if (action === "grant-promo") {
    if (!hasPermission(auth.user, "loyalty.manage")) {
      return NextResponse.json({ error: "You cannot grant promotional points." }, { status: 403 });
    }
    const userId = typeof body.userId === "string" ? body.userId : "";
    const points = Number(body.points);
    if (!userId || !Number.isFinite(points) || points === 0) {
      return NextResponse.json(
        { error: "Provide userId and a non-zero points amount." },
        { status: 400 },
      );
    }
    const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
    try {
      const result = await grantPromotionalPoints({
        organizationId: orgId,
        userId,
        points: Math.trunc(points),
        note: typeof body.note === "string" ? body.note : undefined,
      });
      await recordActivity({
        actorUserId: auth.user.id,
        action: "loyalty.updated",
        entityType: "loyalty",
        entityId: userId,
        summary: `${auth.user.name} granted ${result.points} promotional points`,
        metadata: activityChanges(
          [
            { field: "points", to: result.points },
            ...(typeof result.balance === "number"
              ? [{ field: "balance", to: result.balance }]
              : []),
          ],
          { userId },
        ),
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not grant points." },
        { status: 400 },
      );
    }
  }

  if (action !== "claim-birthday") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const orgId = await resolveMemberOrganizationId({
    preferredBranchId: auth.user.preferredBranchId,
    organizationId: auth.user.organizationId,
  });
  const result = await claimBirthdayReward({
    organizationId: orgId,
    userId: auth.user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (result.notBirthday) {
    return NextResponse.json(
      { error: "Birthday rewards can only be claimed on your birthday.", points: 0 },
      { status: 409 },
    );
  }
  if (result.alreadyClaimed) {
    return NextResponse.json(
      { error: "Birthday reward already claimed this year.", points: 0 },
      { status: 409 },
    );
  }

  if (result.points > 0) {
    await recordActivity({
      actorUserId: auth.user.id,
      action: "loyalty.birthday_claimed",
      entityType: "loyalty",
      entityId: auth.user.id,
      summary: `${auth.user.name} claimed ${result.points} birthday points`,
      metadata: activityChanges(
        [
          { field: "points", to: result.points },
          ...(typeof result.balance === "number"
            ? [{ field: "balance", to: result.balance }]
            : []),
        ],
      ),
    });
  }

  return NextResponse.json({
    ok: true,
    points: result.points,
    balance: result.balance,
  });
}
