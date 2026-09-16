import { prisma, isDbConfigured } from "@/lib/db/prisma";
import {
  ensureOrganizationSchema,
  resolveLocationOrganizationId,
  SAMS_ORG_ID,
} from "@/lib/db/organization";
import { moneyNumber } from "@/lib/db/money";
import { addColumnIfMissing, createUniqueIndexIfMissing } from "@/lib/db/schema-guard";

export type LoyaltyTierDef = { name: string; minPoints: number };

const DEFAULT_TIERS: LoyaltyTierDef[] = [
  { name: "Member", minPoints: 0 },
  { name: "Connoisseur", minPoints: 500 },
  { name: "Collector", minPoints: 1500 },
  { name: "VIP", minPoints: 3000 },
];

let loyaltyColumnsReady = false;

async function ensureLoyaltyColumns() {
  if (loyaltyColumnsReady) return;
  await addColumnIfMissing("loyalty_programs", "birthday_points", "INT NOT NULL DEFAULT 100");
  await addColumnIfMissing("loyalty_programs", "referral_points", "INT NOT NULL DEFAULT 100");
  await addColumnIfMissing(
    "loyalty_programs",
    "referral_signup_points",
    "INT NOT NULL DEFAULT 50",
  );
  await addColumnIfMissing("users", "birthday", "DATE NULL");
  await addColumnIfMissing("users", "referral_code", "VARCHAR(32) NULL");
  await addColumnIfMissing("users", "referred_by_user_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("users", "birthday_reward_year", "INT NULL");
  await addColumnIfMissing(
    "organization_customers",
    "loyalty_points",
    "INT NOT NULL DEFAULT 0",
  );
  await addColumnIfMissing(
    "organization_customers",
    "loyalty_tier",
    "VARCHAR(64) NOT NULL DEFAULT 'Member'",
  );
  await createUniqueIndexIfMissing("users", "users_referral_code_key", "`referral_code`");
  loyaltyColumnsReady = true;
}

export function parseLoyaltyTiers(raw: unknown): LoyaltyTierDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TIERS;
  const parsed = raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      const minPoints = Number(r.minPoints);
      if (!name || !Number.isFinite(minPoints) || minPoints < 0) return null;
      return { name, minPoints: Math.floor(minPoints) };
    })
    .filter((x): x is LoyaltyTierDef => Boolean(x))
    .sort((a, b) => a.minPoints - b.minPoints);
  return parsed.length ? parsed : DEFAULT_TIERS;
}

export function tierForPoints(points: number, tiersRaw?: unknown): string {
  const tiers = parseLoyaltyTiers(tiersRaw);
  let tier = tiers[0]?.name ?? "Member";
  for (const t of tiers) {
    if (points >= t.minPoints) tier = t.name;
  }
  return tier;
}

/** Resolve which owner's loyalty program a shopper uses (preferred store → org). */
export async function resolveMemberOrganizationId(input: {
  preferredBranchId?: string | null;
  organizationId?: string | null;
  locationId?: string | null;
}): Promise<string> {
  if (input.organizationId) return input.organizationId;
  const locationId = input.locationId ?? input.preferredBranchId;
  if (locationId) {
    const org = await resolveLocationOrganizationId(locationId);
    if (org) return org;
  }
  return SAMS_ORG_ID;
}

