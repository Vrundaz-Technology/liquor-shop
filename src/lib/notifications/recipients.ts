import { prisma, isDbConfigured } from "@/lib/db/prisma";
import type { UserPreferences } from "@/types";

function parsePreferences(raw: unknown): UserPreferences | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const next: UserPreferences = {};
  if (row.defaultFulfillment === "delivery" || row.defaultFulfillment === "pickup") {
    next.defaultFulfillment = row.defaultFulfillment;
  }
  if (typeof row.marketingEmails === "boolean") next.marketingEmails = row.marketingEmails;
  if (typeof row.smsUpdates === "boolean") next.smsUpdates = row.smsUpdates;
  if (typeof row.pushUpdates === "boolean") next.pushUpdates = row.pushUpdates;
  if (typeof row.orderEmailUpdates === "boolean") next.orderEmailUpdates = row.orderEmailUpdates;
  if (typeof row.loyaltyAlerts === "boolean") next.loyaltyAlerts = row.loyaltyAlerts;
  if (typeof row.backInStockAlerts === "boolean") next.backInStockAlerts = row.backInStockAlerts;
  if (typeof row.priceAlerts === "boolean") next.priceAlerts = row.priceAlerts;
  if (typeof row.abandonedCartReminders === "boolean") {
    next.abandonedCartReminders = row.abandonedCartReminders;
  }
  if (row.favoriteCategory === null) next.favoriteCategory = null;
  else if (typeof row.favoriteCategory === "string") {
    next.favoriteCategory = row.favoriteCategory.trim().slice(0, 40) || null;
  }
  return Object.keys(next).length ? next : undefined;
}

export async function loadNotifyRecipient(userId: string | null | undefined): Promise<{
  userId: string;
  email: string;
  name: string;
  prefs: UserPreferences | undefined;
} | null> {
  if (!userId || !isDbConfigured()) return null;
  try {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; email: string; name: string; preferences: unknown }[]
    >(
      `SELECT id, email, name, preferences FROM users WHERE id = ? AND active = true LIMIT 1`,
      userId,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.id,
      email: row.email,
      name: row.name,
      prefs: parsePreferences(row.preferences),
    };
  } catch {
    // preferences column may be missing on older DBs briefly
    const user = await prisma.user.findFirst({
      where: { id: userId, active: true },
      select: { id: true, email: true, name: true },
    });
    if (!user) return null;
    return { userId: user.id, email: user.email, name: user.name, prefs: undefined };
  }
}
