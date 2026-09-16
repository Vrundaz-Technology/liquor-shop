import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { mapUser } from "@/lib/db/mappers";
import { mapOrder } from "@/lib/db/mappers";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges, onlyChanged } from "@/lib/activity/changes";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { canAssignRole, canDeactivateUser, canEditUser, canResetPassword, DEMO_PASSWORD, isDemoAccountEmail } from "@/lib/auth/roles";
import { isKnownRole } from "@/lib/auth/role-catalog";
import { warmRoleCatalog } from "@/lib/db/roles-admin";
import {
  effectivePermissions,
  hasPermission,
  normalizeOverrides,
  overridesFromEnabled,
  parsePermissions,
  PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";
import {
  parseLocationIds,
  sanitizeAssignedLocations,
} from "@/lib/auth/location-access";
import { listLocationIds } from "@/lib/db/store-admin";
import { addColumnIfMissing } from "@/lib/db/schema-guard";
import {
  applyReferralOnSignup,
  ensureUserReferralCode,
  loadLoyaltyProfileFields,
  setUserBirthday,
} from "@/lib/db/loyalty";
import type { ManagedUser, UserPreferences, UserProfile } from "@/types";

function parsePreferences(raw: unknown): UserPreferences | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const next: UserPreferences = {};
  if (row.defaultFulfillment === "delivery" || row.defaultFulfillment === "pickup") {
    next.defaultFulfillment = row.defaultFulfillment;
  }
  if (typeof row.marketingEmails === "boolean") next.marketingEmails = row.marketingEmails;
  if (typeof row.smsUpdates === "boolean") next.smsUpdates = row.smsUpdates;
  if (typeof row.pushUpdates === "boolean") next.pushUpdates = row.pushUpdates;
  if (typeof row.orderEmailUpdates === "boolean") next.orderEmailUpdates = row.orderEmailUpdates;
  if (typeof row.loyaltyAlerts === "boolean") next.loyaltyAlerts = row.loyaltyAlerts;
  if (typeof row.backInStockAlerts === "boolean") next.backInStockAlerts = row.backInStockAlerts;
  if (typeof row.priceAlerts === "boolean") next.priceAlerts = row.priceAlerts;
  if (typeof row.abandonedCartReminders === "boolean") {
    next.abandonedCartReminders = row.abandonedCartReminders;
  }
  if (row.favoriteCategory === null) next.favoriteCategory = null;
  else if (typeof row.favoriteCategory === "string") {
    next.favoriteCategory = row.favoriteCategory.trim().slice(0, 40) || null;
  }
  return Object.keys(next).length ? next : undefined;
}

function userInclude() {
  return {
    orders: {
      include: { items: true },
      orderBy: { date: "desc" as const },
    },
  };
}

let extraColumnsReady = false;

