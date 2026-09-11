import { z } from "zod";
import {
  moneyAmountAtMost,
  nullableMoneySchema,
  positiveMoneySchema,
  taxRateSchema,
} from "@/lib/validation/money";
import { PERMISSIONS, isPermission } from "@/lib/auth/permissions";

export const categorySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{1,39}$/, "Use a short lowercase slug, like mezcal.");

export const categoryWriteSchema = z.object({
  name: z.string().trim().min(2).max(40),
  tagline: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().max(400).optional().default(""),
  color: z.string().trim().max(20).optional().default("#C9A962"),
  slug: categorySlugSchema.optional(),
});

export const categoryPatchSchema = z.object({
  slug: categorySlugSchema,
  patch: categoryWriteSchema.partial(),
});

const mediaUrlSchema = z
  .string()
  .trim()
  .max(4000)
  .refine(
    (value) =>
      value === "" ||
      value.startsWith("/") ||
      value.startsWith("https://") ||
      value.startsWith("http://"),
    "Use a site path or http(s) URL.",
  );

export const bottleFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(80),
  category: categorySlugSchema,
  price: positiveMoneySchema,
  compareAtPrice: positiveMoneySchema.nullable().optional(),
  costPrice: moneyAmountAtMost(999_999.99).nullable().optional(),
  sku: z.string().trim().max(64).optional().or(z.literal("")),
  upc: z
    .string()
    .trim()
    .max(32)
    .regex(/^[0-9-]*$/, "UPC may only contain digits and hyphens")
    .optional()
    .or(z.literal("")),
  minQty: z.number().int().min(1).max(99).optional(),
  maxQty: z.number().int().min(1).max(999).nullable().optional(),
  abv: z.number().gt(0).lte(80),
  volumeMl: z.number().int().positive(),
  origin: z.string().max(120).default(""),
  country: z.string().max(80).default(""),
  description: z.string().max(4000).default(""),
  brandStory: z.string().max(4000).default(""),
  imageUrl: mediaUrlSchema.default(""),
  images: z.array(mediaUrlSchema).max(8).optional(),
  tastingNotes: z.string().max(500).default(""),
  foodPairings: z.string().max(500).default(""),
  isPremium: z.boolean().default(false),
  isImported: z.boolean().default(false),
});

export const newBottleSchema = bottleFieldsSchema.extend({
  initialStock: z.number().int().min(0).default(0),
  stockLocationIds: z.array(z.string().min(1)).optional(),
  actorUserId: z.string().min(1).optional(),
});

export const patchBottleSchema = z.object({
  productId: z.string().min(1),
  patch: bottleFieldsSchema.partial(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  referralCode: z.string().trim().min(4).max(32).optional(),
});

export const addressSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  line1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(40),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "Use a 5-digit ZIP"),
  isDefault: z.boolean(),
});

const avatarUrlSchema = z
  .string()
  .max(900_000)
  .refine(
    (value) => {
      const v = value.trim();
      if (!v) return true;
      if (v.startsWith("/uploads/")) return v.length <= 300;
      if (v.startsWith("https://") || v.startsWith("http://")) return v.length <= 2_000;
      // Legacy inline avatars (prefer /uploads going forward).
      if (v.startsWith("data:image/")) return v.length <= 900_000;
      return false;
    },
    { message: "Invalid profile photo." },
  );

export const mePatchSchema = z.union([
  z.object({
    patch: z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        email: z.string().email().optional(),
        avatarUrl: avatarUrlSchema.nullable().optional(),
        preferredBranchId: z.string().min(1).optional(),
        recentlyViewed: z.array(z.string()).max(12).optional(),
        addresses: z.array(addressSchema).max(12).optional(),
        birthday: z
          .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
          .optional(),
        preferences: z
          .object({
            defaultFulfillment: z.enum(["delivery", "pickup"]).optional(),
            marketingEmails: z.boolean().optional(),
            smsUpdates: z.boolean().optional(),
            pushUpdates: z.boolean().optional(),
            orderEmailUpdates: z.boolean().optional(),
            loyaltyAlerts: z.boolean().optional(),
            backInStockAlerts: z.boolean().optional(),
            priceAlerts: z.boolean().optional(),
            abandonedCartReminders: z.boolean().optional(),
            favoriteCategory: z.string().trim().max(40).nullable().optional(),
          })
          .optional(),
        password: z.string().min(8).max(200).optional(),
        currentPassword: z.string().min(1).max(200).optional(),
      })
      .superRefine((patch, ctx) => {
        if (patch.password && !patch.currentPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Enter your current password to change it.",
            path: ["currentPassword"],
          });
        }
      }),
  }),
  z.object({
    redeemPoints: z.number().int().positive(),
  }),
]);