export async function ensureLoyaltyProgram(organizationId: string) {
  if (!isDbConfigured()) return null;
  await ensureOrganizationSchema();
  await ensureLoyaltyColumns();
  const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM loyalty_programs WHERE organization_id = ? LIMIT 1`,
    organizationId,
  );
  if (existing[0]) return existing[0].id;

  const id = `loyal-${organizationId}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO loyalty_programs
      (id, organization_id, name, points_per_dollar, redeem_rate,
       birthday_points, referral_points, referral_signup_points, tiers, rewards, active)
     VALUES (?,?,?,?,?,?,?,?,?,CAST(? AS JSON),true)`,
    id,
    organizationId,
    "Store Loyalty",
    1,
    0.02,
    100,
    100,
    50,
    JSON.stringify(DEFAULT_TIERS),
    JSON.stringify([{ points: 500, value: 10, label: "$10 off" }]),
  );
  return id;
}

async function ensureOrgCustomerLoyaltyRow(organizationId: string, userId: string) {
  await ensureLoyaltyColumns();
  const existing = await prisma.$queryRawUnsafe<
    { id: string; loyalty_points: number; loyalty_tier: string }[]
  >(
    `SELECT id, COALESCE(loyalty_points, 0) AS loyalty_points,
            COALESCE(loyalty_tier, 'Member') AS loyalty_tier
     FROM organization_customers
     WHERE organization_id = ? AND user_id = ?
     LIMIT 1`,
    organizationId,
    userId,
  );
  if (existing[0]) return existing[0];

  // Seed from legacy users.loyalty_points once so existing balances aren't lost.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const seedPoints = user?.loyaltyPoints ?? 0;
  const seedTier = await prisma.$queryRawUnsafe<{ tiers: unknown }[]>(
    `SELECT tiers FROM loyalty_programs WHERE organization_id = ? LIMIT 1`,
    organizationId,
  );
  const tier = tierForPoints(seedPoints, seedTier[0]?.tiers);
  const id = `oc-${crypto.randomUUID().slice(0, 12)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO organization_customers
      (id, organization_id, user_id, marketing_consent, total_spent, order_count, loyalty_points, loyalty_tier)
     VALUES (?,?,?,false,0,0,?,?)
     ON DUPLICATE KEY UPDATE
       loyalty_points = IF(loyalty_points = 0 AND VALUES(loyalty_points) > 0, VALUES(loyalty_points), loyalty_points),
       loyalty_tier = VALUES(loyalty_tier)`,
    id,
    organizationId,
    userId,
    seedPoints,
    tier,
  );
  const again = await prisma.$queryRawUnsafe<
    { id: string; loyalty_points: number; loyalty_tier: string }[]
  >(
    `SELECT id, COALESCE(loyalty_points, 0) AS loyalty_points,
            COALESCE(loyalty_tier, 'Member') AS loyalty_tier
     FROM organization_customers
     WHERE organization_id = ? AND user_id = ?
     LIMIT 1`,
    organizationId,
    userId,
  );
  return again[0] ?? { id, loyalty_points: seedPoints, loyalty_tier: tier };
}

export async function getOrgLoyaltyBalance(
  organizationId: string,
  userId: string,
): Promise<{ points: number; tier: string }> {
  if (!isDbConfigured()) return { points: 0, tier: "Member" };
  const row = await ensureOrgCustomerLoyaltyRow(organizationId, userId);
  return { points: Number(row.loyalty_points), tier: row.loyalty_tier || "Member" };
}

async function adjustLoyaltyPoints(input: {
  organizationId: string;
  userId: string;
  delta: number;
  reason: string;
  orderId?: string | null;
}) {
  if (!isDbConfigured()) return { points: 0, balance: 0, tier: "Member" };

  const programId = await ensureLoyaltyProgram(input.organizationId);
  if (!programId) return { points: 0, balance: 0, tier: "Member" };

  const prog = await prisma.$queryRawUnsafe<{ active: boolean | number; tiers: unknown }[]>(
    `SELECT active, tiers FROM loyalty_programs WHERE id = ? LIMIT 1`,
    programId,
  );
  if (!prog[0] || !prog[0].active) {
    throw new Error("Loyalty program is inactive.");
  }

  const row = await ensureOrgCustomerLoyaltyRow(input.organizationId, input.userId);
  const current = Number(row.loyalty_points);
  if (!input.delta) {
    return { points: 0, balance: current, tier: row.loyalty_tier || "Member" };
  }

  const nextBalance = Math.max(0, current + input.delta);
  const applied = nextBalance - current;
  if (!applied) {
    return { points: 0, balance: current, tier: row.loyalty_tier || "Member" };
  }

  const tier = tierForPoints(nextBalance, prog[0].tiers);
  await prisma.$executeRawUnsafe(
    `UPDATE organization_customers
     SET loyalty_points = ?, loyalty_tier = ?, updated_at = NOW(3)
     WHERE organization_id = ? AND user_id = ?`,
    nextBalance,
    tier,
    input.organizationId,
    input.userId,
  );

  // Keep users.* in sync for the shopping org so profile/header stay consistent.
  await prisma.user.update({
    where: { id: input.userId },
    data: { loyaltyPoints: nextBalance, loyaltyTier: tier },
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO loyalty_ledger (id, program_id, user_id, delta, balance_after, reason, order_id)
     VALUES (?,?,?,?,?,?,?)`,
    `ll-${crypto.randomUUID()}`,
    programId,
    input.userId,
    applied,
    nextBalance,
    input.reason,
    input.orderId ?? null,
  );
  return { points: applied, balance: nextBalance, tier };
}

