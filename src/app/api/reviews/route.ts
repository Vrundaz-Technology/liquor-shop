import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestUser,
  requireAnyPermission,
  requirePermission,
  requireUser,
} from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/permissions";
import {
  createPlatformReview,
  getReviewById,
  listProductReviews,
  listPublishedReviews,
  listStaffReviews,
  reportReview,
  reviewTrends,
  staffUpdateReview,
} from "@/lib/db/reviews-admin";
import {
  accessibleLocations,
  canAccessLocation,
  hasAllLocationAccess,
} from "@/lib/auth/location-access";
import { recordActivity } from "@/lib/db/activity";
import { activityChanges, onlyChanged } from "@/lib/activity/changes";

const createSchema = z.object({
  action: z.literal("create").optional(),
  targetType: z.enum(["product", "store", "delivery"]),
  productId: z.string().min(1).optional().nullable(),
  locationId: z.string().min(1).optional().nullable(),
  orderId: z.string().min(1).optional().nullable(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(8).max(4000),
  images: z.array(z.string().url().or(z.string().startsWith("/"))).max(4).optional(),
});

const reportSchema = z.object({
  action: z.literal("report"),
  reviewId: z.string().min(1),
  reason: z.string().trim().min(3).max(255),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const staffPatchSchema = z.object({
  action: z.literal("moderate"),
  reviewId: z.string().min(1),
  status: z.enum(["published", "hidden", "flagged"]).optional(),
  ownerReply: z.string().trim().max(4000).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const locationId = searchParams.get("locationId");
    const orderId = searchParams.get("orderId");
    const targetType = searchParams.get("targetType") as
      | "product"
      | "store"
      | "delivery"
      | null;
    const staff = searchParams.get("staff") === "1";
    const trends = searchParams.get("trends") === "1";
    const status = searchParams.get("status") as "published" | "hidden" | "flagged" | "all" | null;
    const q = searchParams.get("q") ?? undefined;

    if (staff || trends) {
      const auth = await requirePermission("reviews.view");
      if (auth.error) return auth.error;
      if (trends) {
        if (locationId) {
          if (!canAccessLocation(auth.user, locationId)) {
            return NextResponse.json({ error: "Location not allowed." }, { status: 403 });
          }
          return NextResponse.json({ trends: await reviewTrends({ locationId }) });
        }
        if (!hasAllLocationAccess(auth.user)) {
          const ids = accessibleLocations(auth.user).map((loc) => loc.id);
          return NextResponse.json({
            trends: await reviewTrends({ locationIds: ids }),
          });
        }
        return NextResponse.json({ trends: await reviewTrends() });
      }
      const reviews = await listStaffReviews({
        targetType: (targetType as "product" | "store" | "delivery" | "all") ?? "all",
        status: status ?? "all",
        locationId:
          locationId && canAccessLocation(auth.user, locationId) ? locationId : "all",
        q,
      });
      const scoped = reviews.filter((r) => {
        if (!r.locationId) return true;
        return canAccessLocation(auth.user, r.locationId);
      });
      return NextResponse.json({ reviews: scoped });
    }

    if (productId) {
      const reviews = await listProductReviews(productId);
      return NextResponse.json({ reviews });
    }
    if (locationId && (targetType === "store" || !targetType)) {
      const reviews = await listPublishedReviews({
        targetType: "store",
        locationId,
      });
      return NextResponse.json({ reviews });
    }
    if (orderId) {
      const reviews = await listPublishedReviews({
        targetType: "delivery",
        orderId,
      });
      return NextResponse.json({ reviews });
    }

    return NextResponse.json(
      { error: "Provide productId, locationId, orderId, or staff=1." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[GET /api/reviews]", error);
    return NextResponse.json({ error: "Failed to fetch reviews." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.action === "report") {
      const parsed = reportSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid report payload." }, { status: 400 });
      }
      const user = await getRequestUser();
      const result = await reportReview({
        reviewId: parsed.data.reviewId,
        reporterUserId: user?.id,
        reason: parsed.data.reason,
        notes: parsed.data.notes,
      });
      return NextResponse.json(result);
    }

    if (body?.action === "moderate") {
      const auth = await requireAnyPermission(["reviews.moderate", "reviews.respond"]);
      if (auth.error) return auth.error;
      const parsed = staffPatchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid moderation payload." }, { status: 400 });
      }
      const canModerate = hasPermission(auth.user, "reviews.moderate");
      const canRespond = hasPermission(auth.user, "reviews.respond");
      if (parsed.data.status !== undefined && !canModerate) {
        return NextResponse.json(
          { error: "You do not have permission to moderate reviews." },
          { status: 403 },
        );
      }
      if (parsed.data.ownerReply !== undefined && !canRespond) {
        return NextResponse.json(
          { error: "You do not have permission to respond to reviews." },
          { status: 403 },
        );
      }
      if (parsed.data.status === undefined && parsed.data.ownerReply === undefined) {
        return NextResponse.json(
          { error: "Provide status and/or ownerReply." },
          { status: 400 },
        );
      }
      const existing = await getReviewById(parsed.data.reviewId);
      if (!existing) {
        return NextResponse.json({ error: "Review not found." }, { status: 404 });
      }
      if (existing.locationId && !canAccessLocation(auth.user, existing.locationId)) {
        return NextResponse.json(
          { error: "You do not have access to this store's reviews." },
          { status: 403 },
        );
      }
      const review = await staffUpdateReview({
        reviewId: parsed.data.reviewId,
        status: canModerate ? parsed.data.status : undefined,
        ownerReply: parsed.data.ownerReply,
        actorUserId: auth.user.id,
      });
      const changes = onlyChanged([
        {
          field: "status",
          from: existing.status,
          to: review.status,
        },
        {
          field: "ownerReply",
          from: existing.ownerReply?.trim() || "(none)",
          to: review.ownerReply?.trim() || "(none)",
        },
      ]);
      if (changes.length) {
        await recordActivity({
          actorUserId: auth.user.id,
          action: parsed.data.status !== undefined ? "review.moderate" : "review.respond",
          entityType: "review",
          entityId: review.id,
          locationId: review.locationId,
          summary:
            parsed.data.status !== undefined
              ? `${auth.user.name} moderated review ${review.id}`
              : `${auth.user.name} replied to review ${review.id}`,
          metadata: activityChanges(changes),
        });
      }
      return NextResponse.json({ ok: true, review });
    }

    const { user, error } = await requireUser();
    if (error) return error;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid review." },
        { status: 400 },
      );
    }
    const data = parsed.data;
    if (data.targetType === "product" && !data.productId) {
      return NextResponse.json({ error: "productId is required." }, { status: 400 });
    }
    if (data.targetType === "store" && !data.locationId) {
      return NextResponse.json({ error: "locationId is required." }, { status: 400 });
    }
    if (data.targetType === "delivery" && !data.orderId) {
      return NextResponse.json({ error: "orderId is required." }, { status: 400 });
    }

    const review = await createPlatformReview({
      targetType: data.targetType,
      productId: data.productId,
      locationId: data.locationId,
      orderId: data.orderId,
      userId: user.id,
      userName: user.name,
      rating: data.rating,
      title: data.title,
      body: data.body,
      images: data.images,
    });

    await recordActivity({
      actorUserId: user.id,
      action: "review.created",
      entityType: "review",
      entityId: review.id,
      locationId: review.locationId,
      summary: `${user.name} left a ${data.targetType} review`,
      metadata: activityChanges([
        { field: "created", to: data.title },
        { field: "targetType", to: data.targetType },
        { field: "rating", to: data.rating },
        ...(data.productId ? [{ field: "product", to: data.productId }] : []),
        ...(data.locationId ? [{ field: "location", to: data.locationId }] : []),
      ]),
    });

    return NextResponse.json({ ok: true, review }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/reviews]", error);
    const message = error instanceof Error ? error.message : "Failed to save review.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
