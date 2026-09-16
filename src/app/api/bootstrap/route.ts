import { NextResponse } from "next/server";
import { fetchBootstrapPayload } from "@/lib/db/queries";
import { isDbConfigured } from "@/lib/db/prisma";

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  ) as T;
}

export async function GET() {
  try {
    const payload = await fetchBootstrapPayload();
    return NextResponse.json(
      jsonSafe({
        ok: true,
        dbConnected: isDbConfigured(),
        ...payload,
      }),
    );
  } catch (error) {
    console.error("[GET /api/bootstrap]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load store data from database." },
      { status: 500 },
    );
  }
}
