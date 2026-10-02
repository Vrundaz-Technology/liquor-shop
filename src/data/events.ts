import type { EventItem, Review, UserProfile } from "@/types";

export const events: EventItem[] = [
  {
    id: "e1",
    slug: "speyside-evening",
    title: "Speyside Evening: Macallan & Glenfiddich",
    type: "whiskey-tasting",
    description:
      "A guided tasting through Speyside icons with our whiskey curator. Five pours, cheese pairing, and allocation insights.",
    locationId: "loc1",
    date: "2026-08-15",
    startTime: "19:00",
    endTime: "21:30",
    price: 95,
    seatsTotal: 24,
    seatsAvailable: 8,
    image: "/store/downtown-maison.jpg",
    hosts: ["Marcus Chen"],
    active: true,
  },
  {
    id: "e2",
    slug: "champagne-salon",
    title: "Champagne Salon: Dom Pérignon & Beyond",
    type: "wine-tasting",
    description:
      "Explore vintage Champagne with our uptown concierge. Includes canapés and a take-home tasting journal.",
    locationId: "loc3",
    date: "2026-08-22",
    startTime: "18:30",
    endTime: "21:00",
    price: 145,
    seatsTotal: 16,
    seatsAvailable: 3,
    image: "/store/waterfront-alt.jpg",
    hosts: ["Ava Laurent"],
    active: true,
  },
  {
    id: "e3",
    slug: "rum-festival-waterfront",
    title: "Caribbean Rum Festival",
    type: "festival",
    description:
      "Harbor-side celebration of aged rums, live steel drums, and Diplomático masterclass.",
    locationId: "loc2",
    date: "2026-09-05",
    startTime: "15:00",
    endTime: "21:00",
    price: 55,
    seatsTotal: 80,
    seatsAvailable: 42,
    image: "/store/waterfront-maison.jpg",
    hosts: ["Sofia Alvarez"],
    active: true,
  },
  {
    id: "e4",
    slug: "louis-xiii-launch",
    title: "Louis XIII Private Launch Night",
    type: "launch",
    description:
      "Invitation-style evening unveiling our latest Louis XIII allocation with crystal service.",
    locationId: "loc3",
    date: "2026-09-12",
    startTime: "20:00",
    endTime: "23:00",
    price: 350,
    seatsTotal: 12,
    seatsAvailable: 2,
    image: "/store/downtown-alt.jpg",
    hosts: ["James Whitmore", "Ava Laurent"],
    active: true,
  },
];

export const reviews: Review[] = [
  {
    id: "r1",
    productId: "mk-blantons",
    userName: "David K.",
    rating: 5,
    title: "Worth every pour",
    body: "Blanton's Single Barrel is richer than the usual well pour — caramel, spice, and real barrel character. Served neat after dinner.",
    date: "2026-06-12",
    verified: true,
    helpful: 48,
  },
  {
    id: "r2",
    productId: "mk-jw-blue",
    userName: "Priya S.",
    rating: 5,
    title: "Gift that impressed",
    body: "Bought Johnnie Walker Blue Label for my father's birthday. Silk, smoke, and honey — presentation and taste were flawless.",
    date: "2026-05-28",
    verified: true,
    images: ["/products/market/johnnie-walker-blue-label.jpg"],
    helpful: 31,
  },
  {
    id: "r3",
    productId: "mk-buffalo-trace",
    userName: "Alex M.",
    rating: 5,
    title: "The classic for a reason",
    body: "Buffalo Trace never disappoints. Vanilla, oak, and enough proof for a proper Old Fashioned.",
    date: "2026-07-01",
    verified: true,
    helpful: 67,
  },
  {
    id: "r4",
    productId: "mk-makers-mark",
    userName: "Jordan L.",
    rating: 4,
    title: "Wheated and easy",
    body: "Maker's Mark is my go-to neat pour — soft caramel without the rye bite.",
    date: "2026-06-20",
    verified: true,
    helpful: 22,
  },
  {
    id: "r5",
    productId: "mk-wild-turkey-101",
    userName: "Claire W.",
    rating: 5,
    title: "Campfire bourbon",
    body: "Wild Turkey 101 holds up over ice — caramel, spice, and no watery finish.",
    date: "2026-01-02",
    verified: true,
    helpful: 55,
  },
  {
    id: "r6",
    productId: "mk-glenfiddich-12",
    userName: "Sam T.",
    rating: 5,
    title: "Benchmark Speyside",
    body: "Glenfiddich 12 is everything I want in a daily single malt — pear, vanilla, soft spice.",
    date: "2026-07-08",
    verified: true,
    helpful: 41,
  },
];


