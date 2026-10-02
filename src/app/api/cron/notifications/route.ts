import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeCronJob } from "@/lib/cron/execute";
import { getCronJob } from "@/lib/cron/catalog";

function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Never leave the scheduler endpoint open in production.
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job") || "abandoned_carts";
    if (!getCronJob(jobId) && jobId !== "abandoned_carts") {
      return NextResponse.json({ error: "Unknown cron job." }, { status: 400 });
    }

    const result = await executeCronJob({
      jobId,
      trigger: "schedule",
    });

    return NextResponse.json({
      ok: result.ok,
      jobId: result.jobId,
      status: result.status,
      processed: result.processed,
      failed: result.failed,
      reminded: result.jobId === "abandoned_carts" ? result.processed : undefined,
      message: result.message,
      durationMs: result.durationMs,
      runId: result.runId,
    });
  } catch (error) {
    console.error("[cron/notifications]", error);
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
