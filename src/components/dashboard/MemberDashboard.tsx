"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  ClipboardList,
  Gift,
  Heart,
  MapPin,
  Menu,
  MessageSquare,
  Headphones,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Store,
  Timer,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  ArrowLeftRight,
  X,
} from "lucide-react";
import { useUserStore } from "@/store/user";
import { useBranchStore } from "@/store/branch";
import { getLocationById } from "@/data/locations";
import { DashboardTopBar } from "@/components/dashboard/DashboardTopBar";
import { type LocationFilter } from "@/components/dashboard/LocationScopeBar";
import { hasAnyPermission, hasPermission, type Permission } from "@/lib/auth/permissions";
import {
  dashboardPath,
  parseDashboardPath,
  type DashboardSection,
} from "@/lib/dashboard/routes";
import { accessibleLocations, canAccessLocation, hasAllLocationAccess } from "@/lib/auth/location-access";
import { roleLabel } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { NativeSelect } from "@/components/ui/NativeSelect";

function panelLoading(label: string) {
  return (
    <p className="text-sm text-muted" role="status">
      Loading {label}…
    </p>
  );
}

const DeliveriesPanel = dynamic(
  () => import("@/components/dashboard/DeliveriesPanel").then((m) => m.DeliveriesPanel),
  { ssr: false, loading: () => panelLoading("deliveries") },
);
const PosPanel = dynamic(
  () => import("@/components/dashboard/PosPanel").then((m) => m.PosPanel),
  { ssr: false, loading: () => panelLoading("point of sale") },
);
const OrdersPanel = dynamic(
  () => import("@/components/dashboard/OrdersPanel").then((m) => m.OrdersPanel),
  { ssr: false, loading: () => panelLoading("orders") },
);
const InventoryPanel = dynamic(
  () => import("@/components/dashboard/InventoryPanel").then((m) => m.InventoryPanel),
  { ssr: false, loading: () => panelLoading("inventory") },
);
const TransfersPanel = dynamic(
  () => import("@/components/dashboard/TransfersPanel").then((m) => m.TransfersPanel),
  { ssr: false, loading: () => panelLoading("transfers") },
);
const LocationsPanel = dynamic(
  () => import("@/components/dashboard/LocationsPanel").then((m) => m.LocationsPanel),
  { ssr: false, loading: () => panelLoading("locations") },
);
const EventsPanel = dynamic(
  () => import("@/components/dashboard/EventsPanel").then((m) => m.EventsPanel),
  { ssr: false, loading: () => panelLoading("events") },
);
const ReviewsPanel = dynamic(
  () => import("@/components/dashboard/ReviewsPanel").then((m) => m.ReviewsPanel),
  { ssr: false, loading: () => panelLoading("reviews") },
);
const SupportPanel = dynamic(
  () => import("@/components/dashboard/SupportPanel").then((m) => m.SupportPanel),
  { ssr: false, loading: () => panelLoading("support") },
);
const CustomersPanel = dynamic(
  () => import("@/components/dashboard/CustomersPanel").then((m) => m.CustomersPanel),
  { ssr: false, loading: () => panelLoading("customers") },
);
const PromotionsPanel = dynamic(
  () => import("@/components/dashboard/PromotionsPanel").then((m) => m.PromotionsPanel),
  { ssr: false, loading: () => panelLoading("promotions") },
);
const LoyaltyPanel = dynamic(
  () => import("@/components/dashboard/LoyaltyPanel").then((m) => m.LoyaltyPanel),
  { ssr: false, loading: () => panelLoading("loyalty") },
);
const ActivityLogsPanel = dynamic(
  () => import("@/components/dashboard/ActivityLogsPanel").then((m) => m.ActivityLogsPanel),
  { ssr: false, loading: () => panelLoading("activity") },
);
const CronJobsPanel = dynamic(
  () => import("@/components/dashboard/CronJobsPanel").then((m) => m.CronJobsPanel),
  { ssr: false, loading: () => panelLoading("cron jobs") },
);
const UsersPanel = dynamic(
  () => import("@/components/dashboard/UsersPanel").then((m) => m.UsersPanel),
  { ssr: false, loading: () => panelLoading("users") },
);
const ProfilePanel = dynamic(
  () => import("@/components/dashboard/ProfilePanel").then((m) => m.ProfilePanel),
  { ssr: false, loading: () => panelLoading("profile") },
);
const OverviewAnalyticsPanel = dynamic(
  () =>
    import("@/components/dashboard/OverviewAnalyticsPanel").then(
      (m) => m.OverviewAnalyticsPanel,
    ),
  { ssr: false, loading: () => panelLoading("analytics") },
);

