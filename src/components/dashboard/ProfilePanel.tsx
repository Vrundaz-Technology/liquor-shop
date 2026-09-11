"use client";

import { FormEvent, useEffect, useState } from "react";
import { LogOut, MapPin, Shield } from "lucide-react";
import { useUserStore } from "@/store/user";
import { roleLabel, isDemoAccountEmail } from "@/lib/auth/roles";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { getAllLocations } from "@/data/locations";
import { accessibleLocations } from "@/lib/auth/location-access";
import { LoyaltyMemberCard } from "@/components/dashboard/LoyaltyMemberCard";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<string, string> = {
  owner: "border-(--gold)/40 bg-(--gold)/10 text-gold",
  admin: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  staff: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  customer: "border-white/15 bg-white/5 text-muted",
};

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      <h3 className="mt-1 font-display text-base text-cream sm:text-lg">{title}</h3>
    </div>
  );
}

export function ProfilePanel() {
  const { profile, updateProfile, logout } = useUserStore();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [birthday, setBirthday] = useState(profile.birthday ?? "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const demoLocked = isDemoAccountEmail(profile.email);
  const stores = accessibleLocations(profile, getAllLocations());
  const homeStore =
    stores.find((store) => store.id === profile.preferredBranchId)?.shortName ??
    stores[0]?.shortName ??
    "—";

  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
    setAvatarUrl(profile.avatarUrl ?? "");
    setBirthday(profile.birthday ?? "");
  }, [profile.name, profile.email, profile.avatarUrl, profile.birthday]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password && !currentPassword) {
      setError("Enter your current password to set a new one.");
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        name,
        email,
        avatarUrl,
        birthday: birthday || null,
        ...(password ? { password, currentPassword } : {}),
      });
      setPassword("");
      setCurrentPassword("");
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-0 min-w-0">
      <div className="mb-4 flex justify-end sm:mb-5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            await logout();
            window.location.assign("/login");
          }}
        >
          <LogOut size={14} />
          Sign out
        </Button>
      </div>

      <div className="glass mt-4 overflow-hidden border border-white/10 sm:mt-6">
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,17.5rem)_1fr]">
          <aside className="min-w-0 border-b border-white/10 bg-white/[0.02] p-4 sm:p-5 lg:border-b-0 lg:border-r lg:p-6">
            <AvatarUpload
              layout="responsive"
              name={name}
              value={avatarUrl}
              onChange={setAvatarUrl}
              onPersist={async (next) => {
                try {
                  await updateProfile({ avatarUrl: next || null });
                  setAvatarUrl(next);
                  setMessage(next ? "Profile photo saved." : "Profile photo removed.");
                  setError("");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not save profile photo.");
                  throw err;
                }
              }}
            />
            <div className="mt-5 space-y-3 border-t border-white/10 pt-5 text-left lg:text-center">
              <p className="truncate font-display text-lg text-cream sm:text-xl">{name || "Your name"}</p>
              <div className="flex flex-wrap items-center gap-2 lg:justify-center">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]",
                    ROLE_TONE[profile.role] ?? ROLE_TONE.customer,
                  )}
                >
                  <Shield size={12} />
                  {roleLabel(profile.role)}
                </span>
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-muted">
                  <MapPin size={12} className="shrink-0 text-gold" />
                  <span className="truncate">{homeStore}</span>
                </span>
              </div>
            </div>
          </aside>

          <form onSubmit={save} className="min-w-0 p-4 sm:p-5 lg:p-8">
            <SectionHeading eyebrow="Account" title="Personal details" />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block min-w-0 text-xs text-muted">
                Full name
                <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="block min-w-0 text-xs text-muted">
                Email
                <Input
                  className="mt-1.5"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={demoLocked}
                />
              </label>
            </div>
            {demoLocked ? (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Demo account email is locked so the shared storefront logins keep working.
              </p>
            ) : null}

            <div className="mt-6 border-t border-white/10 pt-6 sm:mt-8 sm:pt-8">
              <LoyaltyMemberCard birthdayValue={birthday} onBirthdayChange={setBirthday} />
              <p className="mt-2 text-[11px] text-white/35">
                Birthday saves with the profile form below.
              </p>
            </div>

            <div className="mt-6 border-t border-white/10 pt-6 sm:mt-8 sm:pt-8">
              <SectionHeading eyebrow="Security" title="Change password" />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block min-w-0 text-xs text-muted">
                  Current password
                  <PasswordInput
                    className="mt-1.5"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={password ? "Required for new password" : "Enter current password"}
                  />
                </label>
                <label className="block min-w-0 text-xs text-muted">
                  New password
                  <PasswordInput
                    className="mt-1.5"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    minLength={8}
                  />
                </label>
              </div>
            </div>

            {message ? <p className="mt-4 text-sm text-emerald-300 sm:mt-5">{message}</p> : null}
            {error ? <p className="mt-4 text-sm text-red-300 sm:mt-5">{error}</p> : null}

            <div className="mt-5 flex border-t border-white/10 pt-4 sm:mt-6 sm:justify-end sm:pt-5">
              <Button type="submit" size="sm" className="w-full sm:w-auto" loading={busy}>
                {busy ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
