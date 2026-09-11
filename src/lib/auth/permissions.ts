import type { UserRole } from "@/types";
import { customRolePermissions } from "@/lib/auth/role-catalog";
import { isBuiltInRole } from "@/lib/auth/role-catalog";

export const PERMISSIONS = [
  "dashboard.access",
  "dashboard.overview",
  "pos.access",
  "pos.sell",
  "orders.view",
  "orders.manage",
  "inventory.view",
  "inventory.adjust",
  "inventory.restock",
  "inventory.reset",
  "catalog.create",
  "catalog.edit",
  "catalog.delete",
  "activity.view",
  "users.view",
  "users.create",
  "users.edit",
  "users.assign_roles",
  "users.deactivate",
  "users.reset_password",
  "locations.view",
  "locations.create",
  "locations.edit",
  "locations.delete",
  "events.view",
  "events.create",
  "events.edit",
  "events.delete",
  "reviews.view",
  "reviews.moderate",
  "reviews.respond",
  "support.view",
  "support.manage",
  "deliveries.view",
  "deliveries.manage",
  "customers.view",
  "customers.edit",
  "promotions.view",
  "promotions.manage",
  "loyalty.view",
  "loyalty.manage",
  "analytics.view",
  "inventory.transfer",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type PermissionKind = "read" | "action";

export type AccessSubject = {
  role: string;
  permissionGrants?: readonly string[];
  permissionRevokes?: readonly string[];
  /** Server-computed snapshot so the client does not need the role catalog. */
  effectivePermissions?: readonly string[];
};

export type AccessInput = string | AccessSubject;

export const PERMISSION_META: Record<
  Permission,
  { label: string; group: string; description: string; kind: PermissionKind }
> = {
  "dashboard.access": {
    group: "Dashboard",
    kind: "read",
    label: "Open dashboard",
    description: "Sign in to the staff command center and open Profile",
  },
  "dashboard.overview": {
    group: "Dashboard",
    kind: "action",
    label: "View overview",
    description: "See sales analytics, order health, and branch performance charts",
  },
  "pos.access": {
    group: "POS",
    kind: "read",
    label: "Open POS",
    description: "Open the point of sale register and browse bottles by store",
  },
  "pos.sell": {
    group: "POS",
    kind: "action",
    label: "Complete sales",
    description: "Ring up walk-in sales, deduct stock, and create orders",
  },
  "orders.view": {
    group: "Orders",
    kind: "read",
    label: "View orders",
    description: "See store orders across online, pickup, and POS sales",
  },
  "orders.manage": {
    group: "Orders",
    kind: "action",
    label: "Manage orders",
    description: "Cancel open orders and update fulfillment status for accessible stores",
  },
  "inventory.view": {
    group: "Inventory",
    kind: "read",
    label: "View inventory",
    description: "See on-hand counts by store",
  },
  "inventory.adjust": {
    group: "Inventory",
    kind: "action",
    label: "Adjust stock",
    description: "Change bottle counts one SKU at a time",
  },
  "inventory.restock": {
    group: "Inventory",
    kind: "action",
    label: "Restock",
    description: "Bulk restock low and out-of-stock bottles",
  },
  "inventory.reset": {
    group: "Inventory",
    kind: "action",
    label: "Reset store",
    description: "Reset a store back to catalog seed counts",
  },
  "catalog.create": {
    group: "Catalog",
    kind: "action",
    label: "Add bottles",
    description: "Create new products in the shop catalog",
  },
  "catalog.edit": {
    group: "Catalog",
    kind: "action",
    label: "Edit bottles",
    description: "Update photos, price, description, and other catalog fields",
  },
  "catalog.delete": {
    group: "Catalog",
    kind: "action",
    label: "Remove bottles",
    description: "Delete owner-added custom bottles",
  },
  "activity.view": {
    group: "Activity",
    kind: "read",
    label: "View activity",
    description: "Read the audit log of account and stock changes",
  },
  "users.view": {
    group: "Users",
    kind: "read",
    label: "View users",
    description: "See accounts, roles, and status",
  },
  "users.create": {
    group: "Users",
    kind: "action",
    label: "Create users",
    description: "Add staff, admin, and customer accounts",
  },
  "users.edit": {
    group: "Users",
    kind: "action",
    label: "Edit profiles",
    description: "Update name, email, password, and photo",
  },
  "users.assign_roles": {
    group: "Users",
    kind: "action",
    label: "Assign roles",
    description: "Change which permission set an account uses",
  },
  "users.deactivate": {
    group: "Users",
    kind: "action",
    label: "Deactivate users",
    description: "Turn access on or off for an account",
  },
  "users.reset_password": {
    group: "Users",
    kind: "action",
    label: "Reset password",
    description: "Set a new sign-in password for another account",
  },
  "locations.view": {
    group: "Locations",
    kind: "read",
    label: "View locations",
    description: "See store addresses and manage the locations list",
  },
  "locations.create": {
    group: "Locations",
    kind: "action",
    label: "Add locations",
    description: "Create a new store in the network",
  },
  "locations.edit": {
    group: "Locations",
    kind: "action",
    label: "Edit locations",
    description: "Update store details, hours, and contact info",
  },
  "locations.delete": {
    group: "Locations",
    kind: "action",
    label: "Remove locations",
    description: "Delete a store that has no order history",
  },
  "events.view": {
    group: "Events",
    kind: "read",
    label: "View events",
    description: "See tastings, launches, and festivals",
  },
  "events.create": {
    group: "Events",
    kind: "action",
    label: "Add events",
    description: "Create a tasting or in-store event",
  },
  "events.edit": {
    group: "Events",
    kind: "action",
    label: "Edit events",
    description: "Update event details, seats, and schedule",
  },
  "events.delete": {
    group: "Events",
    kind: "action",
    label: "Remove events",
    description: "Cancel and delete an event listing",
  },
  "reviews.view": {
    group: "Reviews",
    kind: "read",
    label: "View reviews",
    description: "See product, store, and delivery reviews in one place",
  },
  "reviews.moderate": {
    group: "Reviews",
    kind: "action",
    label: "Moderate reviews",
    description: "Hide, publish, or act on flagged / reported reviews",
  },
  "reviews.respond": {
    group: "Reviews",
    kind: "action",
    label: "Respond to reviews",
    description: "Post owner replies on customer reviews",
  },
  "support.view": {
    group: "Support",
    kind: "read",
    label: "View support tickets",
    description: "See customer support tickets routed to your stores or org",
  },
  "support.manage": {
    group: "Support",
    kind: "action",
    label: "Manage support tickets",
    description: "Reply, assign, resolve, and close support tickets",
  },
  "deliveries.view": {
    group: "Deliveries",
    kind: "read",
    label: "View deliveries",
    description: "See open deliveries, assigned drivers, and status",
  },
  "deliveries.manage": {
    group: "Deliveries",
    kind: "action",
    label: "Manage deliveries",
    description: "Assign drivers, update delivery status, and manage the driver roster",
  },
  "customers.view": {
    group: "CRM",
    kind: "read",
    label: "View customers",
    description: "See organization customer directory and segments",
  },
  "customers.edit": {
    group: "CRM",
    kind: "action",
    label: "Edit customers",
    description: "Update customer notes and marketing consent",
  },
  "promotions.view": {
    group: "Promotions",
    kind: "read",
    label: "View promotions",
    description: "See coupons and promotional offers",
  },
  "promotions.manage": {
    group: "Promotions",
    kind: "action",
    label: "Manage promotions",
    description: "Create and edit organization and location promotions",
  },
  "loyalty.view": {
    group: "Loyalty",
    kind: "read",
    label: "View loyalty",
    description: "See loyalty program settings and tiers",
  },
  "loyalty.manage": {
    group: "Loyalty",
    kind: "action",
    label: "Manage loyalty",
    description: "Update earn rates, rewards, and tiers",
  },
  "analytics.view": {
    group: "Analytics",
    kind: "read",
    label: "View analytics",
    description: "See store-wide sales and financial analytics",
  },
  "inventory.transfer": {
    group: "Inventory",
    kind: "action",
    label: "Transfer stock",
    description: "Move inventory between locations",
  },
};

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  customer: [],
  staff: [
    "dashboard.access",
    "dashboard.overview",
    "pos.access",
    "pos.sell",
    "orders.view",
    "orders.manage",
    "inventory.view",
    "inventory.adjust",
    "inventory.restock",
    "inventory.transfer",
    "activity.view",
    "locations.view",
    "events.view",
    "reviews.view",
    "support.view",
    "support.manage",
    "deliveries.view",
    "deliveries.manage",
    "customers.view",
    "promotions.view",
    "loyalty.view",
    "analytics.view",
  ],
  admin: [
    "dashboard.access",
    "dashboard.overview",
    "pos.access",
    "pos.sell",
    "orders.view",
    "orders.manage",
    "inventory.view",
    "inventory.adjust",
    "inventory.restock",
    "inventory.reset",
    "inventory.transfer",
    "catalog.create",
    "catalog.edit",
    "catalog.delete",
    "activity.view",
    "users.view",
    "users.create",
    "users.edit",
    "users.assign_roles",
    "users.deactivate",
    "users.reset_password",
    "locations.view",
    "locations.create",
    "locations.edit",
    "locations.delete",
    "events.view",
    "events.create",
    "events.edit",
    "events.delete",
    "reviews.view",
    "reviews.moderate",
    "reviews.respond",
    "support.view",
    "support.manage",
    "deliveries.view",
    "deliveries.manage",
    "customers.view",
    "customers.edit",
    "promotions.view",
    "promotions.manage",
    "loyalty.view",
    "loyalty.manage",
    "analytics.view",
  ],
  owner: PERMISSIONS,
};

