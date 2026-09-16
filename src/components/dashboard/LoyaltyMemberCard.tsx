"use client";

import { useMemo, useState } from "react";
import { Cake, Copy, Gift, Save, Share2 } from "lucide-react";
import { useUserStore } from "@/store/user";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type Props = {
  /** Controlled birthday from parent (Account loyalty tab). */
  birthdayValue?: string;
  onBirthdayChange?: (value: string) => void;
  className?: string;
};

export function LoyaltyMemberCard({ birthdayValue, onBirthdayChange, className }: Props) {
  const profile = useUserStore((s) => s.profile);
  const claimBirthdayReward = useUserStore((s) => s.claimBirthdayReward);
  const updateProfile = useUserStore((s) => s.updateProfile);
  const [busy, setBusy] = useState(false);
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [localBirthday, setLocalBirthday] = useState(profile.birthday ?? "");

  const controlled = onBirthdayChange != null;
  const birthday = controlled ? (birthdayValue ?? "") : localBirthday;
  const savedBirthday = profile.birthday ?? "";
  const birthdayDirty = birthday !== savedBirthday;

  const shareUrl = useMemo(() => {
    if (!profile.referralCode || typeof window === "undefined") return "";
    return `${window.location.origin}/signup?ref=${encodeURIComponent(profile.referralCode)}`;
  }, [profile.referralCode]);

  const setBirthday = (value: string) => {
    if (controlled) onBirthdayChange?.(value);
    else setLocalBirthday(value);
  };

  const saveBirthday = async () => {
    setSavingBirthday(true);
    setError("");
    setMessage("");
    try {
      await updateProfile({ birthday: birthday || null });
      if (!controlled) setLocalBirthday(birthday);
      setMessage(birthday ? "Birthday saved." : "Birthday cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save birthday.");
    } finally {
      setSavingBirthday(false);
    }
  };

  const claim = async () => {
    if (birthdayDirty) {
      setError("Save your birthday first, then claim.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await claimBirthdayReward();
      setMessage(
        result.points > 0
          ? `Birthday bonus claimed — +${result.points} points.`
          : "Birthday reward applied.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim birthday reward.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!profile.referralCode) return;
    try {
      await navigator.clipboard.writeText(profile.referralCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy referral code.");
    }
  };

  return (
    <div
      className={cn(
        "space-y-4 rounded-sm border border-white/10 bg-white/[0.02] p-4 sm:p-5",
        className,
      )}
    >
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Loyalty perks</p>
        <h3 className="mt-1 font-display text-base text-cream sm:text-lg">Birthday & referrals</h3>
        <p className="mt-1 text-xs text-muted">
          {profile.loyaltyPoints.toLocaleString()} pts · {profile.loyaltyTier}
        </p>
      </div>

      <label className="block text-xs text-muted">
        Birthday
        <Input
          className="mt-1.5 scheme-dark"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
        <span className="mt-1.5 block text-[11px] text-white/35">
          Claim a birthday bonus once per year on your birthday.
        </span>
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {birthdayDirty ? (
          <Button
            type="button"
            size="sm"
            loading={savingBirthday}
            onClick={() => void saveBirthday()}
            className="w-full sm:w-auto"
          >
            <Save size={14} aria-hidden />
            Save birthday
          </Button>
        ) : null}
        {profile.canClaimBirthday && !birthdayDirty ? (
          <Button
            type="button"
            size="sm"
            loading={busy}
            onClick={() => void claim()}
            className="w-full sm:w-auto"
          >
            <Cake size={14} aria-hidden />
            Claim birthday bonus
          </Button>
        ) : null}
      </div>

      <div className="border-t border-white/10 pt-4">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted">
          <Gift size={12} className="text-gold" aria-hidden />
          Your referral code
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-sm border border-(--gold)/30 bg-(--gold)/10 px-2.5 py-1.5 font-mono text-sm tracking-wider text-gold">
            {profile.referralCode || "—"}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!profile.referralCode}
            onClick={() => void copyCode()}
            className="min-h-9"
          >
            <Copy size={13} aria-hidden />
            {copied ? "Copied" : "Copy"}
          </Button>
          {shareUrl ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-9"
              onClick={() =>
                void navigator.clipboard.writeText(shareUrl).then(() => setCopied(true))
              }
            >
              <Share2 size={13} aria-hidden />
              Copy link
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-white/35">
          Friends who sign up with your code earn a welcome bonus — you earn referral points when
          they join.
        </p>
      </div>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-(--danger)">{error}</p> : null}
    </div>
  );
}