async function ensureUserColumns() {
  if (extraColumnsReady) return;
  // MySQL forbids a literal DEFAULT on JSON columns, and back-filling a NOT NULL
  // JSON column on a populated table would fail. These are added NULL instead;
  // parsePermissions()/parseLocationIds() already map NULL to an empty list, so
  // the effective default is unchanged.
  await addColumnIfMissing("users", "avatar_url", "MEDIUMTEXT NULL");
  // Older installs used TEXT (~65KB), which truncates data-URL avatars.
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE users MODIFY COLUMN avatar_url MEDIUMTEXT NULL`);
  } catch {
    // Ignore if already MEDIUMTEXT or table missing during early boot.
  }
  await addColumnIfMissing("users", "permission_grants", "JSON NULL");
  await addColumnIfMissing("users", "permission_revokes", "JSON NULL");
  await addColumnIfMissing("users", "allowed_location_ids", "JSON NULL");
  await addColumnIfMissing("users", "preferences", "JSON NULL");
  extraColumnsReady = true;
}

function asAvatarUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

export async function attachProfileExtras(user: UserProfile): Promise<UserProfile> {
  if (!isDbConfigured()) return user;
  await ensureUserColumns();
  await warmRoleCatalog();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      avatar_url: string | null;
      active: boolean | null;
      permission_grants: unknown;
      permission_revokes: unknown;
      allowed_location_ids: unknown;
      organization_id: string | null;
      preferences: unknown;
    }>
  >(
    `SELECT
      avatar_url,
      COALESCE(active, true) AS active,
      permission_grants,
      permission_revokes,
      allowed_location_ids,
      organization_id,
      preferences
    FROM users
    WHERE id = ?
    LIMIT 1`,
    user.id,
  );
  const extras = rows[0];
  if (!extras) return user;
  const overrides = normalizeOverrides(
    user.role,
    parsePermissions(extras.permission_grants),
    parsePermissions(extras.permission_revokes),
  );
  const loyaltyFields = await loadLoyaltyProfileFields(user.id);
  const access = {
    role: user.role,
    permissionGrants: overrides.permissionGrants,
    permissionRevokes: overrides.permissionRevokes,
  };
  return {
    ...user,
    active: extras.active !== false,
    avatarUrl: asAvatarUrl(extras.avatar_url),
    organizationId: extras.organization_id ?? user.organizationId,
    permissionGrants: overrides.permissionGrants,
    permissionRevokes: overrides.permissionRevokes,
    effectivePermissions: effectivePermissions(access),
    allowedLocationIds: parseLocationIds(extras.allowed_location_ids),
    preferences: parsePreferences(extras.preferences) ?? user.preferences,
    birthday: loyaltyFields.birthday ?? user.birthday ?? null,
    referralCode: loyaltyFields.referralCode ?? user.referralCode ?? null,
    canClaimBirthday: loyaltyFields.canClaimBirthday,
  };
}

export async function fetchUserWithPassword(email: string) {
  if (!isDbConfigured()) return null;
  return prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: userInclude(),
  });
}

type AuthColumns = {
  id: string;
  password_hash: string | null;
  active: boolean | null;
};

async function loadAuthColumns(email: string) {
  const rows = await prisma.$queryRaw<AuthColumns[]>`
    SELECT id, password_hash, active
    FROM users
    WHERE lower(email) = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<{ user: UserProfile; error?: undefined } | { user?: undefined; error: string; status: number }> {
  const normalized = email.trim().toLowerCase();
  const auth = await loadAuthColumns(normalized);
  if (!auth) return { error: "Invalid email or password.", status: 401 };
  if (auth.active === false) return { error: "This account is deactivated.", status: 403 };

  let hash = auth.password_hash;
  if (!hash && isDemoAccountEmail(normalized) && process.env.NODE_ENV !== "production") {
    hash = await hashPassword(DEMO_PASSWORD);
    await prisma.$executeRaw`
      UPDATE users SET password_hash = ${hash}, active = true WHERE id = ${auth.id}
    `;
  }
  if (!hash) {
    return { error: "Invalid email or password.", status: 401 };
  }

  const ok = await verifyPassword(password, hash);
  if (!ok) return { error: "Invalid email or password.", status: 401 };

  const row = await prisma.user.findUnique({
    where: { id: auth.id },
    include: userInclude(),
  });
  if (!row) return { error: "Invalid email or password.", status: 401 };
  return { user: await attachProfileExtras(mapUser(row, row.orders.map(mapOrder))) };
}

export async function signupCustomer(input: {
  name: string;
  email: string;
  password: string;
  preferredBranchId?: string;
  referralCode?: string;
}): Promise<{ user: UserProfile; error?: undefined } | { user?: undefined; error: string; status: number }> {
  const passwordError = validatePassword(input.password);
  if (passwordError) return { error: passwordError, status: 400 };
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 };

  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const existing = await prisma.user.findUnique({
    where: { email },
    include: userInclude(),
  });

  if (existing) {
    return { error: "An account with this email already exists. Sign in instead.", status: 409 };
  }

  const data = {
    name: input.name.trim(),
    email,
    role: "customer" as const,
    preferredBranchId: input.preferredBranchId || "loc1",
    loyaltyPoints: 0,
    loyaltyTier: "Member",
    addresses: [],
    recentlyViewed: [],
  };

  const row = await prisma.user.create({
    data: {
      id: `u-${crypto.randomUUID()}`,
      ...data,
      permissionGrants: [],
      permissionRevokes: [],
    },
    include: userInclude(),
  });

  await prisma.$executeRaw`
    UPDATE users SET password_hash = ${passwordHash}, active = true WHERE id = ${row.id}
  `;

  await ensureUserReferralCode(row.id);
  if (input.referralCode?.trim()) {
    await applyReferralOnSignup({
      newUserId: row.id,
      referralCode: input.referralCode,
    });
  }

  const refreshed = await prisma.user.findUnique({
    where: { id: row.id },
    include: userInclude(),
  });
  const user = await attachProfileExtras(
    mapUser(refreshed ?? row, (refreshed ?? row).orders.map(mapOrder)),
  );
  await recordActivity({
    actorUserId: user.id,
    action: "auth.signup",
    entityType: "user",
    entityId: user.id,
    summary: `${user.name} created a customer account`,
    metadata: activityChanges([
      { field: "created", to: user.name },
      { field: "email", to: user.email },
      { field: "role", to: "customer" },
    ]),
  });
  return { user };
}

type SqlUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean | null;
  password_hash: string | null;
  loyalty_points: number;
  loyalty_tier: string;
  preferred_branch_id: string;
  created_at: Date | null;
  order_count: number | bigint;
  avatar_url: string | null;
  permission_grants: unknown;
  permission_revokes: unknown;
  allowed_location_ids: unknown;
};

function toManagedUserFromSql(row: SqlUserRow): ManagedUser {
  const role = row.role;
  const overrides = normalizeOverrides(
    isKnownRole(role) ? role : "customer",
    parsePermissions(row.permission_grants),
    parsePermissions(row.permission_revokes),
  );
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    active: row.active !== false,
    hasPassword: Boolean(row.password_hash),
    loyaltyPoints: Number(row.loyalty_points),
    loyaltyTier: row.loyalty_tier as ManagedUser["loyaltyTier"],
    preferredBranchId: row.preferred_branch_id,
    orderCount: Number(row.order_count),
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : new Date().toISOString(),
    avatarUrl: asAvatarUrl(row.avatar_url),
    permissionGrants: overrides.permissionGrants,
    permissionRevokes: overrides.permissionRevokes,
    allowedLocationIds: parseLocationIds(row.allowed_location_ids),
  };
}

function sanitizeOverrides(
  actor: UserProfile,
  role: string,
  grants?: readonly string[],
  revokes?: readonly string[],
  previous?: { permissionGrants?: readonly string[]; permissionRevokes?: readonly string[] },
) {
  const next = normalizeOverrides(role, grants, revokes);
  const prev = normalizeOverrides(role, previous?.permissionGrants, previous?.permissionRevokes);
  const permissionGrants = PERMISSIONS.filter((permission) => {
    const want = next.permissionGrants.includes(permission);
    const was = prev.permissionGrants.includes(permission);
    return hasPermission(actor, permission) ? want : was;
  });
  const permissionRevokes = PERMISSIONS.filter((permission) => {
    const want = next.permissionRevokes.includes(permission);
    const was = prev.permissionRevokes.includes(permission);
    return hasPermission(actor, permission) ? want : was;
  });
  // Persist read⇒action implications so API and UI stay aligned.
  const enabled = effectivePermissions({ role, permissionGrants, permissionRevokes });
  return overridesFromEnabled(role, enabled);
}

function samePermissionList(a: readonly Permission[], b: readonly Permission[]) {
  return a.length === b.length && a.every((permission, index) => permission === b[index]);
}

async function fetchManagedById(id: string) {
  await ensureUserColumns();
  const rows = await prisma.$queryRaw<SqlUserRow[]>`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      COALESCE(u.active, true) AS active,
      u.password_hash,
      u.loyalty_points,
      u.loyalty_tier,
      u.preferred_branch_id,
      u.created_at,
      u.avatar_url,
      u.permission_grants,
      u.permission_revokes,
      u.allowed_location_ids,
      (SELECT CAST(COUNT(*) AS SIGNED) FROM orders o WHERE o.user_id = u.id) AS order_count
    FROM users u
    WHERE u.id = ${id}
    LIMIT 1
  `;
  return rows[0] ? toManagedUserFromSql(rows[0]) : null;
}

