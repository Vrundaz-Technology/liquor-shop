export type CronJobPriority = "must" | "nice";
export type CronJobStatus = "ready" | "planned";

export type CronJobId =
  | "abandoned_carts"
  | "stale_reservations"
  | "low_stock_digest"
  | "loyalty_birthday"
  | "promo_lifecycle"
  | "crm_segments"
  | "log_retention"
  | "cleanup"
  | "stuck_deliveries"
  | "event_reminders";

export type CronJobDefinition = {
  id: CronJobId;
  name: string;
  why: string;
  frequency: string;
  priority: CronJobPriority;
  /** Whether a handler exists and can be executed now. */
  status: CronJobStatus;
  /** Suggested cron expression for external schedulers. */
  cronHint: string;
};

export const CRON_JOBS: CronJobDefinition[] = [
  {
    id: "abandoned_carts",
    name: "Abandoned cart reminders",
    why: "Pipeline already built (abandoned_carts + cron route); just never scheduled.",
    frequency: "Every 15–30 min",
    priority: "must",
    status: "ready",
    cronHint: "*/20 * * * *",
  },
  {
    id: "stale_reservations",
    name: "Release stale reserved stock",
    why: "Checkout reserves stock on new orders; if never accepted/cancelled, location_inventory.reserved stays forever.",
    frequency: "Every 15–30 min",
    priority: "must",
    status: "planned",
    cronHint: "*/20 * * * *",
  },
  {
    id: "low_stock_digest",
    name: "Low-stock staff digest",
    why: "Thresholds exist; analytics only shows on demand — no proactive alert.",
    frequency: "Daily (+ optional hourly for out-of-stock)",
    priority: "must",
    status: "planned",
    cronHint: "0 8 * * *",
  },
  {
    id: "loyalty_birthday",
    name: "Loyalty birthday nudge",
    why: "Birthday points are claim-only today; many users will miss them.",
    frequency: "Daily",
    priority: "must",
    status: "planned",
    cronHint: "0 9 * * *",
  },
  {
    id: "promo_lifecycle",
    name: "Promo goes-live / ending soon",
    why: "Create-time email only; scheduled future startsAt never gets a launch ping.",
    frequency: "Hourly",
    priority: "nice",
    status: "planned",
    cronHint: "5 * * * *",
  },
  {
    id: "crm_segments",
    name: "CRM segment cache + win-back",
    why: "segment_cache column unused; inactive customers (≥60 days) never re-engaged.",
    frequency: "Nightly / weekly",
    priority: "nice",
    status: "planned",
    cronHint: "0 2 * * *",
  },
  {
    id: "log_retention",
    name: "Log / notification retention",
    why: "Activity, staff inbox, and ledgers grow forever.",
    frequency: "Nightly",
    priority: "nice",
    status: "planned",
    cronHint: "30 2 * * *",
  },
  {
    id: "cleanup",
    name: "Cleanup",
    why: "Old abandoned carts / unused product alerts.",
    frequency: "Weekly",
    priority: "nice",
    status: "planned",
    cronHint: "0 3 * * 0",
  },
  {
    id: "stuck_deliveries",
    name: "Stuck delivery digests",
    why: "Ops miss deliveries stuck in assigned / out_for_delivery.",
    frequency: "Every 30–60 min",
    priority: "nice",
    status: "planned",
    cronHint: "*/30 * * * *",
  },
  {
    id: "event_reminders",
    name: "Event reminders",
    why: "Only useful once real bookings exist.",
    frequency: "Daily",
    priority: "nice",
    status: "planned",
    cronHint: "0 10 * * *",
  },
];

export function getCronJob(id: string): CronJobDefinition | undefined {
  return CRON_JOBS.find((job) => job.id === id);
}

export function cronJobsByPriority(priority: CronJobPriority) {
  return CRON_JOBS.filter((job) => job.priority === priority);
}
