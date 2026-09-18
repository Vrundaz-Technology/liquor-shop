"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Flag, LayoutGrid, MessageSquareReply, Star, Table2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import { Modal } from "@/components/ui/Modal";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { PanelLoading } from "@/components/dashboard/DashboardLoading";
import { hasPermission } from "@/lib/auth/permissions";
import { accessibleLocations } from "@/lib/auth/location-access";
import { getAllLocations, getLocationById } from "@/data/locations";
import { getProductById } from "@/data/products";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { useUserStore } from "@/store/user";
import { cn } from "@/lib/utils";
import type { PlatformReview, ReviewStatus, ReviewTargetType } from "@/types";
import {
  MobileSortBar,
  SortableTh,
  compareValues,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";

const REVIEWS_VIEW_KEY = "sams.dashboard.view.reviews";

type Trends = {
  total: number;
  published: number;
  flagged: number;
  avgRating: number;
  last7Days: number;
  byTarget: { product: number; store: number; delivery: number };
  ratingBuckets: number[];
};

type SortKey = "rating" | "review" | "customer" | "type" | "status" | "store" | "date" | "order";

const TARGET_LABELS: Record<ReviewTargetType, string> = {
  product: "Product",
  store: "Store",
  delivery: "Delivery",
};

const STATUS_LABELS: Record<ReviewStatus, string> = {
  published: "Published",
  flagged: "Flagged",
  hidden: "Hidden",
};

function formatReviewDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "MMM d, yyyy");
}

function statusTone(status: ReviewStatus) {
  if (status === "flagged") return "border-red-400/40 bg-red-400/10 text-red-200";
  if (status === "hidden") return "border-white/15 bg-white/5 text-muted";
  return "border-(--gold)/35 bg-(--gold)/10 text-gold";
}

function StatusPill({ status }: { status: ReviewStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        statusTone(status),
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function TypePill({ type }: { type: ReviewTargetType }) {
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
      {TARGET_LABELS[type]}
    </span>
  );
}

function StarRating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={13}
          className={index < value ? "fill-gold text-gold" : "text-white/20"}
          aria-hidden
        />
      ))}
      <span className="ml-1.5 text-sm tabular-nums text-cream">{value}</span>
    </span>
  );
}

function reviewTargetName(review: PlatformReview) {
  if (review.targetType !== "product") return "";
  return getProductById(review.productId ?? "")?.name ?? "";
}