export async function earnLoyaltyPoints(input: {
  organizationId: string;
  userId: string;
  orderTotal: number;
  orderId?: string;
}) {
  if (!isDbConfigured()) return { points: 0, balance: 0 };
  const programId = await ensureLoyaltyProgram(input.organizationId);
  if (!programId) return { points: 0, balance: 0 };

  const prog = await prisma.$queryRawUnsafe<
    { points_per_dollar: number; active: boolean | number }[]
  >(`SELECT points_per_dollar, active FROM loyalty_programs WHERE id = ? LIMIT 1`, programId);
  if (!prog[0] || !prog[0].active) return { points: 0, balance: 0 };

  const rate = moneyNumber(prog[0].points_per_dollar ?? 1);
  const points = Math.max(0, Math.floor(input.orderTotal * rate));
  if (!points) {
    const bal = await getOrgLoyaltyBalance(input.organizationId, input.userId);
    return { points: 0, balance: bal.points };
  }

  return adjustLoyaltyPoints({
    organizationId: input.organizationId,
    userId: input.userId,
    delta: points,
    reason: "earn",
    orderId: input.orderId,
  });
}

export async function redeemLoyaltyPoints(input: {
  organizationId: string;
  userId: string;
  points: number;
  reason?: string;
  orderId?: string | null;
}) {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  const orgId = input.organizationId;
  const programId = await ensureLoyaltyProgram(orgId);
  if (!programId) throw new Error("Loyalty program missing.");

  const prog = await prisma.$queryRawUnsafe<{ active: boolean | number }[]>(
    `SELECT active FROM loyalty_programs WHERE id = ? LIMIT 1`,
    programId,
  );
  if (!prog[0]?.active) throw new Error("Loyalty program is inactive.");

  const balance = await getOrgLoyaltyBalance(orgId, input.userId);
  if (balance.points < input.points) {
    throw new Error("Not enough loyalty points.");
  }

  return adjustLoyaltyPoints({
    organizationId: orgId,
    userId: input.userId,
    delta: -input.points,
    reason: input.reason ?? "redeem",
    orderId: input.orderId,
  });
}

/** Staff/owner promotional bonus points. */
export async function grantPromotionalPoints(input: {
  organizationId: string;
  userId: string;
  points: number;
  note?: string;
}) {
  const points = Math.floor(input.points);
  if (!Number.isFinite(points) || points === 0) {
    throw new Error("Enter a non-zero points amount.");
  }
  return adjustLoyaltyPoints({
    organizationId: input.organizationId,
    userId: input.userId,
    delta: points,
    reason: "promo",
  });
}

export type LoyaltyProgramView = {
  id: string;
  name: string;
  pointsPerDollar: number;
  redeemRate: number;
  birthdayPoints: number;
  referralPoints: number;
  referralSignupPoints: number;
  tiers: unknown;
  rewards: unknown;
  active: boolean;
};

export async function getLoyaltyProgram(
  organizationId: string,
): Promise<LoyaltyProgramView | null> {
  await ensureOrganizationSchema();
  await ensureLoyaltyProgram(organizationId);
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      name: string;
      points_per_dollar: number;
      redeem_rate: number;
      birthday_points: number | null;
      referral_points: number | null;
      referral_signup_points: number | null;
      tiers: unknown;
      rewards: unknown;
      active: boolean;
    }[]
  >(`SELECT * FROM loyalty_programs WHERE organization_id = ? LIMIT 1`, organizationId);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    pointsPerDollar: moneyNumber(row.points_per_dollar),
    redeemRate: moneyNumber(row.redeem_rate),
    birthdayPoints: Number(row.birthday_points ?? 100),
    referralPoints: Number(row.referral_points ?? 100),
    referralSignupPoints: Number(row.referral_signup_points ?? 50),
    tiers: row.tiers,
    rewards: row.rewards,
    active: row.active,
  };
}

export type LoyaltyLedgerEntry = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  orderId: string | null;
  createdAt: string;
};

