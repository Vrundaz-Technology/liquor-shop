"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useUserStore } from "@/store/user";
import { validatePassword } from "@/lib/auth/password";
import { safeInternalPath } from "@/lib/utils";

function SignupForm() {
  const router = useRouter();
  const search = useSearchParams();
  const signup = useUserStore((s) => s.signup);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const authReady = useUserStore((s) => s.authReady);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = safeInternalPath(search.get("next")) || "/account";

  useEffect(() => {
    const ref = search.get("ref");
    if (ref) setReferralCode(ref.trim().toUpperCase());
  }, [search]);

  useEffect(() => {
    if (authReady && isLoggedIn) {
      router.replace(next);
    }
  }, [authReady, isLoggedIn, next, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (name.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    setBusy(true);
    try {
      await signup(name, email, password, referralCode || undefined);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
      setBusy(false);
    }
  };

  return (
    <AuthCard
      kicker="New member"
      title="Create account"
      subtitle="Customer accounts can shop, checkout, and track orders. Staff roles are assigned by an admin."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block text-xs text-muted">
          Full name
          <Input
            className="mt-1"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label className="block text-xs text-muted">
          Email
          <Input
            className="mt-1"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-xs text-muted">
          Password
          <PasswordInput
            className="mt-1"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <span className="mt-1 block text-[11px]">At least 8 characters, with a letter and a number.</span>
        </label>
        <label className="block text-xs text-muted">
          Referral code <span className="text-white/35">(optional)</span>
          <Input
            className="mt-1 uppercase tracking-wider"
            autoComplete="off"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            placeholder="Friend’s code"
            maxLength={32}
          />
        </label>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already a member?{" "}
        <Link
          href={next !== "/account" ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="text-gold hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="px-4 py-24 text-center text-sm text-muted">Loading…</div>}>
      <SignupForm />
    </Suspense>
  );
}
