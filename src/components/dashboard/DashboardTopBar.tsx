"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  UserRound,
} from "lucide-react";
import { roleLabel } from "@/lib/auth/roles";
import { dashboardPath } from "@/lib/dashboard/routes";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { StaffNotificationBell } from "@/components/layout/StaffNotificationBell";
import { useUserStore } from "@/store/user";
import type { UserProfile } from "@/types";

type Props = {
  profile: UserProfile;
  compact?: boolean;
};

export function DashboardTopBar({ profile, compact = false }: Props) {
  const router = useRouter();
  const logout = useUserStore((s) => s.logout);
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [userOpen]);

  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const controlH = "h-11";

  const onSignOut = async () => {
    setUserOpen(false);
    await logout();
    window.location.assign("/login");
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        compact ? "justify-end" : "h-full w-full justify-between gap-4",
      )}
    >
      {!compact ? (
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.02] px-3.5 text-sm text-muted transition hover:border-white/20 hover:bg-white/[0.04] hover:text-cream",
              controlH,
            )}
          >
            <ExternalLink size={14} aria-hidden />
            <span className="hidden xl:inline">View storefront</span>
            <span className="xl:hidden">Storefront</span>
          </Link>
          <span className="hidden h-6 w-px bg-white/10 sm:block" aria-hidden />
          <p className="hidden truncate text-sm text-muted sm:block">{todayLabel}</p>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-2">
        <StaffNotificationBell variant="chrome" />

        <div className="relative" ref={userRef}>
          <Tooltip content="Account menu" disabled={userOpen}>
          <button
            type="button"
            aria-expanded={userOpen}
            aria-haspopup="menu"
            onClick={() => setUserOpen((open) => !open)}
            className={cn(
              "inline-flex items-center gap-2.5 rounded-sm border border-white/10 bg-white/[0.02] pl-1.5 pr-2 transition hover:border-white/20 hover:bg-white/[0.04] sm:pr-3",
              controlH,
              compact && "w-11 justify-center px-0",
              userOpen && "border-(--gold)/40 bg-(--gold)/10",
            )}
          >
            <UserAvatar name={profile.name} src={profile.avatarUrl} size={compact ? 28 : 30} />
            <span className="sr-only">Account menu</span>
            {!compact ? (
              <>
                <span className="hidden min-w-0 text-left sm:block">
                  <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight text-cream">
                    {profile.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] uppercase leading-none tracking-[0.14em] text-muted">
                    {roleLabel(profile.role)}
                  </span>
                </span>
                <ChevronDown
                  size={14}
                  className={cn("hidden shrink-0 text-muted sm:block", userOpen && "text-gold")}
                  aria-hidden
                />
              </>
            ) : null}
          </button>
          </Tooltip>

          {userOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-2 w-[min(16.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-sm border border-white/10 bg-[#121212] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
            >
              <div className="border-b border-white/10 px-3.5 py-3">
                <p className="truncate text-sm font-medium text-cream">{profile.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{profile.email}</p>
              </div>
              <ul className="py-1">
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserOpen(false);
                      router.push(dashboardPath("profile"));
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-cream transition hover:bg-white/[0.04]"
                  >
                    <UserRound size={15} className="text-muted" aria-hidden />
                    Profile
                  </button>
                </li>
                <li>
                  <Link
                    role="menuitem"
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-cream transition hover:bg-white/[0.04]"
                  >
                    <ExternalLink size={15} className="text-muted" aria-hidden />
                    View storefront
                  </Link>
                </li>
                <li className="mt-1 border-t border-white/10 pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void onSignOut()}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-(--danger) transition hover:bg-(--danger)/10"
                  >
                    <LogOut size={15} aria-hidden />
                    Sign out
                  </button>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
