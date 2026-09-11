import { z } from "zod";

/** Round to a fixed number of decimal places without floating-point junk. */
export function roundMoney(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return NaN;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const normalized = value.toString().toLowerCase();
  if (normalized.includes("e")) {
    // scientific notation — treat as too precise unless it fits after round
    const rounded = roundMoney(value, 8);
    return decimalPlaces(rounded);
  }
  const parts = normalized.split(".");
  return parts[1]?.replace(/0+$/, "").length ?? 0;
}

export function hasAtMostDecimals(value: number, maxDecimals: number): boolean {
  if (!Number.isFinite(value)) return false;
  const rounded = roundMoney(value, maxDecimals);
  return Math.abs(value - rounded) < 1 / 10 ** (maxDecimals + 2);
}

/** Parse a numeric input string; empty → null. Rejects junk / Infinity. */
export function parseFiniteNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

export const moneyAmountSchema = z
  .number({ error: "Enter a valid amount" })
  .finite()
  .min(0, "Amount cannot be negative")
  .max(999_999.99, "Amount is too large")
  .refine((n) => hasAtMostDecimals(n, 2), "Use at most 2 decimal places");

/** Money amount with a custom upper bound (still 2 dp, non-negative). */
export function moneyAmountAtMost(max: number, message?: string) {
  return z
    .number({ error: "Enter a valid amount" })
    .finite()
    .min(0, "Amount cannot be negative")
    .max(max, message ?? `Amount cannot exceed ${max}`)
    .refine((n) => hasAtMostDecimals(n, 2), "Use at most 2 decimal places");
}

/** Catalog / ticket prices must be > 0 with money precision. */
export const positiveMoneySchema = z
  .number({ error: "Enter a valid amount" })
  .finite()
  .gt(0, "Amount must be greater than 0")
  .max(999_999.99, "Amount is too large")
  .refine((n) => hasAtMostDecimals(n, 2), "Use at most 2 decimal places");

export const nullableMoneySchema = z.union([moneyAmountSchema, z.null()]);

export const optionalMoneySchema = nullableMoneySchema.optional();

/** Percent as fraction 0–1 (0.1 = 10%), max 4 dp to match DECIMAL(12,4). */
export const percentFractionSchema = z
  .number({ error: "Enter a valid percent" })
  .finite()
  .min(0, "Percent cannot be negative")
  .max(1, "Percent cannot exceed 100% (use 1.0 max)")
  .refine((n) => hasAtMostDecimals(n, 4), "Use at most 4 decimal places (e.g. 0.1250)");

/** Sales tax as fraction (0.08875 = 8.875%), matches DECIMAL(8,6). */
export const taxRateSchema = z
  .number({ error: "Enter a valid tax rate" })
  .finite()
  .min(0, "Tax rate cannot be negative")
  .max(0.25, "Tax rate cannot exceed 25%")
  .refine((n) => hasAtMostDecimals(n, 6), "Use at most 6 decimal places");

/** UI tax percent 0–25 with up to 4 decimals (maps to fraction / 100). */
export const taxPercentSchema = z
  .number({ error: "Enter a valid tax percent" })
  .finite()
  .min(0, "Tax percent cannot be negative")
  .max(25, "Tax percent cannot exceed 25%")
  .refine((n) => hasAtMostDecimals(n, 4), "Use at most 4 decimal places");

export const promoValueSchema = z.number().finite().min(0);

export function promoValueByType(type: "percent" | "fixed" | "free_delivery") {
  if (type === "free_delivery") {
    return z.literal(0);
  }
  if (type === "percent") return percentFractionSchema;
  return moneyAmountSchema;
}

export const prioritySchema = z
  .number({ error: "Enter a priority" })
  .int("Priority must be a whole number")
  .min(1, "Priority must be at least 1")
  .max(9999, "Priority is too large");

export const pointsPerDollarSchema = z
  .number()
  .finite()
  .min(0, "Cannot be negative")
  .max(100, "Max 100 points per dollar")
  .refine((n) => hasAtMostDecimals(n, 4), "Use at most 4 decimal places");

export const redeemRateSchema = z
  .number()
  .finite()
  .min(0, "Cannot be negative")
  .max(1, "Max $1.00 per point")
  .refine((n) => hasAtMostDecimals(n, 4), "Use at most 4 decimal places");

export function sanitizeMoneyInput(raw: string, decimals = 2): string {
  let next = raw.replace(/[^\d.]/g, "");
  const firstDot = next.indexOf(".");
  if (firstDot !== -1) {
    next =
      next.slice(0, firstDot + 1) +
      next.slice(firstDot + 1).replace(/\./g, "");
    const [whole, frac = ""] = next.split(".");
    next = `${whole}.${frac.slice(0, decimals)}`;
  }
  return next;
}

export function sanitizePercentFractionInput(raw: string): string {
  return sanitizeMoneyInput(raw, 4);
}
