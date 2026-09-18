import type {
  NotifyEmailDestination,
  NotifyPhoneDestination,
  UserPreferences,
} from "@/types";

export const US_NOTIFY_PHONE_RE = /^\(\d{3}\) \d{3}-\d{4}$/;
export const MAX_NOTIFY_EMAILS = 8;
export const MAX_NOTIFY_PHONES = 8;

export function newNotifyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatNotifyPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function asId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 64) : newNotifyId();
}

function asLabel(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 40) : "";
}

export function parseNotifyEmails(raw: unknown): NotifyEmailDestination[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const next: NotifyEmailDestination[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@") || email.length > 160) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    next.push({
      id: asId(row.id),
      email,
      label: asLabel(row.label),
      active: row.active !== false,
      locked: row.locked === true,
    });
    if (next.length >= MAX_NOTIFY_EMAILS) break;
  }
  return next;
}

export function parseNotifyPhones(raw: unknown): NotifyPhoneDestination[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const next: NotifyPhoneDestination[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const phone = typeof row.phone === "string" ? row.phone.trim() : "";
    if (!US_NOTIFY_PHONE_RE.test(phone)) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    next.push({
      id: asId(row.id),
      phone,
      countryCode: "+1",
      label: asLabel(row.label),
      active: row.active !== false,
    });
    if (next.length >= MAX_NOTIFY_PHONES) break;
  }
  return next;
}

export function seedNotifyEmails(
  accountEmail: string,
  saved?: NotifyEmailDestination[],
): NotifyEmailDestination[] {
  const email = accountEmail.trim().toLowerCase();
  const extras = (saved ?? []).filter(
    (row) => !row.locked && row.email.trim().toLowerCase() !== email,
  );
  const primary = (saved ?? []).find(
    (row) => row.locked || row.email.trim().toLowerCase() === email,
  );
  if (!email) return extras.slice(0, MAX_NOTIFY_EMAILS);
  return [
    {
      id: primary?.id ?? "account-email",
      email,
      label: primary?.label || "Account",
      active: primary?.active ?? true,
      locked: true,
    },
    ...extras,
  ].slice(0, MAX_NOTIFY_EMAILS);
}

export function seedNotifyPhones(saved?: NotifyPhoneDestination[]): NotifyPhoneDestination[] {
  return (saved ?? []).slice(0, MAX_NOTIFY_PHONES);
}

function phoneKey(phone: string) {
  return phone.replace(/\D/g, "");
}

export function activeNotifyEmails(
  prefs: UserPreferences | null | undefined,
  fallbackEmail?: string | null,
): string[] {
  const fallback = fallbackEmail?.trim().toLowerCase() || "";
  const saved = prefs?.notifyEmails;
  if (saved && saved.length > 0) {
    const active = saved
      .filter((row) => row.active)
      .map((row) => row.email.trim().toLowerCase())
      .filter(Boolean);
    if (active.length) return [...new Set(active)];
    return fallback ? [fallback] : [];
  }
  return fallback ? [fallback] : [];
}

export function activeNotifyPhones(
  prefs: UserPreferences | null | undefined,
  receiptPhone?: string | null,
): string[] {
  const extras = (prefs?.notifyPhones ?? [])
    .filter((row) => row.active)
    .map((row) => row.phone.trim())
    .filter(Boolean);
  const receipt = receiptPhone?.trim() ?? "";
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (phone: string) => {
    const key = phoneKey(phone);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(phone);
  };
  if (receipt) add(receipt);
  for (const phone of extras) add(phone);
  return out;
}

export function validateNotifyDestinations(
  emails: NotifyEmailDestination[],
  phones: NotifyPhoneDestination[],
): string | null {
  if (emails.length > MAX_NOTIFY_EMAILS) return `You can save up to ${MAX_NOTIFY_EMAILS} emails.`;
  if (phones.length > MAX_NOTIFY_PHONES) return `You can save up to ${MAX_NOTIFY_PHONES} numbers.`;
  const emailSeen = new Set<string>();
  for (const row of emails) {
    const email = row.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Enter a valid email address.";
    }
    if (emailSeen.has(email)) return "Each email can only be listed once.";
    emailSeen.add(email);
  }
  const phoneSeen = new Set<string>();
  for (const row of phones) {
    if (!US_NOTIFY_PHONE_RE.test(row.phone.trim())) {
      return "Enter a phone like (212) 555-0100.";
    }
    if (phoneSeen.has(row.phone.trim())) return "Each number can only be listed once.";
    phoneSeen.add(row.phone.trim());
  }
  return null;
}