export const demoUser: UserProfile = {
  id: "u1",
  name: "Alexander Reed",
  email: "alex.reed@email.com",
  role: "customer",
  active: true,
  preferredBranchId: "loc1",
  loyaltyPoints: 2480,
  loyaltyTier: "Collector",
  addresses: [
    {
      id: "a1",
      label: "Home",
      line1: "215 Mercer Street, Apt 4B",
      city: "New York",
      state: "NY",
      zip: "10012",
      isDefault: true,
    },
    {
      id: "a2",
      label: "Office",
      line1: "1 World Trade Center, Floor 42",
      city: "New York",
      state: "NY",
      zip: "10007",
      isDefault: false,
    },
  ],
  recentlyViewed: ["mk-buffalo-trace", "mk-titos", "mk-don-julio-reposado", "mk-makers-mark"],
  permissionGrants: [],
  permissionRevokes: [],
  allowedLocationIds: null,
  orders: [
    {
      id: "ORD-81204",
      date: "2026-01-14",
      status: "delivered",
      items: [
        { productId: "mk-buffalo-trace", quantity: 2, price: 27 },
        { productId: "mk-makers-mark", quantity: 1, price: 28 },
      ],
      total: 98.4,
      fulfillment: "delivery",
      locationId: "loc1",
      tracking: "MS81204NY",
    },
    {
      id: "ORD-82991",
      date: "2026-02-08",
      status: "delivered",
      items: [
        { productId: "mk-glenfiddich-12", quantity: 1, price: 42 },
        { productId: "mk-titos", quantity: 1, price: 19 },
      ],
      total: 98.12,
      fulfillment: "pickup",
      locationId: "loc2",
    },
    {
      id: "ORD-84110",
      date: "2026-03-02",
      status: "delivered",
      items: [
        { productId: "mk-lagavulin-16", quantity: 1, price: 92 },
        { productId: "mk-jameson", quantity: 2, price: 28 },
        { productId: "mk-knob-creek-9", quantity: 1, price: 42 },
      ],
      total: 189.55,
      fulfillment: "delivery",
      locationId: "loc1",
      tracking: "MS84110NY",
    },
    {
      id: "ORD-85227",
      date: "2026-03-28",
      status: "delivered",
      items: [{ productId: "mk-macallan-12", quantity: 1, price: 76 }],
      total: 63.15,
      fulfillment: "pickup",
      locationId: "loc3",
    },
    {
      id: "ORD-86105",
      date: "2026-04-16",
      status: "delivered",
      items: [
        { productId: "mk-woodford", quantity: 1, price: 33 },
        { productId: "mk-baileys", quantity: 1, price: 24 },
        { productId: "mk-malibu", quantity: 1, price: 16 },
      ],
      total: 140.22,
      fulfillment: "delivery",
      locationId: "loc2",
      tracking: "MS86105NY",
    },
    {
      id: "ORD-87240",
      date: "2026-05-09",
      status: "delivered",
      items: [
        { productId: "mk-balvenie-12", quantity: 1, price: 75 },
        { productId: "mk-buffalo-trace", quantity: 1, price: 27 },
      ],
      total: 133.9,
      fulfillment: "pickup",
      locationId: "loc1",
    },
    {
      id: "ORD-87988",
      date: "2026-06-01",
      status: "cancelled",
      items: [{ productId: "mk-hibiki", quantity: 1, price: 95 }],
      total: 120,
      fulfillment: "delivery",
      locationId: "loc1",
    },
    {
      id: "ORD-88012",
      date: "2026-06-12",
      status: "delivered",
      items: [
        { productId: "mk-hendricks", quantity: 2, price: 36 },
        { productId: "mk-wild-turkey-101", quantity: 1, price: 22 },
      ],
      total: 142.68,
      fulfillment: "delivery",
      locationId: "loc3",
      tracking: "MS88012NY",
    },
    {
      id: "ORD-88421",
      date: "2026-07-10",
      status: "delivered",
      items: [
        { productId: "mk-blantons", quantity: 1, price: 80 },
        { productId: "mk-jameson", quantity: 2, price: 28 },
      ],
      total: 130.45,
      fulfillment: "delivery",
      locationId: "loc1",
      tracking: "MS88421NY",
    },
    {
      id: "ORD-89102",
      date: "2026-07-18",
      status: "ready",
      items: [{ productId: "mk-jw-blue", quantity: 1, price: 199 }],
      total: 158.12,
      fulfillment: "pickup",
      locationId: "loc1",
    },
    {
      id: "ORD-89440",
      date: "2026-07-26",
      status: "shipped",
      items: [
        { productId: "mk-glen-grant-15", quantity: 1, price: 86 },
        { productId: "mk-don-julio-reposado", quantity: 1, price: 45 },
      ],
      total: 187.35,
      fulfillment: "delivery",
      locationId: "loc2",
      tracking: "MS89440NY",
    },
    {
      id: "ORD-89601",
      date: "2026-07-29",
      status: "processing",
      items: [
        { productId: "mk-macallan-12", quantity: 1, price: 76 },
        { productId: "mk-wild-turkey-101", quantity: 1, price: 22 },
      ],
      total: 121.94,
      fulfillment: "pickup",
      locationId: "loc1",
    },
  ],
};

