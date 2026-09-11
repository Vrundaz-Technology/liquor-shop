import { randomUUID } from "crypto";
import { prisma, isDbConfigured } from "@/lib/db/prisma";
import type { CronJobId } from "@/lib/cron/catalog";

export type CronRunTrigger = "schedule" | "manual";
export type CronRunStatus = "success" | "failed" | "skipped";

export type CronRunRow = {
  id: string;
  jobId: CronJobId | string;
  status: CronRunStatus;
  trigger: CronRunTrigger;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  processed: number;
  failed: number;
  message: string | null;
  actorUserId: string | null;
};

type DbRun = {
  id: string;
  job_id: string;
  status: string;
  trigger: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  duration_ms: number | null;
  processed: number;
  failed: number;
  message: string | null;
  actor_user_id: string | null;
};

let schemaReady = false;

function toIso(value: Date | string | null | undefined) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRun(row: DbRun): CronRunRow {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status as CronRunStatus,
    trigger: row.trigger as CronRunTrigger,
    startedAt: toIso(row.started_at) ?? new Date().toISOString(),
    finishedAt: toIso(row.finished_at),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    processed: Number(row.processed ?? 0),
    failed: Number(row.failed ?? 0),
    message: row.message,
    actorUserId: row.actor_user_id,
  };
}

export async function ensureCronRunsSchema() {
  if (!isDbConfigured() || schemaReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      job_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      \`trigger\` VARCHAR(32) NOT NULL,
      started_at DATETIME(3) NOT NULL,
      finished_at DATETIME(3) NULL,
      duration_ms INT NULL,
      processed INT NOT NULL DEFAULT 0,
      failed INT NOT NULL DEFAULT 0,
      message TEXT NULL,
      actor_user_id VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX cron_job_runs_job_started_idx (job_id, started_at),
      INDEX cron_job_runs_started_idx (started_at),
      INDEX cron_job_runs_status_idx (status)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  schemaReady = true;
}

export async function startCronRun(input: {
  jobId: string;
  trigger: CronRunTrigger;
  actorUserId?: string | null;
}): Promise<string> {
  await ensureCronRunsSchema();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO cron_job_runs
      (id, job_id, status, \`trigger\`, started_at, processed, failed, actor_user_id)
     VALUES (?, ?, 'success', ?, NOW(3), 0, 0, ?)`,
    id,
    input.jobId,
    input.trigger,
    input.actorUserId ?? null,
  );
  return id;
}

export async function finishCronRun(input: {
  id: string;
  status: CronRunStatus;
  processed?: number;
  failed?: number;
  message?: string | null;
  startedAtMs: number;
}) {
  await ensureCronRunsSchema();
  const durationMs = Math.max(0, Date.now() - input.startedAtMs);
  await prisma.$executeRawUnsafe(
    `UPDATE cron_job_runs
     SET status = ?,
         finished_at = NOW(3),
         duration_ms = ?,
         processed = ?,
         failed = ?,
         message = ?
     WHERE id = ?`,
    input.status,
    durationMs,
    input.processed ?? 0,
    input.failed ?? 0,
    input.message ?? null,
    input.id,
  );
}

export type CronRunFilters = {
  jobId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
};

export async function listCronRuns(filters: CronRunFilters = {}): Promise<CronRunRow[]> {
  if (!isDbConfigured()) return [];
  await ensureCronRunsSchema();

  const where: string[] = ["1=1"];
  const params: unknown[] = [];

  if (filters.jobId && filters.jobId !== "all") {
    where.push("job_id = ?");
    params.push(filters.jobId);
  }
  if (filters.status && filters.status !== "all") {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.fromDate)) {
    where.push("started_at >= ?");
    params.push(`${filters.fromDate} 00:00:00`);
  }
  if (filters.toDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.toDate)) {
    where.push("started_at <= ?");
    params.push(`${filters.toDate} 23:59:59`);
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  params.push(limit);

  const rows = await prisma.$queryRawUnsafe<DbRun[]>(
    `SELECT id, job_id, status, \`trigger\`, started_at, finished_at, duration_ms,
            processed, failed, message, actor_user_id
     FROM cron_job_runs
     WHERE ${where.join(" AND ")}
     ORDER BY started_at DESC
     LIMIT ?`,
    ...params,
  );

  return rows.map(mapRun);
}

export async function latestCronRunsByJob(): Promise<Record<string, CronRunRow>> {
  if (!isDbConfigured()) return {};
  await ensureCronRunsSchema();
  const rows = await prisma.$queryRawUnsafe<DbRun[]>(
    `SELECT r.id, r.job_id, r.status, r.\`trigger\`, r.started_at, r.finished_at,
            r.duration_ms, r.processed, r.failed, r.message, r.actor_user_id
     FROM cron_job_runs r
     INNER JOIN (
       SELECT job_id, MAX(started_at) AS max_started
       FROM cron_job_runs
       GROUP BY job_id
     ) latest ON latest.job_id = r.job_id AND latest.max_started = r.started_at
     ORDER BY r.started_at DESC`,
  );
  const map: Record<string, CronRunRow> = {};
  for (const row of rows) {
    if (!map[row.job_id]) map[row.job_id] = mapRun(row);
  }
  return map;
}
