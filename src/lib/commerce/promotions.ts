import { prisma, isDbConfigured } from "@/lib/db/prisma";
import { ensureOrganizationSchema, SAMS_ORG_ID } from "@/lib/db/organization";
import { moneyNumber } from "@/lib/db/money";
import { getProductById } from "@/data/products";

export type PromotionScope = "platform" | "organization" | "location";
export type PromotionType = "percent" | "fixed" | "free_delivery" | "bogo";

/** Targeting + schedule extras stored in promotions.rules JSON. */
export type PromotionRules = {
  categories?: string[];
  brands?: string[];
  productIds?: string[];
  /** Buy X get Y free (cheapest matching units). */
  buyQty?: number;
  getQty?: number;
  firstOrderOnly?: boolean;
  /** How many times one customer (account) may redeem this offer. Omit = unlimited. */
  maxUsesPerUser?: number;
  /** 0 = Sunday … 6 = Saturday */
  daysOfWeek?: number[];
  /** Local wall-clock "HH:mm" (store timezone approximated as server local). */
  startTime?: string;
  endTime?: string;
};

export type PromoLineItem = {
  productId: string;
  quantity: number;
  price: number;
  category?: string;
  brand?: string;
};

export type PromotionRow = {
  id: string;
  organization_id: string | null;
  location_id: string | null;
  scope: string;
  name: string;
  code: string | null;
  type: string;
  value: number;
  min_subtotal: number | null;
  priority: number;
  stackable: boolean | number;
  active: boolean | number;
  starts_at: Date | null;
  ends_at: Date | null;
  rules: unknown;
};

export type AppliedPromotion = {
  id: string;
  code: string | null;
  name: string;
  discount: number;
  freeDelivery: boolean;
  scope: string;
  priority: number;
  type: string;
};

function scopeRank(scope: string): number {
  if (scope === "location") return 3;
  if (scope === "organization") return 2;
  return 1;
}

export function parsePromotionRules(raw: unknown): PromotionRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const rules: PromotionRules = {};
  if (Array.isArray(row.categories)) {
    rules.categories = row.categories.filter((x): x is string => typeof x === "string");
  }
  if (Array.isArray(row.brands)) {
    rules.brands = row.brands.filter((x): x is string => typeof x === "string");
  }
  if (Array.isArray(row.productIds)) {
    rules.productIds = row.productIds.filter((x): x is string => typeof x === "string");
  }
  if (typeof row.buyQty === "number" && row.buyQty > 0) rules.buyQty = Math.floor(row.buyQty);
  if (typeof row.getQty === "number" && row.getQty > 0) rules.getQty = Math.floor(row.getQty);
  if (typeof row.firstOrderOnly === "boolean") rules.firstOrderOnly = row.firstOrderOnly;
  if (typeof row.maxUsesPerUser === "number" && Number.isInteger(row.maxUsesPerUser) && row.maxUsesPerUser > 0) {
    rules.maxUsesPerUser = Math.min(99, row.maxUsesPerUser);
  }
  if (Array.isArray(row.daysOfWeek)) {
    rules.daysOfWeek = row.daysOfWeek
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  }
  if (typeof row.startTime === "string" && /^\d{2}:\d{2}$/.test(row.startTime)) {
    rules.startTime = row.startTime;
  }
  if (typeof row.endTime === "string" && /^\d{2}:\d{2}$/.test(row.endTime)) {
    rules.endTime = row.endTime;
  }
  return rules;
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isActiveNow(row: PromotionRow, now = new Date()): boolean {
  if (!row.active) return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.ends_at && new Date(row.ends_at) < now) return false;

  const rules = parsePromotionRules(row.rules);
  if (rules.daysOfWeek?.length) {
    if (!rules.daysOfWeek.includes(now.getDay())) return false;
  }
  if (rules.startTime || rules.endTime) {
    const mins = now.getHours() * 60 + now.getMinutes();
    const start = rules.startTime ? minutesOfDay(rules.startTime) : 0;
    const end = rules.endTime ? minutesOfDay(rules.endTime) : 24 * 60 - 1;
    if (start <= end) {
      if (mins < start || mins > end) return false;
    } else {
      // Overnight window (e.g. 22:00–02:00)
      if (mins < start && mins > end) return false;
    }
  }
  return true;
}

