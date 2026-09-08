import type { CustomRoleDefinition } from "@/lib/auth/role-catalog";
import {
  isReservedRoleSlug,
  parseCustomRoleRow,
  setCustomRoleCatalog,
  slugifyRoleLabel,
} from "@/lib/auth/role-catalog";
import { hasPermission, parsePermissions, PERMISSIONS, effectivePermissions, type Permission } from "@/lib/auth/permissions";
import { recordActivity } from "@/lib/db/activity";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { createIndexIfMissing } from "@/lib/db/schema-guard";
import type { UserProfile } from "@/types";

type RoleRow = {
  id: string;
  slug: string;
  label: string;
  description: string;
  permissions: unknown;
  rank: number;
  created_at: Date;
  updated_at: Date;
};

let schemaReady = false;

export async function ensureRoleDefinitionsSchema() {
  if (schemaReady) return;
  // TEXT cannot be a MySQL key without a prefix length, and JSON columns cannot
  // carry a literal DEFAULT — hence VARCHAR(191) keys and a nullable permissions
  // column (parsePermissions maps NULL to []).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS role_definitions (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      slug VARCHAR(191) NOT NULL UNIQUE,
      label VARCHAR(191) NOT NULL,
      description TEXT NULL,
      permissions JSON NULL,
      \`rank\` INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await createIndexIfMissing("role_definitions", "role_definitions_rank_idx", "`rank`");
  schemaReady = true;
}

async function refreshCatalog() {
  if (!isDbConfigured()) {
    setCustomRoleCatalog([]);
    return;
  }
  await ensureRoleDefinitionsSchema();
  const rows = await prisma.$queryRawUnsafe<RoleRow[]>(
    `SELECT * FROM role_definitions ORDER BY label ASC`,
  );
  setCustomRoleCatalog(rows.map(parseCustomRoleRow));
}

export async function listRoleDefinitions(): Promise<CustomRoleDefinition[]> {
  if (!isDbConfigured()) return [];
  await refreshCatalog();
  const rows = await prisma.$queryRawUnsafe<RoleRow[]>(
    `SELECT * FROM role_definitions ORDER BY label ASC`,
  );
  return rows.map(parseCustomRoleRow);
}

function sanitizePermissions(actor: UserProfile, permissions: readonly string[]) {
  const parsed = parsePermissions(permissions);
  if (actor.role === "owner") return parsed;
  return parsed.filter((permission) => hasPermission(actor, permission));
}

function validateSlug(slug: string) {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) {
    return "Use a lowercase slug like inventory-lead.";
  }
  if (isReservedRoleSlug(slug)) return "That slug is reserved for a built-in role.";
  return null;
}

async function slugAvailable(slug: string, exceptId?: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM role_definitions WHERE slug = ${slug} LIMIT 1
  `;
  const hit = rows[0];
  if (!hit) return true;
  return hit.id === exceptId;
}

