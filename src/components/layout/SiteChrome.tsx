"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CartAddedToast } from "@/components/cart/CartAddedToast";
import { CartAbandonedSync } from "@/components/cart/CartAbandonedSync";
import { WishlistAddedToast } from "@/components/wishlist/WishlistAddedToast";
import { AgeGate } from "@/components/layout/AgeGate";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === "/prototype" || pathname.startsWith("/prototype/");
  const immersive = pathname.startsWith("/virtual-store");
  const isDashboard = pathname.startsWith("/dashboard");
  const isAccount = pathname.startsWith("/account");

  if (bare) {
    return (
      <main id="main" className="min-h-screen">
        {children}
      </main>
    );
  }

  if (isDashboard) {
    return (
      <>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-(--bg-elevated) focus:px-3 focus:py-2 focus:text-sm focus:text-cream"
        >
          Skip to content
        </a>
        <main id="main" className="min-h-[100dvh]">
          {children}
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main
        id="main"
        className={
          immersive
            ? "flex min-h-[100dvh] flex-col pt-[calc(3.75rem+env(safe-area-inset-top,0px))] sm:pt-[calc(4.25rem+env(safe-area-inset-top,0px))]"
            : "min-h-[100dvh] pt-[calc(3.75rem+env(safe-area-inset-top,0px))] sm:pt-[calc(4.5rem+env(safe-area-inset-top,0px))]"
        }
      >
        {children}
      </main>
      {!immersive && !isAccount && <Footer />}
      <CartAddedToast />
      <WishlistAddedToast />
      <CartAbandonedSync />
      <AgeGate />
    </>
  );
}