const permissionSchema = z.custom<(typeof PERMISSIONS)[number]>(
  (value): value is (typeof PERMISSIONS)[number] => typeof value === "string" && isPermission(value),
  { message: "Unknown permission." },
);

const permissionListSchema = z.array(permissionSchema);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.string().trim().min(1).max(40),
  preferredBranchId: z.string().min(1).optional(),
  avatarUrl: avatarUrlSchema.optional(),
  permissionGrants: permissionListSchema.optional(),
  permissionRevokes: permissionListSchema.optional(),
  allowedLocationIds: z.array(z.string().min(1)).nullable().optional(),
});

export const patchUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().optional(),
  role: z.string().trim().min(1).max(40).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  permissionGrants: permissionListSchema.optional(),
  permissionRevokes: permissionListSchema.optional(),
  allowedLocationIds: z.array(z.string().min(1)).nullable().optional(),
});

export const profilePatchSchema = z.union([
  z.object({
    userId: z.string().min(1),
    patch: z.object({
      preferredBranchId: z.string().min(1).optional(),
      recentlyViewed: z.array(z.string()).max(12).optional(),
      addresses: z.array(addressSchema).optional(),
    }),
  }),
  z.object({
    userId: z.string().min(1),
    redeemPoints: z.number().int().positive(),
  }),
]);

const deliveryAddressSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Enter a valid phone like (212) 555-0100"),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "Use a 5-digit ZIP"),
  notes: z.string().trim().max(240).optional(),
});

export const placeOrderSchema = z
  .object({
    email: z.string().email(),
    name: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .min(1, "Phone number is required")
      .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "Enter a valid phone like (212) 555-0100"),
    /** Ignored by the API — session user id is authoritative when present. */
    userId: z.string().min(1).optional(),
    locationId: z.string().min(1),
    fulfillment: z.enum(["delivery", "pickup"]),
    coupon: z.string().nullable().optional(),
    loyaltyPointsRedeem: z.number().int().min(0).max(1_000_000).optional(),
    ageConfirmed: z.literal(true, {
      error: "Confirm you are 21 or older to place this order.",
    }),
    delivery: deliveryAddressSchema.optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().positive().max(99),
        }),
      )
      .min(1),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillment === "delivery" && !data.delivery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Delivery address is required for delivery orders.",
        path: ["delivery"],
      });
    }
  });

export const placePosOrderSchema = z
  .object({
    locationId: z.string().min(1),
    fulfillment: z.enum(["pos", "pickup", "delivery"]),
    paymentMethod: z.enum(["cash", "card", "other"]).optional(),
    customerName: z.string().trim().min(2).max(120).optional(),
    customerEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
    customerPhone: z
      .string()
      .trim()
      .regex(/^$|^\(\d{3}\) \d{3}-\d{4}$/, "Enter a valid phone like (212) 555-0100")
      .optional(),
    coupon: z.string().nullable().optional(),
    delivery: deliveryAddressSchema.optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().positive().max(99),
        }),
      )
      .min(1)
      .max(80),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillment === "delivery" && !data.delivery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Delivery address is required for delivery orders.",
        path: ["delivery"],
      });
    }
  });

export const cancelOrderSchema = z.object({
  orderId: z.string().min(1),
  /** @deprecated Ignored — cancel requires a signed-in session. */
  userId: z.string().min(1).optional(),
});

export const patchOrderSchema = z.object({
  orderId: z.string().min(1),
  action: z.enum(["cancel", "status"]).optional().default("cancel"),
  status: z
    .enum([
      "new",
      "accepted",
      "preparing",
      "ready",
      "assigned",
      "out_for_delivery",
      "delivered",
      "ready_for_pickup",
      "picked_up",
      "completed",
      "processing",
      "shipped",
    ])
    .optional(),
  /** @deprecated Ignored — cancel requires a signed-in session. */
  userId: z.string().min(1).optional(),
});

export const bookSeatsSchema = z.object({
  eventId: z.string().min(1),
  qty: z.number().int().positive().max(12),
  actorUserId: z.string().min(1).optional(),
});

