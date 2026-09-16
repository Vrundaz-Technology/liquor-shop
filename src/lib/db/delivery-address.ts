import type { DeliveryAddress } from "@/types";

export function parseAddressSafe(value: unknown): DeliveryAddress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.line1 !== "string" || typeof row.city !== "string") return undefined;
  return {
    name: typeof row.name === "string" ? row.name : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    line1: row.line1,
    line2: typeof row.line2 === "string" ? row.line2 : undefined,
    city: row.city,
    state: typeof row.state === "string" ? row.state : "",
    zip: typeof row.zip === "string" ? row.zip : "",
    notes: typeof row.notes === "string" ? row.notes : undefined,
  };
}
