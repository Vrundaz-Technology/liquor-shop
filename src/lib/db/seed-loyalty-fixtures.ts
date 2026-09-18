import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { demoUser } from "@/data/events";
import { loyaltyTestCustomers } from "@/data/loyalty-test-customers";
import { ensureLoyaltyProgram, tierForPoints } from "@/lib/db/loyalty";
import { ensureOrganizationSchema, SAMS_ORG_ID } from "@/lib/db/organization";
import type { UserProfile } from "@/types";

function staffRole(role: string) {
  return ["owner", "admin", "staff"].includes(role);
}

async function upsertCustomer(
  prisma: PrismaClient,
  profile: UserProfile,
  passwordHash: string,
) {
  await prisma.user.upsert({
    where: { id: profile.id },
    create: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      passwordHash,
      active: true,
      organizationId: staffRole(profile.role) ? SAMS_ORG_ID : null,
      preferredBranchId: profile.preferredBranchId,
      loyaltyPoints: profile.loyaltyPoints,
      loyaltyTier: profile.loyaltyTier,
      addresses: profile.addresses,
      recentlyViewed: profile.recentlyViewed,
      avatarUrl: profile.avatarUrl ?? null,
      permissionGrants: profile.permissionGrants ?? [],
      permissionRevokes: profile.permissionRevokes ?? [],
      allowedLocationIds: profile.allowedLocationIds ?? Prisma.DbNull,
    },
    update: {
      email: profile.email,
      name: profile.name,
      role: profile.role,
      passwordHash,
      active: true,
      preferredBranchId: profile.preferredBranchId,
      loyaltyPoints: profile.loyaltyPoints,
      loyaltyTier: profile.loyaltyTier,
      addresses: profile.addresses,
    },
  });
}

async function syncOrgLoyalty(
  prisma: PrismaClient,
  profile: UserProfile,
  programId: string,
) {
  const points = profile.loyaltyPoints;
  const tier = tierForPoints(points);
  const ocId = `oc-${profile.id}`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_customers
      (id, organization_id, user_id, marketing_consent, total_spent, order_count,
       loyalty_points, loyalty_tier)
     VALUES (?,?,?,false,0,0,?,?)
     ON DUPLICATE KEY UPDATE
       loyalty_points = VALUES(loyalty_points),
       loyalty_tier = VALUES(loyalty_tier),
       updated_at = NOW(3)`,
    ocId,
    SAMS_ORG_ID,
    profile.id,
    points,
    tier,
  );

  const ledgerId = `ll-seed-${profile.id}`;
  await prisma.$executeRawUnsafe(`DELETE FROM loyalty_ledger WHERE id = ?`, ledgerId);
  if (points > 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO loyalty_ledger
        (id, program_id, user_id, delta, balance_after, reason, order_id)
       VALUES (?,?,?,?,?,'adjustment',NULL)`,
      ledgerId,
      programId,
      profile.id,
      points,
      points,
    );
  }
}

/** Creates / resets the loyalty ladder test shoppers (and Alex Reed’s org balance). */
export async function seedLoyaltyFixtures(prisma: PrismaClient, passwordHash: string) {
  await ensureOrganizationSchema();
  const programId = await ensureLoyaltyProgram(SAMS_ORG_ID);
  if (!programId) {
    throw new Error("Could not create the store loyalty program.");
  }

  for (const profile of loyaltyTestCustomers) {
    await upsertCustomer(prisma, profile, passwordHash);
    await syncOrgLoyalty(prisma, profile, programId);
  }

  await prisma.user.update({
    where: { id: demoUser.id },
    data: {
      loyaltyPoints: demoUser.loyaltyPoints,
      loyaltyTier: demoUser.loyaltyTier,
    },
  });
  await syncOrgLoyalty(prisma, demoUser, programId);
}
