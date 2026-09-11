import { getLocationById } from "@/data/locations";
import { moneyNumber } from "@/lib/db/money";
import {
  parsePromotionRules,
  type PromotionRow,
  type PromotionRules,
  type PromotionType,
} from "@/lib/commerce/promotions";

export type PromoSnapshot = {
  name: string;
  code: string | null;
  type: string;
  value: number;
  minSubtotal: number | null;
  priority: number;
  stackable: boolean;
  active: boolean;
  scope: string;
  locationId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  rules: PromotionRules;
};

function isoDate(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  // Normalize to minute precision so form vs DB noise doesn't flood the log
  date.setSeconds(0, 0);
  return date.toISOString();
}

function displayDate(iso: string | null): string {
  if (!iso) return "(none)";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayType(type: string) {
  const map: Record<string, string> = {
    percent: "Percent off",
    fixed: "Fixed amount",
    free_delivery: "Free delivery",
    bogo: "Buy X get Y",
  };
  return map[type] ?? type;
}

function displayScope(scope: string) {
  const map: Record<string, string> = {
    platform: "Platform",
    organization: "Organization",
    location: "Location",
  };
  return map[scope] ?? scope;
}

function displayValue(type: string, value: number) {
  if (type === "percent") {
    const pct = value <= 1 ? value * 100 : value;
    const rounded = Math.round(pct * 100) / 100;
    return `${rounded}%`;
  }
  if (type === "fixed") return `$${moneyNumber(value).toFixed(2)}`;
  if (type === "free_delivery") return "Free delivery";
  if (type === "bogo") return "BOGO";
  return String(value);
}

function displayMoney(value: number | null) {
  if (value == null) return "(none)";
  return `$${moneyNumber(value).toFixed(2)}`;
}

function displayLocation(locationId: string | null) {
  if (!locationId) return "(none)";
  return getLocationById(locationId)?.shortName ?? locationId;
}

function displayRules(rules: PromotionRules): string {
  const parts: string[] = [];
  if (rules.categories?.length) parts.push(`categories: ${rules.categories.join(", ")}`);
  if (rules.brands?.length) parts.push(`brands: ${rules.brands.join(", ")}`);
  if (rules.productIds?.length) {
    parts.push(
      `products: ${rules.productIds.slice(0, 4).join(", ")}${rules.productIds.length > 4 ? "…" : ""}`,
    );
  }
  if (rules.buyQty != null || rules.getQty != null) {
    parts.push(`buy ${rules.buyQty ?? 2} get ${rules.getQty ?? 1}`);
  }
  if (rules.firstOrderOnly) parts.push("first order only");
  if (rules.daysOfWeek?.length) parts.push(`days: ${rules.daysOfWeek.join(",")}`);
  if (rules.startTime || rules.endTime) {
    parts.push(`hours: ${rules.startTime ?? "00:00"}–${rules.endTime ?? "23:59"}`);
  }
  return parts.length ? parts.join("; ") : "(none)";
}

function sameRules(a: PromotionRules, b: PromotionRules) {
  return JSON.stringify(normalizeRules(a)) === JSON.stringify(normalizeRules(b));
}

function normalizeRules(rules: PromotionRules) {
  return {
    categories: [...(rules.categories ?? [])].sort(),
    brands: [...(rules.brands ?? [])].sort(),
    productIds: [...(rules.productIds ?? [])].sort(),
    buyQty: rules.buyQty ?? null,
    getQty: rules.getQty ?? null,
    firstOrderOnly: Boolean(rules.firstOrderOnly),
    daysOfWeek: [...(rules.daysOfWeek ?? [])].sort((x, y) => x - y),
    startTime: rules.startTime ?? null,
    endTime: rules.endTime ?? null,
  };
}

export function snapshotFromRow(row: PromotionRow): PromoSnapshot {
  return {
    name: row.name,
    code: row.code,
    type: row.type,
    value: moneyNumber(row.value),
    minSubtotal: row.min_subtotal == null ? null : moneyNumber(row.min_subtotal),
    priority: row.priority,
    stackable: Boolean(row.stackable),
    active: Boolean(row.active),
    scope: row.scope,
    locationId: row.location_id,
    startsAt: isoDate(row.starts_at),
    endsAt: isoDate(row.ends_at),
    rules: parsePromotionRules(row.rules),
  };
}

export function snapshotFromInput(input: {
  name: string;
  code?: string | null;
  type: PromotionType | string;
  value: number;
  minSubtotal?: number | null;
  priority?: number;
  stackable?: boolean;
  active?: boolean;
  scope: string;
  locationId?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  rules?: PromotionRules | null;
}): PromoSnapshot {
  return {
    name: input.name,
    code: input.code?.trim().toUpperCase() || null,
    type: input.type,
    value: moneyNumber(input.value),
    minSubtotal: input.minSubtotal == null ? null : moneyNumber(input.minSubtotal),
    priority: input.priority ?? 100,
    stackable: Boolean(input.stackable),
    active: input.active !== false,
    scope: input.scope,
    locationId: input.locationId ?? null,
    startsAt: isoDate(input.startsAt),
    endsAt: isoDate(input.endsAt),
    rules: input.rules ?? {},
  };
}

function pushChange(
  out: { field: string; from?: unknown; to?: unknown }[],
  field: string,
  from: unknown,
  to: unknown,
) {
  if (from === to) return;
  out.push({ field, from, to });
}

/** Field-level before → after for promotion create/update activity. */
export function diffPromotionSnapshots(
  before: PromoSnapshot | null,
  after: PromoSnapshot,
): { field: string; from?: unknown; to?: unknown }[] {
  if (!before) {
    const created: { field: string; from?: unknown; to?: unknown }[] = [
      { field: "name", to: after.name },
      { field: "type", to: displayType(after.type) },
      { field: "value", to: displayValue(after.type, after.value) },
      { field: "active", to: after.active ? "Yes" : "No" },
    ];
    if (after.code) created.push({ field: "code", to: after.code });
    if (after.minSubtotal != null) {
      created.push({ field: "min spend", to: displayMoney(after.minSubtotal) });
    }
    created.push({ field: "scope", to: displayScope(after.scope) });
    if (after.locationId) {
      created.push({ field: "location", to: displayLocation(after.locationId) });
    }
    if (after.startsAt) created.push({ field: "starts", to: displayDate(after.startsAt) });
    if (after.endsAt) created.push({ field: "ends", to: displayDate(after.endsAt) });
    if (displayRules(after.rules) !== "(none)") {
      created.push({ field: "rules", to: displayRules(after.rules) });
    }
    return created;
  }

  const changes: { field: string; from?: unknown; to?: unknown }[] = [];
  pushChange(changes, "name", before.name, after.name);
  pushChange(changes, "code", before.code ?? "(none)", after.code ?? "(none)");
  pushChange(changes, "type", displayType(before.type), displayType(after.type));

  const valueChanged =
    before.type !== after.type || moneyNumber(before.value) !== moneyNumber(after.value);
  if (valueChanged) {
    pushChange(
      changes,
      "value",
      displayValue(before.type, before.value),
      displayValue(after.type, after.value),
    );
  }

  pushChange(
    changes,
    "min spend",
    displayMoney(before.minSubtotal),
    displayMoney(after.minSubtotal),
  );
  pushChange(changes, "priority", before.priority, after.priority);
  pushChange(
    changes,
    "stackable",
    before.stackable ? "Yes" : "No",
    after.stackable ? "Yes" : "No",
  );
  pushChange(changes, "active", before.active ? "Yes" : "No", after.active ? "Yes" : "No");
  pushChange(changes, "scope", displayScope(before.scope), displayScope(after.scope));
  pushChange(
    changes,
    "location",
    displayLocation(before.locationId),
    displayLocation(after.locationId),
  );
  pushChange(changes, "starts", displayDate(before.startsAt), displayDate(after.startsAt));
  pushChange(changes, "ends", displayDate(before.endsAt), displayDate(after.endsAt));

  if (!sameRules(before.rules, after.rules)) {
    pushChange(changes, "rules", displayRules(before.rules), displayRules(after.rules));
  }

  return changes;
}
