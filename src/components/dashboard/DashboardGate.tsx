"use client";

import Link from "next/link";
import { useUserStore } from "@/store/user";
import { hasPermission } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/Button";
import { DashboardLoading } from "@/components/dashboard/DashboardLoading";

export function DashboardGate({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, profile, authReady } = useUserStore();
  const canOpenDashboard = isLoggedIn && hasPermission(profile, "dashboard.access");

  if (!authReady) {
    return (
      <DashboardLoading
        label={isLoggedIn ? "Opening dashboard…" : "Checking session…"}
      />
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 ambient-bg" />
        <div className="relative mx-auto max-w-lg px-4 py-24 text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-gold">
            Staff access only
          </p>
          <h1 className="mt-3 font-display text-4xl text-cream md:text-5xl">
            Store admin dashboard
          </h1>
          <p className="mt-3 text-muted">
            Sign in with a staff, admin, or owner account to manage inventory, users, and
            activity.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/login?next=/dashboard">
              <Button size="lg">Sign in</Button>
            </Link>
            <Link href="/shop" className="text-sm text-gold hover:underline">
              Back to shop
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!canOpenDashboard) {
    return (
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 ambient-bg" />
        <div className="relative mx-auto max-w-lg px-4 py-24 text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-gold">Members</p>
          <h1 className="mt-3 font-display text-4xl text-cream md:text-5xl">
            Dashboard is for store staff
          </h1>
          <p className="mt-3 text-muted">
            Your account can shop and track orders from the account page.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/account">
              <Button size="lg">Go to account</Button>
            </Link>
            <Link href="/shop" className="text-sm text-gold hover:underline">
              Back to shop
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
