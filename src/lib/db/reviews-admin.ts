import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { addColumnIfMissing } from "@/lib/db/schema-guard";
import type { PlatformReview, ReviewStatus, ReviewTargetType } from "@/types";

let ready = false;

export async function ensureReviewsSchema() {
  if (!isDbConfigured() || ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS platform_reviews (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      target_type VARCHAR(32) NOT NULL,
      product_id VARCHAR(191) NULL,
      location_id VARCHAR(191) NULL,
      order_id VARCHAR(191) NULL,
      user_id VARCHAR(191) NULL,
      user_name VARCHAR(191) NOT NULL,
      rating INT NOT NULL,
      title VARCHAR(191) NOT NULL,
      body TEXT NOT NULL,
      date VARCHAR(32) NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(32) NOT NULL DEFAULT 'published',
      owner_reply TEXT NULL,
      owner_replied_at DATETIME(3) NULL,
      owner_replied_by VARCHAR(191) NULL,
      report_count INT NOT NULL DEFAULT 0,
      helpful INT NOT NULL DEFAULT 0,
      images JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX platform_reviews_target_idx (target_type),
      INDEX platform_reviews_product_idx (product_id),
      INDEX platform_reviews_location_idx (location_id),
      INDEX platform_reviews_order_idx (order_id),
      INDEX platform_reviews_status_idx (status),
      INDEX platform_reviews_user_idx (user_id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS review_reports (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      review_id VARCHAR(191) NOT NULL,
      reporter_user_id VARCHAR(191) NULL,
      reason VARCHAR(255) NOT NULL,
      notes TEXT NULL,
      resolved BOOLEAN NOT NULL DEFAULT false,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX review_reports_review_idx (review_id),
      INDEX review_reports_resolved_idx (resolved)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  // Soft-extend legacy product reviews for status/reply if present.
  await addColumnIfMissing("reviews", "status", "VARCHAR(32) NULL");
  await addColumnIfMissing("reviews", "owner_reply", "TEXT NULL");
  ready = true;
}

type ReviewRow = {
  id: string;
  target_type: string;
  product_id: string | null;
  location_id: string | null;
  order_id: string | null;
  user_id: string | null;
  user_name: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean | number;
  status: string;
  owner_reply: string | null;
  owner_replied_at: Date | string | null;
  owner_replied_by: string | null;
  report_count: number;
  helpful: number;
  images: unknown;
  created_at?: Date | string;
};

function asImages(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function mapPlatformReview(row: ReviewRow): PlatformReview {
  return {
    id: row.id,
    targetType: row.target_type as ReviewTargetType,
    productId: row.product_id ?? undefined,
    locationId: row.location_id ?? undefined,
    orderId: row.order_id ?? undefined,
    userId: row.user_id ?? undefined,
    userName: row.user_name,
    rating: Number(row.rating),
    title: row.title,
    body: row.body,
    date: row.date,
    verified: Boolean(row.verified),
    status: (row.status as ReviewStatus) || "published",
    ownerReply: row.owner_reply ?? undefined,
    ownerRepliedAt:
      row.owner_replied_at instanceof Date
        ? row.owner_replied_at.toISOString()
        : row.owner_replied_at
          ? String(row.owner_replied_at)
          : undefined,
    ownerRepliedBy: row.owner_replied_by ?? undefined,
    reportCount: Number(row.report_count ?? 0),
    helpful: Number(row.helpful ?? 0),
    images: asImages(row.images),
  };
}

async function recomputeProductRating(productId: string) {
  const rows = await prisma.$queryRawUnsafe<{ avg_rating: number | null; cnt: number | bigint }[]>(
    `SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt
     FROM platform_reviews
     WHERE target_type = 'product' AND product_id = ? AND status = 'published'`,
    productId,
  );
  const legacy = await prisma.$queryRawUnsafe<{ avg_rating: number | null; cnt: number | bigint }[]>(
    `SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM reviews WHERE product_id = ?`,
    productId,
  ).catch(() => [] as { avg_rating: number | null; cnt: number | bigint }[]);

  const a = rows[0];
  const b = legacy[0];
  const countA = Number(a?.cnt ?? 0);
  const countB = Number(b?.cnt ?? 0);
  const total = countA + countB;
  if (!total) {
    await prisma.product.update({
      where: { id: productId },
      data: { rating: 0, reviewCount: 0 },
    });
    return;
  }
  const sum =
    (Number(a?.avg_rating ?? 0) * countA + Number(b?.avg_rating ?? 0) * countB) / total;
  await prisma.product.update({
    where: { id: productId },
    data: {
      rating: Math.round(sum * 10) / 10,
      reviewCount: total,
    },
  });
}

export async function listPublishedReviews(filter: {
  targetType?: ReviewTargetType;
  productId?: string;
  locationId?: string;
  orderId?: string;
  limit?: number;
}): Promise<PlatformReview[]> {
  if (!isDbConfigured()) return [];
  await ensureReviewsSchema();
  const where: string[] = [`status = 'published'`];
  const params: unknown[] = [];
  if (filter.targetType) {
    where.push(`target_type = ?`);
    params.push(filter.targetType);
  }
  if (filter.productId) {
    where.push(`product_id = ?`);
    params.push(filter.productId);
  }
  if (filter.locationId) {
    where.push(`location_id = ?`);
    params.push(filter.locationId);
  }
  if (filter.orderId) {
    where.push(`order_id = ?`);
    params.push(filter.orderId);
  }
  const limit = Math.min(100, Math.max(1, filter.limit ?? 40));
  params.push(limit);
  const rows = await prisma.$queryRawUnsafe<ReviewRow[]>(
    `SELECT * FROM platform_reviews
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ?`,
    ...params,
  );
  return rows.map(mapPlatformReview);
}

/** Product page: platform reviews + legacy seed reviews. */
export async function listProductReviews(productId: string): Promise<PlatformReview[]> {
  if (!isDbConfigured()) return [];
  await ensureReviewsSchema();
  const modern = await listPublishedReviews({ targetType: "product", productId, limit: 80 });
  const legacy = await prisma.review.findMany({
    where: { productId },
    orderBy: { date: "desc" },
  });
  const legacyMapped: PlatformReview[] = legacy.map((r) => ({
    id: r.id,
    targetType: "product",
    productId: r.productId,
    userName: r.userName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    date: r.date,
    verified: r.verified,
    status: "published",
    helpful: r.helpful,
    images: asImages(r.images),
  }));
  const seen = new Set(modern.map((r) => r.id));
  return [...modern, ...legacyMapped.filter((r) => !seen.has(r.id))];
}

export async function getReviewById(reviewId: string): Promise<PlatformReview | null> {
  if (!isDbConfigured()) return null;
  await ensureReviewsSchema();
  const rows = await prisma.$queryRawUnsafe<ReviewRow[]>(
    `SELECT * FROM platform_reviews WHERE id = ? LIMIT 1`,
    reviewId,
  );
  return rows[0] ? mapPlatformReview(rows[0]) : null;
}

export async function createPlatformReview(input: {
  targetType: ReviewTargetType;
  productId?: string | null;
  locationId?: string | null;
  orderId?: string | null;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  body: string;
  images?: string[];
}): Promise<PlatformReview> {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureReviewsSchema();

  let verified = false;
  if (input.targetType === "product" && input.productId) {
    const purchased = await prisma.orderItem.findFirst({
      where: {
        productId: input.productId,
        order: {
          userId: input.userId,
          status: { in: ["delivered", "picked_up", "completed"] },
        },
      },
    });
    verified = Boolean(purchased);
  }
  if (input.targetType === "delivery" && input.orderId) {
    const order = await prisma.order.findFirst({
      where: {
        id: input.orderId,
        userId: input.userId,
        fulfillment: "delivery",
        status: "delivered",
      },
    });
    if (!order) throw new Error("You can only review delivered orders.");
    verified = true;
    if (!input.locationId) input.locationId = order.locationId;
  }
  if (input.targetType === "store" && input.locationId) {
    const visited = await prisma.order.findFirst({
      where: {
        userId: input.userId,
        locationId: input.locationId,
        status: { in: ["delivered", "picked_up", "completed", "ready", "ready_for_pickup"] },
      },
    });
    verified = Boolean(visited);
  }

  if (input.targetType === "delivery" && input.orderId) {
    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM platform_reviews
       WHERE target_type = 'delivery' AND order_id = ? AND user_id = ?
       LIMIT 1`,
      input.orderId,
      input.userId,
    );
    if (existing[0]) throw new Error("You already reviewed this delivery.");
  }

  const id = `rev-${crypto.randomUUID()}`;
  const date = new Date().toISOString().slice(0, 10);
  await prisma.$executeRawUnsafe(
    `INSERT INTO platform_reviews
      (id, target_type, product_id, location_id, order_id, user_id, user_name,
       rating, title, body, date, verified, status, report_count, helpful, images, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'published', 0, 0, CAST(? AS JSON), NOW(3))`,
    id,
    input.targetType,
    input.productId ?? null,
    input.locationId ?? null,
    input.orderId ?? null,
    input.userId,
    input.userName,
    input.rating,
    input.title,
    input.body,
    date,
    verified,
    input.images?.length ? JSON.stringify(input.images) : null,
  );

  if (input.targetType === "product" && input.productId) {
    await recomputeProductRating(input.productId);
  }

  const rows = await prisma.$queryRawUnsafe<ReviewRow[]>(
    `SELECT * FROM platform_reviews WHERE id = ? LIMIT 1`,
    id,
  );
  return mapPlatformReview(rows[0]!);
}

export async function listStaffReviews(filter: {
  targetType?: ReviewTargetType | "all";
  status?: ReviewStatus | "all";
  locationId?: string | "all";
  q?: string;
  limit?: number;
}): Promise<PlatformReview[]> {
  if (!isDbConfigured()) return [];
  await ensureReviewsSchema();
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filter.targetType && filter.targetType !== "all") {
    where.push(`target_type = ?`);
    params.push(filter.targetType);
  }
  if (filter.status && filter.status !== "all") {
    where.push(`status = ?`);
    params.push(filter.status);
  }
  if (filter.locationId && filter.locationId !== "all") {
    where.push(`location_id = ?`);
    params.push(filter.locationId);
  }
  if (filter.q?.trim()) {
    where.push(`(title LIKE ? OR body LIKE ? OR user_name LIKE ? OR id LIKE ?)`);
    const like = `%${filter.q.trim()}%`;
    params.push(like, like, like, like);
  }
  const limit = Math.min(200, Math.max(1, filter.limit ?? 80));
  params.push(limit);
  const rows = await prisma.$queryRawUnsafe<ReviewRow[]>(
    `SELECT * FROM platform_reviews
     WHERE ${where.join(" AND ")}
     ORDER BY
       CASE WHEN status = 'flagged' THEN 0 WHEN status = 'published' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT ?`,
    ...params,
  );
  return rows.map(mapPlatformReview);
}

export async function staffUpdateReview(input: {
  reviewId: string;
  status?: ReviewStatus;
  ownerReply?: string | null;
  actorUserId: string;
}): Promise<PlatformReview> {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureReviewsSchema();
  const rows = await prisma.$queryRawUnsafe<ReviewRow[]>(
    `SELECT * FROM platform_reviews WHERE id = ? LIMIT 1`,
    input.reviewId,
  );
  const current = rows[0];
  if (!current) throw new Error("Review not found.");

  const status = input.status ?? current.status;
  const reply =
    input.ownerReply !== undefined ? input.ownerReply : current.owner_reply;
  const repliedAt =
    input.ownerReply !== undefined && input.ownerReply?.trim()
      ? new Date()
      : current.owner_replied_at;
  const repliedBy =
    input.ownerReply !== undefined && input.ownerReply?.trim()
      ? input.actorUserId
      : current.owner_replied_by;

  await prisma.$executeRawUnsafe(
    `UPDATE platform_reviews
     SET status = ?, owner_reply = ?, owner_replied_at = ?, owner_replied_by = ?
     WHERE id = ?`,
    status,
    reply,
    repliedAt instanceof Date ? repliedAt : repliedAt ? new Date(String(repliedAt)) : null,
    repliedBy,
    input.reviewId,
  );

  if (current.product_id && input.status && input.status !== current.status) {
    await recomputeProductRating(current.product_id);
  }

  const next = await prisma.$queryRawUnsafe<ReviewRow[]>(
    `SELECT * FROM platform_reviews WHERE id = ? LIMIT 1`,
    input.reviewId,
  );
  return mapPlatformReview(next[0]!);
}

export async function reportReview(input: {
  reviewId: string;
  reporterUserId?: string | null;
  reason: string;
  notes?: string | null;
}) {
  if (!isDbConfigured()) throw new Error("Database is not configured.");
  await ensureReviewsSchema();
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM platform_reviews WHERE id = ? LIMIT 1`,
    input.reviewId,
  );
  if (!rows[0]) throw new Error("Review not found.");

  const id = `rr-${crypto.randomUUID()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO review_reports (id, review_id, reporter_user_id, reason, notes, resolved, created_at)
     VALUES (?,?,?,?,?, false, NOW(3))`,
    id,
    input.reviewId,
    input.reporterUserId ?? null,
    input.reason.slice(0, 255),
    input.notes ?? null,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE platform_reviews
     SET report_count = report_count + 1,
         status = CASE WHEN status = 'hidden' THEN 'hidden' ELSE 'flagged' END
     WHERE id = ?`,
    input.reviewId,
  );
  return { ok: true, id };
}

export async function reviewTrends(opts?: {
  locationId?: string | null;
  locationIds?: string[] | null;
}) {
  const empty = {
    total: 0,
    published: 0,
    flagged: 0,
    avgRating: 0,
    last7Days: 0,
    byTarget: { product: 0, store: 0, delivery: 0 },
    ratingBuckets: [0, 0, 0, 0, 0],
  };

  if (!isDbConfigured()) {
    return empty;
  }
  await ensureReviewsSchema();

  const locationId = opts?.locationId ?? null;
  const locationIds = opts?.locationIds ?? null;

  let locClause = "";
  let params: string[] = [];
  if (locationId) {
    locClause = `AND location_id = ?`;
    params = [locationId];
  } else if (locationIds) {
    if (!locationIds.length) return empty;
    locClause = `AND location_id IN (${locationIds.map(() => "?").join(",")})`;
    params = [...locationIds];
  }

  const summary = await prisma.$queryRawUnsafe<
    {
      total: number | bigint;
      published: number | bigint;
      flagged: number | bigint;
      avg_rating: number | null;
      last7: number | bigint;
    }[]
  >(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
       SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) AS flagged,
       AVG(CASE WHEN status = 'published' THEN rating END) AS avg_rating,
       SUM(CASE WHEN created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS last7
     FROM platform_reviews
     WHERE 1=1 ${locClause}`,
    ...params,
  );

  const byTarget = await prisma.$queryRawUnsafe<
    { target_type: string; cnt: number | bigint }[]
  >(
    `SELECT target_type, COUNT(*) AS cnt FROM platform_reviews
     WHERE 1=1 ${locClause}
     GROUP BY target_type`,
    ...params,
  );

  const buckets = await prisma.$queryRawUnsafe<{ rating: number; cnt: number | bigint }[]>(
    `SELECT rating, COUNT(*) AS cnt FROM platform_reviews
     WHERE status = 'published' ${locClause}
     GROUP BY rating`,
    ...params,
  );

  const ratingBuckets = [0, 0, 0, 0, 0];
  for (const row of buckets) {
    const r = Number(row.rating);
    if (r >= 1 && r <= 5) ratingBuckets[r - 1] = Number(row.cnt);
  }

  const targetMap = { product: 0, store: 0, delivery: 0 };
  for (const row of byTarget) {
    if (row.target_type in targetMap) {
      targetMap[row.target_type as keyof typeof targetMap] = Number(row.cnt);
    }
  }

  const s = summary[0];
  return {
    total: Number(s?.total ?? 0),
    published: Number(s?.published ?? 0),
    flagged: Number(s?.flagged ?? 0),
    avgRating: Math.round(Number(s?.avg_rating ?? 0) * 10) / 10,
    last7Days: Number(s?.last7 ?? 0),
    byTarget: targetMap,
    ratingBuckets,
  };
}