function enrichLine(item: PromoLineItem): PromoLineItem {
  if (item.category && item.brand) return item;
  const product = getProductById(item.productId);
  return {
    ...item,
    category: item.category ?? product?.category,
    brand: item.brand ?? product?.brand,
  };
}

function lineMatchesRules(item: PromoLineItem, rules: PromotionRules): boolean {
  const line = enrichLine(item);
  if (rules.productIds?.length && !rules.productIds.includes(line.productId)) return false;
  if (rules.categories?.length) {
    const cat = (line.category ?? "").toLowerCase();
    if (!rules.categories.some((c) => c.toLowerCase() === cat)) return false;
  }
  if (rules.brands?.length) {
    const brand = (line.brand ?? "").toLowerCase();
    if (!rules.brands.some((b) => b.toLowerCase() === brand)) return false;
  }
  return true;
}

function eligibleSubtotal(items: PromoLineItem[] | undefined, rules: PromotionRules, cartSubtotal: number) {
  const hasTarget =
    Boolean(rules.categories?.length) ||
    Boolean(rules.brands?.length) ||
    Boolean(rules.productIds?.length);
  if (!hasTarget) return cartSubtotal;
  if (!items?.length) return 0;
  return items.reduce((sum, item) => {
    if (!lineMatchesRules(item, rules)) return sum;
    return sum + item.price * item.quantity;
  }, 0);
}

function computeBogoDiscount(items: PromoLineItem[], rules: PromotionRules): number {
  const buyQty = Math.max(1, rules.buyQty ?? 2);
  const getQty = Math.max(1, rules.getQty ?? 1);
  const group = buyQty + getQty;
  const units: number[] = [];
  for (const item of items) {
    if (!lineMatchesRules(item, rules)) continue;
    for (let i = 0; i < item.quantity; i += 1) units.push(item.price);
  }
  if (units.length < group) return 0;
  units.sort((a, b) => a - b);
  const freeCount = Math.floor(units.length / group) * getQty;
  // Free the cheapest units
  return Math.round(units.slice(0, freeCount).reduce((s, p) => s + p, 0) * 100) / 100;
}

function computeDiscountForRow(
  row: PromotionRow,
  input: {
    subtotal: number;
    items?: PromoLineItem[];
  },
): { discount: number; freeDelivery: boolean; eligible: number } {
  const rules = parsePromotionRules(row.rules);
  const eligible = eligibleSubtotal(input.items, rules, input.subtotal);
  const winnerValue = moneyNumber(row.value);
  let discount = 0;
  let freeDelivery = false;

  if (row.type === "percent") {
    discount = Math.round(eligible * winnerValue * 100) / 100;
  } else if (row.type === "fixed") {
    discount = Math.min(eligible, winnerValue);
  } else if (row.type === "free_delivery") {
    freeDelivery = true;
  } else if (row.type === "bogo") {
    discount = computeBogoDiscount(input.items ?? [], rules);
  }

  return { discount, freeDelivery, eligible };
}

function compareCandidates(a: PromotionRow, b: PromotionRow) {
  const scopeDiff = scopeRank(b.scope) - scopeRank(a.scope);
  if (scopeDiff !== 0) return scopeDiff;
  return b.priority - a.priority;
}

/**
 * List promotions eligible for a checkout location.
 * Location-scoped offers only match their store; org/platform never bleed via null location_id.
 */