type DashboardTab = DashboardSection;

type TabGroup = "operations" | "manage" | "account";

const DASHBOARD_TABS: {
  id: DashboardTab;
  label: string;
  icon: typeof TrendingUp;
  permission: Permission;
  group: TabGroup;
  description: string;
}[] = [
  {
    id: "overview",
    label: "Overview",
    icon: TrendingUp,
    permission: "analytics.view",
    group: "operations",
    description: "Store-wide sales, financials, and branch comparison for your organization.",
  },
  {
    id: "pos",
    label: "Point of sale",
    icon: Store,
    permission: "pos.access",
    group: "operations",
    description: "Ring up walk-in sales and check stock across stores.",
  },
  {
    id: "orders",
    label: "Orders",
    icon: ShoppingBag,
    permission: "orders.view",
    group: "operations",
    description: "Browse and manage online, pickup, and point-of-sale orders by store.",
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Package,
    permission: "inventory.view",
    group: "operations",
    description: "Manage bottle counts, categories, restock, and products per store.",
  },
  {
    id: "transfers",
    label: "Transfers",
    icon: ArrowLeftRight,
    permission: "inventory.transfer",
    group: "operations",
    description: "Move stock between locations with full history.",
  },
  {
    id: "deliveries",
    label: "Deliveries",
    icon: Truck,
    permission: "deliveries.view",
    group: "operations",
    description: "Assign drivers and track each delivery to the door.",
  },
  {
    id: "customers",
    label: "Customers",
    icon: Users,
    permission: "customers.view",
    group: "manage",
    description: "CRM segments, spend, and notes for your organization.",
  },
  {
    id: "promotions",
    label: "Promotions",
    icon: Gift,
    permission: "promotions.view",
    group: "manage",
    description: "Coupons and offers with platform / owner / location priority.",
  },
  {
    id: "loyalty",
    label: "Loyalty",
    icon: Heart,
    permission: "loyalty.view",
    group: "manage",
    description: "Organization loyalty earn rates and rewards.",
  },
  {
    id: "locations",
    label: "Locations",
    icon: MapPin,
    permission: "locations.view",
    group: "manage",
    description: "Add, edit, or remove stores in your organization.",
  },
  {
    id: "events",
    label: "Events",
    icon: CalendarDays,
    permission: "events.view",
    group: "manage",
    description: "Create and manage tastings, launches, and in-store events.",
  },
  {
    id: "reviews",
    label: "Reviews",
    icon: MessageSquare,
    permission: "reviews.view",
    group: "manage",
    description: "Centralized product, store, and delivery review management.",
  },
  {
    id: "support",
    label: "Support",
    icon: Headphones,
    permission: "support.view",
    group: "manage",
    description: "Customer support tickets routed to store, owner, or platform.",
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
    permission: "users.view",
    group: "manage",
    description: "Create accounts, assign roles, store access, and permissions.",
  },
  {
    id: "activity",
    label: "Activity",
    icon: ClipboardList,
    permission: "activity.view",
    group: "manage",
    description: "Audit trail of stock, orders, catalog, and account changes.",
  },
  {
    id: "cron",
    label: "Cron Jobs",
    icon: Timer,
    permission: "activity.view",
    group: "manage",
    description: "Scheduled background jobs, frequency, and run history.",
  },
  {
    id: "profile",
    label: "Profile",
    icon: UserRound,
    permission: "dashboard.access",
    group: "account",
    description: "Update your photo, name, email, and password.",
  },
];

const TAB_GROUPS: { id: TabGroup; label: string }[] = [
  { id: "operations", label: "Operations" },
  { id: "manage", label: "Manage" },
  { id: "account", label: "Account" },
];