export function ReviewsPanel() {
  const actor = useUserStore((s) => s.profile);
  const stores = accessibleLocations(actor, getAllLocations());
  const canModerate = hasPermission(actor, "reviews.moderate");
  const canRespond = hasPermission(actor, "reviews.respond");

  const [targetType, setTargetType] = useState<ReviewTargetType | "all">("all");
  const [status, setStatus] = useState<ReviewStatus | "all">("all");
  const [locationId, setLocationId] = useState("all");
  const [q, setQ] = useState("");
  const [reviews, setReviews] = useState<PlatformReview[]>([]);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = usePersistedViewMode(REVIEWS_VIEW_KEY, "cards");
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("date", "desc", ["date", "rating"]);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ staff: "1" });
      if (targetType !== "all") params.set("targetType", targetType);
      if (status !== "all") params.set("status", status);
      if (locationId !== "all") params.set("locationId", locationId);
      if (q.trim()) params.set("q", q.trim());
      const [listRes, trendRes] = await Promise.all([
        fetch(`/api/reviews?${params}`),
        fetch(
          `/api/reviews?trends=1${locationId !== "all" ? `&locationId=${locationId}` : ""}`,
        ),
      ]);
      const listData = (await listRes.json()) as { reviews?: PlatformReview[]; error?: string };
      const trendData = (await trendRes.json()) as { trends?: Trends; error?: string };
      if (!listRes.ok) throw new Error(listData.error ?? "Failed to load reviews.");
      setReviews(listData.reviews ?? []);
      if (trendRes.ok) setTrends(trendData.trends ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reviews.");
    } finally {
      setBusy(false);
    }
  }, [targetType, status, locationId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const clearFilters = () => {
    setTargetType("all");
    setStatus("all");
    setLocationId("all");
    setQ("");
    setPage(1);
  };

  const moderate = async (
    reviewId: string,
    patch: { status?: ReviewStatus; ownerReply?: string | null },
  ) => {
    setMsg("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moderate", reviewId, ...patch }),
    });
    const data = (await res.json()) as { error?: string; review?: PlatformReview };
    if (!res.ok) {
      setMsg(data.error ?? "Update failed.");
      return false;
    }
    setMsg("Review updated.");
    if (data.review) {
      setReviews((prev) => prev.map((row) => (row.id === reviewId ? data.review! : row)));
    }
    void load();
    return true;
  };

  const saveReply = async (reviewId: string) => {
    const saved = await moderate(reviewId, {
      ownerReply: (replyDrafts[reviewId] ?? "").trim() || null,
    });
    if (saved) setReplyingId(null);
  };

  const flaggedCount = useMemo(
    () => reviews.filter((review) => review.status === "flagged").length,
    [reviews],
  );

  const sortedReviews = useMemo(() => {
    return [...reviews].sort((a, b) => {
      const storeA = a.locationId ? getLocationById(a.locationId)?.shortName ?? "" : "";
      const storeB = b.locationId ? getLocationById(b.locationId)?.shortName ?? "" : "";
      if (sortKey === "rating") return compareValues(a.rating, b.rating, sortDir);
      if (sortKey === "review") return compareValues(a.title || a.body, b.title || b.body, sortDir);
      if (sortKey === "customer") return compareValues(a.userName, b.userName, sortDir);
      if (sortKey === "type") return compareValues(a.targetType, b.targetType, sortDir);
      if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
      if (sortKey === "store") return compareValues(storeA, storeB, sortDir);
      if (sortKey === "order") return compareValues(a.orderId ?? "", b.orderId ?? "", sortDir);
      return compareValues(a.date, b.date, sortDir);
    });
  }, [reviews, sortDir, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [targetType, status, locationId, q, sortKey, sortDir, pageSize]);

  const total = sortedReviews.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const pageReviews = useMemo(
    () => sortedReviews.slice((safePage - 1) * pageSize, (safePage - 1) * pageSize + pageSize),
    [pageSize, safePage, sortedReviews],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const replying = sortedReviews.find((review) => review.id === replyingId) ?? null;

  const renderActions = (review: PlatformReview, compact = false) => (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "justify-end")}>
      {canModerate && review.status !== "published" ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void moderate(review.id, { status: "published" })}
        >
          Publish
        </Button>
      ) : null}
      {canModerate && review.status !== "hidden" ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void moderate(review.id, { status: "hidden" })}
        >
          Hide
        </Button>
      ) : null}
      {canRespond ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setReplyingId(review.id);
            setReplyDrafts((prev) => ({
              ...prev,
              [review.id]: prev[review.id] ?? review.ownerReply ?? "",
            }));
          }}
        >
          <MessageSquareReply size={14} aria-hidden />
          {review.ownerReply ? "Edit reply" : "Reply"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <ConnectionNotice feature="manage product, store, and delivery reviews" />
      {trends ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            { label: "Avg rating", value: trends.avgRating ? `${trends.avgRating}` : "—" },
            { label: "Published", value: String(trends.published) },
            { label: "Flagged", value: String(trends.flagged) },
            { label: "Last 7 days", value: String(trends.last7Days) },
            { label: "Total", value: String(trends.total) },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-sm border border-white/10 bg-black/20 px-3 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{card.label}</p>
              <p className="mt-1 text-xl tabular-nums text-cream">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {trends ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-sm border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gold">By target</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li className="flex justify-between">
                <span>Product</span>
                <span className="tabular-nums text-cream">{trends.byTarget.product}</span>
              </li>
              <li className="flex justify-between">
                <span>Store</span>
                <span className="tabular-nums text-cream">{trends.byTarget.store}</span>
              </li>
              <li className="flex justify-between">
                <span>Delivery</span>
                <span className="tabular-nums text-cream">{trends.byTarget.delivery}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-sm border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gold">Rating mix</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {trends.ratingBuckets.map((count, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="w-10 text-cream">{idx + 1}★</span>
                  <div className="h-2 flex-1 rounded-full bg-white/5">
                    <div
                      className="h-2 rounded-full bg-(--gold)/60"
                      style={{
                        width: `${trends.published ? Math.max(4, (count / trends.published) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-cream">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Type"
          value={targetType}
          onChange={(value) => setTargetType(value as ReviewTargetType | "all")}
          options={[
            { value: "all", label: "All types" },
            { value: "product", label: "Product" },
            { value: "store", label: "Store" },
            { value: "delivery", label: "Delivery" },
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as ReviewStatus | "all")}
          options={[
            { value: "all", label: "All statuses" },
            { value: "published", label: "Published" },
            { value: "flagged", label: `Flagged${flaggedCount ? ` (${flaggedCount})` : ""}` },
            { value: "hidden", label: "Hidden" },
          ]}
        />
        <Select
          label="Store"
          value={locationId}
          onChange={setLocationId}
          options={[
            { value: "all", label: "All stores" },
            ...stores.map((store) => ({ value: store.id, label: store.shortName })),
          ]}
        />
        <label className="block text-xs text-muted">
          Search
          <SearchInput
            className="mt-1"
            value={q}
            onChange={setQ}
            placeholder="Name, title, body…"
            aria-label="Search reviews"
          />
        </label>
      </div>

      <ActiveFiltersBar
        className="mt-3"
        resultCount={reviews.length}
        resultNoun="review"
        chips={[
          ...(targetType !== "all"
            ? [
                {
                  id: "target",
                  label: TARGET_LABELS[targetType],
                  onRemove: () => {
                    setTargetType("all");
                    setPage(1);
                  },
                },
              ]
            : []),
          ...(status !== "all"
            ? [
                {
                  id: "status",
                  label: STATUS_LABELS[status],
                  onRemove: () => {
                    setStatus("all");
                    setPage(1);
                  },
                },
              ]
            : []),
          ...(locationId !== "all"
            ? [
                {
                  id: "location",
                  label: stores.find((store) => store.id === locationId)?.shortName ?? locationId,
                  onRemove: () => {
                    setLocationId("all");
                    setPage(1);
                  },
                },
              ]
            : []),
          ...(q.trim()
            ? [
                {
                  id: "q",
                  label: `“${q.trim()}”`,
                  onRemove: () => {
                    setQ("");
                    setPage(1);
                  },
                },
              ]
            : []),
        ]}
        onClearAll={clearFilters}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          {busy && !reviews.length
            ? "Loading…"
            : total === 0
              ? "No reviews"
              : `Showing ${from}–${to} of ${total} review${total === 1 ? "" : "s"}`}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <PageSizeSelect value={pageSize} onChange={setPageSize} options={[5, 10, 20, 50]} />
          <div
            className="inline-flex shrink-0 rounded-sm border border-white/10 p-0.5"
            role="group"
            aria-label="Reviews view"
          >
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition",
                viewMode === "cards" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
              )}
              aria-pressed={viewMode === "cards"}
            >
              <LayoutGrid size={14} aria-hidden />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition",
                viewMode === "table" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
              )}
              aria-pressed={viewMode === "table"}
            >
              <Table2 size={14} aria-hidden />
              Table
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {msg ? <p className="text-sm text-gold">{msg}</p> : null}

      {busy && !reviews.length ? (
        <PanelLoading label="Loading reviews…" />
      ) : !reviews.length ? (
        <div className="rounded-sm border border-dashed border-white/10 px-3 py-10 text-center">
          <Star className="mx-auto mb-3 text-gold/70" size={28} />
          <p className="text-sm text-muted">No reviews match these filters.</p>
        </div>
      ) : (
        <>
          <MobileSortBar
            className={viewMode === "table" ? "xl:hidden" : undefined}
            columns={[
              { key: "date", label: "Date" },
              { key: "rating", label: "Rating" },
              { key: "customer", label: "Customer" },
              { key: "type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "store", label: "Store" },
              { key: "review", label: "Review" },
              { key: "order", label: "Order" },
            ]}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />

          {viewMode === "table" ? (
            <div className={`hidden max-w-full xl:block ${tableWrapClass}`}>
              <table className="w-max min-w-full text-left text-sm">
                <thead>
                  <tr className={tableHeadRowClass}>
                    <SortableTh label="Rating" column="rating" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Review" column="review" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Customer" column="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Type" column="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Store" column="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Date" column="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Order" column="order" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageReviews.map((review) => {
                    const store = review.locationId ? getLocationById(review.locationId) : null;
                    return (
                      <tr key={review.id} className={tableRowClass}>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          <StarRating value={review.rating} />
                        </td>
                        <td className="min-w-[16rem] max-w-[22rem] px-4 py-3 align-top">
                          <p className="text-cream">{review.title || "Untitled review"}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                            {review.body}
                          </p>
                          {review.ownerReply ? (
                            <p className="mt-1.5 line-clamp-1 text-[11px] text-gold/80">
                              Reply: {review.ownerReply}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-cream">{review.userName}</td>
                        <td className="px-4 py-3 align-top">
                          <TypePill type={review.targetType} />
                          {review.targetType === "product" && reviewTargetName(review) ? (
                            <p className="mt-1 text-[11px] text-muted">{reviewTargetName(review)}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusPill status={review.status} />
                          {review.status === "flagged" ? (
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-300">
                              <Flag size={11} /> Needs review
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted">
                          {store?.shortName ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted">
                          {formatReviewDate(review.date)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-[11px] text-white/55">
                          {review.orderId ?? "—"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {renderActions(review, true)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <ol className={cn("space-y-3", viewMode === "table" && "xl:hidden")}>
            {pageReviews.map((review) => {
              const store = review.locationId ? getLocationById(review.locationId) : null;
              const product = review.productId ? getProductById(review.productId) : null;
              return (
                <li
                  key={review.id}
                  className="glass min-w-0 border border-white/5 p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StarRating value={review.rating} />
                        <StatusPill status={review.status} />
                        <TypePill type={review.targetType} />
                        {review.verified ? (
                          <span className="text-[10px] uppercase tracking-[0.14em] text-gold/80">
                            Verified
                          </span>
                        ) : null}
                        {review.status === "flagged" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-red-300">
                            <Flag size={12} /> Needs review
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 text-base text-cream">
                        {review.title || "Untitled review"}
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span className="text-cream/85">{review.userName}</span>
                        <span aria-hidden>·</span>
                        <span>{formatReviewDate(review.date)}</span>
                        {store ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{store.shortName}</span>
                          </>
                        ) : null}
                        {product ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{product.name}</span>
                          </>
                        ) : null}
                        {review.orderId ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="font-mono text-[11px] text-white/55">{review.orderId}</span>
                          </>
                        ) : null}
                        {review.reportCount ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{review.reportCount} report{review.reportCount === 1 ? "" : "s"}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {renderActions(review)}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-cream/85">{review.body}</p>
                  {review.ownerReply ? (
                    <div className="mt-4 border-l-2 border-(--gold)/40 pl-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-gold">Owner reply</p>
                      <p className="mt-1 text-sm leading-relaxed text-cream">{review.ownerReply}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onChange={setPage}
            className="mt-8"
          />
        </>
      )}

      <Modal
        open={Boolean(replying)}
        title={replying?.ownerReply ? "Edit owner reply" : "Reply to review"}
        subtitle={
          replying
            ? `${replying.userName} · ${replying.title || "Untitled review"}`
            : undefined
        }
        onClose={() => setReplyingId(null)}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setReplyingId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (replying) void saveReply(replying.id);
              }}
            >
              <MessageSquareReply size={14} aria-hidden />
              Save reply
            </Button>
          </div>
        }
      >
        {replying ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted">{replying.body}</p>
            <Input
              value={replyDrafts[replying.id] ?? replying.ownerReply ?? ""}
              onChange={(event) =>
                setReplyDrafts((prev) => ({ ...prev, [replying.id]: event.target.value }))
              }
              placeholder="Owner reply…"
              aria-label="Owner reply"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
