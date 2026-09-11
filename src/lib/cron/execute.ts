import { getCronJob, type CronJobId } from "@/lib/cron/catalog";
import {
  finishCronRun,
  startCronRun,
  type CronRunTrigger,
} from "@/lib/db/cron-runs";
import { isDbConfigured } from "@/lib/db/prisma";
import {
  listAbandonedCartsDue,
  markAbandonedCartReminded,
} from "@/lib/db/notifications-data";
import { notifyAbandonedCart } from "@/lib/notifications";
import { loadNotifyRecipient } from "@/lib/notifications/recipients";

export type CronExecutionResult = {
  ok: boolean;
  jobId: CronJobId | string;
  status: "success" | "failed" | "skipped";
  processed: number;
  failed: number;
  message: string;
  durationMs: number;
  runId: string | null;
};

async function runAbandonedCarts(): Promise<Omit<CronExecutionResult, "ok" | "jobId" | "runId" | "durationMs">> {
  if (!isDbConfigured()) {
    return {
      status: "skipped",
      processed: 0,
      failed: 0,
      message: "Database is not configured.",
    };
  }

  const due = await listAbandonedCartsDue(60, 40);
  let processed = 0;
  let failed = 0;

  for (const row of due) {
    try {
      const recipient = await loadNotifyRecipient(row.user_id);
      if (!recipient) continue;
      await notifyAbandonedCart({
        userId: recipient.userId,
        email: recipient.email,
        itemCount: row.item_count,
        prefs: recipient.prefs,
      });
      await markAbandonedCartReminded(row.user_id);
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    status: failed > 0 && processed === 0 ? "failed" : "success",
    processed,
    failed,
    message:
      due.length === 0
        ? "No abandoned carts due for reminder."
        : `Scanned ${due.length} cart(s); reminded ${processed}.`,
  };
}

async function runPlanned(jobId: CronJobId): Promise<Omit<CronExecutionResult, "ok" | "jobId" | "runId" | "durationMs">> {
  const job = getCronJob(jobId);
  return {
    status: "skipped",
    processed: 0,
    failed: 0,
    message: `${job?.name ?? jobId} is planned — handler not implemented yet.`,
  };
}

export async function executeCronJob(input: {
  jobId: string;
  trigger: CronRunTrigger;
  actorUserId?: string | null;
}): Promise<CronExecutionResult> {
  const job = getCronJob(input.jobId);
  const jobId = (job?.id ?? input.jobId) as CronJobId | string;
  const startedAtMs = Date.now();
  let runId: string | null = null;

  try {
    runId = await startCronRun({
      jobId: String(jobId),
      trigger: input.trigger,
      actorUserId: input.actorUserId,
    });
  } catch (error) {
    console.error("[cron] failed to start run log", error);
  }

  try {
    const outcome =
      jobId === "abandoned_carts"
        ? await runAbandonedCarts()
        : await runPlanned(jobId as CronJobId);

    const durationMs = Math.max(0, Date.now() - startedAtMs);
    if (runId) {
      await finishCronRun({
        id: runId,
        status: outcome.status,
        processed: outcome.processed,
        failed: outcome.failed,
        message: outcome.message,
        startedAtMs,
      });
    }

    return {
      ok: outcome.status !== "failed",
      jobId,
      status: outcome.status,
      processed: outcome.processed,
      failed: outcome.failed,
      message: outcome.message,
      durationMs,
      runId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cron job failed.";
    if (runId) {
      await finishCronRun({
        id: runId,
        status: "failed",
        processed: 0,
        failed: 1,
        message,
        startedAtMs,
      });
    }
    return {
      ok: false,
      jobId,
      status: "failed",
      processed: 0,
      failed: 1,
      message,
      durationMs: Math.max(0, Date.now() - startedAtMs),
      runId,
    };
  }
}
