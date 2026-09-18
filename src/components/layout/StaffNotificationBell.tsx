"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Bell,
  CheckCheck,
  Headphones,
  Package,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { dashboardPath } from "@/lib/dashboard/routes";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { confirmAction } from "@/store/dialog";
import { useNotificationDevicePrefs } from "@/hooks/useNotificationDevicePrefs";
import {
  playNotificationSound,
  unlockNotificationAudio,
} from "@/lib/notifications/device-prefs";
import { formatStaffNotificationWhen } from "@/lib/notifications/format";

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

function typeIcon(type: string) {
  if (type.startsWith("order")) return Package;
  if (type.startsWith("transfer")) return ArrowLeftRight;
  if (type.startsWith("support")) return Headphones;
  return Bell;
}

export function StaffNotificationBell({
  variant = "header",
}: {
  variant?: "header" | "chrome";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { prefs } = useNotificationDevicePrefs();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);

  const notifQuery = useQuery({
    queryKey: ["staff-notifications"],
    queryFn: async () =>
      apiFetch<{ ok: true; items: StaffNotificationItem[]; unread: number }>(
        "/api/staff-notifications?limit=20",
      ),
    staleTime: 20_000,
    refetchInterval: 45_000,
  });

  const unread = prefs.enabled ? (notifQuery.data?.unread ?? 0) : 0;
  const items = notifQuery.data?.items ?? [];

  const updateNotifs = useMutation({
    mutationFn: async (
      payload: { all: true } | { ids: string[] } | { clear: true } | { clearIds: string[] },
    ) =>
      apiFetch<{ ok: true; unread: number }>("/api/staff-notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff-notifications"] });
    },
  });

  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const nextItems = notifQuery.data?.items;
    if (!nextItems) return;

    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(nextItems.map((item) => item.id));
      return;
    }

    const fresh = nextItems.filter((item) => !seenIdsRef.current!.has(item.id) && !item.readAt);
    for (const item of nextItems) seenIdsRef.current.add(item.id);

    if (fresh.length && prefs.enabled && prefs.soundEnabled) {
      playNotificationSound(prefs);
    }
  }, [notifQuery.data, prefs]);

  useEffect(() => {
    if (!prefs.autoMarkRead || !prefs.enabled) return;
    const pending = notifQuery.data?.unread ?? 0;
    if (pending === 0 || updateNotifs.isPending) return;
    updateNotifs.mutate({ all: true });
  }, [
    prefs.autoMarkRead,
    prefs.enabled,
    notifQuery.data?.unread,
    updateNotifs.isPending,
    updateNotifs.mutate,
  ]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badgeLabel = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;

  const openItem = (item: StaffNotificationItem) => {
    if (!item.readAt) updateNotifs.mutate({ ids: [item.id] });
    setOpen(false);
    if (item.href) router.push(item.href);
  };

  const clearAll = async () => {
    if (!items.length) return;
    const ok = await confirmAction({
      title: "Clear all notifications?",
      description: "They’ll leave your inbox. Other staff still see theirs.",
      confirmLabel: "Clear all",
      tone: "danger",
    });
    if (ok) updateNotifs.mutate({ clear: true });
  };

  return (
    <div className="relative" ref={rootRef}>
      <Tooltip
        content={badgeLabel ? `Notifications, ${badgeLabel} unread` : "Notifications"}
        disabled={open}
      >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          unlockNotificationAudio();
          setOpen((v) => !v);
          if (!open) void notifQuery.refetch();
        }}
        className={cn(
          "relative inline-flex items-center justify-center rounded-sm",
          variant === "chrome"
            ? cn(
                "h-11 w-11 border border-white/10 bg-white/[0.02] text-muted transition hover:border-white/20 hover:bg-white/[0.04] hover:text-cream",
                open && "border-(--gold)/40 bg-(--gold)/10 text-gold",
              )
            : cn(
                "min-h-11 min-w-11 text-[var(--cream)] hover:bg-white/5",
                open && "bg-white/5 text-gold",
              ),
        )}
      >
        <Bell size={18} aria-hidden />
        <span className="sr-only">
          {badgeLabel ? `Notifications, ${badgeLabel} unread` : "Notifications"}
        </span>
        {badgeLabel ? (
          <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-(--danger) px-1 text-[10px] font-medium leading-none text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>
      </Tooltip>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[80] mt-2 flex w-[min(22rem,calc(100vw-1.25rem))] max-h-[min(28rem,70dvh)] flex-col overflow-hidden rounded-sm border border-white/10 bg-[#121212] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        >
          <div className="shrink-0 border-b border-white/10 px-3.5 py-3">
            <p className="text-sm font-medium text-cream">Notifications</p>
            <p className="mt-0.5 text-xs text-muted">
              {!prefs.enabled
                ? "Alerts paused on this device"
                : unread > 0
                  ? `${unread} unread · orders, transfers, support`
                  : "Orders, transfers, and support updates"}
            </p>
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
                    <li key={item.id} className="relative">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openItem(item)}
                        className={cn(
                          "flex w-full items-start gap-3 px-3.5 py-3.5 pr-11 text-left transition hover:bg-white/[0.04]",
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
                          <span
                            className={cn(
                              "block text-sm leading-snug",
                              unreadItem ? "font-medium text-cream" : "text-cream/90",
                            )}
                          >
                            {item.title}
                          </span>
                          <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted">
                            {item.body}
                          </span>
                          <span className="mt-1.5 block text-[11px] text-white/35">
                            {formatStaffNotificationWhen(item.createdAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Clear notification"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateNotifs.mutate({ clearIds: [item.id] });
                        }}
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted transition hover:bg-white/10 hover:text-cream"
                      >
                        <X size={13} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <button
                  type="button"
                  disabled={unread === 0 || updateNotifs.isPending}
                  onClick={() => updateNotifs.mutate({ all: true })}
                  className="inline-flex items-center gap-1 text-muted transition hover:text-gold disabled:opacity-40"
                >
                  <CheckCheck size={12} aria-hidden />
                  Mark all read
                </button>
                <button
                  type="button"
                  disabled={!items.length || updateNotifs.isPending}
                  onClick={() => void clearAll()}
                  className="text-muted transition hover:text-gold disabled:opacity-40"
                >
                  Clear all
                </button>
              </div>
              <Link
                href={dashboardPath("notifications")}
                onClick={() => setOpen(false)}
                className="shrink-0 text-gold transition hover:text-cream"
              >
                See all
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
