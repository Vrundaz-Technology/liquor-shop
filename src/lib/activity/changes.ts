export type ActivityChangeView = {
  field: string;
  from: string | null;
  to: string | null;
};

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "—";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty)";
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return value.slice(0, 8).join(", ") + (value.length > 8 ? "…" : "");
    }
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

function fieldLabel(key: string) {
  const map: Record<string, string> = {
    from: "value",
    to: "value",
    previous: "status",
    status: "status",
    hidden: "visibility",
    role: "role",
    active: "active",
    name: "name",
    email: "email",
    basePrice: "base price",
    salePrice: "sale price",
    costPrice: "cost price",
    promoPrice: "promo price",
    quantity: "quantity",
    delta: "delta",
    reason: "reason",
    points: "points",
    marketingConsent: "marketing",
    notesLength: "notes length",
    rating: "rating",
    targetType: "target",
    category: "category",
    format: "format",
    rows: "rows",
    updated: "updated",
    skipped: "skipped",
    filtered: "filtered",
    permissions: "permissions",
    grants: "grants",
    revokes: "revokes",
    slug: "slug",
    rank: "rank",
    code: "code",
    type: "type",
    value: "value",
    "min spend": "min spend",
    priority: "priority",
    stackable: "stackable",
    scope: "scope",
    location: "location",
    starts: "starts",
    ends: "ends",
    rules: "rules",
    deleted: "deleted",
    created: "created",
    password: "password",
    avatar: "avatar",
    birthday: "birthday",
    preferences: "preferences",
    shortName: "short name",
    address: "address",
    city: "city",
    state: "state",
    zip: "zip",
    phone: "phone",
    description: "description",
    pickupAvailable: "pickup",
    deliveryAvailable: "delivery",
    deliveryRadiusKm: "delivery radius",
    deliveryFee: "delivery fee",
    deliveryFreeMinimum: "free delivery min",
    minimumOrderAmount: "minimum order",
    taxRate: "tax rate",
    hours: "hours",
    holidayHours: "holiday hours",
    parking: "parking",
    heroImage: "hero image",
    gallery: "gallery",
    lat: "latitude",
    lng: "longitude",
    title: "title",
    date: "date",
    startTime: "start time",
    endTime: "end time",
    price: "price",
    seatsTotal: "seats",
    hosts: "hosts",
    image: "image",
    vehicle: "vehicle",
    photoUrl: "photo",
    driver: "driver",
    "from location": "from location",
    "to location": "to location",
    "SKU count": "SKU count",
    units: "units",
    subject: "subject",
    assignee: "assignee",
    reply: "reply",
    ownerReply: "owner reply",
    pointsPerDollar: "points per dollar",
    redeemRate: "redeem rate",
    birthdayPoints: "birthday points",
    referralPoints: "referral points",
    referralSignupPoints: "referral signup points",
    tiers: "tiers",
    rewards: "rewards",
    notes: "notes",
    label: "label",
    allowedLocations: "store access",
    balance: "balance",
    product: "product",
  };
  return map[key] ?? key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase();
}

/**
 * Normalize activity metadata into field-level before → after rows for the UI.
 * Supports:
 * - { changes: [{ field, from, to }] }
 * - { from, to } / { previous, status }
 * - known single-field bags
 * - delete actions via summary/entityId
 */
