import type { UserProfile } from "@/types";

/**
 * Shoppers that sit on / just below each default membership threshold.
 * Default ladder: Member 0 · Connoisseur 500 · Collector 1500 · VIP 3000
 *
 * Login password (same as other demo accounts): Liquor123!
 */
export const LOYALTY_TEST_FIXTURES = [
  {
    id: "u-loyal-member",
    name: "Mia Member",
    email: "loyalty.member@email.com",
    loyaltyPoints: 0,
    loyaltyTier: "Member" as const,
    case: "New shopper — 0 pts",
  },
  {
    id: "u-loyal-member-edge",
    name: "Noah Almost",
    email: "loyalty.member-edge@email.com",
    loyaltyPoints: 499,
    loyaltyTier: "Member" as const,
    case: "1 point below Connoisseur",
  },
  {
    id: "u-loyal-connoisseur",
    name: "Cora Connoisseur",
    email: "loyalty.connoisseur@email.com",
    loyaltyPoints: 500,
    loyaltyTier: "Connoisseur" as const,
    case: "Exactly at Connoisseur (500)",
  },
  {
    id: "u-loyal-collector",
    name: "Cole Collector",
    email: "loyalty.collector@email.com",
    loyaltyPoints: 1500,
    loyaltyTier: "Collector" as const,
    case: "Exactly at Collector (1500)",
  },
  {
    id: "u-loyal-collector-edge",
    name: "Elena Almost VIP",
    email: "loyalty.collector-edge@email.com",
    loyaltyPoints: 2999,
    loyaltyTier: "Collector" as const,
    case: "1 point below VIP",
  },
  {
    id: "u-loyal-vip",
    name: "Victor VIP",
    email: "loyalty.vip@email.com",
    loyaltyPoints: 3000,
    loyaltyTier: "VIP" as const,
    case: "Exactly at VIP (3000)",
  },
  {
    id: "u-loyal-vip-high",
    name: "Vera Platinum",
    email: "loyalty.vip-high@email.com",
    loyaltyPoints: 5200,
    loyaltyTier: "VIP" as const,
    case: "Well above VIP — redeem without dropping",
  },
] as const;

function fixtureProfile(
  row: (typeof LOYALTY_TEST_FIXTURES)[number],
): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: "customer",
    active: true,
    preferredBranchId: "loc1",
    loyaltyPoints: row.loyaltyPoints,
    loyaltyTier: row.loyaltyTier,
    addresses: [],
    recentlyViewed: [],
    orders: [],
    permissionGrants: [],
    permissionRevokes: [],
    allowedLocationIds: null,
  };
}

export const loyaltyTestCustomers: UserProfile[] =
  LOYALTY_TEST_FIXTURES.map(fixtureProfile);
