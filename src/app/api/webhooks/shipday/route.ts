import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyShipdayWebhook } from "@/lib/db/shipday-orders";
import { resolveShipdayWebhookSecret } from "@/lib/db/dispatch-settings";
import { isDbConfigured } from "@/lib/db/prisma";

function secretsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function headerToken(request: Request) {
  return (
    request.headers.get("token") ||
    request.headers.get("x-shipday-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }
  try {
    const expected = await resolveShipdayWebhookSecret();
    if (!expected) {
      return NextResponse.json({ error: "Shipday webhook secret is not configured." }, { status: 401 });
    }
    const provided = headerToken(request).trim();
    if (!provided || !secretsMatch(provided, expected)) {
      return NextResponse.json({ error: "Invalid webhook token." }, { status: 401 });
    }
    const payload = await request.json().catch(() => null);
    const result = await applyShipdayWebhook(payload);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    console.error("[POST /api/webhooks/shipday]", err);
    return NextResponse.json({ error: "Webhook failed." }, { status: 500 });
  }
}
