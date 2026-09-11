import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import {
  deletePromotion,
  getPromotionById,
  listPromotions,
  parsePromotionRules,
  setPromotionActive,
  upsertPromotion,
  type PromotionRules,
  type PromotionType,
} from "@/lib/commerce/promotions";
import { actorOrganizationId, SAMS_ORG_ID } from "@/lib/db/organization";
import { moneyNumber } from "@/lib/db/money";
import { recordActivity } from "@/lib/db/activity";
import {
  diffPromotionSnapshots,
  snapshotFromInput,
  snapshotFromRow,
} from "@/lib/activity/promotion-diff";
import { activityChanges } from "@/lib/activity/changes";
import { canAccessLocation } from "@/lib/auth/location-access";
import { getLocationById } from "@/data/locations";
import {
  moneyAmountSchema,
  optionalMoneySchema,
  percentFractionSchema,
  prioritySchema,
  roundMoney,
} from "@/lib/validation/money";
import { z } from "zod";

function mapPromoRow(r: Awaited<ReturnType<typeof listPromotions>>[number]) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    locationId: r.location_id,
    scope: r.scope,
    name: r.name,
    code: r.code,
    type: r.type,
    value: moneyNumber(r.value),
    minSubtotal: r.min_subtotal == null ? null : moneyNumber(r.min_subtotal),
    priority: r.priority,
    stackable: Boolean(r.stackable),
    active: Boolean(r.active),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    rules: parsePromotionRules(r.rules),
  };
}

export async function GET(request: Request) {
  const auth = await requirePermission("promotions.view");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
  const locationId = searchParams.get("locationId");
  const rows = await listPromotions({
    organizationId: orgId,
    locationId,
    includePlatform: true,
    includeInactive: true,
    adminList: !locationId,
  });

  return NextResponse.json({
    ok: true,
    promotions: rows.map(mapPromoRow),
  });
}

const rulesSchema = z
  .object({
    categories: z.array(z.string().min(1)).optional(),
    brands: z.array(z.string().min(1)).optional(),
    productIds: z.array(z.string().min(1)).optional(),
    buyQty: z.number().int().min(1).max(20).optional(),
    getQty: z.number().int().min(1).max(10).optional(),
    firstOrderOnly: z.boolean().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Use HH:mm")
      .optional()
      .nullable(),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Use HH:mm")
      .optional()
      .nullable(),
  })
  .optional()
  .nullable();

const promoSchema = z
  .object({
    id: z.string().optional(),
    scope: z.enum(["platform", "organization", "location"]),
    name: z.string().trim().min(1, "Name is required").max(120),
    code: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Z0-9_-]*$/, "Code may only use A–Z, 0–9, _ or -")
      .nullable()
      .optional()
      .transform((v) => (v ? v.toUpperCase() : null)),
    type: z.enum(["percent", "fixed", "free_delivery", "bogo"]),
    value: z.number({ error: "Enter a valid value" }).finite(),
    minSubtotal: optionalMoneySchema,
    priority: prioritySchema.optional().default(100),
    stackable: z.boolean().optional(),
    active: z.boolean().optional(),
    locationId: z.string().nullable().optional(),
    startsAt: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v && v.trim() ? v : null)),
    endsAt: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v && v.trim() ? v : null)),
    rules: rulesSchema,
  })
  .superRefine((data, ctx) => {
    if (data.scope === "location" && !data.locationId) {
      ctx.addIssue({
        code: "custom",
        path: ["locationId"],
        message: "Choose a store for location-specific offers.",
      });
    }
    if (data.scope !== "location" && data.locationId) {
      ctx.addIssue({
        code: "custom",
        path: ["locationId"],
        message: "Only location-scoped offers can bind to a store.",
      });
    }

    if (data.type === "percent") {
      const check = percentFractionSchema.safeParse(data.value);
      if (!check.success) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: check.error.issues[0]?.message ?? "Invalid percent value",
        });
      }
    } else if (data.type === "fixed") {
      const check = moneyAmountSchema.safeParse(data.value);
      if (!check.success) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: check.error.issues[0]?.message ?? "Invalid dollar amount",
        });
      }
    } else if (data.type === "bogo") {
      const buy = data.rules?.buyQty ?? 2;
      const get = data.rules?.getQty ?? 1;
      if (buy < 1 || get < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["rules"],
          message: "Buy 2 Get 1 needs buy and get quantities.",
        });
      }
    } else if (data.value !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Free delivery does not use a discount value",
      });
    }

    if (data.minSubtotal != null) {
      const check = moneyAmountSchema.safeParse(data.minSubtotal);
      if (!check.success) {
        ctx.addIssue({
          code: "custom",
          path: ["minSubtotal"],
          message: check.error.issues[0]?.message ?? "Invalid min subtotal",
        });
      }
    }

    if (data.startsAt && data.endsAt && new Date(data.startsAt) > new Date(data.endsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End date must be after the start date.",
      });
    }
  })
  .transform((data) => ({
    ...data,
    value:
      data.type === "free_delivery" || data.type === "bogo"
        ? 0
        : data.type === "percent"
          ? roundMoney(data.value, 4)
          : roundMoney(data.value, 2),
    minSubtotal: data.minSubtotal == null ? null : roundMoney(data.minSubtotal, 2),
    code: data.code || null,
    locationId: data.scope === "location" ? data.locationId : null,
    rules: (data.rules ?? null) as PromotionRules | null,
  }));