export async function listPromotions(filters: {
  organizationId?: string | null;
  locationId?: string | null;
  includePlatform?: boolean;
  includeInactive?: boolean;
  /** When true (admin list), include all location-scoped offers for the org. */
  adminList?: boolean;
}) {
  if (!isDbConfigured()) return [] as PromotionRow[];
  await ensureOrganizationSchema();

  const params: unknown[] = [];
  const where: string[] = [];

  if (!filters.includeInactive) where.push("active = true");

  const orgId = filters.organizationId ?? null;
  const locationId = filters.locationId ?? null;
  const includePlatform = filters.includePlatform !== false;

  if (filters.adminList && orgId) {
    const parts = [
      `(scope = 'organization' AND organization_id = ?)`,
      `(scope = 'location' AND organization_id = ?)`,
    ];
    params.push(orgId, orgId);
    if (includePlatform) parts.push(`scope = 'platform'`);
    where.push(`(${parts.join(" OR ")})`);
  } else {
    const parts: string[] = [];
    if (includePlatform) parts.push(`scope = 'platform'`);
    if (orgId) {
      parts.push(`(scope = 'organization' AND organization_id = ?)`);
      params.push(orgId);
    }
    if (locationId) {
      parts.push(`(scope = 'location' AND location_id = ?)`);
      params.push(locationId);
    }
    if (!parts.length) return [];
    where.push(`(${parts.join(" OR ")})`);
  }

  return prisma.$queryRawUnsafe<PromotionRow[]>(
    `SELECT * FROM promotions WHERE ${where.join(" AND ")} ORDER BY priority DESC, created_at DESC LIMIT 500`,
    ...params,
  );
}

export class PromotionUsageLimitError extends Error {
  constructor(
    public promoName: string,
    public maxUses: number,
  ) {
    super(
      `You can use ${promoName} only ${maxUses} time${maxUses === 1 ? "" : "s"} per customer.`,
    );
    this.name = "PromotionUsageLimitError";
  }
}

