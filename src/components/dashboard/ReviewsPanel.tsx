"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, MessageSquareReply, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { hasPermission } from "@/lib/auth/permissions";
import { accessibleLocations } from "@/lib/auth/location-access";
import { getAllLocations, getLocationById } from "@/data/locations";
import { getProductById } from "@/data/products";
import { useUserStore } from "@/store/user";
import { cn } from "@/lib/utils";
import type { PlatformReview, ReviewStatus, ReviewTargetType } from "@/types";

type Trends = {
  total: number;
  published: number;
  flagged: number;
  avgRating: number;
  last7Days: number;
  byTarget: { product: number; store: number; delivery: number };
  ratingBuckets: number[];
};

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
      return;
    }
    setMsg("Review updated.");
    if (data.review) {
      setReviews((prev) => prev.map((r) => (r.id === reviewId ? data.review! : r)));
    }
    void load();
  };

  const flaggedCount = useMemo(
    () => reviews.filter((r) => r.status === "flagged").length,
    [reviews],
  );

  return (
    <div className="space-y-6">
      <ConnectionNotice />
      {trends ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Avg rating", value: trends.avgRating ? `${trends.avgRating}★` : "—" },
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
              <p className="mt-1 text-xl text-cream tabular-nums">{card.value}</p>
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
                <span className="text-cream">{trends.byTarget.product}</span>
              </li>
              <li className="flex justify-between">
                <span>Store</span>
                <span className="text-cream">{trends.byTarget.store}</span>
              </li>
              <li className="flex justify-between">
                <span>Delivery</span>
                <span className="text-cream">{trends.byTarget.delivery}</span>
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
          onChange={(v) => setTargetType(v as ReviewTargetType | "all")}
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
          onChange={(v) => setStatus(v as ReviewStatus | "all")}
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
            ...stores.map((s) => ({ value: s.id, label: s.shortName })),
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
                  label:
                    targetType === "product"
                      ? "Product"
                      : targetType === "store"
                        ? "Store"
                        : "Delivery",
                  onRemove: () => setTargetType("all"),
                },
              ]
            : []),
          ...(status !== "all"
            ? [
                {
                  id: "status",
                  label:
                    status === "published"
                      ? "Published"
                      : status === "flagged"
                        ? "Flagged"
                        : "Hidden",
                  onRemove: () => setStatus("all"),
                },
              ]
            : []),
          ...(locationId !== "all"
            ? [
                {
                  id: "location",
                  label: stores.find((s) => s.id === locationId)?.shortName ?? locationId,
                  onRemove: () => setLocationId("all"),
                },
              ]
            : []),
          ...(q.trim()
            ? [
                {
                  id: "q",
                  label: `“${q.trim()}”`,
                  onRemove: () => setQ(""),
                },
              ]
            : []),
        ]}
        onClearAll={clearFilters}
      />

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {msg ? <p className="text-sm text-gold">{msg}</p> : null}
      {busy && !reviews.length ? <p className="text-sm text-muted">Loading reviews…</p> : null}

      <ul className="space-y-3">
        {reviews.map((review) => {
          const product = review.productId ? getProductById(review.productId) : null;
          const store = review.locationId ? getLocationById(review.locationId) : null;
          return (
            <li
              key={review.id}
              className="rounded-sm border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-cream">
                    <Star size={14} className="text-gold" />
                    {review.rating}★ · {review.title}
                    <span
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                        review.status === "flagged"
                          ? "border-red-400/40 text-red-300"
                          : review.status === "hidden"
                            ? "border-white/20 text-muted"
                            : "border-(--gold)/35 text-gold",
                      )}
                    >
                      {review.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
                      {review.targetType}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {review.userName} · {review.date}
                    {product ? ` · ${product.name}` : ""}
                    {store ? ` · ${store.shortName}` : ""}
                    {review.orderId ? ` · ${review.orderId}` : ""}
                    {review.reportCount ? ` · ${review.reportCount} report(s)` : ""}
                  </p>
                  <p className="mt-3 text-sm text-muted">{review.body}</p>
                  {review.ownerReply ? (
                    <p className="mt-3 border-l-2 border-(--gold)/40 pl-3 text-sm text-cream">
                      Reply: {review.ownerReply}
                    </p>
                  ) : null}
                </div>
                {canModerate ? (
                  <div className="flex flex-wrap gap-2">
                    {review.status !== "published" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void moderate(review.id, { status: "published" })}
                      >
                        Publish
                      </Button>
                    ) : null}
                    {review.status !== "hidden" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void moderate(review.id, { status: "hidden" })}
                      >
                        Hide
                      </Button>
                    ) : null}
                    {review.status === "flagged" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-300">
                        <Flag size={12} /> Needs review
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {canRespond ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={replyDrafts[review.id] ?? review.ownerReply ?? ""}
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))
                    }
                    placeholder="Owner reply…"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void moderate(review.id, {
                        ownerReply: (replyDrafts[review.id] ?? "").trim() || null,
                      })
                    }
                  >
                    <MessageSquareReply size={14} />
                    Save reply
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!busy && !reviews.length ? (
        <p className="text-sm text-muted">No reviews match these filters.</p>
      ) : null}
    </div>
  );
}
