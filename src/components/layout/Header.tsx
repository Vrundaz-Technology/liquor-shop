"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Heart,
  MapPin,
  Menu,
  Search,
  ShoppingBag,
  Store,
  X,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { useCartFeedbackStore } from "@/store/cart-feedback";
import { useBranchStore } from "@/store/branch";
import { useUserStore } from "@/store/user";
import { isStaffRole } from "@/lib/auth/roles";
import { getAllLocations } from "@/data/locations";
import { accessibleLocations } from "@/lib/auth/location-access";
import { switchShoppingStore } from "@/lib/switch-store";
import { shopHref } from "@/lib/shop-url";
import { formatPrice } from "@/lib/utils";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { StoreFinder } from "@/components/store/StoreFinder";
import type { Product } from "@/types";
import type { getCategories } from "@/data/categories";

const nav = [
  { href: "/virtual-store", label: "Virtual Store" },
  { href: "/shop", label: "Collections" },
  { href: "/locations", label: "Locations" },
  { href: "/events", label: "Events" },
];

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const branchButtonRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [listening, setListening] = useState(false);
  const [storeFinderOpen, setStoreFinderOpen] = useState(false);
  const [results, setResults] = useState<{
    products: Product[];
    categories: ReturnType<typeof getCategories>;
  } | null>(null);
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const cartBump = useCartFeedbackStore((s) => s.bump);
  const branchId = useBranchStore((s) => s.branchId);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const authReady = useUserStore((s) => s.authReady);
  const profile = useUserStore((s) => s.profile);
  const isStaff = useUserStore(
    (s) => s.isLoggedIn && isStaffRole(s.profile),
  );
  const logout = useUserStore((s) => s.logout);
  const onDashboard = pathname.startsWith("/dashboard");
  const branchOptions =
    isLoggedIn && isStaff ? accessibleLocations(profile) : getAllLocations();
  const branch =
    branchOptions.find((l) => l.id === branchId) ??
    branchOptions[0] ??
    getAllLocations()[0];

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let cancelled = false;
    void import("@/lib/search").then(({ searchAll }) => {
      if (!cancelled) setResults(searchAll(q));
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const handleSignOut = async () => {
    await logout();
    setOpen(false);
    setBranchOpen(false);
    setAccountOpen(false);
    window.location.assign("/login");
  };

  useEffect(() => {
    if (!isLoggedIn || !isStaff) return;
    const options = accessibleLocations(profile);
    if (options.some((loc) => loc.id === branchId)) return;
    if (options[0]) switchShoppingStore(options[0].id);
  }, [branchId, isLoggedIn, isStaff, profile]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setSearchOpen(false);
    setBranchOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!branchOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (branchMenuRef.current?.contains(target)) return;
      if (branchButtonRef.current?.contains(target)) return;
      setBranchOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBranchOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [branchOpen]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const startVoice = () => {
    type Rec = {
      lang: string;
      start: () => void;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
    };
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => Rec;
      SpeechRecognition?: new () => Rec;
    };
    const SR = w.webkitSpeechRecognition || w.SpeechRecognition;
    if (!SR) {
      setQuery("Macallan");
      setSearchOpen(true);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setQuery(text);
      setSearchOpen(true);
    };
    rec.start();
  };

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-[var(--gold)] focus:px-4 focus:py-2 focus:text-black"
      >
        Skip to content
      </a>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          "pt-[env(safe-area-inset-top,0px)]",
          scrolled || pathname !== "/"
            ? "glass border-b border-white/5 py-2.5 sm:py-3"
            : "bg-transparent py-3 sm:py-5",
        )}
      >
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 px-3 sm:gap-3 sm:px-5 md:px-6 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] lg:gap-6 lg:px-8 xl:px-10 2xl:px-12">
          <button
            className="relative z-10 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[var(--cream)] touch-manipulation lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu size={22} />
          </button>

          <Link
            href="/"
            className="group relative z-0 min-w-0 w-full overflow-hidden justify-self-stretch px-1 lg:justify-self-start lg:w-auto lg:px-0"
          >
            <span className="block truncate text-center font-display text-base leading-tight tracking-[0.01em] text-[var(--cream)] sm:hidden">
              Sam&apos;s
            </span>
            <span className="hidden truncate text-center font-display text-lg leading-tight tracking-[0.01em] text-[var(--cream)] sm:block lg:hidden">
              Sam&apos;s Discount
            </span>
            <span className="hidden truncate text-left font-display text-2xl leading-tight tracking-[0.01em] text-[var(--cream)] lg:block xl:text-[1.65rem]">
              Sam&apos;s Discount Liquor
            </span>
          </Link>

          <nav
            className="hidden min-w-0 items-center justify-center gap-4 xl:gap-8 lg:flex"
            aria-label="Primary"
          >
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap text-[11px] uppercase tracking-[0.16em] transition-colors xl:text-xs xl:tracking-[0.2em]",
                  pathname.startsWith(item.href)
                    ? "text-[var(--gold)]"
                    : "text-[var(--muted)] hover:text-[var(--cream)]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="relative z-10 flex shrink-0 items-center justify-end gap-0.5 sm:gap-1.5 md:gap-2">
            <button
              type="button"
              ref={branchButtonRef}
              onClick={() => {
                setBranchOpen((v) => !v);
                setAccountOpen(false);
              }}
              className="hidden items-center gap-1.5 rounded-sm border border-white/10 px-2.5 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] hover:border-[var(--gold)]/40 hover:text-[var(--gold)] lg:flex xl:gap-2"
              aria-label="Select store branch"
              aria-expanded={branchOpen}
              aria-haspopup="listbox"
              aria-controls="header-branch-menu"
            >
              <MapPin size={12} />
              <span className="max-w-[6rem] truncate xl:max-w-[10rem] 2xl:max-w-none">
                {branch.shortName}
              </span>
            </button>
            {onDashboard ? (
              <Link
                href="/shop"
                className="hidden items-center border border-[var(--gold)]/45 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/10 lg:inline-flex"
              >
                Shop
              </Link>
            ) : null}
            <button
              onClick={() => {
                setSearchOpen(true);
                setAccountOpen(false);
              }}
              className="rounded-sm p-2 text-[var(--cream)] hover:bg-white/5"
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <Link
              href="/wishlist"
              className="hidden rounded-sm p-2 text-[var(--cream)] hover:bg-white/5 lg:block"
              aria-label="Wishlist"
            >
              <Heart size={18} />
            </Link>
            {!authReady && !isLoggedIn ? (
              <span
                className="inline-flex h-9 w-9 shrink-0 animate-pulse rounded-sm bg-white/10 sm:h-10 sm:w-10"
                aria-label="Checking account"
                title="Checking account"
              />
            ) : isLoggedIn ? (
              <AccountMenu
                open={accountOpen}
                onOpenChange={(next) => {
                  setAccountOpen(next);
                  if (next) setBranchOpen(false);
                }}
                profile={profile}
                isStaff={isStaff}
                onSignOut={() => void handleSignOut()}
                menuRef={accountRef}
              />
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-9 items-center rounded-sm border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cream transition hover:border-(--gold)/40 hover:bg-white/10 sm:min-h-10"
                aria-label="Sign in"
                title="Sign in"
              >
                Sign in
              </Link>
            )}
            <Link
              href="/cart"
              className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-[var(--cream)] hover:bg-white/5"
              aria-label={`Cart, ${count} items`}
            >
              <ShoppingBag size={18} />
              {count > 0 && (
                <span
                  key={cartBump || count}
                  className="absolute right-0.5 top-0.5 flex h-4 min-w-4 animate-[pulse_0.7s_ease-out] items-center justify-center rounded-full bg-[var(--gold)] px-1 text-[10px] font-medium text-black"
                >
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {branchOpen && (
          <motion.div
            ref={branchMenuRef}
            id="header-branch-menu"
            role="listbox"
            aria-label="Store branches"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed right-3 top-14 z-[60] w-[min(18rem,calc(100vw-1.5rem))] glass-gold p-4 shadow-2xl sm:right-8 sm:top-16 sm:w-72"
          >
            <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
              Select Branch
            </p>
            <button
              type="button"
              onClick={() => {
                setBranchOpen(false);
                setStoreFinderOpen(true);
              }}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-sm border border-(--gold)/35 bg-(--gold)/10 px-3 py-2.5 text-[11px] uppercase tracking-[0.14em] text-gold transition hover:bg-(--gold)/15"
            >
              <MapPin size={13} aria-hidden />
              Find by ZIP
            </button>
            {branchOptions.map((loc) => (
              <button
                key={loc.id}
                type="button"
                role="option"
                aria-selected={loc.id === branchId}
                onClick={() => {
                  switchShoppingStore(loc.id);
                  setBranchOpen(false);
                }}
                className={cn(
                  "mb-2 flex w-full items-start gap-3 rounded-sm border p-3 text-left transition",
                  loc.id === branchId
                    ? "border-[var(--gold)]/50 bg-[var(--gold)]/10"
                    : "border-white/5 hover:border-white/20",
                )}
              >
                <Store size={16} className="mt-0.5 shrink-0 text-[var(--gold)]" />
                <span className="min-w-0">
                  <span className="block text-sm text-[var(--cream)]">{loc.shortName}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {loc.city} · {loc.deliveryRadiusKm}km delivery
                  </span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto mt-[calc(4.25rem+env(safe-area-inset-top,0px))] max-w-2xl px-3 sm:mt-[calc(5rem+env(safe-area-inset-top,0px))] sm:px-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="glass-gold flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
                <Search size={20} className="shrink-0 text-[var(--gold)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search bottles, brands…"
                  className="min-w-0 flex-1 bg-transparent text-base text-[var(--cream)] outline-none placeholder:italic placeholder:text-[var(--placeholder)] sm:text-lg"
                  aria-label="Search products"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-[var(--muted)] transition hover:bg-white/10 hover:text-[var(--cream)]"
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    <X size={16} strokeWidth={2.25} />
                  </button>
                ) : null}
                <button
                  onClick={startVoice}
                  className={cn(
                    "shrink-0 rounded-sm p-2",
                    listening ? "animate-pulse text-[var(--gold)]" : "text-[var(--muted)]",
                  )}
                  aria-label="Voice search"
                >
                  <Mic size={18} />
                </button>
                <button
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                  className="shrink-0 p-2"
                >
                  <X size={18} />
                </button>
              </div>
              {results && (
                <div className="glass mt-2 max-h-[min(60vh,calc(100dvh-9rem))] overflow-y-auto p-3 sm:p-4">
                  {results.categories.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
                        Categories
                      </p>
                      {results.categories.map((c) => (
                        <Link
                          key={c.slug}
                          href={`/shop/${c.slug}`}
                          className="block py-2 text-sm text-[var(--cream)] hover:text-[var(--gold)]"
                        >
                          {c.name} — {c.tagline}
                        </Link>
                      ))}
                    </div>
                  )}
                  {results.products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/products/${p.slug}`}
                      className="flex items-start justify-between gap-3 border-b border-white/5 py-3 last:border-0 sm:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-[var(--cream)] break-words">
                          {p.name}
                        </span>
                        <span className="text-xs text-[var(--muted)]">{p.brand}</span>
                      </span>
                      <span className="shrink-0 text-sm text-[var(--gold)]">
                        {formatPrice(p.price)}
                      </span>
                    </Link>
                  ))}
                  {results.products.length > 0 ? (
                    <Link
                      href={shopHref({ q: query.trim(), inStockOnly: true, sort: "popular" })}
                      onClick={() => setSearchOpen(false)}
                      className="mt-3 block border-t border-white/10 pt-3 text-center text-xs uppercase tracking-[0.14em] text-gold hover:underline"
                    >
                      View all results in shop
                    </Link>
                  ) : null}
                  {!results.products.length && !results.categories.length && (
                    <p className="text-sm text-[var(--muted)]">No matches found.</p>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#070707]/98 lg:hidden"
          >
            <div className="flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
              <button
                className="text-[var(--cream)]"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X size={24} />
              </button>
              <span className="truncate text-[10px] uppercase tracking-[0.18em] text-[var(--gold)]">
                {branch.shortName}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
            <nav className="flex flex-col gap-4 sm:gap-5">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "font-display text-[1.75rem] leading-tight text-[var(--cream)] sm:text-3xl md:text-4xl",
                    pathname.startsWith(item.href) && "text-[var(--gold)]",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/wishlist"
                className="font-display text-[1.75rem] leading-tight text-[var(--cream)] sm:text-3xl md:text-4xl"
              >
                Wishlist
              </Link>
              <Link
                href="/cart"
                className="font-display text-[1.75rem] leading-tight text-[var(--cream)] sm:text-3xl md:text-4xl"
              >
                Cart{count > 0 ? ` (${count})` : ""}
              </Link>
              <Link
                href={isStaff ? "/dashboard" : isLoggedIn ? "/account" : "/login"}
                className={cn(
                  "font-display text-[1.75rem] leading-tight sm:text-3xl md:text-4xl",
                  pathname.startsWith("/dashboard") || pathname.startsWith("/account") || pathname.startsWith("/login")
                    ? "text-[var(--gold)]"
                    : "text-[var(--cream)]",
                )}
              >
                {!authReady && !isLoggedIn
                  ? "Account"
                  : isStaff
                    ? "Dashboard"
                    : isLoggedIn
                      ? "Account"
                      : "Sign in"}
              </Link>
              {isStaff ? (
                <Link
                  href="/shop"
                  className="font-display text-[1.75rem] leading-tight text-[var(--cream)] sm:text-3xl md:text-4xl"
                >
                  Continue shopping
                </Link>
              ) : null}
            </nav>

            {isLoggedIn ? (
              <div className="mt-8 border-t border-white/10 pt-6">
                <div className="mb-3 flex items-center gap-3">
                  <UserAvatar name={profile.name} src={profile.avatarUrl} size={36} />
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
                    {profile.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full border border-[var(--gold)]/45 px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/10"
                >
                  Sign out
                </button>
              </div>
            ) : null}

            <div className="mt-8 border-t border-white/10 pt-6 sm:mt-10">
              <p className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">
                <MapPin size={12} /> Select branch
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setStoreFinderOpen(true);
                }}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-sm border border-(--gold)/35 bg-(--gold)/10 px-3 py-3 text-[11px] uppercase tracking-[0.14em] text-gold"
              >
                Find stores by ZIP
              </button>
              <p className="mb-3 text-xs text-[var(--muted)]">
                Current:{" "}
                <span className="text-[var(--cream)]">{branch.shortName}</span>
                {pathname.startsWith("/dashboard")
                  ? " · updates owner analytics"
                  : ""}
              </p>
              <div className="space-y-2 pb-8">
                {branchOptions.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      switchShoppingStore(loc.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm border p-3 text-left transition-colors sm:p-3.5",
                      loc.id === branchId
                        ? "border-[var(--gold)]/50 bg-[var(--gold)]/10"
                        : "border-white/10 hover:border-white/25",
                    )}
                  >
                    <Store size={16} className="shrink-0 text-[var(--gold)]" />
                    <span className="min-w-0">
                      <span className="block text-sm text-[var(--cream)]">
                        {loc.shortName}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {loc.city}, {loc.state} · {loc.deliveryRadiusKm}km delivery
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <StoreFinder open={storeFinderOpen} onClose={() => setStoreFinderOpen(false)} />
    </>
  );
}