/** Shared height for sidebar brand strip + desktop top bar (aligned divider). */
const CHROME_HEADER_H = "h-[5.25rem]";
const HEADER_TOP = "top-[env(safe-area-inset-top,0px)]";
const SIDEBAR_HEIGHT =
  "h-[calc(100dvh-env(safe-area-inset-top,0px))]";
const SIDEBAR_EXPANDED = "w-[15.5rem] xl:w-[16.5rem]";
const SIDEBAR_COLLAPSED = "w-[4.5rem]";
const CONTENT_PAD_EXPANDED = "lg:pl-[15.5rem] xl:pl-[16.5rem]";
const CONTENT_PAD_COLLAPSED = "lg:pl-[4.5rem]";
const SIDEBAR_STORAGE_KEY = "sams-dashboard-sidebar-collapsed";

function canAccessDashboardTab(
  profile: Parameters<typeof hasPermission>[0],
  tab: (typeof DASHBOARD_TABS)[number],
) {
  if (tab.id === "overview") {
    return (
      hasPermission(profile, "analytics.view") || hasPermission(profile, "dashboard.overview")
    );
  }
  if (tab.id === "inventory") {
    return (
      hasPermission(profile, "inventory.view") ||
      hasAnyPermission(profile, ["catalog.create", "catalog.edit", "catalog.delete"])
    );
  }
  return hasPermission(profile, tab.permission);
}

function useBreakpoint() {
  const [bp, setBp] = useState<"mobile" | "tablet" | "desktop">("desktop");

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setBp("mobile");
      else if (w < 1024) setBp("tablet");
      else setBp("desktop");
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return bp;
}

