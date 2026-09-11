"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Cake,
  Gift,
  History,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { cn, nativeSelectClass } from "@/lib/utils";
import {
  parseFiniteNumber,
  pointsPerDollarSchema,
  redeemRateSchema,
  roundMoney,
  sanitizeMoneyInput,
} from "@/lib/validation/money";
import {
  compareValues,
  SortableTh,
  useTableSort,
} from "@/components/ui/SortableTh";

function loyaltyReasonLabel(reason: string) {
  switch (reason) {
    case "earn":
      return "Order earn";
    case "redeem":
      return "Redeemed";
    case "birthday":
      return "Birthday bonus";
    case "referral":
      return "Referral reward";
    case "referral_signup":
      return "Referral signup";
    case "adjustment":
      return "Adjustment";
    default:
      return reason.replace(/_/g, " ");
  }
}

const fieldClass = cn(nativeSelectClass, "mt-1.5 w-full");
const fieldErrorClass = cn(
  nativeSelectClass,
  "mt-1.5 w-full border-(--danger)/55 bg-(--danger)/5 focus:border-(--danger)/70",
);
const labelClass = "block text-[10px] uppercase tracking-[0.16em] text-muted";
const hintClass = "mt-1.5 block normal-case tracking-normal text-[11px] leading-relaxed text-white/40";
const sectionTitleClass = "font-display text-lg text-cream";

const MAX_TIERS = 12;
const MAX_REWARDS = 24;

const DEFAULT_TIERS = [
  { name: "Member", minPoints: 0 },
  { name: "Connoisseur", minPoints: 500 },
  { name: "Collector", minPoints: 1500 },
  { name: "VIP", minPoints: 3000 },
] as const;

const DEFAULT_REWARDS = [{ points: 500, value: 10, label: "$10 off" }] as const;

type TierDraft = { name: string; minPoints: string };
type RewardDraft = { points: string; value: string; label: string };
type TierPayload = { name: string; minPoints: number };
type RewardPayload = { points: number; value: number; label: string };

function sanitizeIntInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

function toTierDraft(t: { name: string; minPoints: number }): TierDraft {
  return { name: t.name, minPoints: String(t.minPoints) };
}

function toRewardDraft(r: { points: number; value: number; label: string }): RewardDraft {
  return { points: String(r.points), value: String(r.value), label: r.label };
}

function parseTiers(raw: unknown): TierDraft[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_TIERS.map(toTierDraft);
  }
  const next: TierDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    const min =
      typeof row.minPoints === "number" && Number.isFinite(row.minPoints)
        ? Math.max(0, Math.trunc(row.minPoints))
        : typeof row.minPoints === "string"
          ? sanitizeIntInput(row.minPoints)
          : "";
    next.push({
      name,
      minPoints: typeof min === "number" ? String(min) : min,
    });
    if (next.length >= MAX_TIERS) break;
  }
  return next.length > 0 ? next : DEFAULT_TIERS.map(toTierDraft);
}

