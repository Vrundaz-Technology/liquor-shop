import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopCatalog } from "@/components/shop/ShopCatalog";

export const metadata: Metadata = {
  title: "Collections",
  description: "Browse premium spirits, wine, beer, and champagne at Sam's Discount Liquor.",
};

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-3 py-16 text-sm text-muted sm:px-4 md:px-8">
          Loading collections…
        </div>
      }
    >
      <ShopCatalog />
    </Suspense>
  );
}