export const PERMISSION_GROUPS = [
  "Dashboard",
  "POS",
  "Orders",
  "Inventory",
  "Catalog",
  "Locations",
  "Events",
  "Reviews",
  "Support",
  "Deliveries",
  "CRM",
  "Promotions",
  "Loyalty",
  "Analytics",
  "Activity",
  "Users",
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export function permissionsInGroup(group: string): Permission[] {
  return PERMISSIONS.filter((permission) => PERMISSION_META[permission].group === group);
}

export function permissionGroupTree(group: string) {
  const items = permissionsInGroup(group);
  const read = items.find((permission) => PERMISSION_META[permission].kind === "read");
  const actions = items.filter((permission) => permission !== read);
  return { items, read, actions };
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function parsePermissions(value: unknown): Permission[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Permission => typeof item === "string" && isPermission(item));
}

export function asAccess(subject: AccessInput): AccessSubject {
  return typeof subject === "string" ? { role: subject } : subject;
}

export function rolePermissions(role: string): Permission[] {
  if (role === "owner") return [...PERMISSIONS];
  if (isBuiltInRole(role)) return [...ROLE_PERMISSIONS[role]];
  const custom = customRolePermissions(role);
  return custom ? [...custom] : [];
}

export function normalizeOverrides(
  role: string,
  grants: readonly string[] = [],
  revokes: readonly string[] = [],
) {
  if (role === "owner") {
    return { permissionGrants: [] as Permission[], permissionRevokes: [] as Permission[] };
  }
  const base = new Set(rolePermissions(role));
  const permissionGrants = parsePermissions(grants).filter((permission) => !base.has(permission));
  const permissionRevokes = parsePermissions(revokes).filter((permission) => base.has(permission));
  return { permissionGrants, permissionRevokes };
}

export function effectivePermissions(subject: AccessInput): Permission[] {
  const access = asAccess(subject);
  if (access.role === "owner") return [...PERMISSIONS];
  const enabled = new Set(rolePermissions(access.role));
  for (const permission of parsePermissions(access.permissionRevokes)) {
    enabled.delete(permission);
  }
  for (const permission of parsePermissions(access.permissionGrants)) {
    enabled.add(permission);
  }
  return withPermissionImplications(PERMISSIONS.filter((permission) => enabled.has(permission)));
}

export function hasPermission(subject: AccessInput, permission: Permission) {
  if (typeof subject !== "string" && subject.effectivePermissions !== undefined) {
    return subject.effectivePermissions.includes(permission);
  }
  return effectivePermissions(subject).includes(permission);
}

export function hasAnyPermission(subject: AccessInput, permissions: Permission[]) {
  if (typeof subject !== "string" && subject.effectivePermissions !== undefined) {
    return permissions.some((permission) =>
      subject.effectivePermissions!.includes(permission),
    );
  }
  return permissions.some((permission) => hasPermission(subject, permission));
}

export function permissionsFor(subject: AccessInput): Permission[] {
  return effectivePermissions(subject);
}

export function hasCustomPermissions(subject: AccessInput) {
  const access = asAccess(subject);
  const { permissionGrants, permissionRevokes } = normalizeOverrides(
    access.role,
    access.permissionGrants,
    access.permissionRevokes,
  );
  return permissionGrants.length > 0 || permissionRevokes.length > 0;
}

export function overridesFromEnabled(role: string, enabled: readonly Permission[]) {
  if (role === "owner") {
    return { permissionGrants: [] as Permission[], permissionRevokes: [] as Permission[] };
  }
  const on = new Set(withPermissionImplications(enabled));
  const base = new Set(rolePermissions(role));
  return {
    permissionGrants: PERMISSIONS.filter((permission) => on.has(permission) && !base.has(permission)),
    permissionRevokes: PERMISSIONS.filter((permission) => base.has(permission) && !on.has(permission)),
  };
}

/** If any action in a group is on, ensure the group's read permission is on. */
export function withPermissionImplications(enabled: readonly Permission[]): Permission[] {
  const next = new Set(enabled);
  for (const group of PERMISSION_GROUPS) {
    const { read, actions } = permissionGroupTree(group);
    if (!read) continue;
    if (actions.some((action) => next.has(action))) next.add(read);
  }
  return PERMISSIONS.filter((permission) => next.has(permission));
}

export function permissionSource(
  subject: AccessInput,
  permission: Permission,
): "role" | "added" | "removed" | "none" {
  const access = asAccess(subject);
  const inRole = rolePermissions(access.role).includes(permission) || access.role === "owner";
  const granted = parsePermissions(access.permissionGrants).includes(permission);
  const revoked = parsePermissions(access.permissionRevokes).includes(permission);
  if (inRole && revoked) return "removed";
  if (!inRole && granted) return "added";
  if (inRole) return "role";
  return "none";
}