type QueryClient = {
  $queryRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

export async function countUserPromotionUses(
  userId: string,
  promo: { id: string; code?: string | null },
  db: QueryClient = prisma,
): Promise<number> {
  if (!userId || !isDbConfigured()) return 0;
  const code = promo.code?.trim().toUpperCase() ?? "";
  const rows = (await db.$queryRawUnsafe(
    `SELECT COUNT(*) AS c
     FROM orders
     WHERE user_id = ?
       AND status <> 'cancelled'
       AND (
         promotion_id = ?
         OR (? <> '' AND UPPER(COALESCE(coupon_code, '')) = ?)
       )`,
    userId,
    promo.id,
    code,
    code,
  )) as { c: bigint | number }[];
  return Number(rows[0]?.c ?? 0);
}

export async function resolvePromotionDiscount(input: {
  code?: string | null;
  subtotal: number;
  organizationId?: string | null;
  locationId?: string | null;
  items?: PromoLineItem[];
  isFirstOrder?: boolean;
  userId?: string | null;
  now?: Date;
  db?: QueryClient;
}): Promise<AppliedPromotion | null> {
  if (!isDbConfigured()) {
    const code = input.code?.trim().toUpperCase();
    const legacy: Record<string, number> = { SAMS10: 0.1, GOLD15: 0.15, WELCOME20: 0.2 };
    if (!code || !legacy[code]) return null;
    return {
      id: `legacy-${code}`,
      code,
      name: code,
      discount: Math.round(input.subtotal * legacy[code] * 100) / 100,
      freeDelivery: false,
      scope: "organization",
      priority: 50,
      type: "percent",
    };
  }

  await ensureOrganizationSchema();
  const rows = await listPromotions({
    organizationId: input.organizationId ?? SAMS_ORG_ID,
    locationId: input.locationId,
    includePlatform: true,
  });

  const now = input.now ?? new Date();
  const code = input.code?.trim().toUpperCase() || null;

  let candidates = rows
    .filter((row) => isActiveNow(row, now))
    .filter((row) => {
      if (code) return row.code?.toUpperCase() === code;
      return !row.code;
    })
    .filter((row) => {
      const rules = parsePromotionRules(row.rules);
      if (rules.firstOrderOnly) {
        if (input.isFirstOrder !== true) return false;
      }
      // Anonymous auto-apply cannot track per-user caps.
      if (!input.userId && !code && rules.maxUsesPerUser) return false;
      const min = row.min_subtotal == null ? null : moneyNumber(row.min_subtotal);
      if (min != null) {
        const basis = eligibleSubtotal(input.items, rules, input.subtotal);
        // Min spend uses eligible (targeted) subtotal when targeting is set; else cart subtotal.
        const hasTarget =
          Boolean(rules.categories?.length) ||
          Boolean(rules.brands?.length) ||
          Boolean(rules.productIds?.length);
        if ((hasTarget ? basis : input.subtotal) < min) return false;
      }
      if (row.type === "free_delivery") return true;
      const { discount } = computeDiscountForRow(row, input);
      // Keep zero-discount percent/fixed out of auto-apply; coded coupons still "match" for messaging
      if (code) return true;
      return discount > 0;
    })
    .sort(compareCandidates);

  if (input.userId) {
    const db = input.db ?? prisma;
    const remaining: PromotionRow[] = [];
    for (const row of candidates) {
      const maxUses = parsePromotionRules(row.rules).maxUsesPerUser;
      if (!maxUses) {
        remaining.push(row);
        continue;
      }
      const used = await countUserPromotionUses(input.userId, row, db);
      if (used < maxUses) {
        remaining.push(row);
        continue;
      }
      if (code) {
        throw new PromotionUsageLimitError(row.name, maxUses);
      }
    }
    candidates = remaining;
  }

  if (!candidates.length) return null;

  // Primary: best product discount (percent / fixed / bogo)
  const productRows = candidates.filter((r) => r.type !== "free_delivery");
  const deliveryRows = candidates.filter((r) => r.type === "free_delivery");

  let discount = 0;
  let freeDelivery = false;
  let winner: PromotionRow | null = null;

  if (productRows.length) {
    winner = productRows[0]!;
    const computed = computeDiscountForRow(winner, input);
    discount = computed.discount;

    // Stackable free delivery can combine with a product discount.
    const delivery = deliveryRows.find((r) => Boolean(r.stackable)) ?? null;
    if (delivery) {
      freeDelivery = true;
      // Prefer reporting the product promo as the applied id; delivery stacks.
    } else if (!winner) {
      /* noop */
    }
  } else if (deliveryRows.length) {
    winner = deliveryRows[0]!;
    freeDelivery = true;
  }

  // If only free delivery matched with a code, use it.
  if (!winner && deliveryRows[0]) {
    winner = deliveryRows[0];
    freeDelivery = true;
  }
  if (!winner) return null;

  // Non-stackable free_delivery as sole winner
  if (winner.type === "free_delivery") {
    freeDelivery = true;
    discount = 0;
  }

  // Additional stackable product discounts (rare): add if marked stackable and lower priority
  if (winner.type !== "free_delivery") {
    for (const extra of productRows.slice(1)) {
      if (!extra.stackable) continue;
      if (extra.id === winner.id) continue;
      const add = computeDiscountForRow(extra, input).discount;
      discount = Math.min(input.subtotal, Math.round((discount + add) * 100) / 100);
    }
    const stackedDelivery = deliveryRows.find((r) => Boolean(r.stackable));
    if (stackedDelivery) freeDelivery = true;
  }

  return {
    id: winner.id,
    code: winner.code,
    name: winner.name,
    discount: Math.min(input.subtotal, Math.max(0, discount)),
    freeDelivery,
    scope: winner.scope,
    priority: winner.priority,
    type: winner.type,
  };
}

/** @deprecated use resolvePromotionDiscount — kept for offline / POS fallback */
export const COUPONS: Record<string, number> = {
  SAMS10: 0.1,
  GOLD15: 0.15,
  WELCOME20: 0.2,
};

export function isValidCoupon(code: string | null | undefined) {
  if (!code) return false;
  return Boolean(COUPONS[code.trim().toUpperCase()]);
}

export function getCouponDiscount(code: string | null | undefined, subtotal: number) {
  if (!code) return 0;
  const rate = COUPONS[code.toUpperCase()];
  if (!rate) return 0;
  return Math.round(subtotal * rate * 100) / 100;
}

export type CustomerCouponOffer = {
  id: string;
  code: string;
  name: string;
  type: string;
  label: string;
  discount: number;
  freeDelivery: boolean;
  minSubtotal: number | null;
  eligible: boolean;
  reason: string | null;
  endsAt: string | null;
};

function moneyLabel(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function offerLabel(row: Pick<PromotionRow, "type" | "value" | "name">, rules: PromotionRules) {
  const value = moneyNumber(row.value);
  if (row.type === "percent") return `${Math.round(value * 100)}% off`;
  if (row.type === "fixed") return `${moneyLabel(value)} off`;
  if (row.type === "free_delivery") return "Free delivery";
  if (row.type === "bogo") {
    return `Buy ${rules.buyQty ?? 2} get ${rules.getQty ?? 1} free`;
  }
  return row.name;
}

function targetingHint(rules: PromotionRules) {
  const bits: string[] = [];
  if (rules.categories?.length) bits.push(rules.categories.join(", "));
  if (rules.brands?.length) bits.push(rules.brands.join(", "));
  return bits.length ? bits.join(" · ") : null;
}

export function parsePromoLineItems(raw: unknown): PromoLineItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: PromoLineItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.productId !== "string") continue;
    const quantity = Number(r.quantity);
    const price = Number(r.price);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
      continue;
    }
    items.push({
      productId: r.productId,
      quantity,
      price,
      category: typeof r.category === "string" ? r.category : undefined,
      brand: typeof r.brand === "string" ? r.brand : undefined,
    });
  }
  return items.length ? items : undefined;
}