export async function listLoyaltyHistory(
  organizationId: string,
  opts: { limit?: number; offset?: number; userId?: string } = {},
): Promise<{ entries: LoyaltyLedgerEntry[]; total: number }> {
  if (!isDbConfigured()) return { entries: [], total: 0 };
  const programId = await ensureLoyaltyProgram(organizationId);
  if (!programId) return { entries: [], total: 0 };

  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const offset = Math.max(0, opts.offset ?? 0);
  const userFilter = opts.userId ? `AND ll.user_id = ?` : "";
  const params: unknown[] = opts.userId ? [programId, opts.userId] : [programId];

  const [countRows, rows] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: number | bigint }[]>(
      `SELECT COUNT(*) AS total FROM loyalty_ledger ll WHERE ll.program_id = ? ${userFilter}`,
      ...params,
    ),
    prisma.$queryRawUnsafe<
      {
        id: string;
        user_id: string;
        user_name: string;
        user_email: string;
        delta: number;
        balance_after: number;
        reason: string;
        order_id: string | null;
        created_at: Date;
      }[]
    >(
      `SELECT ll.id, ll.user_id, u.name AS user_name, u.email AS user_email,
              ll.delta, ll.balance_after, ll.reason, ll.order_id, ll.created_at
       FROM loyalty_ledger ll
       INNER JOIN users u ON u.id = ll.user_id
       WHERE ll.program_id = ? ${userFilter}
       ORDER BY ll.created_at DESC
       LIMIT ? OFFSET ?`,
      ...params,
      limit,
      offset,
    ),
  ]);

  return {
    total: Number(countRows[0]?.total ?? 0),
    entries: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      delta: Number(row.delta),
      balanceAfter: Number(row.balance_after),
      reason: row.reason,
      orderId: row.order_id,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    })),
  };
}

function makeReferralCode(seed: string) {
  const cleaned = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const base = (cleaned.slice(0, 4) || "SAM").padEnd(4, "X");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${base}${suffix}`;
}

export async function ensureUserReferralCode(userId: string): Promise<string | null> {
  if (!isDbConfigured()) return null;
  await ensureLoyaltyColumns();
  const existing = await prisma.$queryRawUnsafe<{ referral_code: string | null; name: string }[]>(
    `SELECT referral_code, name FROM users WHERE id = ? LIMIT 1`,
    userId,
  );
  const row = existing[0];
  if (!row) return null;
  if (row.referral_code) return row.referral_code;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeReferralCode(row.name);
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL`,
        code,
        userId,
      );
      const check = await prisma.$queryRawUnsafe<{ referral_code: string | null }[]>(
        `SELECT referral_code FROM users WHERE id = ? LIMIT 1`,
        userId,
      );
      if (check[0]?.referral_code) return check[0].referral_code;
    } catch {
      /* unique collision — retry */
    }
  }
  return null;
}

