import type { Permission } from "@/lib/auth/permissions";

export type RolePreset = {
  slug: string;
  label: string;
  description: string;
  rank: number;
  permissions: Permission[];
};

/** Named industry roles owners can one-click create as custom roles. */
export const ROLE_PRESETS: RolePreset[] = [
  {
    slug: "store-manager",
    label: "Store Manager",
    description: "Orders, inventory, customers, reports, and store settings.",
    rank: 1,
    permissions: [
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
      "catalog.create",
      "catalog.edit",
      "activity.view",
      "locations.view",
      "locations.edit",
      "events.view",
      "events.create",
      "events.edit",
      "deliveries.view",
      "deliveries.manage",
      "customers.view",
      "customers.edit",
      "promotions.view",
      "promotions.manage",
      "loyalty.view",
      "reviews.view",
      "support.view",
      "support.manage",
      "analytics.view",
      "users.view",
    ],
  },
  {
    slug: "cashier",
    label: "Cashier",
    description: "POS, orders, and payments at the counter.",
    rank: 2,
    permissions: [
      "dashboard.access",
      "pos.access",
      "pos.sell",
      "orders.view",
      "orders.manage",
      "inventory.view",
      "customers.view",
    ],
  },
  {
    slug: "warehouse",
    label: "Warehouse",
    description: "Inventory, receiving adjustments, and transfers.",
    rank: 2,
    permissions: [
      "dashboard.access",
      "inventory.view",
      "inventory.adjust",
      "inventory.restock",
      "inventory.transfer",
      "activity.view",
    ],
  },
  {
    slug: "driver-ops",
    label: "Driver Ops",
    description: "Assigned deliveries only — update status on your runs.",
    rank: 2,
    permissions: [
      "dashboard.access",
      "orders.view",
      "deliveries.view",
    ],
  },
  {
    slug: "customer-service",
    label: "Customer Service",
    description: "Support tickets, customers, and order help.",
    rank: 2,
    permissions: [
      "dashboard.access",
      "orders.view",
      "orders.manage",
      "customers.view",
      "customers.edit",
      "events.view",
      "support.view",
      "support.manage",
      "reviews.view",
      "reviews.respond",
    ],
  },
];