export async function POST(request: Request) {
  const auth = await requirePermission("promotions.manage");
  if (auth.error) return auth.error;

  const body = promoSchema.safeParse(await request.json());
  if (!body.success) {
    const message = body.error.issues[0]?.message ?? "Invalid promotion";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
  if (body.data.scope === "platform" && auth.user.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can create platform promotions." },
      { status: 403 },
    );
  }

  if (body.data.scope === "location" && body.data.locationId) {
    if (!getLocationById(body.data.locationId)) {
      return NextResponse.json({ error: "Unknown store." }, { status: 400 });
    }
    if (!canAccessLocation(auth.user, body.data.locationId)) {
      return NextResponse.json(
        { error: "You cannot create offers for that store." },
        { status: 403 },
      );
    }
  }

  const isUpdate = Boolean(body.data.id);
  const previous = isUpdate && body.data.id ? await getPromotionById(body.data.id) : null;
  if (isUpdate && !previous) {
    return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
  }

  const id = await upsertPromotion({
    ...body.data,
    type: body.data.type as PromotionType,
    organizationId: body.data.scope === "platform" ? null : orgId,
    startsAt: body.data.startsAt ?? null,
    endsAt: body.data.endsAt ?? null,
    rules: body.data.rules,
  });

  const after = snapshotFromInput({
    ...body.data,
    type: body.data.type as PromotionType,
  });
  const before = previous ? snapshotFromRow(previous) : null;
  const fieldChanges = diffPromotionSnapshots(before, after);

  if (!isUpdate || fieldChanges.length > 0) {
    await recordActivity({
      actorUserId: auth.user.id,
      action: isUpdate ? "promotion.updated" : "promotion.created",
      entityType: "promotion",
      entityId: id,
      locationId: body.data.locationId ?? previous?.location_id ?? undefined,
      summary: isUpdate
        ? `${auth.user.name} updated promotion ${body.data.name} (${fieldChanges.length} field${
            fieldChanges.length === 1 ? "" : "s"
          })`
        : `${auth.user.name} created promotion ${body.data.name}`,
      metadata: activityChanges(fieldChanges),
    });
  }

  if (body.data.active !== false && body.data.scope !== "platform" && !isUpdate) {
    void (async () => {
      try {
        const { prisma } = await import("@/lib/db/prisma");
        const { notifyPromo } = await import("@/lib/notifications");
        const { loadNotifyRecipient } = await import("@/lib/notifications/recipients");
        const customers = await prisma.$queryRawUnsafe<
          { user_id: string; marketing_consent: boolean | number }[]
        >(
          `SELECT user_id, marketing_consent FROM organization_customers
           WHERE organization_id = ? AND marketing_consent = true
           LIMIT 80`,
          orgId,
        );
        for (const row of customers) {
          const recipient = await loadNotifyRecipient(row.user_id);
          if (!recipient) continue;
          await notifyPromo({
            userId: recipient.userId,
            email: recipient.email,
            title: body.data.name,
            body: body.data.code
              ? `New offer “${body.data.name}” — use code ${body.data.code} at checkout.`
              : `New offer: ${body.data.name}`,
            promotionId: id,
            prefs: recipient.prefs,
            marketingConsent: Boolean(row.marketing_consent),
          });
        }
      } catch (error) {
        console.error("[promotions] notify failed", error);
      }
    })();
  }

  return NextResponse.json({ ok: true, id });
}

const patchSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export async function PATCH(request: Request) {
  const auth = await requirePermission("promotions.manage");
  if (auth.error) return auth.error;

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid promotion update." }, { status: 400 });
  }

  const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
  const rows = await listPromotions({
    organizationId: orgId,
    includePlatform: auth.user.role === "owner",
    includeInactive: true,
    adminList: true,
  });
  const target = rows.find((r) => r.id === body.data.id);
  if (!target) {
    return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
  }
  if (target.scope === "platform" && auth.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can change platform offers." }, { status: 403 });
  }
  if (target.location_id && !canAccessLocation(auth.user, target.location_id)) {
    return NextResponse.json({ error: "You cannot manage that store offer." }, { status: 403 });
  }

  await setPromotionActive(body.data.id, body.data.active);
  const wasActive = Boolean(target.active);
  await recordActivity({
    actorUserId: auth.user.id,
    action: "promotion.updated",
    entityType: "promotion",
    entityId: body.data.id,
    locationId: target.location_id ?? undefined,
    summary: `${auth.user.name} ${body.data.active ? "activated" : "deactivated"} promotion ${target.name}`,
    metadata: activityChanges([
      {
        field: "active",
        from: wasActive ? "Yes" : "No",
        to: body.data.active ? "Yes" : "No",
      },
    ]),
  });

  return NextResponse.json({ ok: true, id: body.data.id, active: body.data.active });
}

export async function DELETE(request: Request) {
  const auth = await requirePermission("promotions.manage");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Promotion id is required." }, { status: 400 });
  }

  const orgId = actorOrganizationId(auth.user) ?? SAMS_ORG_ID;
  const rows = await listPromotions({
    organizationId: orgId,
    includePlatform: auth.user.role === "owner",
    includeInactive: true,
    adminList: true,
  });
  const target = rows.find((r) => r.id === id);
  if (!target) {
    return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
  }
  if (target.scope === "platform" && auth.user.role !== "owner") {
    return NextResponse.json({ error: "Only owners can delete platform offers." }, { status: 403 });
  }
  if (target.location_id && !canAccessLocation(auth.user, target.location_id)) {
    return NextResponse.json({ error: "You cannot manage that store offer." }, { status: 403 });
  }

  await deletePromotion(id);
  await recordActivity({
    actorUserId: auth.user.id,
    action: "promotion.deleted",
    entityType: "promotion",
    entityId: id,
    locationId: target.location_id ?? undefined,
    summary: `${auth.user.name} deleted promotion ${target.name}`,
    metadata: {
      changes: [{ field: "deleted", from: target.name, to: "(deleted)" }],
    },
  });

  return NextResponse.json({ ok: true, id });
}
