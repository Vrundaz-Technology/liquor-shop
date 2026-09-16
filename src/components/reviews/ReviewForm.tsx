"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useUserStore } from "@/store/user";
import type { PlatformReview, ReviewTargetType } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  targetType: ReviewTargetType;
  productId?: string;
  locationId?: string;
  orderId?: string;
  onCreated?: (review: PlatformReview) => void;
  className?: string;
};

export function ReviewForm({
  targetType,
  productId,
  locationId,
  orderId,
  onCreated,
  className,
}: Props) {
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!isLoggedIn) {
    return (
      <p className={cn("text-sm text-muted", className)}>
        <Link href="/login" className="text-gold hover:underline">
          Sign in
        </Link>{" "}
        to leave a review.
      </p>
    );
  }

  if (done) {
    return (
      <p className={cn("text-sm text-gold", className)}>Thanks — your review was submitted.</p>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          productId,
          locationId,
          orderId,
          rating,
          title,
          body,
        }),
      });
      const data = (await res.json()) as { error?: string; review?: PlatformReview };
      if (!res.ok) {
        setError(data.error ?? "Could not submit review.");
        return;
      }
      setDone(true);
      if (data.review) onCreated?.(data.review);
    } catch {
      setError("Could not submit review.");
    } finally {
      setBusy(false);
    }
  };

  const label =
    targetType === "product"
      ? "Write a product review"
      : targetType === "store"
        ? "Rate this store"
        : "Rate your delivery";

  return (
    <form onSubmit={(e) => void onSubmit(e)} className={cn("space-y-3", className)}>
      <p className="text-sm font-medium text-cream">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={cn(
              "h-9 w-9 rounded-sm border text-sm",
              rating >= n
                ? "border-(--gold)/50 bg-(--gold)/15 text-gold"
                : "border-white/10 text-muted",
            )}
            aria-label={`${n} stars`}
          >
            ★
          </button>
        ))}
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Headline"
        required
        minLength={3}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share details of your experience…"
        required
        minLength={8}
        rows={4}
        className="w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-cream outline-none focus:border-(--gold)/40"
      />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <Button type="submit" size="sm" loading={busy}>
        Submit review
      </Button>
    </form>
  );
}

export function ReviewList({
  reviews,
  allowReport = true,
}: {
  reviews: PlatformReview[];
  allowReport?: boolean;
}) {
  const [msg, setMsg] = useState("");

  const report = async (reviewId: string) => {
    const reason = window.prompt("Why are you reporting this review?");
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "report", reviewId, reason: reason.trim() }),
    });
    const data = (await res.json()) as { error?: string };
    setMsg(res.ok ? "Thanks — we flagged this for review." : data.error ?? "Report failed.");
  };

  if (!reviews.length) return <p className="text-sm text-muted">No reviews yet.</p>;

  return (
    <div className="space-y-4">
      {msg ? <p className="text-xs text-gold">{msg}</p> : null}
      {reviews.map((r) => (
        <article key={r.id} className="border border-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-cream">{r.userName}</span>
              {r.verified ? (
                <span className="text-[10px] uppercase tracking-[0.12em] text-gold">
                  Verified
                </span>
              ) : null}
            </div>
            <span className="text-xs text-muted">{r.date}</span>
          </div>
          <p className="mt-1 text-sm text-gold">
            {"★".repeat(r.rating)}
            {"☆".repeat(Math.max(0, 5 - r.rating))} {r.title}
          </p>
          <p className="mt-2 text-sm text-muted">{r.body}</p>
          {r.ownerReply ? (
            <div className="mt-3 border-l-2 border-(--gold)/40 pl-3 text-sm">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gold">Store reply</p>
              <p className="mt-1 text-cream">{r.ownerReply}</p>
            </div>
          ) : null}
          {allowReport ? (
            <button
              type="button"
              className="mt-3 text-[10px] uppercase tracking-[0.12em] text-muted hover:text-red-300"
              onClick={() => void report(r.id)}
            >
              Report
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