// MySQL has no `NULLS LAST`. `(col IS NULL)` yields 0/1, so sorting on that
// first pushes NULLs to the end and reproduces the Postgres ordering exactly.
function userOrderBy(sortKey?: string, sortDir?: string) {
  const desc = sortDir === "desc";
  switch (sortKey) {
    case "name":
      return desc
        ? Prisma.sql`ORDER BY (u.name IS NULL) ASC, u.name DESC, u.email ASC`
        : Prisma.sql`ORDER BY u.name ASC, u.email ASC`;
    case "role":
      return desc
        ? Prisma.sql`ORDER BY u.role DESC, u.name ASC`
        : Prisma.sql`ORDER BY u.role ASC, u.name ASC`;
    case "status":
      return desc
        ? Prisma.sql`ORDER BY COALESCE(u.active, true) DESC, u.name ASC`
        : Prisma.sql`ORDER BY COALESCE(u.active, true) ASC, u.name ASC`;
    case "joined":
    default: {
      const newestFirst = sortDir !== "asc";
      return newestFirst
        ? Prisma.sql`ORDER BY (u.created_at IS NULL) ASC, u.created_at DESC, u.email ASC`
        : Prisma.sql`ORDER BY (u.created_at IS NULL) ASC, u.created_at ASC, u.email ASC`;
    }
  }
}

export async function listManagedUsers(filters: {
  q?: string;
  role?: string;
  limit?: number;
  offset?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}) {
  if (!isDbConfigured()) return { users: [] as ManagedUser[], total: 0 };
  await ensureUserColumns();

  const limit = Math.min(50, Math.max(1, filters.limit ?? 10));
  const offset = Math.max(0, filters.offset ?? 0);
  const role = filters.role?.trim() || null;
  const like = filters.q?.trim() ? `%${filters.q.trim()}%` : null;
  const orderBy = userOrderBy(filters.sortKey, filters.sortDir);

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<SqlUserRow[]>`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COALESCE(u.active, true) AS active,
        u.password_hash,
        u.loyalty_points,
        u.loyalty_tier,
        u.preferred_branch_id,
        u.created_at,
        u.avatar_url,
        u.permission_grants,
        u.permission_revokes,
      u.allowed_location_ids,
        (SELECT CAST(COUNT(*) AS SIGNED) FROM orders o WHERE o.user_id = u.id) AS order_count
      FROM users u
      WHERE (${role} IS NULL OR u.role = ${role})
        AND (${like} IS NULL OR u.name LIKE ${like} OR u.email LIKE ${like})
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<Array<{ count: number | bigint }>>`
      SELECT CAST(COUNT(*) AS SIGNED) AS count
      FROM users u
      WHERE (${role} IS NULL OR u.role = ${role})
        AND (${like} IS NULL OR u.name LIKE ${like} OR u.email LIKE ${like})
    `,
  ]);

  return {
    users: rows.map(toManagedUserFromSql),
    total: Number(totals[0]?.count ?? 0),
  };
}

export async function countOwners() {
  if (!isDbConfigured()) return 1;
  const rows = await prisma.$queryRaw<Array<{ count: number | bigint }>>`
    SELECT CAST(COUNT(*) AS SIGNED) AS count
    FROM users
    WHERE role = 'owner' AND COALESCE(active, true) = true
  `;
  return Number(rows[0]?.count ?? 0);
}

async function emailTaken(email: string, exceptUserId?: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1
  `;
  const hit = rows[0];
  if (!hit) return false;
  return hit.id !== exceptUserId;
}