export function parseActivityChanges(input: {
  action: string;
  entityId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown> | null;
}): ActivityChangeView[] {
  const meta = input.metadata ?? undefined;
  const out: ActivityChangeView[] = [];

  if (meta && Array.isArray(meta.changes)) {
    for (const raw of meta.changes) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const row = raw as Record<string, unknown>;
      const field = String(row.field ?? row.path ?? "change");
      const hasFrom = "from" in row || "before" in row || "previous" in row;
      const hasTo = "to" in row || "after" in row || "next" in row;
      out.push({
        field: fieldLabel(field),
        from: hasFrom
          ? formatValue(row.from ?? row.before ?? row.previous)
          : null,
        to: hasTo ? formatValue(row.to ?? row.after ?? row.next) : null,
      });
    }
    if (out.length) return out;
  }

  if (meta && ("from" in meta || "to" in meta) && !("previous" in meta && "status" in meta)) {
    const field =
      input.action === "user.role_updated"
        ? "role"
        : input.action.includes("status")
          ? "status"
          : "value";
    out.push({
      field,
      from: "from" in meta ? formatValue(meta.from) : null,
      to: "to" in meta ? formatValue(meta.to) : null,
    });
    return out;
  }

  if (meta && ("previous" in meta || "status" in meta) && (meta.previous != null || meta.status != null)) {
    out.push({
      field: "status",
      from: "previous" in meta ? formatValue(meta.previous) : null,
      to: "status" in meta ? formatValue(meta.status) : null,
    });
  }

  if (meta && typeof meta.hidden === "boolean") {
    out.push({
      field: "visibility",
      from: meta.hidden ? "Visible" : "Hidden",
      to: meta.hidden ? "Hidden" : "Visible",
    });
  }

  if (meta && typeof meta.active === "boolean" && !out.length) {
    out.push({
      field: "active",
      from: meta.active ? "No" : "Yes",
      to: meta.active ? "Yes" : "No",
    });
  }

  // Pricing / numeric snapshots (new values only → show as set to)
  const moneyKeys = ["basePrice", "salePrice", "costPrice", "promoPrice"] as const;
  for (const key of moneyKeys) {
    if (meta && key in meta && meta[key] !== undefined) {
      out.push({
        field: fieldLabel(key),
        from: null,
        to: formatValue(meta[key]),
      });
    }
  }

  if (meta && typeof meta.quantity === "number") {
    out.push({
      field: "quantity",
      from: null,
      to:
        typeof meta.delta === "number"
          ? `${meta.quantity} (${meta.delta > 0 ? "+" : ""}${meta.delta})`
          : formatValue(meta.quantity),
    });
  }

  if (meta && typeof meta.points === "number") {
    out.push({ field: "points", from: null, to: formatValue(meta.points) });
  }

  if (meta && typeof meta.marketingConsent === "boolean") {
    out.push({
      field: "marketing",
      from: null,
      to: meta.marketingConsent ? "Opted in" : "Opted out",
    });
  }

  if (meta && typeof meta.rating === "number") {
    out.push({ field: "rating", from: null, to: formatValue(meta.rating) });
  }

  if (input.action.endsWith(".deleted") || input.action.includes("deactivated")) {
    const nameMatch = input.summary?.match(/[“"]([^”"]+)[”"]/);
    const label = nameMatch?.[1] ?? input.entityId ?? "item";
    if (!out.some((c) => c.to === "(deleted)" || c.to === "Inactive")) {
      out.push({
        field: input.action.includes("deactivated") ? "active" : "deleted",
        from: label,
        to: input.action.includes("deactivated") ? "Inactive" : "(deleted)",
      });
    }
  }

  if (input.action.endsWith(".created") || input.action === "auth.signup" || input.action === "user.created") {
    if (!out.length) {
      const nameMatch = input.summary?.match(/[“"]([^”"]+)[”"]/);
      out.push({
        field: "created",
        from: null,
        to: nameMatch?.[1] ?? input.entityId ?? "Yes",
      });
    }
  }

  // Generic leftover scalar keys (avoid dumping huge arrays)
  if (meta && out.length === 0) {
    const skip = new Set([
      "changes",
      "fields",
      "lines",
      "productId",
      "customerUserId",
      "organizationId",
      "orderId",
      "transferId",
      "fromLocationId",
      "toLocationId",
      "itemCount",
      "fulfillment",
      "total",
      "notesLength",
    ]);
    for (const [key, value] of Object.entries(meta)) {
      if (skip.has(key)) continue;
      if (value == null) continue;
      if (typeof value === "object") continue;
      out.push({ field: fieldLabel(key), from: null, to: formatValue(value) });
      if (out.length >= 4) break;
    }
  }

  return out;
}

export function formatChangesPlain(changes: ActivityChangeView[]) {
  if (!changes.length) return "";
  return changes
    .map((c) => {
      if (c.from && c.to) return `${c.field}: ${c.from} → ${c.to}`;
      if (c.to) return `${c.field}: ${c.to}`;
      if (c.from) return `${c.field}: ${c.from}`;
      return c.field;
    })
    .join("; ");
}

/** Helper for writers — store structured diffs in metadata.changes */
export function activityChanges(
  changes: { field: string; from?: unknown; to?: unknown }[],
  extra?: Record<string, unknown>,
) {
  return {
    changes: changes.map((c) => ({
      field: c.field,
      ...(c.from !== undefined ? { from: c.from } : {}),
      ...(c.to !== undefined ? { to: c.to } : {}),
    })),
    ...extra,
  };
}

function valuesEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b)) {
    return Math.abs(a - b) < 1e-9;
  }
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

/** Keep only fields whose from/to actually differ. */
export function onlyChanged(
  entries: Array<{ field: string; from: unknown; to: unknown }>,
): Array<{ field: string; from: unknown; to: unknown }> {
  return entries.filter((entry) => !valuesEqual(entry.from, entry.to));
}