/** Store owner — full dashboard access */
export const demoOwner: UserProfile = {
  id: "owner1",
  name: "Sam",
  email: "owner@samsdiscountliquor.com",
  role: "owner",
  active: true,
  preferredBranchId: "loc1",
  loyaltyPoints: 0,
  loyaltyTier: "VIP",
  addresses: [],
  recentlyViewed: [],
  orders: demoUser.orders,
  permissionGrants: [],
  permissionRevokes: [],
  allowedLocationIds: null,
};

export const demoStaff: UserProfile = {
  id: "staff1",
  name: "Maya Chen",
  email: "staff@samsdiscountliquor.com",
  role: "staff",
  active: true,
  preferredBranchId: "loc1",
  loyaltyPoints: 0,
  loyaltyTier: "Member",
  addresses: [],
  recentlyViewed: [],
  orders: [],
  permissionGrants: [],
  permissionRevokes: [],
  allowedLocationIds: null,
};

export const demoAdmin: UserProfile = {
  id: "admin1",
  name: "Jordan Hale",
  email: "admin@samsdiscountliquor.com",
  role: "admin",
  active: true,
  preferredBranchId: "loc2",
  loyaltyPoints: 0,
  loyaltyTier: "Member",
  addresses: [],
  recentlyViewed: [],
  orders: [],
  permissionGrants: [],
  permissionRevokes: [],
  allowedLocationIds: null,
};

export const demoAccounts: UserProfile[] = [demoUser, demoOwner, demoStaff, demoAdmin];

import { getLocationById, isLocationPublic } from "@/data/locations";
import { runtimeData } from "@/lib/runtime-data-bridge";

export function getAllEvents() {
  return runtimeData().getRuntimeEvents();
}

/** Public listings — inactive events and events at hidden stores stay hidden. */
export function getPublicEvents() {
  return getAllEvents().filter((e) => {
    if (e.active === false) return false;
    const store = getLocationById(e.locationId);
    return !store || isLocationPublic(store);
  });
}

export function getReviewsForProduct(productId: string) {
  return runtimeData().getRuntimeReviews().filter((r) => r.productId === productId);
}

export function getEventBySlug(slug: string) {
  return getAllEvents().find((e) => e.slug === slug);
}

export function getPublicEventBySlug(slug: string) {
  return getPublicEvents().find((e) => e.slug === slug);
}