function ymdParts(value: Date | string) {
  if (value instanceof Date) {
    return {
      y: value.getUTCFullYear(),
      m: value.getUTCMonth() + 1,
      d: value.getUTCDate(),
    };
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export async function claimBirthdayReward(input: {
  organizationId?: string;
  userId: string;
}): Promise<
  | { ok: true; points: number; balance: number; alreadyClaimed?: boolean; notBirthday?: boolean }
  | { ok: false; error: string }
> {
  if (!isDbConfigured()) return { ok: false, error: "Database is not configured." };
  await ensureLoyaltyColumns();
  const orgId = input.organizationId ?? SAMS_ORG_ID;
  const program = await getLoyaltyProgram(orgId);
  if (!program?.active) return { ok: false, error: "Loyalty program is inactive." };
  if (program.birthdayPoints <= 0) {
    return { ok: false, error: "Birthday rewards are not enabled." };
  }

  const rows = await prisma.$queryRawUnsafe<
    {
      birthday: Date | string | null;
      birthday_reward_year: number | null;
    }[]
  >(
    `SELECT birthday, birthday_reward_year FROM users WHERE id = ? LIMIT 1`,
    input.userId,
  );
  const user = rows[0];
  if (!user) return { ok: false, error: "User not found." };
  if (!user.birthday) return { ok: false, error: "Add your birthday in profile first." };

  const balanceRow = await getOrgLoyaltyBalance(orgId, input.userId);

  const birth = ymdParts(user.birthday);
  if (!birth) return { ok: false, error: "Invalid birthday on file." };

  const now = new Date();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();
  const year = now.getFullYear();

  if (birth.m !== todayM || birth.d !== todayD) {
    return { ok: true, points: 0, balance: balanceRow.points, notBirthday: true };
  }
  if (user.birthday_reward_year === year) {
    return { ok: true, points: 0, balance: balanceRow.points, alreadyClaimed: true };
  }

  const result = await adjustLoyaltyPoints({
    organizationId: orgId,
    userId: input.userId,
    delta: program.birthdayPoints,
    reason: "birthday",
  });

  await prisma.$executeRawUnsafe(
    `UPDATE users SET birthday_reward_year = ? WHERE id = ?`,
    year,
    input.userId,
  );

  return { ok: true, points: result.points, balance: result.balance };
}

export async function applyReferralOnSignup(input: {
  newUserId: string;
  referralCode?: string | null;
  organizationId?: string;
}): Promise<{ referrerPoints: number; signupPoints: number } | null> {
  const code = input.referralCode?.trim().toUpperCase();
  if (!code || !isDbConfigured()) return null;

  await ensureLoyaltyColumns();
  const orgId = input.organizationId ?? SAMS_ORG_ID;
  const program = await getLoyaltyProgram(orgId);
  if (!program?.active) return null;

  const referrers = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM users WHERE UPPER(referral_code) = ? LIMIT 1`,
    code,
  );
  const referrer = referrers[0];
  if (!referrer || referrer.id === input.newUserId) return null;

  const already = await prisma.$queryRawUnsafe<{ referred_by_user_id: string | null }[]>(
    `SELECT referred_by_user_id FROM users WHERE id = ? LIMIT 1`,
    input.newUserId,
  );
  if (already[0]?.referred_by_user_id) return null;

  await prisma.$executeRawUnsafe(
    `UPDATE users SET referred_by_user_id = ? WHERE id = ? AND referred_by_user_id IS NULL`,
    referrer.id,
    input.newUserId,
  );

  let referrerPoints = 0;
  let signupPoints = 0;

  if (program.referralPoints > 0) {
    const awarded = await adjustLoyaltyPoints({
      organizationId: orgId,
      userId: referrer.id,
      delta: program.referralPoints,
      reason: "referral",
    });
    referrerPoints = awarded.points;
  }

  if (program.referralSignupPoints > 0) {
    const awarded = await adjustLoyaltyPoints({
      organizationId: orgId,
      userId: input.newUserId,
      delta: program.referralSignupPoints,
      reason: "referral_signup",
    });
    signupPoints = awarded.points;
  }

  await ensureUserReferralCode(input.newUserId);
  return { referrerPoints, signupPoints };
}

export async function setUserBirthday(userId: string, birthday: string | null) {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureLoyaltyColumns();
  if (birthday == null || birthday === "") {
    await prisma.$executeRawUnsafe(`UPDATE users SET birthday = NULL WHERE id = ?`, userId);
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    throw new Error("Birthday must be YYYY-MM-DD.");
  }
  await prisma.$executeRawUnsafe(
    `UPDATE users SET birthday = ? WHERE id = ?`,
    birthday,
    userId,
  );
}

export async function loadLoyaltyProfileFields(userId: string): Promise<{
  birthday: string | null;
  referralCode: string | null;
  birthdayRewardYear: number | null;
  canClaimBirthday: boolean;
}> {
  if (!isDbConfigured()) {
    return {
      birthday: null,
      referralCode: null,
      birthdayRewardYear: null,
      canClaimBirthday: false,
    };
  }
  await ensureLoyaltyColumns();
  const code = await ensureUserReferralCode(userId);
  const rows = await prisma.$queryRawUnsafe<
    {
      birthday: Date | string | null;
      referral_code: string | null;
      birthday_reward_year: number | null;
    }[]
  >(
    `SELECT birthday, referral_code, birthday_reward_year FROM users WHERE id = ? LIMIT 1`,
    userId,
  );
  const row = rows[0];
  let birthday: string | null = null;
  if (row?.birthday) {
    const parts = ymdParts(row.birthday);
    if (parts) {
      birthday = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
    }
  }
  const now = new Date();
  const year = now.getFullYear();
  let canClaimBirthday = false;
  if (birthday) {
    const parts = ymdParts(birthday);
    if (
      parts &&
      parts.m === now.getMonth() + 1 &&
      parts.d === now.getDate() &&
      row?.birthday_reward_year !== year
    ) {
      canClaimBirthday = true;
    }
  }
  return {
    birthday,
    referralCode: code ?? row?.referral_code ?? null,
    birthdayRewardYear: row?.birthday_reward_year ?? null,
    canClaimBirthday,
  };
}

export function loyaltyReasonLabel(reason: string) {
  switch (reason) {
    case "earn":
      return "Order earn";
    case "redeem":
      return "Redeemed";
    case "birthday":
      return "Birthday bonus";
    case "referral":
      return "Referral reward";
    case "referral_signup":
      return "Referral signup";
    case "promo":
      return "Promotional points";
    case "adjustment":
      return "Adjustment";
    default:
      return reason.replace(/_/g, " ");
  }
}