export async function createManagedUser(
  actor: UserProfile,
  input: {
    name: string;
    email: string;
    password: string;
    role: string;
    preferredBranchId?: string;
    avatarUrl?: string;
    permissionGrants?: readonly string[];
    permissionRevokes?: readonly string[];
    allowedLocationIds?: readonly string[] | null;
  },
): Promise<{ user: ManagedUser; error?: undefined } | { user?: undefined; error: string; status: number }> {
  if (!hasPermission(actor, "users.create")) {
    return { error: "You cannot create accounts.", status: 403 };
  }
  if (!canAssignRole(actor, input.role)) {
    return { error: "You cannot assign that role.", status: 403 };
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) return { error: passwordError, status: 400 };
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 };
  await warmRoleCatalog();
  if (!isKnownRole(input.role)) return { error: "Unknown role.", status: 400 };
  await ensureUserColumns();

  const email = input.email.trim().toLowerCase();
  if (await emailTaken(email)) return { error: "That email is already in use.", status: 409 };

  const id = `u-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(input.password);
  const avatar = asAvatarUrl(input.avatarUrl) ?? null;
  const overrides = sanitizeOverrides(actor, input.role, input.permissionGrants, input.permissionRevokes);
  const grantsJson = JSON.stringify(overrides.permissionGrants);
  const revokesJson = JSON.stringify(overrides.permissionRevokes);
  const knownIds = await listLocationIds();
  const allowed = sanitizeAssignedLocations(actor, input.role, input.allowedLocationIds, knownIds);
  const allowedJson = allowed ? JSON.stringify(allowed) : null;
  await prisma.user.create({
    data: {
      id,
      name: input.name.trim(),
      email,
      role: input.role,
      preferredBranchId: input.preferredBranchId || "loc1",
      loyaltyPoints: 0,
      loyaltyTier: "Member",
      addresses: [],
      recentlyViewed: [],
      permissionGrants: [],
      permissionRevokes: [],
    },
  });
  await prisma.$executeRaw`
    UPDATE users
    SET
      password_hash = ${passwordHash},
      active = true,
      avatar_url = ${avatar},
      permission_grants = ${grantsJson},
      permission_revokes = ${revokesJson},
      allowed_location_ids = ${allowedJson}
    WHERE id = ${id}
  `;

  const user = await fetchManagedById(id);
  if (!user) return { error: "User was created but could not be loaded.", status: 500 };

  await recordActivity({
    actorUserId: actor.id,
    action: "user.created",
    entityType: "user",
    entityId: user.id,
    summary: `${actor.name} created ${input.role} account for ${user.name}`,
    metadata: activityChanges([
      { field: "created", to: user.name },
      { field: "email", to: user.email },
      { field: "role", to: input.role },
      ...(user.permissionGrants?.length
        ? [{ field: "grants", to: user.permissionGrants }]
        : []),
      ...(user.permissionRevokes?.length
        ? [{ field: "revokes", to: user.permissionRevokes }]
        : []),
      ...(user.allowedLocationIds?.length
        ? [{ field: "allowedLocations", to: user.allowedLocationIds }]
        : []),
    ]),
  });

  return { user };
}

export async function patchManagedUser(
  actor: UserProfile,
  input: {
    userId: string;
    name?: string;
    email?: string;
    role?: string;
    active?: boolean;
    password?: string;
    avatarUrl?: string | null;
    permissionGrants?: readonly string[];
    permissionRevokes?: readonly string[];
    allowedLocationIds?: readonly string[] | null;
  },
): Promise<{ user: ManagedUser; error?: undefined } | { user?: undefined; error: string; status: number }> {
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 };
  await warmRoleCatalog();
  await ensureUserColumns();

  const existingRows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      active: boolean | null;
      avatar_url: string | null;
      permission_grants: unknown;
      permission_revokes: unknown;
    }>
  >`
    SELECT
      id, name, email, role, COALESCE(active, true) AS active,
      avatar_url,
      permission_grants,
      permission_revokes AS permission_revokes
    FROM users
    WHERE id = ${input.userId}
    LIMIT 1
  `;
  const target = existingRows[0];
  if (!target) return { error: "User not found.", status: 404 };
  if (!isKnownRole(target.role)) return { error: "Unknown role.", status: 400 };
  if (input.role && !isKnownRole(input.role)) return { error: "Unknown role.", status: 400 };
  const isSelf = actor.id === input.userId;
  const canEdit = canEditUser(actor, target.role);
  const canReset = canResetPassword(actor, target.role);
  const wantsPassword = Boolean(input.password);
  const wantsRole = Boolean(input.role && input.role !== target.role);
  const wantsActive = typeof input.active === "boolean";
  const wantsPermissions =
    input.permissionGrants !== undefined || input.permissionRevokes !== undefined;
  const wantsProfileFields =
    Boolean(input.name) ||
    Boolean(input.email) ||
    input.avatarUrl !== undefined ||
    input.allowedLocationIds !== undefined;

  if (
    isSelf &&
    (wantsProfileFields || wantsRole || wantsActive || wantsPermissions)
  ) {
    return {
      error: "Update your own profile from the Profile page.",
      status: 403,
    };
  }

  if ((wantsProfileFields || wantsPermissions) && !canEdit) {
    return { error: "You cannot edit this account.", status: 403 };
  }
  if (wantsRole && !canAssignRole(actor, input.role!)) {
    return { error: "You cannot assign that role.", status: 403 };
  }
  if (wantsPassword && !canReset) {
    return { error: "You cannot reset this password.", status: 403 };
  }
  if (
    !wantsPassword &&
    !wantsRole &&
    !wantsActive &&
    !wantsProfileFields &&
    !wantsPermissions
  ) {
    return { error: "No changes provided.", status: 400 };
  }
  if (
    !canEdit &&
    !canReset &&
    !wantsRole &&
    !(wantsActive && canDeactivateUser(actor, target.role))
  ) {
    return { error: "You cannot edit this account.", status: 403 };
  }

  if (typeof input.active === "boolean" && input.active !== (target.active !== false)) {
    if (!canDeactivateUser(actor, target.role) || actor.id === input.userId) {
      return { error: "You cannot change access for this account.", status: 403 };
    }
  }

  if (target.role === "owner" && ((input.role && input.role !== "owner") || input.active === false)) {
    const owners = await countOwners();
    if (owners <= 1) {
      return { error: "The last owner account cannot be demoted or deactivated.", status: 409 };
    }
  }

  if (input.userId === actor.id && input.active === false) {
    return { error: "You cannot deactivate your own account.", status: 409 };
  }

  if (input.active === false && isDemoAccountEmail(target.email)) {
    return { error: "Demo accounts cannot be deactivated.", status: 409 };
  }

  const nextEmail = input.email?.trim().toLowerCase();
  if (nextEmail && nextEmail !== target.email) {
    if (isDemoAccountEmail(target.email)) {
      return { error: "Demo account emails cannot be changed.", status: 409 };
    }
    if (await emailTaken(nextEmail, input.userId)) {
      return { error: "That email is already in use.", status: 409 };
    }
  }

  if (input.password) {
    const passwordError = validatePassword(input.password);
    if (passwordError) return { error: passwordError, status: 400 };
  }

  if (input.name || input.role || nextEmail) {
    await prisma.user.update({
      where: { id: input.userId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(nextEmail ? { email: nextEmail } : {}),
      },
    });
  }

  if (typeof input.active === "boolean" || input.password || input.avatarUrl !== undefined) {
    const nextHash = input.password ? await hashPassword(input.password) : null;
    const avatar =
      input.avatarUrl === undefined ? null : asAvatarUrl(input.avatarUrl ?? "") ?? null;
    const touchAvatar = input.avatarUrl !== undefined;
    await prisma.$executeRaw`
      UPDATE users
      SET
        active = COALESCE(${typeof input.active === "boolean" ? input.active : null}, active),
        password_hash = COALESCE(${nextHash}, password_hash),
        avatar_url = CASE WHEN ${touchAvatar} THEN ${avatar} ELSE avatar_url END
      WHERE id = ${input.userId}
    `;
  }

  const nextRole = input.role && isKnownRole(input.role) ? input.role : target.role;
  const explicitPermissions =
    input.permissionGrants !== undefined || input.permissionRevokes !== undefined;
  const roleChanged = Boolean(input.role && input.role !== target.role);
  const previousOverrides = normalizeOverrides(
    target.role,
    parsePermissions(target.permission_grants),
    parsePermissions(target.permission_revokes),
  );
  let permissionsChanged = false;
  if (actor.id !== input.userId && (explicitPermissions || roleChanged)) {
    const overrides = sanitizeOverrides(
      actor,
      nextRole,
      input.permissionGrants ?? previousOverrides.permissionGrants,
      input.permissionRevokes ?? previousOverrides.permissionRevokes,
      previousOverrides,
    );
    const grantsJson = JSON.stringify(overrides.permissionGrants);
    const revokesJson = JSON.stringify(overrides.permissionRevokes);
    await prisma.$executeRaw`
      UPDATE users
      SET
        permission_grants = ${grantsJson},
        permission_revokes = ${revokesJson}
      WHERE id = ${input.userId}
    `;
    const remappedPrevious = normalizeOverrides(
      nextRole,
      previousOverrides.permissionGrants,
      previousOverrides.permissionRevokes,
    );
    permissionsChanged =
      explicitPermissions &&
      (!samePermissionList(overrides.permissionGrants, remappedPrevious.permissionGrants) ||
        !samePermissionList(overrides.permissionRevokes, remappedPrevious.permissionRevokes));
  }

  if (
    actor.id !== input.userId &&
    (input.allowedLocationIds !== undefined || (input.role && (nextRole === "owner" || nextRole === "customer")))
  ) {
    const knownIds = await listLocationIds();
    const allowed = sanitizeAssignedLocations(
      actor,
      nextRole,
      nextRole === "owner" || nextRole === "customer" ? null : input.allowedLocationIds,
      knownIds,
    );
    const allowedJson = allowed ? JSON.stringify(allowed) : null;
    await prisma.$executeRaw`
      UPDATE users
      SET allowed_location_ids = ${allowedJson}
      WHERE id = ${input.userId}
    `;
  }

  const user = await fetchManagedById(input.userId);
  if (!user) return { error: "User not found.", status: 404 };

  if (input.role && input.role !== target.role) {
    await recordActivity({
      actorUserId: actor.id,
      action: "user.role_updated",
      entityType: "user",
      entityId: user.id,
      summary: `${actor.name} changed ${user.name}'s role from ${target.role} to ${input.role}`,
      metadata: activityChanges([
        { field: "role", from: target.role, to: input.role },
      ]),
    });
  }
  if (typeof input.active === "boolean" && input.active !== (target.active !== false)) {
    await recordActivity({
      actorUserId: actor.id,
      action: input.active ? "user.activated" : "user.deactivated",
      entityType: "user",
      entityId: user.id,
      summary: `${actor.name} ${input.active ? "activated" : "deactivated"} ${user.name}`,
      metadata: activityChanges([
        {
          field: "active",
          from: target.active !== false ? "Yes" : "No",
          to: input.active ? "Yes" : "No",
        },
      ]),
    });
  }
  if (input.password) {
    await recordActivity({
      actorUserId: actor.id,
      action: "user.password_reset",
      entityType: "user",
      entityId: user.id,
      summary: `${actor.name} reset the password for ${user.name}`,
      metadata: activityChanges([
        { field: "password", from: "(set)", to: "(reset)" },
      ]),
    });
  }
  if (input.name || nextEmail || input.avatarUrl !== undefined) {
    const profileChanges = onlyChanged([
      { field: "name", from: target.name, to: user.name },
      { field: "email", from: target.email, to: user.email },
      {
        field: "avatar",
        from: asAvatarUrl(target.avatar_url) ?? "(none)",
        to: user.avatarUrl ?? "(none)",
      },
    ]);
    if (profileChanges.length) {
      await recordActivity({
        actorUserId: actor.id,
        action: "user.profile_updated",
        entityType: "user",
        entityId: user.id,
        summary: `${actor.name} updated profile for ${user.name}`,
        metadata: activityChanges(profileChanges),
      });
    }
  }
  if (permissionsChanged) {
    await recordActivity({
      actorUserId: actor.id,
      action: "user.permissions_updated",
      entityType: "user",
      entityId: user.id,
      summary: `${actor.name} updated permissions for ${user.name}`,
      metadata: activityChanges(
        onlyChanged([
          {
            field: "grants",
            from: previousOverrides.permissionGrants,
            to: user.permissionGrants ?? [],
          },
          {
            field: "revokes",
            from: previousOverrides.permissionRevokes,
            to: user.permissionRevokes ?? [],
          },
        ]),
      ),
    });
  }

  return { user };
}

