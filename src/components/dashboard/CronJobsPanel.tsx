"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Play, RefreshCw, Timer, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { AccessDenied } from "@/components/dashboard/AccessDenied";
import { Button } from "@/components/ui/Button";
import { NativeSelect } from "@/components/ui/NativeSelect";
import {
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
} from "@/components/ui/SortableTh";
import { useUserStore } from "@/store/user";
import { hasPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import type { CronJobDefinition } from "@/lib/cron/catalog";

type LastRun = {
  id: string;
  jobId: string;
  status: "success" | "failed" | "skipped";
  trigger: "schedule" | "manual";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  processed: number;
  failed: number;
  message: string | null;
};

type CatalogJob = CronJobDefinition & { lastRun: LastRun | null };
type CatalogResponse = { ok: true; jobs: CatalogJob[] };
type RunsResponse = { ok: true; runs: LastRun[] };
type PanelTab = "catalog" | "history";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "success" || status === "ready"
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
      : status === "failed"
        ? "border-(--danger)/35 bg-(--danger)/10 text-(--danger)"
        : status === "skipped" || status === "planned"
          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
          : "border-white/15 bg-white/5 text-muted";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        tone,
      )}
    >
      {status}
    </span>
  );
}

export function CronJobsPanel() {
  const qc = useQueryClient();
  const profile = useUserStore((s) => s.profile);
  const canView = hasPermission(profile, "activity.view");

  const [tab, setTab] = useState<PanelTab>("catalog");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["cron-jobs-catalog"],
    enabled: canView,
    queryFn: () => apiFetch<CatalogResponse>("/api/cron/jobs?view=catalog"),
  });

  const runsQuery = useQuery({
    queryKey: ["cron-jobs-runs", jobFilter, statusFilter, fromDate, toDate],
    enabled: canView && tab === "history",
    queryFn: async () => {
      const params = new URLSearchParams({ view: "runs" });
      if (jobFilter !== "all") params.set("jobId", jobFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      return apiFetch<RunsResponse>(`/api/cron/jobs?${params.toString()}`);
    },
  });

  const runJob = useMutation({
    mutationFn: async (jobId: string) => {
      setBusyId(jobId);
      return apiFetch<{
        ok: boolean;
        result: { message: string; status: string; processed: number; failed: number };
      }>("/api/cron/jobs", {
        method: "POST",
        body: JSON.stringify({ jobId }),
      });
    },
    onSuccess: (json) => {
      setFlash(json.result.message || "Job finished.");
      void qc.invalidateQueries({ queryKey: ["cron-jobs-catalog"] });
      void qc.invalidateQueries({ queryKey: ["cron-jobs-runs"] });
    },
    onError: (err) => {
      setFlash(err instanceof Error ? err.message : "Could not run job.");
    },
    onSettled: () => setBusyId(null),
  });

  const jobs = catalogQuery.data?.jobs ?? [];
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      if (a.status !== b.status) return a.status === "ready" ? -1 : 1;
      if (a.priority !== b.priority) return a.priority === "must" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [jobs]);

  const stats = useMemo(() => {
    const ready = jobs.filter((j) => j.status === "ready").length;
    const planned = jobs.filter((j) => j.status === "planned").length;
    const ran = jobs.filter((j) => j.lastRun).length;
    return { ready, planned, ran, total: jobs.length };
  }, [jobs]);

  const runs = runsQuery.data?.runs ?? [];
  const refreshing = catalogQuery.isFetching || runsQuery.isFetching;

  if (!canView) {
    return (
      <AccessDenied message="Cron job access requires Activity view. Ask an owner to grant it." />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-0">
        <div className="flex gap-1" role="tablist" aria-label="Cron sections">
          {(
            [
              { id: "catalog" as const, label: "Jobs", icon: Timer },
              { id: "history" as const, label: "History", icon: History },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-xs uppercase tracking-[0.14em] transition-colors sm:px-4 sm:text-sm",
                  active
                    ? "border-(--gold) text-cream"
                    : "border-transparent text-muted hover:text-cream",
                )}
              >
                <Icon size={14} className={active ? "text-gold" : undefined} />
                {item.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            void catalogQuery.refetch();
            if (tab === "history") void runsQuery.refetch();
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-white/10 px-3 text-xs text-muted transition hover:border-white/20 hover:text-cream"
          aria-label="Refresh"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : undefined} />
          Refresh
        </button>
      </div>

      {flash ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-sm border border-(--gold)/25 bg-(--gold)/8 px-3.5 py-2.5 text-sm text-cream"
        >
          <p className="min-w-0 leading-relaxed">{flash}</p>
          <button
            type="button"
            className="shrink-0 rounded-sm p-1 text-muted transition hover:bg-white/5 hover:text-cream"
            aria-label="Dismiss"
            onClick={() => setFlash(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {tab === "catalog" ? (
        catalogQuery.isLoading ? (
          <p className="inline-flex items-center gap-2 py-10 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading jobs…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Total jobs", value: String(stats.total) },
                { label: "Ready", value: String(stats.ready) },
                { label: "Planned", value: String(stats.planned) },
                { label: "Have run", value: String(stats.ran) },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 px-3 py-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{card.label}</p>
                  <p className="mt-1.5 font-display text-xl tabular-nums text-cream">{card.value}</p>
                </div>
              ))}
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 lg:hidden">
              {sortedJobs.map((job) => (
                <li
                  key={job.id}
                  className="rounded-sm border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-cream">{job.name}</p>
                      <p className="mt-1 text-xs text-muted">{job.frequency}</p>
                    </div>
                    <StatusPill status={job.status === "ready" ? "ready" : "planned"} />
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{job.why}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3">
                    <p className="text-[11px] text-muted">
                      Last run · {job.lastRun ? formatWhen(job.lastRun.startedAt) : "Never"}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant={job.status === "ready" ? "secondary" : "ghost"}
                      className="min-h-9"
                      disabled={busyId === job.id}
                      loading={busyId === job.id}
                      onClick={() => runJob.mutate(job.id)}
                    >
                      {busyId === job.id ? null : <Play size={13} />}
                      Run
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className={cn("hidden lg:block", tableWrapClass)}>
              <table className="w-max min-w-full text-left text-sm">
                <thead>
                  <tr className={tableHeadRowClass}>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Why</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Frequency</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Last run</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedJobs.map((job) => (
                    <tr key={job.id} className={cn(tableRowClass, "align-top")}>
                      <td className={cn(tableCellClass, "min-w-[12rem] align-top")}>
                        <p className="font-medium text-cream">{job.name}</p>
                        <code className="mt-1.5 inline-block rounded-sm border border-white/8 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          {job.cronHint}
                        </code>
                      </td>
                      <td className={cn(tableCellClass, "min-w-[16rem] max-w-[28rem] align-top")}>
                        <p className="leading-relaxed text-muted">{job.why}</p>
                      </td>
                      <td className={cn(tableCellClass, "whitespace-nowrap align-top text-cream/85")}>
                        {job.frequency}
                      </td>
                      <td className={cn(tableCellClass, "align-top")}>
                        <StatusPill status={job.status === "ready" ? "ready" : "planned"} />
                      </td>
                      <td className={cn(tableCellClass, "whitespace-nowrap align-top")}>
                        {job.lastRun ? (
                          <div className="space-y-1.5">
                            <StatusPill status={job.lastRun.status} />
                            <p className="text-[11px] text-muted">
                              {formatWhen(job.lastRun.startedAt)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted">Never</span>
                        )}
                      </td>
                      <td className={cn(tableCellClass, "align-top text-right")}>
                        <Button
                          type="button"
                          size="sm"
                          variant={job.status === "ready" ? "secondary" : "ghost"}
                          className="inline-flex min-h-9 shrink-0 whitespace-nowrap"
                          disabled={busyId === job.id}
                          loading={busyId === job.id}
                          onClick={() => runJob.mutate(job.id)}
                          aria-label={`Run ${job.name}`}
                        >
                          {busyId === job.id ? null : <Play size={13} className="shrink-0" />}
                          Run
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-sm border border-white/10 bg-black/20 p-3">
            <label className="min-w-[10rem] flex-1 text-[10px] uppercase tracking-[0.14em] text-muted">
              Job
              <NativeSelect
                className="mt-1.5 h-11 py-0"
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
              >
                <option value="all">All jobs</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="min-w-[9rem] flex-1 text-[10px] uppercase tracking-[0.14em] text-muted">
              Status
              <NativeSelect
                className="mt-1.5 h-11 py-0"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </NativeSelect>
            </label>
            <label className="min-w-[9rem] flex-1 text-[10px] uppercase tracking-[0.14em] text-muted">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-sm border border-white/10 bg-white/5 px-3 text-sm text-cream outline-none focus:border-(--gold)/50"
              />
            </label>
            <label className="min-w-[9rem] flex-1 text-[10px] uppercase tracking-[0.14em] text-muted">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-sm border border-white/10 bg-white/5 px-3 text-sm text-cream outline-none focus:border-(--gold)/50"
              />
            </label>
            {jobFilter !== "all" || statusFilter !== "all" || fromDate || toDate ? (
              <button
                type="button"
                className="min-h-11 px-3 text-xs uppercase tracking-wider text-muted transition hover:text-cream"
                onClick={() => {
                  setJobFilter("all");
                  setStatusFilter("all");
                  setFromDate("");
                  setToDate("");
                }}
              >
                Clear
              </button>
            ) : null}
          </div>

          {runsQuery.isLoading ? (
            <p className="inline-flex items-center gap-2 py-10 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading history…
            </p>
          ) : runs.length === 0 ? (
            <div className="rounded-sm border border-dashed border-white/15 px-4 py-14 text-center">
              <History className="mx-auto h-7 w-7 text-muted" aria-hidden />
              <p className="mt-3 text-sm text-cream">No runs yet</p>
              <p className="mt-1 text-sm text-muted">
                Run a job from the Jobs tab, or schedule{" "}
                <code className="text-gold/90">/api/cron/notifications</code>.
              </p>
            </div>
          ) : (
            <div className={tableWrapClass}>
              <table className="w-max min-w-full text-left text-sm">
                <thead>
                  <tr className={tableHeadRowClass}>
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Started</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Duration</th>
                    <th className="px-4 py-3 font-medium">Trigger</th>
                    <th className="px-4 py-3 font-medium whitespace-nowrap">Processed / failed</th>
                    <th className="px-4 py-3 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const name = jobs.find((j) => j.id === run.jobId)?.name ?? run.jobId;
                    return (
                      <tr key={run.id} className={tableRowClass}>
                        <td className={cn(tableCellClass, "whitespace-nowrap font-medium text-cream")}>
                          {name}
                        </td>
                        <td className={tableCellClass}>
                          <StatusPill status={run.status} />
                        </td>
                        <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                          {formatWhen(run.startedAt)}
                        </td>
                        <td className={cn(tableCellClass, "whitespace-nowrap tabular-nums text-muted")}>
                          {formatDuration(run.durationMs)}
                        </td>
                        <td className={cn(tableCellClass, "capitalize text-muted")}>{run.trigger}</td>
                        <td className={cn(tableCellClass, "whitespace-nowrap tabular-nums text-cream")}>
                          {run.processed} / {run.failed}
                        </td>
                        <td className={cn(tableCellClass, "max-w-[22rem] text-muted")}>
                          <p className="truncate" title={run.message ?? undefined}>
                            {run.message || "—"}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
