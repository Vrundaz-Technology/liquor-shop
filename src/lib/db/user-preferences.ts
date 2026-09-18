import {
  parseNotifyEmails,
  parseNotifyPhones,
} from "@/lib/notifications/destinations";
import type { UserPreferences } from "@/types";

export function parseUserPreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
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
  const emails = parseNotifyEmails(row.notifyEmails);
  if (emails) next.notifyEmails = emails;
  const phones = parseNotifyPhones(row.notifyPhones);
  if (phones) next.notifyPhones = phones;
  return next;
}

export function parseUserPreferencesOrUndefined(raw: unknown): UserPreferences | undefined {
  const next = parseUserPreferences(raw);
  return Object.keys(next).length ? next : undefined;
}
