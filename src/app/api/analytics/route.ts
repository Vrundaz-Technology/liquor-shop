import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import { fetchOwnerAnalytics } from "@/lib/db/analytics";

/** MySQL SUM/COUNT can surface as BigInt — JSON cannot serialize those. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  ) as T;
}

export async function GET(request: Request) {
  const auth = await requirePermission("analytics.view");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  try {
    const data = await fetchOwnerAnalytics(auth.user, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      locationId: searchParams.get("locationId") ?? undefined,
    });
    return NextResponse.json({ ok: true, analytics: jsonSafe(data) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load analytics" },
      { status: 500 },
    );
  }
}