async function uniqueSlug(base: string, exceptId?: string) {
  let slug = base;
  let suffix = 2;
  while (!(await slugAvailable(slug, exceptId))) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

export async function createRoleDefinition(
  actor: UserProfile,
  input: {
    label: string;
    description?: string;
    permissions: readonly string[];
    rank?: number;
    slug?: string;
  },
): Promise<
  { role: CustomRoleDefinition; error?: undefined } | { role?: undefined; error: string; status: number }
> {
  if (!hasPermission(actor, "users.assign_roles")) {
    return { error: "You cannot create roles.", status: 403 };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 };

  const label = input.label.trim();
  if (label.length < 2) return { error: "Enter a role name.", status: 400 };

  const permissions = sanitizePermissions(actor, input.permissions);
  if (permissions.length === 0) {
    return { error: "Choose at least one permission for this role.", status: 400 };
  }

  const rank = Math.min(Math.max(input.rank ?? 1, 0), actor.role === "owner" ? 2 : 2);
  const baseSlug = slugifyRoleLabel(input.slug?.trim() || label);
  if (!baseSlug) return { error: "Could not derive a slug from that name.", status: 400 };
  const slugError = validateSlug(baseSlug);
  if (slugError) return { error: slugError, status: 400 };

  await ensureRoleDefinitionsSchema();
  const slug = await uniqueSlug(baseSlug);
  const id = `role-${crypto.randomUUID()}`;
  const permissionsJson = JSON.stringify(permissions);
  const description = (input.description ?? "").trim();

  await prisma.$executeRaw`
    INSERT INTO role_definitions (id, slug, label, description, permissions, \`rank\`)
    VALUES (${id}, ${slug}, ${label}, ${description}, ${permissionsJson}, ${rank})
  `;

  await refreshCatalog();
  const role = (await listRoleDefinitions()).find((item) => item.id === id);
  if (!role) return { error: "Role was created but could not be loaded.", status: 500 };

  await recordActivity({
    actorUserId: actor.id,
    action: "role.created",
    entityType: "role",
    entityId: role.id,
    summary: `${actor.name} created the ${role.label} role`,
    metadata: { slug: role.slug, permissions: role.permissions, rank: role.rank },
  });

  return { role };
}

export async function updateRoleDefinition(
  actor: UserProfile,
  roleId: string,
  patch: {
    label?: string;
    description?: string;
    permissions?: readonly string[];
    rank?: number;
    slug?: string;
  },
): Promise<
  { role: CustomRoleDefinition; error?: undefined } | { role?: undefined; error: string; status: number }
> {
  if (!hasPermission(actor, "users.assign_roles")) {
    return { error: "You cannot edit roles.", status: 403 };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 };
  await ensureRoleDefinitionsSchema();

  const rows = await prisma.$queryRawUnsafe<RoleRow[]>(
    `SELECT * FROM role_definitions WHERE id = ? LIMIT 1`,
    roleId,
  );
  const existing = rows[0];
  if (!existing) return { error: "Role not found.", status: 404 };

  const label = patch.label !== undefined ? patch.label.trim() : existing.label;
  if (label.length < 2) return { error: "Enter a role name.", status: 400 };

  const permissions =
    patch.permissions !== undefined
      ? sanitizePermissions(actor, patch.permissions)
      : parsePermissions(existing.permissions);
  if (permissions.length === 0) {
    return { error: "Choose at least one permission for this role.", status: 400 };
  }

  let slug = existing.slug;
  if (patch.slug !== undefined) {
    const nextSlug = slugifyRoleLabel(patch.slug.trim());
    const slugError = validateSlug(nextSlug);
    if (slugError) return { error: slugError, status: 400 };
    if (!(await slugAvailable(nextSlug, roleId))) {
      return { error: "That slug is already in use.", status: 409 };
    }
    slug = nextSlug;
  }

  const rank =
    patch.rank !== undefined
      ? Math.min(Math.max(patch.rank, 0), actor.role === "owner" ? 2 : 2)
      : existing.rank;
  const description =
    patch.description !== undefined ? patch.description.trim() : existing.description;
  const permissionsJson = JSON.stringify(permissions);

  await prisma.$executeRaw`
    UPDATE role_definitions
    SET
      slug = ${slug},
      label = ${label},
      description = ${description},
      permissions = ${permissionsJson},
      \`rank\` = ${rank},
      updated_at = NOW()
    WHERE id = ${roleId}
  `;

  await refreshCatalog();
  const role = (await listRoleDefinitions()).find((item) => item.id === roleId);
  if (!role) return { error: "Role was updated but could not be loaded.", status: 500 };

  await recordActivity({
    actorUserId: actor.id,
    action: "role.updated",
    entityType: "role",
    entityId: role.id,
    summary: `${actor.name} updated the ${role.label} role`,
    metadata: { slug: role.slug, permissions: role.permissions, rank: role.rank },
  });

  return { role };
}

export async function deleteRoleDefinition(
  actor: UserProfile,
  roleId: string,
): Promise<{ ok: true; error?: undefined } | { ok?: undefined; error: string; status: number }> {
  if (!hasPermission(actor, "users.assign_roles")) {
    return { error: "You cannot delete roles.", status: 403 };
  }
  if (!isDbConfigured()) return { error: "Database is not configured.", status: 503 };
  await ensureRoleDefinitionsSchema();

  const rows = await prisma.$queryRawUnsafe<RoleRow[]>(
    `SELECT * FROM role_definitions WHERE id = ? LIMIT 1`,
    roleId,
  );
  const existing = rows[0];
  if (!existing) return { error: "Role not found.", status: 404 };

  const usage = await prisma.$queryRaw<Array<{ count: number | bigint }>>`
    SELECT CAST(COUNT(*) AS SIGNED) AS count FROM users WHERE role = ${existing.slug}
  `;
  if (Number(usage[0]?.count ?? 0) > 0) {
    return { error: "Reassign users on this role before deleting it.", status: 409 };
  }

  await prisma.$executeRaw`DELETE FROM role_definitions WHERE id = ${roleId}`;
  await refreshCatalog();

  await recordActivity({
    actorUserId: actor.id,
    action: "role.deleted",
    entityType: "role",
    entityId: existing.id,
    summary: `${actor.name} deleted the ${existing.label} role`,
    metadata: { slug: existing.slug },
  });

  return { ok: true };
}

export async function warmRoleCatalog() {
  await refreshCatalog();
}

export function permissionsActorCanGrant(actor: UserProfile): Permission[] {
  if (actor.role === "owner") return [...PERMISSIONS];
  return effectivePermissions(actor);
}