export const inventoryPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set"),
    locationId: z.string().min(1),
    productId: z.string().min(1),
    quantity: z.number().int().min(0),
    reason: z.string().max(40).optional(),
    actorUserId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    locationId: z.string().min(1),
    productId: z.string().min(1),
    delta: z.number().int(),
    reason: z.string().max(40).optional(),
    orderId: z.string().optional(),
    actorUserId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("deduct"),
    locationId: z.string().min(1),
    orderId: z.string().min(1),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().positive(),
        }),
      )
      .min(1),
    actorUserId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("reset"),
    locationId: z.string().min(1).optional(),
    actorUserId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("visibility"),
    locationId: z.string().min(1),
    productId: z.string().min(1),
    hidden: z.boolean(),
    actorUserId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("pricing"),
    locationId: z.string().min(1),
    productId: z.string().min(1),
    basePrice: nullableMoneySchema.optional(),
    salePrice: nullableMoneySchema.optional(),
    costPrice: nullableMoneySchema.optional(),
    promoPrice: nullableMoneySchema.optional(),
    actorUserId: z.string().min(1).optional(),
  }),
]);

export const locationWriteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  shortName: z.string().trim().min(2).max(40),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
  zip: z.string().trim().min(3).max(20),
  phone: z.string().trim().min(7).max(40),
  email: z.string().email(),
  description: z.string().trim().max(4000).optional(),
  pickupAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
  deliveryRadiusKm: z
    .number()
    .finite()
    .min(0)
    .max(200)
    .refine((n) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9, "Use 0.5 km steps")
    .optional(),
  deliveryFee: moneyAmountAtMost(500, "Delivery fee cannot exceed $500").optional(),
  deliveryFreeMinimum: moneyAmountAtMost(
    10_000,
    "Free delivery minimum cannot exceed $10,000",
  ).optional(),
  minimumOrderAmount: moneyAmountAtMost(
    10_000,
    "Minimum order cannot exceed $10,000",
  ).optional(),
  taxRate: taxRateSchema.optional(),
  hours: z
    .array(
      z.object({
        day: z.string().trim().min(1).max(40),
        open: z.string().trim().min(1).max(16),
        close: z.string().trim().min(1).max(16),
      }),
    )
    .min(1)
    .max(14)
    .optional(),
  holidayHours: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
        open: z.string().trim().max(16).default(""),
        close: z.string().trim().max(16).default(""),
        closed: z.boolean().optional(),
      }),
    )
    .max(60)
    .optional(),
  parking: z.string().trim().max(400).optional(),
  heroImage: z.string().trim().max(4000).optional(),
  gallery: z.array(z.string().trim().max(4000)).max(8).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const locationPatchSchema = z.object({
  locationId: z.string().min(1),
  patch: locationWriteSchema.partial(),
});

export const driverWriteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(40),
  email: z.string().email().optional().or(z.literal("")),
  vehicle: z.string().trim().min(2).max(120),
  locationId: z.string().min(1),
  photoUrl: z.string().trim().max(4000).optional(),
  status: z.enum(["available", "on_route", "offline"]).optional(),
  active: z.boolean().optional(),
});

export const driverPatchSchema = z.object({
  driverId: z.string().min(1),
  patch: driverWriteSchema.partial(),
});

const eventFieldsSchema = z.object({
  title: z.string().trim().min(3).max(160),
  type: z.enum(["wine-tasting", "whiskey-tasting", "launch", "festival"]),
  description: z.string().trim().min(8).max(4000),
  locationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  startTime: z.string().min(4).max(16),
  endTime: z.string().min(4).max(16),
  price: moneyAmountAtMost(10_000, "Ticket price cannot exceed $10,000"),
  seatsTotal: z.number().int().min(1).max(2000),
  image: z.string().trim().max(4000).optional(),
  hosts: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  active: z.boolean().optional(),
});

function refineEventTimes<T extends { startTime?: string; endTime?: string }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (data.startTime && data.endTime && data.endTime <= data.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End time must be after start time.",
      path: ["endTime"],
    });
  }
}

export const eventWriteSchema = eventFieldsSchema.superRefine(refineEventTimes);

export const eventPatchSchema = z.object({
  eventId: z.string().min(1),
  patch: eventFieldsSchema.partial().superRefine(refineEventTimes),
});

export const roleWriteSchema = z.object({
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional().default(""),
  slug: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z][a-z0-9-]*$/, "Use a lowercase slug like inventory-lead.")
    .optional(),
  rank: z.number().int().min(0).max(2).optional(),
  permissions: permissionListSchema.min(1, "Choose at least one permission."),
});

export const rolePatchSchema = z.object({
  roleId: z.string().min(1),
  patch: roleWriteSchema.partial().extend({
    permissions: permissionListSchema.min(1).optional(),
  }),
});
