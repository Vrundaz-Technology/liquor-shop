"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Bell,
  CheckCheck,
  ChevronDown,
  ExternalLink,
  Headphones,
  LogOut,
  Package,
  UserRound,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { roleLabel } from "@/lib/auth/roles";
import { dashboardPath } from "@/lib/dashboard/routes";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useUserStore } from "@/store/user";
import type { UserProfile } from "@/types";

type StaffNotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
  severity: string;
};

type Props = {
  profile: UserProfile;
  /** Compact bar for mobile (menu button rendered by parent). */
  compact?: boolean;
};

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function typeIcon(type: string) {
  if (type.startsWith("order")) return Package;
  if (type.startsWith("transfer")) return ArrowLeftRight;
  if (type.startsWith("support")) return Headphones;
  return Bell;
}

export function DashboardTopBar({ profile, compact = false }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const logout = useUserStore((s) => s.logout);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const notifQuery = useQuery({
    queryKey: ["staff-notifications"],
    queryFn: async () =>
      apiFetch<{ ok: true; items: StaffNotificationItem[]; unread: number }>(
        "/api/staff-notifications?limit=20",
      ),
    staleTime: 20_000,
    refetchInterval: 45_000,
  });

  const unread = notifQuery.data?.unread ?? 0;
  const items = notifQuery.data?.items ?? [];

  const markRead = useMutation({
    mutationFn: async (payload: { all: true } | { ids: string[] }) =>
      apiFetch<{ ok: true; unread: number }>("/api/staff-notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff-notifications"] });
    },
  });

  useEffect(() => {
    if (!notifOpen && !userOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notifOpen && notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (userOpen && userRef.current && !userRef.current.contains(target)) {
        setUserOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotifOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen, userOpen]);

  const badgeLabel = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;

  const closeMenus = () => {
    setNotifOpen(false);
    setUserOpen(false);
  };

  const onSignOut = async () => {
    closeMenus();
    await logout();
    window.location.assign("/login");
  };

  const openItem = (item: StaffNotificationItem) => {
    if (!item.readAt) {
      markRead.mutate({ ids: [item.id] });
    }
    closeMenus();
    if (item.href) router.push(item.href);
  };

  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const controlH = "h-11";

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
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            aria-label={badgeLabel ? `Notifications, ${badgeLabel} unread` : "Notifications"}
            aria-expanded={notifOpen}
            aria-haspopup="menu"
            onClick={() => {
              setUserOpen(false);
              setNotifOpen((open) => !open);
              if (!notifOpen) void notifQuery.refetch();
            }}
            className={cn(
              "relative inline-flex w-11 items-center justify-center rounded-sm border border-white/10 bg-white/[0.02] text-muted transition hover:border-white/20 hover:bg-white/[0.04] hover:text-cream",
              controlH,
              notifOpen && "border-(--gold)/40 bg-(--gold)/10 text-gold",
            )}
          >
            <Bell size={17} aria-hidden />
            {badgeLabel ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-(--danger) px-1 text-[9px] font-semibold leading-none text-white">
                {badgeLabel}
              </span>
            ) : null}
          </button>

          {notifOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-40 mt-2 flex w-[min(22rem,calc(100vw-1.25rem))] max-h-[min(28rem,70dvh)] flex-col overflow-hidden rounded-sm border border-white/10 bg-[#121212] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-cream">Notifications</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {unread > 0
                      ? `${unread} unread · orders, transfers, support`
                      : "Orders, transfers, and support updates"}
                  </p>
                </div>
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => markRead.mutate({ all: true })}
                    disabled={markRead.isPending}
                    className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-gold transition hover:text-cream disabled:opacity-50"
                  >
                    <CheckCheck size={13} aria-hidden />
                    Mark all read
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {notifQuery.isLoading ? (
                  <p className="px-3.5 py-8 text-center text-sm text-muted">Loading…</p>
                ) : notifQuery.isError ? (
                  <p className="px-3.5 py-8 text-center text-sm text-(--danger)">
                    Could not load notifications.
                  </p>
                ) : !items.length ? (
                  <div className="flex flex-col items-center px-3.5 py-10 text-center">
                    <Bell size={28} className="text-white/25" aria-hidden />
                    <p className="mt-3 text-sm text-muted">No notifications</p>
                    <p className="mt-1 max-w-[16rem] text-xs text-white/35">
                      New orders, stock transfers, and support tickets will show up here.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {items.map((item) => {
                      const Icon = typeIcon(item.type);
                      const unreadItem = !item.readAt;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => openItem(item)}
                            className={cn(
                              "flex w-full items-start gap-3 px-3.5 py-3.5 text-left transition hover:bg-white/[0.04]",
                              unreadItem && "bg-(--gold)/[0.06]",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border",
                                unreadItem
                                  ? "border-(--gold)/35 bg-(--gold)/10 text-gold"
                                  : "border-white/10 text-muted",
                              )}
                            >
                              <Icon size={15} aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span
                                  className={cn(
                                    "text-sm leading-snug",
                                    unreadItem ? "font-medium text-cream" : "text-cream/90",
                                  )}
                                >
                                  {item.title}
                                </span>
                                {unreadItem ? (
                                  <span
                                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--gold)"
                                    aria-label="Unread"
                                  />
                                ) : null}
                              </span>
                              <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted">
                                {item.body}
                              </span>
                              <span className="mt-1.5 block text-[11px] text-white/35">
                                {relativeTime(item.createdAt)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="shrink-0 border-t border-white/10 px-3.5 py-2.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                  <Link
                    href={dashboardPath("orders")}
                    onClick={closeMenus}
                    className="text-muted transition hover:text-gold"
                  >
                    Orders
                  </Link>
                  <Link
                    href={dashboardPath("transfers")}
                    onClick={closeMenus}
                    className="text-muted transition hover:text-gold"
                  >
                    Transfers
                  </Link>
                  <Link
                    href={dashboardPath("support")}
                    onClick={closeMenus}
                    className="text-muted transition hover:text-gold"
                  >
                    Support
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative" ref={userRef}>
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={userOpen}
            aria-haspopup="menu"
            onClick={() => {
              setNotifOpen(false);
              setUserOpen((open) => !open);
            }}
            className={cn(
              "inline-flex items-center gap-2.5 rounded-sm border border-white/10 bg-white/[0.02] pl-1.5 pr-2 transition hover:border-white/20 hover:bg-white/[0.04] sm:pr-3",
              controlH,
              compact && "w-11 justify-center px-0",
              userOpen && "border-(--gold)/40 bg-(--gold)/10",
            )}
          >
            <UserAvatar name={profile.name} src={profile.avatarUrl} size={compact ? 28 : 30} />
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
                      closeMenus();
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
                    onClick={closeMenus}
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
