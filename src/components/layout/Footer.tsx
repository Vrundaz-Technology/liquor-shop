"use client";

import Link from "next/link";
import { SITE } from "@/lib/utils";
import { useUserStore } from "@/store/user";
import { isStaffRole } from "@/lib/auth/roles";

export function Footer() {
  const showDashboard = useUserStore(
    (s) => s.authReady && s.isLoggedIn && isStaffRole(s.profile),
  );

  return (
    <footer className="border-t border-white/5 bg-[#050505] px-0 pt-12 pb-[max(2rem,env(safe-area-inset-bottom))] sm:pt-16">
      <div className="grid w-full gap-10 px-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4 md:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="font-display text-2xl leading-tight text-[var(--cream)] md:text-3xl">
            Sam&apos;s Discount Liquor
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
            {SITE.tagline} Curated collections, virtual showroom, and AR discovery across New York.
          </p>
        </div>
        <div>
          <p className="mb-4 text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">Explore</p>
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            <li>
              <Link href="/virtual-store" className="hover:text-[var(--cream)]">
                Virtual Store
              </Link>
            </li>
            <li>
              <Link href="/shop" className="hover:text-[var(--cream)]">
                Collections
              </Link>
            </li>
            <li>
              <Link href="/locations" className="hover:text-[var(--cream)]">
                Locations
              </Link>
            </li>
            <li>
              <Link href="/events" className="hover:text-[var(--cream)]">
                Events
              </Link>
            </li>
            <li>
              <Link href="/prototype" className="hover:text-[var(--cream)]">
                Client Prototype
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-4 text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">Services</p>
          <ul className="space-y-2 text-sm text-[var(--muted)]">
            {showDashboard ? (
              <li>
                <Link href="/dashboard" className="hover:text-[var(--cream)]">
                  Owner dashboard
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/locations" className="hover:text-[var(--cream)]">
                Pickup & Delivery
              </Link>
            </li>
            <li>
              <Link href="/wishlist" className="hover:text-[var(--cream)]">
                Wishlist
              </Link>
            </li>
            <li>
              <Link href="/track" className="hover:text-[var(--cream)]">
                Track order
              </Link>
            </li>
            <li>
              <Link href="/support" className="hover:text-[var(--cream)]">
                Support
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-4 text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">
            Please drink responsibly
          </p>
          <p className="text-sm text-[var(--muted)]">
            You must be of legal drinking age to purchase. Frontend demo — payments simulated.
          </p>
        </div>
      </div>
      <div className="mt-12 flex w-full flex-wrap justify-between gap-2 border-t border-white/5 px-3 pt-6 text-xs text-[var(--muted)] sm:px-5 md:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <span>© {new Date().getFullYear()} Sam&apos;s Discount Liquor</span>
        <span>Must be 21+</span>
      </div>
    </footer>
  );
}
