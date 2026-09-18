"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { roleLabel } from "@/lib/auth/roles";
import type { UserProfile } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile;
  isStaff: boolean;
  onSignOut: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
};

const itemClass =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition";

export function AccountMenu({
  open,
  onOpenChange,
  profile,
  isStaff,
  onSignOut,
  menuRef,
}: Props) {
  const pathname = usePathname();
  const onDashboard = pathname.startsWith("/dashboard");
  const onAccount = pathname.startsWith("/account");
  const primaryHref = isStaff ? "/dashboard" : "/account";
  const primaryActive = isStaff ? onDashboard : onAccount;

  return (
    <div className="relative" ref={menuRef}>
      <Tooltip content="Account menu" disabled={open}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex min-h-9 items-center gap-1 rounded-sm border px-1 py-1 transition sm:min-h-10 sm:gap-1.5 sm:px-1.5",
          open
            ? "border-(--gold)/50 bg-white/5"
            : "border-white/10 hover:border-white/20 hover:bg-white/5",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserAvatar name={profile.name} src={profile.avatarUrl} size={26} />
        <span className="sr-only">Account menu</span>
        <ChevronDown
          size={14}
          className={cn(
            "hidden shrink-0 text-muted transition sm:block",
            open && "rotate-180 text-gold",
          )}
        />
      </button>
      </Tooltip>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-[calc(100%+0.4rem)] z-[80] w-[13.75rem] overflow-hidden rounded-sm border border-white/10 bg-(--bg-elevated) shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          >
            <div className="border-b border-white/10 px-3 py-2.5">
              <p className="truncate text-sm text-cream">{profile.name}</p>
              <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.14em] text-gold/80">
                {roleLabel(profile.role)}
              </p>
            </div>
            <div className="py-1">
              <Link
                href={primaryHref}
                role="menuitem"
                onClick={() => onOpenChange(false)}
                className={cn(
                  itemClass,
                  primaryActive
                    ? "bg-(--gold)/15 text-gold"
                    : "text-cream hover:bg-white/10",
                )}
              >
                {isStaff ? (
                  <LayoutDashboard size={14} className="shrink-0 opacity-80" />
                ) : (
                  <UserRound size={14} className="shrink-0 opacity-80" />
                )}
                {isStaff ? "Dashboard" : "Account"}
              </Link>
              {isStaff ? (
                <Link
                  href="/dashboard/notifications"
                  role="menuitem"
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    itemClass,
                    onDashboard && pathname.startsWith("/dashboard/notifications")
                      ? "bg-(--gold)/15 text-gold"
                      : "text-cream hover:bg-white/10",
                  )}
                >
                  <Bell size={14} className="shrink-0 opacity-80" />
                  Notifications
                </Link>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={onSignOut}
                className={cn(itemClass, "text-cream hover:bg-white/10")}
              >
                <LogOut size={14} className="shrink-0 text-muted" />
                Sign out
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
