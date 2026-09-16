import { Prisma } from "@prisma/client";

/**
 * Coerce Prisma Decimal / MySQL DECIMAL / BigInt driver values to a plain number
 * for app-layer math and JSON responses.
 */
export function moneyNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function moneyOptional(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  return moneyNumber(value);
}

/** Prisma accepts number|string|Decimal for Decimal fields. */
export function asMoney(value: number | string | null | undefined): Prisma.Decimal | null {
  if (value == null || value === "") return null;
  return new Prisma.Decimal(value);
}

export function asMoneyRequired(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}