function parseRewards(raw: unknown): RewardDraft[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_REWARDS.map(toRewardDraft);
  }
  const next: RewardDraft[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label : "";
    const points =
      typeof row.points === "number" && Number.isFinite(row.points)
        ? String(Math.max(0, Math.trunc(row.points)))
        : typeof row.points === "string"
          ? sanitizeIntInput(row.points)
          : "";
    const value =
      typeof row.value === "number" && Number.isFinite(row.value)
        ? String(roundMoney(row.value, 2))
        : typeof row.value === "string"
          ? sanitizeMoneyInput(row.value, 2)
          : "";
    next.push({ points, value, label });
    if (next.length >= MAX_REWARDS) break;
  }
  return next.length > 0 ? next : DEFAULT_REWARDS.map(toRewardDraft);
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="mt-1.5 flex items-start gap-1.5 normal-case tracking-normal text-xs text-(--danger)">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </span>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className={sectionTitleClass}>{title}</h4>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function LoyaltyPanel() {
  const qc = useQueryClient();
  const { data: program, isLoading } = useQuery({
    queryKey: ["loyalty-program"],
    queryFn: async () => {
      const json = await apiFetch<{
        ok: true;
        program: {
          name: string;
          pointsPerDollar: number;
          redeemRate: number;
          birthdayPoints: number;
          referralPoints: number;
          referralSignupPoints: number;
          active: boolean;
          tiers: unknown;
          rewards: unknown;
        } | null;
      }>("/api/loyalty");
      return json.program;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: async () => {
      const json = await apiFetch<{
        ok: true;
        entries: {
          id: string;
          userName: string;
          userEmail: string;
          delta: number;
          balanceAfter: number;
          reason: string;
          orderId: string | null;
          createdAt: string;
        }[];
        total: number;
      }>("/api/loyalty?history=1&limit=40");
      return json;
    },
  });

  type LedgerSortKey = "when" | "member" | "reason" | "delta" | "balance";
  const { sortKey: ledgerSortKey, sortDir: ledgerSortDir, toggleSort: toggleLedgerSort } =
    useTableSort<LedgerSortKey>("when", "desc", ["when", "delta", "balance"]);

  const sortedLedgerEntries = useMemo(() => {
    const entries = historyQuery.data?.entries ?? [];
    return [...entries].sort((a, b) => {
      switch (ledgerSortKey) {
        case "member":
          return compareValues(a.userName, b.userName, ledgerSortDir);
        case "reason":
          return compareValues(
            loyaltyReasonLabel(a.reason),
            loyaltyReasonLabel(b.reason),
            ledgerSortDir,
          );
        case "delta":
          return compareValues(a.delta, b.delta, ledgerSortDir);
        case "balance":
          return compareValues(a.balanceAfter, b.balanceAfter, ledgerSortDir);
        case "when":
        default:
          return compareValues(a.createdAt, b.createdAt, ledgerSortDir);
      }
    });
  }, [historyQuery.data?.entries, ledgerSortDir, ledgerSortKey]);

  const [name, setName] = useState("");
  const [pointsPerDollar, setPointsPerDollar] = useState("1");
  const [redeemRate, setRedeemRate] = useState("0.02");
  const [birthdayPoints, setBirthdayPoints] = useState("100");
  const [referralPoints, setReferralPoints] = useState("100");
  const [referralSignupPoints, setReferralSignupPoints] = useState("50");
  const [tiers, setTiers] = useState<TierDraft[]>(() => DEFAULT_TIERS.map(toTierDraft));
  const [rewards, setRewards] = useState<RewardDraft[]>(() =>
    DEFAULT_REWARDS.map(toRewardDraft),
  );
  const [hydrated, setHydrated] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [section, setSection] = useState<"program" | "activity">("program");

  useEffect(() => {
    if (hydrated || !program) return;
    setName(program.name);
    setPointsPerDollar(String(program.pointsPerDollar));
    setRedeemRate(String(program.redeemRate));
    setBirthdayPoints(String(program.birthdayPoints ?? 100));
    setReferralPoints(String(program.referralPoints ?? 100));
    setReferralSignupPoints(String(program.referralSignupPoints ?? 50));
    setTiers(parseTiers(program.tiers));
    setRewards(parseRewards(program.rewards));
    setHydrated(true);
  }, [program, hydrated]);

  // If query finished with no program, still unlock the form with defaults.
  useEffect(() => {
    if (hydrated || isLoading || program) return;
    setHydrated(true);
  }, [hydrated, isLoading, program]);

  const { errors, tierPayload, rewardPayload } = useMemo(() => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Program name is required.";
    else if (name.trim().length > 120) next.name = "Name must be 120 characters or less.";

    const pts = parseFiniteNumber(pointsPerDollar);
    if (pts == null) next.pointsPerDollar = "Enter a valid number.";
    else {
      const check = pointsPerDollarSchema.safeParse(pts);
      if (!check.success) {
        next.pointsPerDollar = check.error.issues[0]?.message ?? "Invalid earn rate.";
      }
    }

    const rate = parseFiniteNumber(redeemRate);
    if (rate == null) next.redeemRate = "Enter a valid number.";
    else {
      const check = redeemRateSchema.safeParse(rate);
      if (!check.success) {
        next.redeemRate = check.error.issues[0]?.message ?? "Invalid redeem rate.";
      }
    }

    const bday = parseFiniteNumber(birthdayPoints);
    if (bday == null || !Number.isInteger(bday)) next.birthdayPoints = "Enter a whole number.";
    else if (bday < 0 || bday > 100_000) next.birthdayPoints = "Use 0–100,000.";

    const refPts = parseFiniteNumber(referralPoints);
    if (refPts == null || !Number.isInteger(refPts)) next.referralPoints = "Enter a whole number.";
    else if (refPts < 0 || refPts > 100_000) next.referralPoints = "Use 0–100,000.";

    const refSignup = parseFiniteNumber(referralSignupPoints);
    if (refSignup == null || !Number.isInteger(refSignup)) {
      next.referralSignupPoints = "Enter a whole number.";
    } else if (refSignup < 0 || refSignup > 100_000) {
      next.referralSignupPoints = "Use 0–100,000.";
    }

    if (tiers.length < 1) next.tiers = "Add at least one tier.";
    else if (tiers.length > MAX_TIERS) next.tiers = `At most ${MAX_TIERS} tiers.`;

    const builtTiers: TierPayload[] = [];
    tiers.forEach((tier, idx) => {
      const key = `tier.${idx}`;
      const trimmed = tier.name.trim();
      if (!trimmed) next[`${key}.name`] = "Tier name is required.";
      else if (trimmed.length > 40) next[`${key}.name`] = "Name must be 40 characters or less.";

      const minPts = parseFiniteNumber(tier.minPoints);
      if (minPts == null || !Number.isInteger(minPts)) {
        next[`${key}.minPoints`] = "Enter a whole number.";
      } else if (minPts < 0) {
        next[`${key}.minPoints`] = "Cannot be negative.";
      } else if (minPts > 1_000_000) {
        next[`${key}.minPoints`] = "Max 1,000,000.";
      } else if (trimmed && trimmed.length <= 40) {
        builtTiers.push({ name: trimmed, minPoints: minPts });
      }
    });

    if (rewards.length > MAX_REWARDS) next.rewards = `At most ${MAX_REWARDS} rewards.`;

    const builtRewards: RewardPayload[] = [];
    rewards.forEach((reward, idx) => {
      const key = `reward.${idx}`;
      const trimmed = reward.label.trim();
      if (!trimmed) next[`${key}.label`] = "Label is required.";
      else if (trimmed.length > 80) next[`${key}.label`] = "Label must be 80 characters or less.";

      const points = parseFiniteNumber(reward.points);
      if (points == null || !Number.isInteger(points)) {
        next[`${key}.points`] = "Enter a whole number.";
      } else if (points < 1) {
        next[`${key}.points`] = "Must be at least 1.";
      } else if (points > 1_000_000) {
        next[`${key}.points`] = "Max 1,000,000.";
      }

      const value = parseFiniteNumber(reward.value);
      if (value == null) {
        next[`${key}.value`] = "Enter a valid amount.";
      } else if (value < 0) {
        next[`${key}.value`] = "Cannot be negative.";
      } else if (value > 10_000) {
        next[`${key}.value`] = "Max $10,000.";
      }

      if (
        points != null &&
        Number.isInteger(points) &&
        points >= 1 &&
        points <= 1_000_000 &&
        value != null &&
        value >= 0 &&
        value <= 10_000 &&
        trimmed &&
        trimmed.length <= 80
      ) {
        builtRewards.push({ points, value: roundMoney(value, 2), label: trimmed });
      }
    });

    return { errors: next, tierPayload: builtTiers, rewardPayload: builtRewards };
  }, [name, pointsPerDollar, redeemRate, birthdayPoints, referralPoints, referralSignupPoints, tiers, rewards]);

  const pointsNum = parseFiniteNumber(pointsPerDollar);
  const redeemNum = parseFiniteNumber(redeemRate);
  const birthdayNum = parseFiniteNumber(birthdayPoints);
  const referralNum = parseFiniteNumber(referralPoints);
  const referralSignupNum = parseFiniteNumber(referralSignupPoints);

  const dirty = Boolean(
    hydrated &&
      program &&
      (name.trim() !== program.name ||
        (pointsNum != null && pointsNum !== program.pointsPerDollar) ||
        (redeemNum != null && redeemNum !== program.redeemRate) ||
        (birthdayNum != null && birthdayNum !== (program.birthdayPoints ?? 100)) ||
        (referralNum != null && referralNum !== (program.referralPoints ?? 100)) ||
        (referralSignupNum != null &&
          referralSignupNum !== (program.referralSignupPoints ?? 50)) ||
        JSON.stringify(tiers) !== JSON.stringify(parseTiers(program.tiers)) ||
        JSON.stringify(rewards) !== JSON.stringify(parseRewards(program.rewards))),
  );

  const canSubmit = dirty && Object.keys(errors).length === 0;
  const earnPreview =
    pointsNum != null && Number.isFinite(pointsNum) ? `${pointsNum} pt / $1` : "—";
  const redeemPreview =
    redeemNum != null && Number.isFinite(redeemNum)
      ? `${(redeemNum * 100).toFixed(redeemNum * 100 % 1 === 0 ? 0 : 1)}¢ / pt`
      : "—";

  const save = useMutation({
    mutationFn: async () => {
      const pts = parseFiniteNumber(pointsPerDollar);
      const rate = parseFiniteNumber(redeemRate);
      const bday = parseFiniteNumber(birthdayPoints);
      const refPts = parseFiniteNumber(referralPoints);
      const refSignup = parseFiniteNumber(referralSignupPoints);
      if (pts == null || rate == null || bday == null || refPts == null || refSignup == null) {
        throw new Error("Invalid rates");
      }
      if (tierPayload.length < 1) throw new Error("Add at least one tier");
      if (Object.keys(errors).length) throw new Error("Fix validation errors");
      await apiFetch("/api/loyalty", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || program?.name,
          pointsPerDollar: roundMoney(pts, 4),
          redeemRate: roundMoney(rate, 4),
          birthdayPoints: Math.trunc(bday),
          referralPoints: Math.trunc(refPts),
          referralSignupPoints: Math.trunc(refSignup),
          tiers: tierPayload,
          rewards: rewardPayload,
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["loyalty-program"] });
      void qc.invalidateQueries({ queryKey: ["loyalty-history"] });
      setHydrated(false);
      setTouched({});
    },
  });

  const isSaving = save.isPending;
  const markTouched = (key: string) => setTouched((t) => ({ ...t, [key]: true }));
  const show = (key: string) => (touched[key] ? errors[key] : undefined);

  const touchAll = () => {
    const next: Record<string, boolean> = {
      name: true,
      pointsPerDollar: true,
      redeemRate: true,
      birthdayPoints: true,
      referralPoints: true,
      referralSignupPoints: true,
      tiers: true,
      rewards: true,
    };
    tiers.forEach((_, idx) => {
      next[`tier.${idx}.name`] = true;
      next[`tier.${idx}.minPoints`] = true;
    });
    rewards.forEach((_, idx) => {
      next[`reward.${idx}.points`] = true;
      next[`reward.${idx}.value`] = true;
      next[`reward.${idx}.label`] = true;
    });
    setTouched(next);
  };

  const onSave = () => {
    touchAll();
    if (!canSubmit) return;
    save.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-16 animate-pulse rounded-sm bg-white/[0.04]" />
        <div className="h-48 animate-pulse rounded-sm bg-white/[0.04]" />
        <div className="h-40 animate-pulse rounded-sm bg-white/[0.04]" />
      </div>
    );
  }

  const statusMessage = (() => {
    if (Object.keys(errors).length && dirty) return "Fix highlighted fields before saving.";
    if (!dirty) return "No unsaved changes.";
    if (isSaving) return "Saving…";
    return "You have unsaved changes.";
  })();

  return (
    <div className="min-w-0 w-full max-w-5xl">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Loyalty</p>
          <h3 className="mt-1 font-display text-xl text-cream sm:text-2xl">Program settings</h3>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Earn rates, bonuses, tiers, and rewards for this owner’s stores.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-cream">
            <span className="text-muted">Earn</span>
            <span className="text-gold">{earnPreview}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-cream">
            <span className="text-muted">Redeem</span>
            <span className="text-gold">{redeemPreview}</span>
          </span>
        </div>
      </div>

      <div
        className="-mx-1 mt-4 flex gap-1 overflow-x-auto border-b border-white/10 px-1"
        role="tablist"
        aria-label="Loyalty sections"
      >
        {(
          [
            { id: "program" as const, label: "Program", icon: Gift },
            { id: "activity" as const, label: "Activity", icon: History },
          ] as const
        ).map((tab) => {
          const active = section === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(tab.id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs uppercase tracking-[0.14em] transition-colors sm:px-4 sm:text-sm",
                active
                  ? "border-(--gold) text-cream"
                  : "border-transparent text-muted hover:text-cream",
              )}
            >
              <Icon size={14} className={active ? "text-gold" : undefined} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {section === "program" ? (
        <form
          className="mt-5 space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          {/* Program rates */}
          <section className="rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
            <SectionHeader
              title="Earn & redeem"
              description="Base rates for every purchase across your stores."
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
              <label className={labelClass}>
                Program name
                <input
                  className={show("name") ? fieldErrorClass : fieldClass}
                  value={name}
                  maxLength={120}
                  onBlur={() => markTouched("name")}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={Boolean(show("name"))}
                  placeholder="Store Loyalty"
                />
                <FieldError message={show("name")} />
              </label>
              <label className={labelClass}>
                Points per $1
                <input
                  inputMode="decimal"
                  className={show("pointsPerDollar") ? fieldErrorClass : fieldClass}
                  value={pointsPerDollar}
                  onBlur={() => markTouched("pointsPerDollar")}
                  onChange={(e) => setPointsPerDollar(sanitizeMoneyInput(e.target.value, 4))}
                  aria-invalid={Boolean(show("pointsPerDollar"))}
                />
                <FieldError message={show("pointsPerDollar")} />
                {!show("pointsPerDollar") ? (
                  <span className={hintClass}>e.g. 1 = 1 point per dollar</span>
                ) : null}
              </label>
              <label className={labelClass}>
                $ per point
                <input
                  inputMode="decimal"
                  className={show("redeemRate") ? fieldErrorClass : fieldClass}
                  value={redeemRate}
                  onBlur={() => markTouched("redeemRate")}
                  onChange={(e) => setRedeemRate(sanitizeMoneyInput(e.target.value, 4))}
                  aria-invalid={Boolean(show("redeemRate"))}
                />
                <FieldError message={show("redeemRate")} />
                {!show("redeemRate") ? (
                  <span className={hintClass}>e.g. 0.02 = 2¢ · 500 pts = $10</span>
                ) : null}
              </label>
            </div>
          </section>

          {/* Birthday & referral */}
          <section className="rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
            <SectionHeader
              title="Birthday & referrals"
              description="Bonus points for special moments. Set any value to 0 to turn that bonus off."
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2 text-gold">
                  <Cake size={15} aria-hidden />
                  <span className="text-[10px] uppercase tracking-[0.16em]">Birthday</span>
                </div>
                <label className={cn(labelClass, "mt-3")}>
                  Points awarded
                  <input
                    inputMode="numeric"
                    className={show("birthdayPoints") ? fieldErrorClass : fieldClass}
                    value={birthdayPoints}
                    onBlur={() => markTouched("birthdayPoints")}
                    onChange={(e) => setBirthdayPoints(sanitizeIntInput(e.target.value))}
                    aria-invalid={Boolean(show("birthdayPoints"))}
                  />
                  <FieldError message={show("birthdayPoints")} />
                </label>
                <p className={hintClass}>Once per year on their birthday.</p>
              </div>
              <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2 text-gold">
                  <Users size={15} aria-hidden />
                  <span className="text-[10px] uppercase tracking-[0.16em]">Referrer</span>
                </div>
                <label className={cn(labelClass, "mt-3")}>
                  Points for invitee’s friend
                  <input
                    inputMode="numeric"
                    className={show("referralPoints") ? fieldErrorClass : fieldClass}
                    value={referralPoints}
                    onBlur={() => markTouched("referralPoints")}
                    onChange={(e) => setReferralPoints(sanitizeIntInput(e.target.value))}
                    aria-invalid={Boolean(show("referralPoints"))}
                  />
                  <FieldError message={show("referralPoints")} />
                </label>
                <p className={hintClass}>When someone signs up with their code.</p>
              </div>
              <div className="rounded-sm border border-white/10 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2 text-gold">
                  <Gift size={15} aria-hidden />
                  <span className="text-[10px] uppercase tracking-[0.16em]">New member</span>
                </div>
                <label className={cn(labelClass, "mt-3")}>
                  Welcome points
                  <input
                    inputMode="numeric"
                    className={show("referralSignupPoints") ? fieldErrorClass : fieldClass}
                    value={referralSignupPoints}
                    onBlur={() => markTouched("referralSignupPoints")}
                    onChange={(e) => setReferralSignupPoints(sanitizeIntInput(e.target.value))}
                    aria-invalid={Boolean(show("referralSignupPoints"))}
                  />
                  <FieldError message={show("referralSignupPoints")} />
                </label>
                <p className={hintClass}>Bonus for the person who used a code.</p>
              </div>
            </div>
          </section>

          {/* Tiers */}
          <section className="rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
            <SectionHeader
              title="Membership tiers"
              description="Ascending minimum points unlock better status."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={tiers.length >= MAX_TIERS || isSaving}
                  onClick={() =>
                    setTiers((rows) => [
                      ...rows,
                      { name: "", minPoints: rows.length ? "" : "0" },
                    ])
                  }
                >
                  <Plus size={14} aria-hidden />
                  Add tier
                </Button>
              }
            />
            <FieldError message={show("tiers") ?? (touched.tiers ? errors.tiers : undefined)} />

            <div className="mt-4 overflow-hidden rounded-sm border border-white/10">
              <div className="hidden grid-cols-[minmax(0,1fr)_8rem_2.75rem] gap-3 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted sm:grid">
                <span>Tier name</span>
                <span>Min points</span>
                <span className="sr-only">Remove</span>
              </div>
              <ul className="divide-y divide-white/10">
                {tiers.map((tier, idx) => {
                  const nameKey = `tier.${idx}.name`;
                  const minKey = `tier.${idx}.minPoints`;
                  return (
                    <li
                      key={`tier-${idx}`}
                      className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_2.75rem] sm:items-start sm:gap-3"
                    >
                      <label className={cn(labelClass, "sm:contents")}>
                        <span className="sm:hidden">Name</span>
                        <div>
                          <input
                            className={cn(
                              show(nameKey) ? fieldErrorClass : fieldClass,
                              "sm:mt-0",
                            )}
                            value={tier.name}
                            maxLength={40}
                            placeholder={`Tier ${idx + 1}`}
                            onBlur={() => markTouched(nameKey)}
                            onChange={(e) =>
                              setTiers((rows) =>
                                rows.map((r, i) =>
                                  i === idx ? { ...r, name: e.target.value } : r,
                                ),
                              )
                            }
                            aria-invalid={Boolean(show(nameKey))}
                          />
                          <FieldError message={show(nameKey)} />
                        </div>
                      </label>
                      <label className={cn(labelClass, "sm:contents")}>
                        <span className="sm:hidden">Min points</span>
                        <div>
                          <input
                            inputMode="numeric"
                            className={cn(
                              show(minKey) ? fieldErrorClass : fieldClass,
                              "sm:mt-0",
                            )}
                            value={tier.minPoints}
                            onBlur={() => markTouched(minKey)}
                            onChange={(e) =>
                              setTiers((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? { ...r, minPoints: sanitizeIntInput(e.target.value) }
                                    : r,
                                ),
                              )
                            }
                            aria-invalid={Boolean(show(minKey))}
                          />
                          <FieldError message={show(minKey)} />
                        </div>
                      </label>
                      <div className="flex sm:justify-end sm:pt-1.5">
                        <button
                          type="button"
                          disabled={tiers.length <= 1 || isSaving}
                          onClick={() => setTiers((rows) => rows.filter((_, i) => i !== idx))}
                          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-white/10 text-xs text-muted transition hover:border-(--danger)/40 hover:text-(--danger) disabled:opacity-40 sm:w-9"
                          aria-label={`Remove ${tier.name || `tier ${idx + 1}`}`}
                        >
                          <Trash2 size={14} aria-hidden />
                          <span className="sm:hidden">Remove</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Rewards */}
          <section className="rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
            <SectionHeader
              title="Redeemable rewards"
              description="Exact packages (e.g. 500 pts = $10). Cart uses these when the member redeems that exact amount."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={rewards.length >= MAX_REWARDS || isSaving}
                  onClick={() =>
                    setRewards((rows) => [...rows, { points: "", value: "", label: "" }])
                  }
                >
                  <Plus size={14} aria-hidden />
                  Add reward
                </Button>
              }
            />
            <FieldError
              message={show("rewards") ?? (touched.rewards ? errors.rewards : undefined)}
            />

            {rewards.length === 0 ? (
              <div className="mt-4 rounded-sm border border-dashed border-white/15 px-4 py-8 text-center">
                <p className="text-sm text-muted">No rewards yet.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    setRewards((rows) => [
                      ...rows,
                      { points: "500", value: "10", label: "$10 off" },
                    ])
                  }
                >
                  <Plus size={14} aria-hidden />
                  Add first reward
                </Button>
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-sm border border-white/10">
                <div className="hidden grid-cols-[6.5rem_6.5rem_minmax(0,1fr)_2.75rem] gap-3 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted sm:grid">
                  <span>Points</span>
                  <span>Value ($)</span>
                  <span>Label</span>
                  <span className="sr-only">Remove</span>
                </div>
                <ul className="divide-y divide-white/10">
                  {rewards.map((reward, idx) => {
                    const pointsKey = `reward.${idx}.points`;
                    const valueKey = `reward.${idx}.value`;
                    const labelKey = `reward.${idx}.label`;
                    return (
                      <li
                        key={`reward-${idx}`}
                        className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[6.5rem_6.5rem_minmax(0,1fr)_2.75rem] sm:items-start sm:gap-3"
                      >
                        <label className={cn(labelClass, "sm:contents")}>
                          <span className="sm:hidden">Points</span>
                          <div>
                            <input
                              inputMode="numeric"
                              className={cn(
                                show(pointsKey) ? fieldErrorClass : fieldClass,
                                "sm:mt-0",
                              )}
                              value={reward.points}
                              onBlur={() => markTouched(pointsKey)}
                              onChange={(e) =>
                                setRewards((rows) =>
                                  rows.map((r, i) =>
                                    i === idx
                                      ? { ...r, points: sanitizeIntInput(e.target.value) }
                                      : r,
                                  ),
                                )
                              }
                              aria-invalid={Boolean(show(pointsKey))}
                            />
                            <FieldError message={show(pointsKey)} />
                          </div>
                        </label>
                        <label className={cn(labelClass, "sm:contents")}>
                          <span className="sm:hidden">Value ($)</span>
                          <div>
                            <input
                              inputMode="decimal"
                              className={cn(
                                show(valueKey) ? fieldErrorClass : fieldClass,
                                "sm:mt-0",
                              )}
                              value={reward.value}
                              onBlur={() => markTouched(valueKey)}
                              onChange={(e) =>
                                setRewards((rows) =>
                                  rows.map((r, i) =>
                                    i === idx
                                      ? { ...r, value: sanitizeMoneyInput(e.target.value, 2) }
                                      : r,
                                  ),
                                )
                              }
                              aria-invalid={Boolean(show(valueKey))}
                            />
                            <FieldError message={show(valueKey)} />
                          </div>
                        </label>
                        <label className={cn(labelClass, "sm:contents")}>
                          <span className="sm:hidden">Label</span>
                          <div>
                            <input
                              className={cn(
                                show(labelKey) ? fieldErrorClass : fieldClass,
                                "sm:mt-0",
                              )}
                              value={reward.label}
                              maxLength={80}
                              placeholder="$10 off"
                              onBlur={() => markTouched(labelKey)}
                              onChange={(e) =>
                                setRewards((rows) =>
                                  rows.map((r, i) =>
                                    i === idx ? { ...r, label: e.target.value } : r,
                                  ),
                                )
                              }
                              aria-invalid={Boolean(show(labelKey))}
                            />
                            <FieldError message={show(labelKey)} />
                          </div>
                        </label>
                        <div className="flex sm:justify-end sm:pt-1.5">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() =>
                              setRewards((rows) => rows.filter((_, i) => i !== idx))
                            }
                            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-sm border border-white/10 text-xs text-muted transition hover:border-(--danger)/40 hover:text-(--danger) disabled:opacity-40 sm:w-9"
                            aria-label={`Remove reward ${idx + 1}`}
                          >
                            <Trash2 size={14} aria-hidden />
                            <span className="sm:hidden">Remove</span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* In-panel save bar — stays inside the child section */}
          <div className="sticky bottom-0 z-10 -mx-1 border border-white/10 bg-[#0c0b0a]/95 px-3 py-3 backdrop-blur-md sm:mx-0 sm:rounded-sm sm:px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                className={cn(
                  "text-xs leading-relaxed sm:text-sm",
                  Object.keys(errors).length && dirty
                    ? "text-(--danger)"
                    : dirty
                      ? "text-gold"
                      : "text-muted",
                )}
              >
                {statusMessage}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10"
                  disabled={!dirty || isSaving}
                  onClick={() => {
                    setHydrated(false);
                    setTouched({});
                  }}
                >
                  Discard
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="min-h-10 min-w-[9.5rem]"
                  loading={isSaving}
                  disabled={!canSubmit}
                >
                  {!isSaving ? <Save size={15} aria-hidden /> : null}
                  {isSaving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
            {save.error ? (
              <p className="mt-2 text-sm text-(--danger)">{(save.error as Error).message}</p>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="mt-5 space-y-5">
          <PromotionalPointsGrant />

          <section className="rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
            <SectionHeader
              title="Points history"
              description={
                historyQuery.data
                  ? `${historyQuery.data.total} ledger ${historyQuery.data.total === 1 ? "entry" : "entries"} · earn, redeem, birthday, referral, promo`
                  : "Recent earn, redeem, birthday, referral, and promotional activity."
              }
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={historyQuery.isFetching}
                  onClick={() => void historyQuery.refetch()}
                >
                  <RefreshCw size={14} aria-hidden />
                  Refresh
                </Button>
              }
            />

            {historyQuery.isLoading ? (
              <p className="mt-4 text-sm text-muted">Loading history…</p>
            ) : historyQuery.error ? (
              <p className="mt-4 text-sm text-(--danger)">
                {(historyQuery.error as Error).message || "Could not load history."}
              </p>
            ) : !(historyQuery.data?.entries.length) ? (
              <p className="mt-4 text-sm text-muted">No ledger activity yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-sm border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.14em] text-muted">
                    <tr>
                      <SortableTh
                        label="When"
                        column="when"
                        sortKey={ledgerSortKey}
                        sortDir={ledgerSortDir}
                        onSort={toggleLedgerSort}
                      />
                      <SortableTh
                        label="Member"
                        column="member"
                        sortKey={ledgerSortKey}
                        sortDir={ledgerSortDir}
                        onSort={toggleLedgerSort}
                      />
                      <SortableTh
                        label="Reason"
                        column="reason"
                        sortKey={ledgerSortKey}
                        sortDir={ledgerSortDir}
                        onSort={toggleLedgerSort}
                      />
                      <SortableTh
                        label="Δ"
                        column="delta"
                        sortKey={ledgerSortKey}
                        sortDir={ledgerSortDir}
                        onSort={toggleLedgerSort}
                        align="right"
                      />
                      <SortableTh
                        label="Balance"
                        column="balance"
                        sortKey={ledgerSortKey}
                        sortDir={ledgerSortDir}
                        onSort={toggleLedgerSort}
                        align="right"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {sortedLedgerEntries.map((entry) => (
                      <tr key={entry.id} className="text-cream/90">
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="truncate text-cream">{entry.userName}</p>
                          <p className="truncate text-[11px] text-muted">{entry.userEmail}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-sm border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-muted">
                            {loyaltyReasonLabel(entry.reason)}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-medium tabular-nums",
                            entry.delta >= 0 ? "text-emerald-300" : "text-(--danger)",
                          )}
                        >
                          {entry.delta >= 0 ? `+${entry.delta}` : entry.delta}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-cream">
                          {entry.balanceAfter}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function PromotionalPointsGrant() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [points, setPoints] = useState("100");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const grant = useMutation({
    mutationFn: async () => {
      const pts = Number(points);
      if (!email.trim() || !Number.isFinite(pts) || pts === 0) {
        throw new Error("Enter a customer email and a non-zero points amount.");
      }
      // Resolve user id via customers search is heavy — send email lookup through grant by resolving client-side
      const lookup = await apiFetch<{ ok: true; customers: { id: string; email: string }[] }>(
        `/api/customers?q=${encodeURIComponent(email.trim())}&limit=5`,
      );
      const match = lookup.customers.find(
        (c) => c.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!match) throw new Error("No customer found with that email.");
      return apiFetch<{ ok: true; points: number; balance: number }>("/api/loyalty", {
        method: "POST",
        body: JSON.stringify({
          action: "grant-promo",
          userId: match.id,
          points: Math.trunc(pts),
        }),
      });
    },
    onSuccess: (data) => {
      setMessage(`Granted ${data.points} pts · new balance ${data.balance}.`);
      setError("");
      void qc.invalidateQueries({ queryKey: ["loyalty-history"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not grant points.");
      setMessage("");
    },
  });

  return (
    <section className="mt-5 rounded-sm border border-white/10 bg-black/20 p-4 sm:p-5">
      <SectionHeader
        title="Promotional points"
        description="Bonus points for campaigns (double points day, apology credits, launch bonuses)."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
        <label className="block text-[10px] uppercase tracking-[0.16em] text-muted">
          Customer email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex.reed@email.com"
            className={cn(nativeSelectClass, "mt-1.5 w-full")}
            autoComplete="off"
          />
        </label>
        <label className="block text-[10px] uppercase tracking-[0.16em] text-muted">
          Points
          <input
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, "").slice(0, 7))}
            className={cn(nativeSelectClass, "mt-1.5 w-full")}
          />
        </label>
        <div className="flex items-end">
          <Button
            type="button"
            className="min-h-11 w-full"
            loading={grant.isPending}
            onClick={() => grant.mutate()}
          >
            Grant
          </Button>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-gold">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-(--danger)">{error}</p> : null}
    </section>
  );
}