export async function listCustomerCoupons(input: {
  organizationId?: string | null;
  locationId?: string | null;
  subtotal: number;
  items?: PromoLineItem[];
  isFirstOrder?: boolean;
  userId?: string | null;
  now?: Date;
}): Promise<CustomerCouponOffer[]> {
  const now = input.now ?? new Date();
  const offers: CustomerCouponOffer[] = [];

  if (isDbConfigured()) {
    const rows = await listPromotions({
      organizationId: input.organizationId ?? SAMS_ORG_ID,
      locationId: input.locationId,
      includePlatform: true,
    });
    for (const row of rows) {
      const code = row.code?.trim().toUpperCase();
      if (!code || !isActiveNow(row, now)) continue;
      const rules = parsePromotionRules(row.rules);
      const min = row.min_subtotal == null ? null : moneyNumber(row.min_subtotal);
      const computed = computeDiscountForRow(row, input);
      const hasTarget =
        Boolean(rules.categories?.length) ||
        Boolean(rules.brands?.length) ||
        Boolean(rules.productIds?.length);
      const basis = hasTarget ? computed.eligible : input.subtotal;
      let eligible = true;
      let reason: string | null = null;
      let usesLeft: number | null = null;

      if (rules.firstOrderOnly && input.isFirstOrder === false) {
        eligible = false;
        reason = "First order only";
      }
      if (eligible && rules.maxUsesPerUser && input.userId) {
        const used = await countUserPromotionUses(input.userId, row);
        if (used >= rules.maxUsesPerUser) {
          eligible = false;
          reason = `Limit reached (${rules.maxUsesPerUser} per customer)`;
        } else {
          usesLeft = rules.maxUsesPerUser - used;
        }
      }
      if (eligible && min != null && basis < min) {
        eligible = false;
        reason = `Add ${moneyLabel(Math.round((min - basis) * 100) / 100)} more`;
      } else if (eligible && hasTarget && computed.eligible <= 0) {
        eligible = false;
        reason = targetingHint(rules) ? `Applies to ${targetingHint(rules)}` : "Not for items in this bag";
      } else if (eligible && row.type !== "free_delivery" && computed.discount <= 0) {
        eligible = false;
        reason = "Add items to use this offer";
      }

      if (eligible && computed.discount > 0) {
        reason = `Save ${moneyLabel(computed.discount)}`;
      } else if (eligible && computed.freeDelivery) {
        reason = "Waives delivery fee";
      }
      if (eligible && usesLeft != null) {
        const cap = usesLeft === 1 ? "1 use left" : `${usesLeft} uses left`;
        reason = reason ? `${reason} · ${cap}` : cap;
      }

      offers.push({
        id: row.id,
        code,
        name: row.name,
        type: row.type,
        label: offerLabel(row, rules),
        discount: computed.discount,
        freeDelivery: computed.freeDelivery,
        minSubtotal: min,
        eligible,
        reason,
        endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
      });
    }
  }

  const seen = new Set(offers.map((o) => o.code));
  for (const [code, rate] of Object.entries(COUPONS)) {
    if (seen.has(code)) continue;
    const discount = Math.round(input.subtotal * rate * 100) / 100;
    offers.push({
      id: `legacy-${code}`,
      code,
      name: code,
      type: "percent",
      label: `${Math.round(rate * 100)}% off`,
      discount,
      freeDelivery: false,
      minSubtotal: null,
      eligible: discount > 0,
      reason: discount > 0 ? `Save ${moneyLabel(discount)}` : "Add items to use this offer",
      endsAt: null,
    });
  }

  return offers.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.discount !== a.discount) return b.discount - a.discount;
    return a.code.localeCompare(b.code);
  });
}

