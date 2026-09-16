"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Heart,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  Package,
  Headphones,
  RotateCcw,
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
import { formatPrice, cn } from "@/lib/utils";
import { useDeliveryStore } from "@/store/delivery";
import { OrderTrackingTimeline } from "@/components/orders/OrderTrackingTimeline";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { CustomerSupportCenter } from "@/components/support/CustomerSupportCenter";
import { customerStatusLabel } from "@/lib/commerce/order-tracking";
import { getProductById } from "@/data/products";
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

const emptyAddress = (): Address => ({
  id: `addr-${crypto.randomUUID()}`,
  label: "Home",
  line1: "",
  city: "",
  state: "",
  zip: "",
  isDefault: false,
});

function LoyaltyAccountSection({
  birthday,
  setBirthday,
}: {
  birthday: string;
  setBirthday: (value: string) => void;
}) {
  const profile = useUserStore((s) => s.profile);
  const branchId = useBranchStore((s) => s.branchId);
  const memberQuery = useQuery({
    queryKey: ["loyalty-member-account", branchId],
    enabled: isDbConnected(),
    staleTime: 30_000,
    queryFn: () => apiLoyaltyMember({ locationId: branchId }),
  });
  const historyQuery = useQuery({
    queryKey: ["loyalty-member-history", branchId],
    enabled: isDbConnected(),
    staleTime: 30_000,
    queryFn: () => apiLoyaltyMember({ locationId: branchId, history: true }),
  });

  const balance = memberQuery.data?.balance ?? profile.loyaltyPoints;
  const tier = memberQuery.data?.tier ?? profile.loyaltyTier;
  const program = memberQuery.data?.program;

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
        ) : !(historyQuery.data?.entries?.length) ? (
          <p className="mt-2 text-sm text-muted">No points activity yet — place an order to start earning.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/10 rounded-sm border border-white/10">
            {historyQuery.data.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-cream">
                    {entry.reasonLabel ?? entry.reason}
                    {entry.orderId ? (
                      <span className="text-muted"> · {entry.orderId}</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-muted">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    entry.delta >= 0 ? "text-gold" : "text-cream",
                  )}
                >
                  {entry.delta >= 0 ? "+" : ""}
                  {entry.delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
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
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border border-white/10 bg-black/20 p-4 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
          <h2 className="mt-1 font-display text-xl text-cream sm:text-2xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
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
        { id: "overview" as const, label: "Overview", icon: LayoutGrid, description: "Snapshot of your loyalty, orders, and store." },
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
    const qs = params.toString();
    router.replace(qs ? `/account?${qs}` : "/account", { scroll: false });
  };

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
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-sm border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <UserAvatar name={profile.name} src={profile.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-cream">{profile.name}</p>
            <p className="truncate text-[11px] text-gold">
              {profile.loyaltyPoints.toLocaleString()} pts · {profile.loyaltyTier}
            </p>
          </div>
        </div>
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

      {/* Mobile top bar */}
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
              Account · {activeTab.label}
            </p>
            <p className="truncate font-display text-lg leading-tight text-cream sm:text-xl">
              {firstName}
            </p>
          </div>
          <UserAvatar name={profile.name} src={profile.avatarUrl} size={36} />
        </div>
      </div>

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
        <div className="w-full min-w-0 px-3 py-5 sm:px-5 sm:py-6 md:px-6 md:py-8 lg:px-8 xl:px-10 2xl:px-12">
          <header className="mb-5 hidden border-b border-white/10 pb-5 lg:block">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-gold">
                  <ActiveIcon size={12} className="text-gold" aria-hidden />
                  Account · {activeTab.label}
                </p>
                <h1 className="mt-2 font-display text-3xl text-cream xl:text-4xl">
                  {activeTab.label}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted">{activeTab.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/wishlist">
                  <Button size="sm" variant="secondary">
                    <Heart size={14} />
                    Wishlist
                  </Button>
                </Link>
                {isStaffRole(profile) ? (
                  <Link href="/dashboard">
                    <Button size="sm" variant="secondary">
                      <Shield size={14} />
                      Dashboard
                    </Button>
                  </Link>
                ) : null}
                <Button
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
            </div>
          </header>

          <div className="mb-4 flex flex-wrap gap-2 lg:hidden">
            <Link href="/wishlist">
              <Button size="sm" variant="secondary">
                <Heart size={14} />
                Wishlist
              </Button>
            </Link>
            {isStaffRole(profile) ? (
              <Link href="/dashboard">
                <Button size="sm" variant="secondary">
                  <Shield size={14} />
                  Dashboard
                </Button>
              </Link>
            ) : null}
            <Button
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

          {(message || error) && (
            <p
              className={cn(
                "mb-4 text-sm",
                message ? "text-emerald-300" : "text-red-300",
              )}
            >
              {message || error}
            </p>
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

          {tab === "orders" ? (
            <SectionCard
              eyebrow="History"
              title="Your orders"
              description="Track status and reorder favorites in one tap."
            >
              <p className="mb-4 text-xs text-muted">
                Have a tracking code?{" "}
                <Link href="/track" className="text-gold hover:underline">
                  Track an order
                </Link>
              </p>
              {reorderMsg ? <p className="mb-3 text-sm text-gold">{reorderMsg}</p> : null}
              {ordersLoading && profile.orders.length === 0 ? (
                <p className="text-sm text-muted">Loading orders…</p>
              ) : profile.orders.length === 0 ? (
                <div className="rounded-sm border border-dashed border-white/15 px-4 py-10 text-center">
                  <p className="text-sm text-cream">No orders yet</p>
                  <Link href="/shop" className="mt-3 inline-block">
                    <Button size="sm">Browse the shop</Button>
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {profile.orders.slice(0, 20).map((raw) => {
                    const order = enrich(raw);
                    const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
                    return (
                      <li
                        key={order.id}
                        className="rounded-sm border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-cream">{order.id}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted">
                              {order.date} · {itemCount} item{itemCount === 1 ? "" : "s"} ·{" "}
                              {customerStatusLabel(order)}
                              {order.tracking ? ` · ${order.tracking}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-gold">
                              {formatPrice(order.total)}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => onReorder(order.id)}
                            >
                              <RotateCcw size={13} />
                              Reorder
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSupportOrderId(order.id);
                                selectTab("support");
                              }}
                            >
                              <Headphones size={13} />
                              Help
                            </Button>
                          </div>
                        </div>
                        {order.fulfillment !== "pos" ? (
                          <div className="mt-4 border-t border-white/10 pt-4">
                            <OrderTrackingTimeline order={order} compact />
                          </div>
                        ) : null}
                        {order.status === "delivered" || order.status === "picked_up" || order.status === "completed" ? (
                          <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-gold">
                              Leave a review
                            </p>
                            {order.fulfillment === "delivery" ? (
                              <ReviewForm
                                targetType="delivery"
                                orderId={order.id}
                                locationId={order.locationId}
                              />
                            ) : null}
                            <ReviewForm
                              targetType="store"
                              locationId={order.locationId}
                            />
                            {order.items[0] ? (
                              <p className="text-xs text-muted">
                                Rate a bottle:{" "}
                                {order.items.slice(0, 3).map((item, idx) => {
                                  const product = getProductById(item.productId);
                                  if (!product) return null;
                                  return (
                                    <span key={item.productId}>
                                      {idx > 0 ? " · " : ""}
                                      <Link
                                        href={`/products/${product.slug}`}
                                        className="text-gold hover:underline"
                                      >
                                        {product.name}
                                      </Link>
                                    </span>
                                  );
                                })}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {tab === "addresses" ? (
            <SectionCard
              eyebrow="Delivery"
              title="Saved addresses"
              description="Apply these at checkout in one tap."
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy || addresses.length >= 12}
                  onClick={() =>
                    setEditingAddress({
                      ...emptyAddress(),
                      isDefault: addresses.length === 0,
                    })
                  }
                >
                  Add address
                </Button>
              }
            >
              {editingAddress ? (
                <div className="mb-4 space-y-3 rounded-sm border border-(--gold)/25 bg-(--gold)/5 p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-muted">
                      Label
                      <Input
                        className="mt-1"
                        value={editingAddress.label}
                        onChange={(e) =>
                          setEditingAddress({ ...editingAddress, label: e.target.value })
                        }
                        placeholder="Home, Work…"
                      />
                    </label>
                    <label className="block text-xs text-muted sm:col-span-2">
                      Street
                      <Input
                        className="mt-1"
                        value={editingAddress.line1}
                        onChange={(e) =>
                          setEditingAddress({ ...editingAddress, line1: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="block text-xs text-muted">
                      City
                      <Input
                        className="mt-1"
                        value={editingAddress.city}
                        onChange={(e) =>
                          setEditingAddress({ ...editingAddress, city: e.target.value })
                        }
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs text-muted">
                        State
                        <Input
                          className="mt-1"
                          value={editingAddress.state}
                          onChange={(e) =>
                            setEditingAddress({ ...editingAddress, state: e.target.value })
                          }
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        ZIP
                        <Input
                          className="mt-1"
                          value={editingAddress.zip}
                          onChange={(e) =>
                            setEditingAddress({ ...editingAddress, zip: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-cream">
                    <input
                      type="checkbox"
                      checked={editingAddress.isDefault}
                      onChange={(e) =>
                        setEditingAddress({ ...editingAddress, isDefault: e.target.checked })
                      }
                    />
                    Default address
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      loading={busy}
                      onClick={() => {
                        const exists = addresses.some((a) => a.id === editingAddress.id);
                        const next = exists
                          ? addresses.map((a) =>
                              a.id === editingAddress.id ? editingAddress : a,
                            )
                          : [...addresses, editingAddress];
                        const withDefault = editingAddress.isDefault
                          ? next.map((a) => ({
                              ...a,
                              isDefault: a.id === editingAddress.id,
                            }))
                          : next;
                        void saveAddresses(withDefault);
                      }}
                    >
                      Save address
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingAddress(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              {addresses.length === 0 && !editingAddress ? (
                <p className="text-sm text-muted">No saved addresses yet.</p>
              ) : (
                <ul className="space-y-2">
                  {addresses.map((address) => (
                    <li
                      key={address.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-sm border border-white/10 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-cream">
                          {address.label}
                          {address.isDefault ? (
                            <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-gold">
                              Default
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {address.line1}, {address.city}, {address.state} {address.zip}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingAddress(address)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void saveAddresses(addresses.filter((a) => a.id !== address.id))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {tab === "stores" ? (
            <SectionCard
              eyebrow="Preferences"
              title="Favorite store & shopping prefs"
              description="We use these to speed up cart and checkout."
            >
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
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.orderEmailUpdates !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, orderEmailUpdates: e.target.checked }))
                    }
                  />
                  Email me order status updates
                </label>
                <label className="flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.smsUpdates ?? false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, smsUpdates: e.target.checked }))
                    }
                  />
                  Text me order status updates
                </label>
                <label className="flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.pushUpdates ?? false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, pushUpdates: e.target.checked }))
                    }
                  />
                  Push notifications (when enabled on this device)
                </label>
                <label className="flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.marketingEmails ?? false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, marketingEmails: e.target.checked }))
                    }
                  />
                  Promotional offers and new arrivals
                </label>
                <label className="flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.loyaltyAlerts !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, loyaltyAlerts: e.target.checked }))
                    }
                  />
                  Loyalty rewards updates
                </label>
                <label className="flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.backInStockAlerts !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, backInStockAlerts: e.target.checked }))
                    }
                  />
                  Back-in-stock alerts
                </label>
                <label className="flex items-center gap-2 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={prefs.priceAlerts !== false}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, priceAlerts: e.target.checked }))
                    }
                  />
                  Price and promotion alerts
                </label>
                <label className="flex items-center gap-2 text-sm text-cream">
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
            <SectionCard
              eyebrow="Help"
              title="Support center"
              description="Tickets auto-route to the right store, owner, or platform team."
            >
              <CustomerSupportCenter
                compact
                defaultOrderId={supportOrderId || undefined}
                defaultCategory="order_issue"
              />
            </SectionCard>
          ) : null}

          {tab === "profile" ? (
            <SectionCard eyebrow="Account" title="Profile & security">
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
