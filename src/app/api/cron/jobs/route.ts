import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require";
import { CRON_JOBS } from "@/lib/cron/catalog";
import { executeCronJob } from "@/lib/cron/execute";
import { latestCronRunsByJob, listCronRuns } from "@/lib/db/cron-runs";

export async function GET(request: Request) {
  const auth = await requirePermission("activity.view");
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "catalog";

    if (view === "runs") {
      const runs = await listCronRuns({
        jobId: searchParams.get("jobId") || undefined,
        status: searchParams.get("status") || undefined,
        fromDate: searchParams.get("fromDate") || undefined,
        toDate: searchParams.get("toDate") || undefined,
        limit: Number(searchParams.get("limit") || 50),
      });
      return NextResponse.json({ ok: true, runs });
    }

    const latest = await latestCronRunsByJob();
    return NextResponse.json({
      ok: true,
      jobs: CRON_JOBS.map((job) => ({
        ...job,
        lastRun: latest[job.id] ?? null,
      })),
    });
  } catch (error) {
    console.error("[GET /api/cron/jobs]", error);
    return NextResponse.json({ error: "Failed to load cron jobs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("activity.view");
  if (auth.error) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as { jobId?: string };
    const jobId = body.jobId?.trim();
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    const result = await executeCronJob({
      jobId,
      trigger: "manual",
      actorUserId: auth.user.id,
    });

    return NextResponse.json({
      ok: result.ok,
      result,
    });
  } catch (error) {
    console.error("[POST /api/cron/jobs]", error);
    return NextResponse.json({ error: "Failed to run cron job." }, { status: 500 });
  }
}