export async function upsertPromotion(data: {
  id?: string;
  organizationId?: string | null;
  locationId?: string | null;
  scope: PromotionScope;
  name: string;
  code?: string | null;
  type: PromotionType;
  value: number;
  minSubtotal?: number | null;
  priority?: number;
  stackable?: boolean;
  active?: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  rules?: PromotionRules | null;
}) {
  await ensureOrganizationSchema();
  const id = data.id ?? `promo-${crypto.randomUUID()}`;
  const startsAt =
    data.startsAt === undefined
      ? undefined
      : data.startsAt
        ? new Date(data.startsAt)
        : null;
  const endsAt =
    data.endsAt === undefined ? undefined : data.endsAt ? new Date(data.endsAt) : null;
  const rulesJson = data.rules ? JSON.stringify(data.rules) : "null";

  // Build dynamic upsert so schedule/rules can be cleared or set.
  await prisma.$executeRawUnsafe(
    `INSERT INTO promotions
      (id, organization_id, location_id, scope, name, code, type, value, min_subtotal, priority, stackable, active, starts_at, ends_at, rules)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       code = VALUES(code),
       type = VALUES(type),
       value = VALUES(value),
       min_subtotal = VALUES(min_subtotal),
       priority = VALUES(priority),
       stackable = VALUES(stackable),
       active = VALUES(active),
       organization_id = VALUES(organization_id),
       location_id = VALUES(location_id),
       scope = VALUES(scope),
       starts_at = VALUES(starts_at),
       ends_at = VALUES(ends_at),
       rules = VALUES(rules)`,
    id,
    data.organizationId ?? null,
    data.locationId ?? null,
    data.scope,
    data.name,
    data.code?.trim().toUpperCase() || null,
    data.type,
    data.value,
    data.minSubtotal ?? null,
    data.priority ?? 100,
    data.stackable ?? false,
    data.active ?? true,
    startsAt === undefined ? null : startsAt,
    endsAt === undefined ? null : endsAt,
    rulesJson,
  );
  return id;
}

export async function setPromotionActive(id: string, active: boolean) {
  await ensureOrganizationSchema();
  await prisma.$executeRawUnsafe(`UPDATE promotions SET active = ? WHERE id = ?`, active, id);
}

export async function deletePromotion(id: string) {
  await ensureOrganizationSchema();
  await prisma.$executeRawUnsafe(`DELETE FROM promotions WHERE id = ?`, id);
}

export async function getPromotionById(id: string) {
  if (!isDbConfigured() || !id.trim()) return null;
  await ensureOrganizationSchema();
  const rows = await prisma.$queryRawUnsafe<PromotionRow[]>(
    `SELECT * FROM promotions WHERE id = ? LIMIT 1`,
    id,
  );
  return rows[0] ?? null;
}
