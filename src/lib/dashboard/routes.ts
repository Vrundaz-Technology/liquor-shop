import type { Permission } from "@/lib/auth/permissions";

export type DashboardSection =
  | "overview"
  | "pos"
  | "orders"
  | "inventory"
  | "transfers"
  | "locations"
  | "events"
  | "reviews"
  | "support"
  | "activity"
  | "cron"
  | "users"
  | "customers"
  | "promotions"
  | "loyalty"
  | "deliveries"
  | "profile";

export const DASHBOARD_SECTION_PATHS: Record<DashboardSection, string> = {
  overview: "/dashboard",
  pos: "/dashboard/pos",
  orders: "/dashboard/orders",
  inventory: "/dashboard/inventory",
  transfers: "/dashboard/transfers",
  locations: "/dashboard/locations",
  events: "/dashboard/events",
  reviews: "/dashboard/reviews",
  support: "/dashboard/support",
  activity: "/dashboard/activity",
  cron: "/dashboard/cron",
  users: "/dashboard/users",
  customers: "/dashboard/customers",
  promotions: "/dashboard/promotions",
  loyalty: "/dashboard/loyalty",
  deliveries: "/dashboard/deliveries",
  profile: "/dashboard/profile",
};

const SECTION_BY_SEGMENT: Record<string, DashboardSection> = {
  pos: "pos",
  orders: "orders",
  inventory: "inventory",
  transfers: "transfers",
  locations: "locations",
  events: "events",
  reviews: "reviews",
  support: "support",
  activity: "activity",
  cron: "cron",
  users: "users",
  customers: "customers",
  promotions: "promotions",
  loyalty: "loyalty",
  deliveries: "deliveries",
  profile: "profile",
};

export const DASHBOARD_SECTION_META: {
  id: DashboardSection;
  label: string;
  permission: Permission;
  description: string;
}[] = [
  {
    id: "overview",
    label: "Overview",
    permission: "analytics.view",
    description: "Sales, order health, and branch performance across your organization.",
  },
  {
    id: "pos",
    label: "Point of sale",
    permission: "pos.access",
    description: "Ring up walk-in sales and check stock across stores.",
  },
  {
    id: "orders",
    label: "Orders",
    permission: "orders.view",
    description: "Browse and manage online, pickup, and POS orders by store.",
  },
  {
    id: "inventory",
    label: "Inventory",
    permission: "inventory.view",
    description: "Manage bottle counts, categories, restock, and products per store.",
  },
  {
    id: "transfers",
    label: "Transfers",
    permission: "inventory.transfer",
    description: "Move stock between locations with a full transfer history.",
  },
  {
    id: "deliveries",
    label: "Deliveries",
    permission: "deliveries.view",
    description: "Assign drivers and track each delivery to the door.",
  },
  {
    id: "customers",
    label: "Customers",
    permission: "customers.view",
    description: "CRM segments, spend, and customer notes for your organization.",
  },
  {
    id: "promotions",
    label: "Promotions",
    permission: "promotions.view",
    description: "Platform, owner, and location promotions with priority rules.",
  },
  {
    id: "loyalty",
    label: "Loyalty",
    permission: "loyalty.view",
    description: "Organization loyalty earn rates, tiers, and rewards.",
  },
  {
    id: "locations",
    label: "Locations",
    permission: "locations.view",
    description: "Add, edit, or remove stores in your organization.",
  },
  {
    id: "events",
    label: "Events",
    permission: "events.view",
    description: "Create and manage tastings, launches, and in-store events.",
  },
  {
    id: "reviews",
    label: "Reviews",
    permission: "reviews.view",
    description: "Centralized product, store, and delivery review management.",
  },
  {
    id: "support",
    label: "Support",
    permission: "support.view",
    description: "Customer support tickets routed to store, owner, or platform.",
  },
  {
    id: "users",
    label: "Users",
    permission: "users.view",
    description: "Create accounts, assign roles, store access, and permissions.",
  },
  {
    id: "activity",
    label: "Activity",
    permission: "activity.view",
    description: "Audit trail of stock, orders, catalog, and account changes.",
  },
  {
    id: "cron",
    label: "Cron Jobs",
    permission: "activity.view",
    description: "Scheduled background jobs, why they exist, and run history.",
  },
  {
    id: "profile",
    label: "Profile",
    permission: "dashboard.access",
    description: "Update your photo, name, email, and password.",
  },
];

export function isDashboardSection(value: string | null | undefined): value is DashboardSection {
  return Boolean(value && value in DASHBOARD_SECTION_PATHS);
}

export function dashboardPath(
  section: DashboardSection,
  opts?: { orderId?: string; drivers?: boolean; categories?: boolean },
): string {
  if (section === "orders" && opts?.orderId) {
    return `/dashboard/orders/${encodeURIComponent(opts.orderId)}`;
  }
  if (section === "deliveries" && opts?.drivers) {
    return "/dashboard/deliveries/drivers";
  }
  if (section === "inventory" && opts?.categories) {
    return "/dashboard/inventory/categories";
  }
  return DASHBOARD_SECTION_PATHS[section];
}

export type ParsedDashboardRoute = {
  section: DashboardSection;
  orderId: string | null;
  deliveriesSection: "deliveries" | "drivers";
  inventoryView: "stock" | "categories";
};

export function parseDashboardPath(pathname: string): ParsedDashboardRoute {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const segment = parts[1];
  const rest = parts.slice(2);

  if (!segment) {
    return {
      section: "overview",
      orderId: null,
      deliveriesSection: "deliveries",
      inventoryView: "stock",
    };
  }

  if (segment === "orders") {
    return {
      section: "orders",
      orderId: rest[0] ? decodeURIComponent(rest[0]) : null,
      deliveriesSection: "deliveries",
      inventoryView: "stock",
    };
  }

  if (segment === "deliveries") {
    return {
      section: "deliveries",
      orderId: null,
      deliveriesSection: rest[0] === "drivers" ? "drivers" : "deliveries",
      inventoryView: "stock",
    };
  }

  if (segment === "inventory") {
    return {
      section: "inventory",
      orderId: null,
      deliveriesSection: "deliveries",
      inventoryView: rest[0] === "categories" ? "categories" : "stock",
    };
  }

  const section = SECTION_BY_SEGMENT[segment];
  if (section) {
    return {
      section,
      orderId: null,
      deliveriesSection: "deliveries",
      inventoryView: "stock",
    };
  }

  return {
    section: "overview",
    orderId: null,
    deliveriesSection: "deliveries",
    inventoryView: "stock",
  };
}

/** Map legacy `?tab=` values to dedicated paths. */
export function legacyTabToPath(
  tab: string | null,
  searchParams?: URLSearchParams,
): string | null {
  if (!tab) return null;
  if (tab === "drivers") return dashboardPath("deliveries", { drivers: true });
  if (tab === "categories") return dashboardPath("inventory", { categories: true });
  if (!isDashboardSection(tab)) return "/dashboard";

  if (tab === "orders") {
    const orderId = searchParams?.get("order");
    return dashboardPath("orders", orderId ? { orderId } : undefined);
  }
  if (tab === "deliveries" && searchParams?.get("section") === "drivers") {
    return dashboardPath("deliveries", { drivers: true });
  }
  return dashboardPath(tab);
}