export function MemberDashboard() {
  const profile = useUserStore((s) => s.profile);
  const branchId = useBranchStore((s) => s.branchId);
  const setBranch = useBranchStore((s) => s.setBranch);
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const [locationFilter, setLocationFilter] = useState<LocationFilter>(branchId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const tabs = useMemo(
    () => DASHBOARD_TABS.filter((tab) => canAccessDashboardTab(profile, tab)),
    [profile],
  );
  const route = useMemo(() => parseDashboardPath(pathname), [pathname]);
  const requestedAllowed = tabs.some((tab) => tab.id === route.section);
  const dashboardTab: DashboardTab = requestedAllowed
    ? route.section
    : (tabs[0]?.id ?? "overview");
  const openCategoriesInInventory = route.inventoryView === "categories";
  const stores = useMemo(() => accessibleLocations(profile), [profile]);
  const allowAllStores = hasAllLocationAccess(profile);

  const setDashboardTab = useCallback(
    (tab: DashboardTab, opts?: { drivers?: boolean; categories?: boolean }) => {
      const href = dashboardPath(tab, opts);
      router.push(href, { scroll: false });
      setSidebarOpen(false);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [router],
  );

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => drawerCloseRef.current?.focus(), 50);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      menuButtonRef.current?.focus();
    };
  }, [sidebarOpen]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved === "1") setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    if (!sidebarReady) return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed, sidebarReady]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    if (canAccessLocation(profile, branchId)) {
      setLocationFilter(branchId);
    }
  }, [branchId, profile]);

  useEffect(() => {
    if (!requestedAllowed && pathname.startsWith("/dashboard")) {
      const fallback = tabs[0]?.id ?? "overview";
      if (route.section !== fallback) {
        router.replace(dashboardPath(fallback));
      }
    }
  }, [pathname, requestedAllowed, route.section, router, tabs]);

  useEffect(() => {
    if (locationFilter === "all") {
      if (!allowAllStores && stores[0]) setLocationFilter(stores[0].id);
      return;
    }
    if (!canAccessLocation(profile, locationFilter) && stores[0]) {
      setLocationFilter(stores[0].id);
    }
  }, [allowAllStores, locationFilter, profile, stores]);

  const posRegisterStoreId =
    locationFilter !== "all" && getLocationById(locationFilter)
      ? locationFilter
      : stores[0]?.id ?? "";

  const firstName = profile.name.split(" ")[0];

  const setLocation = (id: LocationFilter) => {
    setLocationFilter(id);
    if (id !== "all") setBranch(id);
  };

  const activeTabMeta = tabs.find((tab) => tab.id === dashboardTab) ?? tabs[0];
  const ActiveIcon = activeTabMeta?.icon ?? TrendingUp;

  const selectTab = (tab: DashboardTab) => {
    if (
      (tab === "inventory" || tab === "pos") &&
      (locationFilter === "all" || !getLocationById(locationFilter))
    ) {
      const fallback =
        (canAccessLocation(profile, branchId) ? branchId : null) ?? stores[0]?.id;
      if (fallback) setLocation(fallback);
    }
  };

  const renderNav = (opts?: { onNavigate?: () => void; collapsed?: boolean }) => {
    const collapsed = Boolean(opts?.collapsed);
    return (
      <nav className="flex min-h-0 flex-1 flex-col" aria-label="Dashboard sections">
        <div
          className={cn(
            "min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-4",
            collapsed ? "space-y-3 px-2" : "px-3",
          )}
        >
          {TAB_GROUPS.map((group) => {
            const items = tabs.filter(
              (tab) => tab.group === group.id && tab.id !== "profile",
            );
            if (!items.length) return null;
            return (
              <div key={group.id}>
                {collapsed ? (
                  <div
                    className="mx-auto mb-2 h-px w-6 bg-white/10"
                    aria-hidden
                  />
                ) : (
                  <p className="mb-1.5 px-2.5 text-[10px] uppercase tracking-[0.2em] text-gold/80">
                    {group.label}
                  </p>
                )}
                <ul className={cn("space-y-0.5", collapsed && "space-y-1")}>
                  {items.map((tab) => {
                    const active = dashboardTab === tab.id;
                    const Icon = tab.icon;
                    return (
                      <li key={tab.id}>
                        <Link
                          href={dashboardPath(tab.id)}
                          title={collapsed ? tab.label : undefined}
                          aria-label={tab.label}
                          onClick={() => {
                            selectTab(tab.id);
                            opts?.onNavigate?.();
                          }}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative flex min-h-11 cursor-pointer items-center rounded-sm text-left touch-manipulation transition",
                            collapsed
                              ? "w-full justify-center px-0 py-2"
                              : "w-full gap-3 px-2.5 py-2",
                            active
                              ? collapsed
                                ? "bg-(--gold)/12 text-cream"
                                : "bg-(--gold)/12 text-cream shadow-[inset_3px_0_0_0_var(--gold)]"
                              : "text-muted hover:bg-white/[0.04] hover:text-cream",
                          )}
                        >
                          {collapsed && active ? (
                            <span
                              className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-(--gold)"
                              aria-hidden
                            />
                          ) : null}
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border transition",
                              active
                                ? "border-(--gold)/40 bg-(--gold)/15 text-gold"
                                : "border-white/10 bg-white/[0.03] text-muted group-hover:border-white/20 group-hover:text-cream",
                            )}
                          >
                            <Icon size={15} />
                          </span>
                          {!collapsed ? (
                            <span className="min-w-0">
                              <span className="block truncate text-sm tracking-wide">
                                {tab.label}
                              </span>
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        <div className={cn("shrink-0 border-t border-white/10", collapsed ? "p-2" : "p-3")}>
          <Link
            href={dashboardPath("profile")}
            title={collapsed ? "Profile" : undefined}
            aria-label="Profile"
            aria-current={dashboardTab === "profile" ? "page" : undefined}
            onClick={() => {
              opts?.onNavigate?.();
            }}
            className={cn(
              "flex cursor-pointer items-center rounded-sm border touch-manipulation transition",
              collapsed
                ? "mx-auto min-h-11 w-11 justify-center p-0"
                : "w-full min-h-12 gap-3 px-2.5 py-2 text-left",
              dashboardTab === "profile"
                ? "border-(--gold)/40 bg-(--gold)/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20",
            )}
          >
            <UserAvatar name={profile.name} src={profile.avatarUrl} size={collapsed ? 32 : 36} />
            {!collapsed ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-cream">{profile.name}</span>
                <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.14em] text-muted">
                  {roleLabel(profile.role)}
                </span>
              </span>
            ) : null}
          </Link>
        </div>
      </nav>
    );
  };

  const pageTitle =
    dashboardTab === "overview"
      ? `${firstName}'s command center`
      : activeTabMeta?.label ?? "Dashboard";
  const pageDescription =
    dashboardTab === "overview" && isMobile
      ? "Pick a location, then tap charts for store details."
      : activeTabMeta?.description ?? "";

  return (
    <div className="relative min-h-[100dvh]">
      <div className="pointer-events-none absolute inset-0 ambient-bg opacity-70" />
      <div className="pointer-events-none absolute inset-0 luxury-grid opacity-35" />

      {/* Desktop / large tablet sidebar */}
      <aside
        className={cn(
          "fixed bottom-0 left-0 z-30 hidden border-r border-white/10 bg-[#090909]/95 backdrop-blur-xl lg:flex lg:flex-col",
          HEADER_TOP,
          SIDEBAR_HEIGHT,
          sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
          sidebarReady && "transition-[width] duration-150 ease-out",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center border-b border-white/10",
            CHROME_HEADER_H,
            sidebarCollapsed ? "justify-center px-2" : "px-4 xl:px-5",
          )}
        >
          {sidebarCollapsed ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-sm border border-white/10 bg-white/[0.02] text-muted transition hover:border-(--gold)/40 hover:bg-white/[0.04] hover:text-gold"
              >
                <PanelLeftOpen size={16} />
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase leading-none tracking-[0.22em] text-gold">
                  {roleLabel(profile.role)}
                </p>
                <p className="mt-1.5 truncate font-display text-xl leading-none text-cream">
                  Command center
                </p>
              </div>
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-white/10 bg-white/[0.02] text-muted transition hover:border-(--gold)/40 hover:bg-white/[0.04] hover:text-gold"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
          )}
        </div>
        {renderNav({ collapsed: sidebarCollapsed })}
      </aside>

      {/* Mobile / tablet top bar */}
      <div
        className={cn(
          "sticky z-30 border-b border-white/10 bg-[#090909]/92 backdrop-blur-xl lg:hidden",
          HEADER_TOP,
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            ref={menuButtonRef}
            aria-label="Open dashboard menu"
            aria-expanded={sidebarOpen}
            aria-controls="dashboard-mobile-menu"
            onClick={() => setSidebarOpen(true)}
            className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-sm border border-white/10 text-cream touch-manipulation hover:border-white/20"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-gold">
              {roleLabel(profile.role)} · {activeTabMeta?.label}
            </p>
            <p className="truncate font-display text-lg leading-tight text-cream sm:text-xl">
              {pageTitle}
            </p>
          </div>
          <DashboardTopBar profile={profile} compact />
        </div>
      </div>

      {/* Mobile drawer — always expanded labels */}
      <AnimatePresence>
        {sidebarOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              ref={drawerRef}
              id="dashboard-mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard menu"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              className={cn(
                "fixed bottom-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-white/10 bg-[#0a0a0a] shadow-[20px_0_60px_rgba(0,0,0,0.55)] lg:hidden",
                HEADER_TOP,
                SIDEBAR_HEIGHT,
              )}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold">
                    {roleLabel(profile.role)}
                  </p>
                  <p className="mt-1 font-display text-xl text-cream">Menu</p>
                </div>
                <button
                  type="button"
                  ref={drawerCloseRef}
                  aria-label="Close dashboard menu"
                  onClick={() => setSidebarOpen(false)}
                  className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-sm border border-white/10 text-muted touch-manipulation hover:text-cream"
                >
                  <X size={18} />
                </button>
              </div>
              {renderNav({ onNavigate: () => setSidebarOpen(false), collapsed: false })}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* Main content */}
      <div
        className={cn(
          "relative pl-0",
          sidebarCollapsed ? CONTENT_PAD_COLLAPSED : CONTENT_PAD_EXPANDED,
          sidebarReady && "transition-[padding] duration-150 ease-out",
        )}
      >
        {/* Desktop top chrome — notifications + account (storefront header stays off dashboard) */}
        <div
          className={cn(
            "sticky z-20 hidden border-b border-white/10 bg-[#090909]/92 backdrop-blur-xl lg:block",
            HEADER_TOP,
            CHROME_HEADER_H,
          )}
        >
          <div className={cn("flex h-full items-center px-6 xl:px-10 2xl:px-12")}>
            <DashboardTopBar profile={profile} />
          </div>
        </div>

        <div
          className={cn(
            "w-full min-w-0 overflow-x-clip px-3 sm:px-5 md:px-6 lg:px-8 xl:px-10 2xl:px-12",
            dashboardTab === "pos" ? "py-4 md:py-5 lg:py-6" : "py-5 sm:py-6 md:py-8",
          )}
        >
          {/* Desktop page header — panels with action headers skip this */}
          {!["users", "inventory", "locations", "events", "activity", "orders", "transfers", "customers", "promotions", "loyalty", "deliveries"].includes(
            dashboardTab,
          ) ? (
            <header
              className={cn(
                "mb-6 hidden lg:block",
                dashboardTab === "pos" && "mb-4",
              )}
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0 max-w-3xl">
                  <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-gold">
                    <ActiveIcon size={12} className="text-gold" aria-hidden />
                    {roleLabel(profile.role)} · {activeTabMeta?.label}
                  </p>
                  <h1 className="mt-2.5 wrap-break-word font-display text-[2rem] leading-[1.15] text-cream xl:text-4xl">
                    {pageTitle}
                  </h1>
                  {pageDescription ? (
                    <p className="mt-2.5 text-sm leading-relaxed text-muted">{pageDescription}</p>
                  ) : null}
                </div>

                {dashboardTab === "pos" && stores.length > 0 ? (
                  <div className="flex shrink-0 flex-col items-stretch gap-1.5 border-l border-white/10 pl-5">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
                      Selling from
                    </p>
                    <label className="block w-[11.5rem]">
                      <span className="sr-only">Change store</span>
                      <NativeSelect
                        id="pos-header-store"
                        value={posRegisterStoreId}
                        onChange={(e) => setLocation(e.target.value)}
                        className="border-white/15 py-2 pl-3 hover:border-white/15 focus:border-(--gold)/45"
                      >
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.shortName}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  </div>
                ) : null}
              </div>
            </header>
          ) : null}

          {/* Mobile description (title lives in sticky bar) */}
          {dashboardTab !== "pos" &&
          !["users", "inventory", "locations", "events", "reviews", "support", "activity", "orders", "transfers", "customers", "promotions", "loyalty", "deliveries"].includes(
            dashboardTab,
          ) &&
          pageDescription ? (
            <p className="mb-4 text-sm text-muted lg:hidden">{pageDescription}</p>
          ) : null}

          {dashboardTab === "pos" ? (
          <PosPanel
            locationId={
              locationFilter !== "all" && getLocationById(locationFilter)
                ? locationFilter
                : stores[0]?.id ?? branchId
            }
            onLocationChange={setLocation}
          />
        ) : dashboardTab === "orders" ? (
          <OrdersPanel
            locationId={locationFilter}
            onLocationChange={setLocation}
            locations={stores}
          />
        ) : dashboardTab === "inventory" ? (
          <InventoryPanel
            locationId={locationFilter}
            onLocationChange={setLocation}
            locations={stores}
            initialView={openCategoriesInInventory ? "categories" : "stock"}
          />
        ) : dashboardTab === "transfers" ? (
          <TransfersPanel locations={stores} />
        ) : dashboardTab === "locations" ? (
          <LocationsPanel />
        ) : dashboardTab === "events" ? (
          <EventsPanel />
        ) : dashboardTab === "reviews" ? (
          <ReviewsPanel />
        ) : dashboardTab === "support" ? (
          <SupportPanel />
        ) : dashboardTab === "deliveries" ? (
          <DeliveriesPanel />
        ) : dashboardTab === "customers" ? (
          <CustomersPanel />
        ) : dashboardTab === "promotions" ? (
          <PromotionsPanel />
        ) : dashboardTab === "loyalty" ? (
          <LoyaltyPanel />
        ) : dashboardTab === "activity" ? (
          <ActivityLogsPanel />
        ) : dashboardTab === "cron" ? (
          <CronJobsPanel />
        ) : dashboardTab === "users" ? (
          <UsersPanel />
        ) : dashboardTab === "profile" ? (
          <ProfilePanel />
        ) : (
          <>
            <OverviewAnalyticsPanel
              locationId={locationFilter}
              onLocationChange={setLocation}
              locations={stores}
              allowAll={allowAllStores}
            />
          </>
        )}
        </div>
      </div>
    </div>
  );
}
