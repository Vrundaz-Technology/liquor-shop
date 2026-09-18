"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Heart,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  Package,
  Headphones,
  Shield,
  Star,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useUserStore } from "@/store/user";
import { useCartStore } from "@/store/cart";
import { switchShoppingStore } from "@/lib/switch-store";
import { useCartFeedbackStore } from "@/store/cart-feedback";
import { isDemoAccountEmail, isStaffRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { Select } from "@/components/ui/Select";
import { LoyaltyMemberCard } from "@/components/dashboard/LoyaltyMemberCard";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { getAllLocations } from "@/data/locations";
import { getCategories } from "@/data/categories";
import { cn } from "@/lib/utils";
import {
  MobileSortBar,
  SortableTh,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
  compareValues,
} from "@/components/ui/SortableTh";
import { useDeliveryStore } from "@/store/delivery";
import { CustomerAddressesPanel } from "@/components/account/CustomerAddressesPanel";
import { CustomerOrdersList } from "@/components/account/CustomerOrdersList";
import { AccountOverviewCharts } from "@/components/account/AccountOverviewCharts";
import { CustomerOrderDetail } from "@/components/orders/CustomerOrderDetail";
import { CustomerSupportCenter } from "@/components/support/CustomerSupportCenter";
import type { UserPreferences, UserProfile } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { apiLoyaltyMember } from "@/lib/api-mutations";
import { isDbConnected } from "@/lib/runtime-data";
import { useBranchStore } from "@/store/branch";

type Address = UserProfile["addresses"][number];
type TabId = "overview" | "orders" | "addresses" | "stores" | "loyalty" | "support" | "profile";

const ACCOUNT_TABS: TabId[] = [
  "overview",
  "orders",
  "addresses",
  "stores",
  "loyalty",
  "support",
  "profile",
];

function isAccountTab(value: string | null): value is TabId {
  return value != null && (ACCOUNT_TABS as string[]).includes(value);
}

const HEADER_TOP =
  "top-[calc(3.75rem+env(safe-area-inset-top,0px))] sm:top-[calc(4.5rem+env(safe-area-inset-top,0px))]";
const SIDEBAR_HEIGHT =
  "h-[calc(100dvh-3.75rem-env(safe-area-inset-top,0px))] sm:h-[calc(100dvh-4.5rem-env(safe-area-inset-top,0px))]";
const SIDEBAR_WIDTH = "w-[15.5rem] xl:w-[16.5rem]";
const CONTENT_PAD = "lg:pl-[15.5rem] xl:pl-[16.5rem]";

function LoyaltyAccountSection({
  birthday,
  setBirthday,
}: {
  birthday: string;
  setBirthday: (value: string) => void;
}) {
  const profile = useUserStore((s) => s.profile);
  const branchId = useBranchStore((s) => s.branchId);
  const historyQuery = useQuery({
    queryKey: ["loyalty-member-history", branchId],
    enabled: isDbConnected(),
    staleTime: 30_000,
    queryFn: () => apiLoyaltyMember({ locationId: branchId, history: true }),
  });
  const {
    sortKey,
    sortDir,
    toggleSort,
  } = useTableSort<"activity" | "order" | "date" | "points">("date", "desc", ["date", "points"]);

  const balance = historyQuery.data?.balance ?? profile.loyaltyPoints;
  const tier = historyQuery.data?.tier ?? profile.loyaltyTier;
  const program = historyQuery.data?.program;
  const entries = historyQuery.data?.entries ?? [];
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      switch (sortKey) {
        case "activity":
          return compareValues(a.reasonLabel ?? a.reason, b.reasonLabel ?? b.reason, sortDir);
        case "order":
          return compareValues(a.orderId ?? "", b.orderId ?? "", sortDir);
        case "points":
          return compareValues(a.delta, b.delta, sortDir);
        case "date":
        default:
          return compareValues(a.createdAt, b.createdAt, sortDir);
      }
    });
  }, [entries, sortDir, sortKey]);

  return (
    <SectionCard
      eyebrow="Rewards"
      title="Loyalty points"
      description="Earn on every order. Share your code. Claim birthday bonuses. History is for your current store’s program."
    >
      <LoyaltyMemberCard birthdayValue={birthday} onBirthdayChange={setBirthday} />
      <div className="mt-4 rounded-sm border border-white/10 bg-black/20 p-3 text-sm text-muted">
        Balance <span className="text-cream">{balance.toLocaleString()} pts</span>
        {" · "}
        Tier <span className="text-gold">{tier}</span>
        {program ? (
          <>
            {" · "}
            {program.pointsPerDollar} pt/$ · redeem {Math.round(program.redeemRate * 100)}¢/pt
          </>
        ) : null}
        {" · "}
        Redeem in your{" "}
        <Link href="/cart" className="text-gold hover:underline">
          cart
        </Link>
        .
      </div>

      <div className="mt-5">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Your loyalty history</p>
        {historyQuery.isLoading ? (
          <p className="mt-2 text-sm text-muted">Loading history…</p>
        ) : historyQuery.error ? (
          <p className="mt-2 text-sm text-(--danger)">Could not load history.</p>
        ) : !entries.length ? (
          <p className="mt-2 text-sm text-muted">No points activity yet — place an order to start earning.</p>
        ) : (
          <>
            <MobileSortBar
              className="mt-3 xl:hidden"
              columns={[
                { key: "activity", label: "Activity" },
                { key: "order", label: "Order" },
                { key: "date", label: "Date" },
                { key: "points", label: "Points" },
              ]}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <ul className="mt-3 space-y-2 xl:hidden">
              {sortedEntries.map((entry) => (
                <li key={entry.id} className="rounded-sm border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-cream">{entry.reasonLabel ?? entry.reason}</p>
                    <p
                      className={cn(
                        "shrink-0 text-sm tabular-nums font-medium",
                        entry.delta >= 0 ? "text-gold" : "text-cream",
                      )}
                    >
                      {entry.delta >= 0 ? "+" : ""}
                      {entry.delta.toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(entry.createdAt).toLocaleString()}
                    {entry.orderId ? ` · ${entry.orderId}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <div className={cn(tableWrapClass, "mt-3 hidden xl:block")}>
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <SortableTh label="Activity" column="activity" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Order" column="order" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Date" column="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Points" column="points" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => (
                  <tr key={entry.id} className={tableRowClass}>
                    <td className={cn(tableCellClass, "text-cream")}>
                      {entry.reasonLabel ?? entry.reason}
                    </td>
                    <td className={tableCellClass}>
                      {entry.orderId ? (
                        <Link
                          href={`/account?tab=orders&order=${encodeURIComponent(entry.orderId)}`}
                          className="text-cream hover:text-gold"
                        >
                          {entry.orderId}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td
                      className={cn(
                        tableCellClass,
                        "text-right tabular-nums font-medium",
                        entry.delta >= 0 ? "text-gold" : "text-cream",
                      )}
                    >
                      {entry.delta >= 0 ? "+" : ""}
                      {entry.delta.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
  action,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const hasHead = Boolean(eyebrow || title || description || action);
  return (
    <section className="min-w-0 border border-white/10 bg-black/20 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      {hasHead ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className={cn("font-display text-xl text-cream sm:text-2xl", eyebrow && "mt-1")}>
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    isLoggedIn,
    profile,
    logout,
    updateProfile,
    setPreferredBranch,
    authReady,
    loadOrdersIntoProfile,
  } = useUserStore();
  const reorderItems = useCartStore((s) => s.reorderItems);
  const setFulfillment = useCartStore((s) => s.setFulfillment);
  const enrich = useDeliveryStore((s) => s.enrich);
  const stores = getAllLocations();
  const categories = getCategories();

  const [tab, setTab] = useState<TabId>(() => {
    const fromQuery = searchParams.get("tab");
    return isAccountTab(fromQuery) ? fromQuery : "overview";
  });
  const [supportOrderId, setSupportOrderId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [birthday, setBirthday] = useState(profile.birthday ?? "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [addresses, setAddresses] = useState<Address[]>(profile.addresses ?? []);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences>(profile.preferences ?? {});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [reorderMsg, setReorderMsg] = useState("");
  const demoLocked = isDemoAccountEmail(profile.email);

  useEffect(() => {
    if (authReady && !isLoggedIn) router.replace("/login?next=/account");
  }, [authReady, isLoggedIn, router]);

  useEffect(() => {
    const fromQuery = searchParams.get("tab");
    if (isAccountTab(fromQuery)) setTab(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
    setAvatarUrl(profile.avatarUrl ?? "");
    setBirthday(profile.birthday ?? "");
    setAddresses(profile.addresses ?? []);
    setPrefs(profile.preferences ?? {});
  }, [
    profile.name,
    profile.email,
    profile.avatarUrl,
    profile.birthday,
    profile.addresses,
    profile.preferences,
  ]);

  useEffect(() => {
    if (!authReady || !isLoggedIn) return;
    let cancelled = false;
    setOrdersLoading(true);
    void loadOrdersIntoProfile().finally(() => {
      if (!cancelled) setOrdersLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, isLoggedIn, loadOrdersIntoProfile]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  const preferredStore =
    stores.find((s) => s.id === profile.preferredBranchId) ?? stores[0] ?? null;

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: "Overview", icon: LayoutGrid, description: "Loyalty, orders, spend trends, and your home store." },
        { id: "orders" as const, label: "Orders", icon: Package, description: "Track status and reorder favorites in one tap." },
        { id: "addresses" as const, label: "Addresses", icon: MapPin, description: "Saved delivery addresses for faster checkout." },
        { id: "stores" as const, label: "Store & prefs", icon: Store, description: "Home store and shopping preferences." },
        { id: "loyalty" as const, label: "Loyalty", icon: Star, description: "Points, birthday rewards, and referrals." },
        { id: "support" as const, label: "Support", icon: Headphones, description: "Open tickets for orders, delivery, refunds, and more." },
        { id: "profile" as const, label: "Profile", icon: UserRound, description: "Photo, name, email, and password." },
      ] as const,
    [],
  );

  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];
  const ActiveIcon = activeTab.icon;
  const firstName = profile.name.split(" ")[0] || "Your account";

  const selectTab = (id: TabId) => {
    setTab(id);
    if (id !== "support") setSupportOrderId("");
    setMessage("");
    setError("");
    setSidebarOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "overview") params.delete("tab");
    else params.set("tab", id);
    params.delete("order");
    const qs = params.toString();
    router.replace(qs ? `/account?${qs}` : "/account", { scroll: false });
  };

  const setOrderParam = (orderId: string | null) => {
    setTab("orders");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "orders");
    if (orderId) params.set("order", orderId);
    else params.delete("order");
    router.replace(`/account?${params.toString()}`, { scroll: false });
  };

  const selectedOrderId = searchParams.get("order");
  const viewingOrder = tab === "orders" && Boolean(selectedOrderId);
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    const raw = profile.orders.find((o) => o.id === selectedOrderId);
    return raw ? enrich(raw) : null;
  }, [selectedOrderId, profile.orders, enrich]);

  useEffect(() => {
    if (tab === "orders" && selectedOrderId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [tab, selectedOrderId]);

  if (!authReady || !isLoggedIn) {
    return (
      <div className="px-4 py-24 text-center text-sm text-muted">Loading account…</div>
    );
  }

  const flash = (ok: string) => {
    setMessage(ok);
    setError("");
  };
  const flashErr = (msg: string) => {
    setError(msg);
    setMessage("");
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (password && !currentPassword) {
      flashErr("Enter your current password to set a new one.");
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
      flash("Profile saved.");
    } catch (err) {
      flashErr(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  };

  const saveAddresses = async (next: Address[]) => {
    setBusy(true);
    try {
      const normalized = next.map((a, idx) => ({
        ...a,
        label: a.label.trim() || `Address ${idx + 1}`,
        line1: a.line1.trim(),
        city: a.city.trim(),
        state: a.state.trim(),
        zip: a.zip.trim(),
      }));
      if (normalized.some((a) => !a.line1 || !a.city || !a.state || !a.zip)) {
        throw new Error("Complete street, city, state, and ZIP for each address.");
      }
      if (normalized.some((a) => !/^\d{5}(-\d{4})?$/.test(a.zip))) {
        throw new Error("Use a 5-digit ZIP (or ZIP+4).");
      }
      let defaults = normalized;
      if (!defaults.some((a) => a.isDefault) && defaults[0]) {
        defaults = defaults.map((a, i) => ({ ...a, isDefault: i === 0 }));
      }
      await updateProfile({ addresses: defaults });
      setAddresses(defaults);
      setEditingAddress(null);
      flash("Addresses saved.");
    } catch (err) {
      flashErr(err instanceof Error ? err.message : "Could not save addresses.");
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    setBusy(true);
    try {
      await updateProfile({
        preferences: prefs,
        preferredBranchId: profile.preferredBranchId,
      });
      if (prefs.defaultFulfillment) setFulfillment(prefs.defaultFulfillment);
      flash("Preferences saved.");
    } catch (err) {
      flashErr(err instanceof Error ? err.message : "Could not save preferences.");
    } finally {
      setBusy(false);
    }
  };

  const onReorder = (orderId: string) => {
    const order = profile.orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.locationId) {
      switchShoppingStore(order.locationId);
      setPreferredBranch(order.locationId);
    }
    if (order.fulfillment === "pickup" || order.fulfillment === "delivery") {
      setFulfillment(order.fulfillment);
    }
    const result = reorderItems(
      order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    );
    if (result.added === 0) {
      setReorderMsg("Those bottles are out of stock at this store right now.");
      return;
    }
    const msg = result.skipped
      ? `Added ${result.added} item(s). ${result.skipped} unavailable at this store.`
      : `Added ${result.added} item(s) to your cart.`;
    setReorderMsg(msg);
    useCartFeedbackStore.getState().notifyInfo(msg);
    router.push("/cart");
  };

  const renderNav = (opts?: { onNavigate?: () => void }) => (
    <nav className="flex min-h-0 flex-1 flex-col" aria-label="Account sections">
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  selectTab(t.id);
                  opts?.onNavigate?.();
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-11 w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left touch-manipulation transition",
                  active
                    ? "bg-(--gold)/12 text-cream shadow-[inset_3px_0_0_0_var(--gold)]"
                    : "text-muted hover:bg-white/[0.04] hover:text-cream",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border transition",
                    active
                      ? "border-(--gold)/40 bg-(--gold)/15 text-gold"
                      : "border-white/10 bg-white/[0.03] text-muted group-hover:border-white/20 group-hover:text-cream",
                  )}
                >
                  <Icon size={15} aria-hidden />
                </span>
                <span className="min-w-0 truncate text-sm tracking-wide">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 space-y-2 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <UserAvatar name={profile.name} src={profile.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-cream">{profile.name}</p>
            <p className="truncate text-[11px] text-gold">
              {profile.loyaltyPoints.toLocaleString()} pts · {profile.loyaltyTier}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/wishlist" className="min-w-0" onClick={opts?.onNavigate}>
            <Button size="sm" variant="secondary" className="w-full">
              <Heart size={14} />
              Wishlist
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await logout();
              window.location.assign("/login");
            }}
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
        {isStaffRole(profile) ? (
          <Link href="/dashboard" className="block" onClick={opts?.onNavigate}>
            <Button size="sm" variant="secondary" className="w-full">
              <Shield size={14} />
              Dashboard
            </Button>
          </Link>
        ) : null}
      </div>
    </nav>
  );

  return (
    <div className="relative min-h-[calc(100dvh-3.75rem-env(safe-area-inset-top,0px))] sm:min-h-[calc(100dvh-4.5rem-env(safe-area-inset-top,0px))]">
      <div className="pointer-events-none absolute inset-0 ambient-bg opacity-70" />
      <div className="pointer-events-none absolute inset-0 luxury-grid opacity-35" />

      {/* Desktop sidebar — fixed edge-to-edge under site header */}
      <aside
        className={cn(
          "fixed bottom-0 left-0 z-30 hidden border-r border-white/10 bg-[#090909]/95 backdrop-blur-xl lg:flex lg:flex-col",
          HEADER_TOP,
          SIDEBAR_HEIGHT,
          SIDEBAR_WIDTH,
        )}
      >
        <div className="shrink-0 border-b border-white/10 px-4 py-4 xl:px-5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Account</p>
          <p className="mt-1 font-display text-xl leading-tight text-cream xl:text-2xl">
            {firstName}
          </p>
          <p className="mt-1 truncate text-xs text-muted">{profile.email}</p>
        </div>
        {renderNav()}
      </aside>

      {/* Mobile top bar — hidden on order detail (that view has its own back row) */}
      {!viewingOrder ? (
      <div
        className={cn(
          "sticky z-30 border-b border-white/10 bg-[#090909]/92 backdrop-blur-xl lg:hidden",
          HEADER_TOP,
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
          <button
            type="button"
            aria-label="Open account menu"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-white/10 text-cream touch-manipulation hover:border-white/20"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-gold">
              Account
            </p>
            <p className="truncate font-display text-lg leading-tight text-cream sm:text-xl">
              {activeTab.label}
            </p>
          </div>
          <UserAvatar name={profile.name} src={profile.avatarUrl} size={36} />
        </div>
      </div>
      ) : null}

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
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2 }}
              className={cn(
                "fixed left-0 z-50 flex flex-col border-r border-white/10 bg-[#090909] lg:hidden",
                HEADER_TOP,
                SIDEBAR_HEIGHT,
                SIDEBAR_WIDTH,
              )}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Account</p>
                  <p className="mt-1 truncate font-display text-xl text-cream">{firstName}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setSidebarOpen(false)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-white/10 text-muted touch-manipulation hover:text-cream"
                >
                  <X size={18} />
                </button>
              </div>
              {renderNav({ onNavigate: () => setSidebarOpen(false) })}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {/* Main content — full remaining width */}
      <div className={cn("relative pl-0", CONTENT_PAD)}>
        <div
          className={cn(
            "w-full min-w-0 px-4 sm:px-6 lg:px-8 xl:px-10",
            viewingOrder ? "py-4 sm:py-5" : "py-5 sm:py-6",
          )}
        >
          {!viewingOrder ? (
            <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div className="min-w-0">
                <p className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-gold lg:flex">
                  <ActiveIcon size={12} aria-hidden />
                  Account · {activeTab.label}
                </p>
                <h1 className="hidden font-display text-3xl text-cream lg:mt-1.5 lg:block">
                  {activeTab.label}
                </h1>
                <p className="max-w-xl text-sm text-muted">{activeTab.description}</p>
              </div>
            </header>
          ) : null}

          {(message || error) && (
            <div
              role="status"
              className={cn(
                "mb-4 flex items-start gap-2.5 rounded-sm border px-3 py-2.5 text-sm",
                message
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                  : "border-red-500/25 bg-red-500/10 text-red-200",
              )}
            >
              {message ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
              )}
              <p>{message || error}</p>
            </div>
          )}

          <div className="space-y-5">
          {tab === "overview" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Loyalty",
                    value: `${profile.loyaltyPoints.toLocaleString()} pts`,
                    sub: profile.loyaltyTier,
                    icon: Star,
                  },
                  {
                    label: "Orders",
                    value: String(profile.orders.length),
                    sub: "Lifetime",
                    icon: Package,
                  },
                  {
                    label: "Home store",
                    value: preferredStore?.shortName ?? "—",
                    sub: preferredStore?.city ?? "Choose a store",
                    icon: Store,
                  },
                  {
                    label: "Addresses",
                    value: String(profile.addresses.length),
                    sub: "Saved for checkout",
                    icon: MapPin,
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-sm border border-white/10 bg-black/25 p-4"
                  >
                    <div className="flex items-center gap-2 text-muted">
                      <card.icon size={14} className="text-gold" />
                      <p className="text-[10px] uppercase tracking-[0.14em]">{card.label}</p>
                    </div>
                    <p className="mt-2 truncate font-display text-xl text-cream">{card.value}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{card.sub}</p>
                  </div>
                ))}
              </div>

              <AccountOverviewCharts orders={profile.orders} />

              <SectionCard
                eyebrow="Quick actions"
                title="Keep shopping simple"
                description="Jump to the things you use most."
              >
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button type="button" variant="secondary" onClick={() => setTab("orders")}>
                    View orders
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setTab("addresses")}>
                    Manage addresses
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setTab("loyalty")}>
                    Loyalty & rewards
                  </Button>
                </div>
              </SectionCard>
            </>
          ) : null}

          {tab === "orders" && selectedOrder ? (
            <CustomerOrderDetail
              order={selectedOrder}
              onBack={() => setOrderParam(null)}
              onReorder={() => onReorder(selectedOrder.id)}
              onHelp={() => {
                setSupportOrderId(selectedOrder.id);
                selectTab("support");
              }}
            />
          ) : tab === "orders" ? (
            <SectionCard>
              <p className="mb-4 text-xs text-muted">
                Have a tracking code?{" "}
                <Link href="/track" className="text-gold hover:underline">
                  Track an order
                </Link>
              </p>
              {reorderMsg ? <p className="mb-3 text-sm text-gold">{reorderMsg}</p> : null}
              {ordersLoading && profile.orders.length === 0 ? (
                <p className="text-sm text-muted">Loading orders…</p>
              ) : selectedOrderId && !selectedOrder && !ordersLoading ? (
                <div className="rounded-sm border border-dashed border-white/15 px-4 py-10 text-center">
                  <p className="text-sm text-cream">That order isn’t in your history.</p>
                  <Button size="sm" className="mt-3" onClick={() => setOrderParam(null)}>
                    Back to orders
                  </Button>
                </div>
              ) : profile.orders.length === 0 ? (
                <div className="rounded-sm border border-dashed border-white/15 px-4 py-10 text-center">
                  <p className="text-sm text-cream">No orders yet</p>
                  <Link href="/shop" className="mt-3 inline-block">
                    <Button size="sm">Browse the shop</Button>
                  </Link>
                </div>
              ) : (
                <CustomerOrdersList
                  orders={profile.orders.map((raw) => enrich(raw))}
                  onOpen={setOrderParam}
                  onReorder={onReorder}
                  onHelp={(orderId) => {
                    setSupportOrderId(orderId);
                    selectTab("support");
                  }}
                />
              )}
            </SectionCard>
          ) : null}

          {tab === "addresses" ? (
            <SectionCard>
              <CustomerAddressesPanel
                addresses={addresses}
                editing={editingAddress}
                busy={busy}
                onEdit={setEditingAddress}
                onChangeDraft={setEditingAddress}
                onSave={(next) => void saveAddresses(next)}
              />
            </SectionCard>
          ) : null}

          {tab === "stores" ? (
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Select
                    label="Preferred store"
                    value={profile.preferredBranchId || stores[0]?.id || ""}
                    onChange={(id) => {
                      switchShoppingStore(id);
                      setPreferredBranch(id);
                      flash("Preferred store updated.");
                    }}
                    options={stores.map((s) => ({
                      value: s.id,
                      label: `${s.shortName} · ${s.city}`,
                    }))}
                  />
                </div>
                <div>
                  <Select
                    label="Default fulfillment"
                    value={prefs.defaultFulfillment ?? "delivery"}
                    onChange={(v) =>
                      setPrefs((p) => ({
                        ...p,
                        defaultFulfillment: v as "delivery" | "pickup",
                      }))
                    }
                    options={[
                      { value: "delivery", label: "Delivery" },
                      { value: "pickup", label: "Pickup" },
                    ]}
                  />
                </div>
                <div>
                  <Select
                    label="Favorite category"
                    value={prefs.favoriteCategory ?? ""}
                    onChange={(v) =>
                      setPrefs((p) => ({
                        ...p,
                        favoriteCategory: v || null,
                      }))
                    }
                    options={[
                      { value: "", label: "No preference" },
                      ...categories.map((c) => ({ value: c.slug, label: c.name })),
                    ]}
                  />
                </div>
              </div>
              <div className="mt-4 space-y-1">
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.orderEmailUpdates !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, orderEmailUpdates: e.target.checked }))
                    }
                  />
                  Email me order status updates
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.smsUpdates !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, smsUpdates: e.target.checked }))
                    }
                  />
                  Text me order status updates
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.pushUpdates ?? false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, pushUpdates: e.target.checked }))
                    }
                  />
                  Push notifications (when enabled on this device)
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.marketingEmails ?? false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, marketingEmails: e.target.checked }))
                    }
                  />
                  Promotional offers and new arrivals
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.loyaltyAlerts !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, loyaltyAlerts: e.target.checked }))
                    }
                  />
                  Loyalty rewards updates
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.backInStockAlerts !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, backInStockAlerts: e.target.checked }))
                    }
                  />
                  Back-in-stock alerts
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.priceAlerts !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, priceAlerts: e.target.checked }))
                    }
                  />
                  Price and promotion alerts
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.abandonedCartReminders !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, abandonedCartReminders: e.target.checked }))
                    }
                  />
                  Abandoned cart reminders
                </label>
              </div>
              <Button type="button" size="sm" className="mt-5" loading={busy} onClick={() => void savePrefs()}>
                Save preferences
              </Button>
            </SectionCard>
          ) : null}

          {tab === "loyalty" ? (
            <LoyaltyAccountSection birthday={birthday} setBirthday={setBirthday} />
          ) : null}

          {tab === "support" ? (
            <SectionCard>
              <CustomerSupportCenter
                compact
                defaultOrderId={supportOrderId || undefined}
                defaultCategory="order_issue"
              />
            </SectionCard>
          ) : null}

          {tab === "profile" ? (
            <SectionCard>
              <form className="space-y-5" onSubmit={saveProfile}>
                <AvatarUpload
                  name={name}
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                  onPersist={async (next) => {
                    try {
                      await updateProfile({ avatarUrl: next || null });
                      setAvatarUrl(next);
                      flash(next ? "Profile photo saved." : "Profile photo removed.");
                    } catch (err) {
                      flashErr(
                        err instanceof Error ? err.message : "Could not save profile photo.",
                      );
                      throw err;
                    }
                  }}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-muted">
                    Full name
                    <Input
                      className="mt-1"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    Email
                    <Input
                      className="mt-1"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={demoLocked}
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    Current password
                    <PasswordInput
                      className="mt-1"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={
                        password ? "Required to set a new password" : "Only to change password"
                      }
                    />
                  </label>
                  <label className="block text-xs text-muted">
                    New password
                    <PasswordInput
                      className="mt-1"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave blank to keep current"
                      minLength={8}
                    />
                  </label>
                </div>
                {demoLocked ? (
                  <p className="text-xs text-muted">Demo account email is locked.</p>
                ) : null}
                <Button type="submit" size="sm" loading={busy}>
                  {busy ? "Saving…" : "Save profile"}
                </Button>
              </form>
            </SectionCard>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