export async function updateOwnPassword(
  userId: string,
  password: string,
  currentPassword: string,
) {
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);
  const rows = await prisma.$queryRaw<{ password_hash: string | null }[]>`
    SELECT password_hash FROM users WHERE id = ${userId} LIMIT 1
  `;
  const hash = rows[0]?.password_hash;
  if (!hash) throw new Error("Current password is incorrect.");
  const ok = await verifyPassword(currentPassword, hash);
  if (!ok) throw new Error("Current password is incorrect.");
  const passwordHash = await hashPassword(password);
  await prisma.$executeRaw`
    UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}
  `;
}

export async function updateOwnProfileFields(
  userId: string,
  patch: {
    name?: string;
    email?: string;
    avatarUrl?: string | null;
    birthday?: string | null;
    preferences?: UserPreferences;
  },
): Promise<{ error?: string; status?: number }> {
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 };
  await ensureUserColumns();

  const existing = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      email: string;
      avatar_url: string | null;
      preferences: unknown;
    }>
  >(
    `SELECT id, name, email, avatar_url, preferences FROM users WHERE id = ? LIMIT 1`,
    userId,
  );
  const row = existing[0];
  if (!row) return { error: "User not found.", status: 404 };

  const loyaltyFields = await loadLoyaltyProfileFields(userId);
  const previousBirthday = loyaltyFields.birthday;
  const previousPrefs = parsePreferences(row.preferences);
  const previousAvatar = asAvatarUrl(row.avatar_url) ?? "(none)";

  const nextEmail = patch.email?.trim().toLowerCase();
  if (nextEmail && nextEmail !== row.email) {
    if (isDemoAccountEmail(row.email)) {
      return { error: "Demo account emails cannot be changed.", status: 409 };
    }
    if (await emailTaken(nextEmail, userId)) {
      return { error: "That email is already in use.", status: 409 };
    }
    await prisma.user.update({
      where: { id: userId },
      data: { email: nextEmail, ...(patch.name ? { name: patch.name.trim() } : {}) },
    });
  } else if (patch.name) {
    await prisma.user.update({
      where: { id: userId },
      data: { name: patch.name.trim() },
    });
  }

  if (patch.avatarUrl !== undefined) {
    const avatar = asAvatarUrl(patch.avatarUrl ?? "") ?? null;
    await prisma.$executeRaw`
      UPDATE users SET avatar_url = ${avatar} WHERE id = ${userId}
    `;
  }

  if (patch.birthday !== undefined) {
    try {
      await setUserBirthday(userId, patch.birthday);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not update birthday.",
        status: 400,
      };
    }
  }

  let nextPrefs = previousPrefs;
  if (patch.preferences !== undefined) {
    await ensureUserColumns();
    nextPrefs = {
      ...(previousPrefs ?? {}),
      ...patch.preferences,
    };
    await prisma.$executeRawUnsafe(
      `UPDATE users SET preferences = CAST(? AS JSON) WHERE id = ?`,
      JSON.stringify(nextPrefs),
      userId,
    );
  }

  const nextName = patch.name?.trim() || row.name;
  const nextEmailValue = nextEmail && nextEmail !== row.email ? nextEmail : row.email;
  const nextAvatar =
    patch.avatarUrl !== undefined
      ? asAvatarUrl(patch.avatarUrl ?? "") ?? "(none)"
      : previousAvatar;
  const nextBirthday =
    patch.birthday !== undefined ? patch.birthday || null : previousBirthday;

  const changes = onlyChanged([
    { field: "name", from: row.name, to: nextName },
    { field: "email", from: row.email, to: nextEmailValue },
    { field: "avatar", from: previousAvatar, to: nextAvatar },
    {
      field: "birthday",
      from: previousBirthday ?? "(none)",
      to: nextBirthday ?? "(none)",
    },
    {
      field: "preferences",
      from: previousPrefs ?? {},
      to: nextPrefs ?? {},
    },
  ]);

  if (changes.length) {
    await recordActivity({
      actorUserId: userId,
      action: "user.profile_updated",
      entityType: "profile",
      entityId: userId,
      summary: "Updated profile details",
      metadata: activityChanges(changes),
    });
  }

  return {};
}
