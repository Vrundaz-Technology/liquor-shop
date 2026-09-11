import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Product } from "@/types";
import { products } from "@/data/products";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shared dark native <select> styles — prefer NativeSelect so the chevron arrow is shown. */
export const nativeSelectClass =
  "appearance-none rounded-sm border border-white/10 bg-(--bg-elevated) px-3 py-2.5 text-sm text-cream outline-none transition scheme-dark hover:border-white/20 focus:border-(--gold)/45 [&_option]:bg-(--bg-elevated) [&_option]:text-cream";

/** Absolute chevron for custom-wrapped native selects (when NativeSelect isn't used). */
export const nativeSelectChevronClass =
  "pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted";

export function formatPrice(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** Display form: (212) 555-0100 */
export const US_PHONE_PATTERN = /^\(\d{3}\) \d{3}-\d{4}$/;

export function formatUsPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);
  if (digits.length === 0) return "";
  if (digits.length < 3) return `(${area}`;
  if (digits.length === 3) return `(${area}) `;
  if (digits.length < 6) return `(${area}) ${prefix}`;
  if (digits.length === 6) return `(${area}) ${prefix}-`;
  return `(${area}) ${prefix}-${line}`;
}

export function isUsPhone(value: string) {
  return US_PHONE_PATTERN.test(value.trim());
}

export function formatAbv(abv: number) {
  return `${abv}% ABV`;
}

export {
  calculateShipping,
  calculateTax,
  formatDeliveryPricingSummary,
  formatTaxRatePercent,
  amountUntilFreeDelivery,
  pricingFromLocation,
  DEFAULT_FULFILLMENT_PRICING,
} from "@/lib/fulfillment-pricing";

export function getRecommendations(
  prefs: {
    viewedIds?: string[];
    brandFavorites?: string[];
    maxPrice?: number;
    occasion?: string;
  },
  limit = 6,
): Product[] {
  const scored = products.map((p) => {
    let score = 0;
    if (prefs.viewedIds?.includes(p.id)) score += 3;
    if (prefs.brandFavorites?.some((b) => p.brand.toLowerCase().includes(b.toLowerCase())))
      score += 4;
    if (prefs.maxPrice && p.price <= prefs.maxPrice) score += 2;
    if (prefs.occasion === "gift" && p.tags.includes("gift")) score += 5;
    if (prefs.occasion === "celebration" && (p.category === "champagne" || p.isPremium))
      score += 5;
    if (p.isPremium) score += 1;
    score += p.rating;
    return { p, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.p)
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
    .slice(0, limit);
}

export function safeInternalPath(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}

export const SITE = {
  name: "Sam's Discount Liquor",
  tagline: "Great bottles. Better prices.",
  url: "https://samsdiscountliquor.com",
  description:
    "Sam's Discount Liquor — immersive shopping with a virtual showroom, AR bottle viewing, and curated collections across three New York locations.",
};
