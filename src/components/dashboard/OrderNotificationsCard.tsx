"use client";

import { Bell, Mail, MessageSquare, RotateCcw, Smartphone } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  latestNoticeByChannel,
  notifyKindLabel,
  notifyReasonCopy,
  notifyStatusLabel,
  type OrderNotificationLog,
  type OrderNotifyChannel,
} from "@/lib/notifications/order-log";

function ChannelIcon({ channel }: { channel: OrderNotifyChannel }) {
  if (channel === "sms") return <MessageSquare size={14} aria-hidden />;
  if (channel === "push") return <Smartphone size={14} aria-hidden />;
  if (channel === "in_app") return <Bell size={14} aria-hidden />;
  return <Mail size={14} aria-hidden />;
}

function channelTitle(entry: OrderNotificationLog) {
  const channel =
    entry.channel === "in_app" ? "In-app" : entry.channel === "sms" ? "SMS" : entry.channel === "push" ? "Push" : "Email";
  return `${channel} (${entry.audience})`;
}

export function OrderNotificationsCard({
  orderId,
  canResend,
}: {
  orderId: string;
  canResend?: boolean;
}) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["order-notifications", orderId],
    queryFn: async () => {
      const res = await apiFetch<{ ok: true; notifications: OrderNotificationLog[] }>(
        `/api/orders/notifications?orderId=${encodeURIComponent(orderId)}`,
      );
      return res.notifications;
    },
    staleTime: 15_000,
  });

  const resend = useMutation({
    mutationFn: async (entry: { channel: OrderNotifyChannel; kind?: string }) => {
      const res = await apiFetch<{ ok: true; notifications: OrderNotificationLog[] }>(
        "/api/orders/notifications",
        {
          method: "POST",
          body: JSON.stringify({
            orderId,
            channel: entry.channel,
            kind: entry.channel === "email" || entry.channel === "sms" ? "order.confirmed" : entry.kind,
          }),
        },
      );
      return res.notifications;
    },
    onSuccess: (next) => {
      qc.setQueryData(["order-notifications", orderId], next);
    },
  });

  const rows = latestNoticeByChannel(data);

  return (
    <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-5 print:hidden">
      <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Notifications</p>
      <p className="mt-1 text-xs text-muted">
        Email and SMS go out when the order is placed. Later status texts still follow the customer’s SMS switch.
      </p>
      {isLoading ? (
        <p className="mt-4 text-sm text-muted">Loading messages…</p>
      ) : rows.length === 0 ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-sm border border-dashed border-white/15 px-3 py-4 text-sm text-muted">
            No messages recorded yet. Place the order again or send the placed confirmation below.
          </p>
          {canResend ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11 w-full sm:w-auto"
                loading={resend.isPending && resend.variables?.channel === "email"}
                onClick={() => resend.mutate({ channel: "email" })}
              >
                Send email
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11 w-full sm:w-auto"
                loading={resend.isPending && resend.variables?.channel === "sms"}
                onClick={() => resend.mutate({ channel: "sms" })}
              >
                Send SMS
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-white/10">
          {rows.map((entry) => {
            const status = notifyStatusLabel(entry);
            return (
              <li key={`${entry.audience}-${entry.channel}`} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-cream">
                    <ChannelIcon channel={entry.channel} />
                    {channelTitle(entry)}
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                        status === "sent"
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                          : status === "skipped"
                            ? "border-white/15 bg-white/5 text-muted"
                            : "border-(--danger)/35 bg-(--danger)/10 text-(--danger)",
                      )}
                    >
                      {status}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {notifyKindLabel(entry.kind)}
                    {entry.trigger === "manual_resend" ? " · Re-sent" : ""}
                    {" · "}
                    {notifyReasonCopy(entry)}
                  </p>
                </div>
                {canResend ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-11 w-full shrink-0 sm:w-auto"
                    loading={resend.isPending && resend.variables?.channel === entry.channel}
                    onClick={() => resend.mutate(entry)}
                  >
                    {!resend.isPending || resend.variables?.channel !== entry.channel ? (
                      <RotateCcw size={13} aria-hidden />
                    ) : null}
                    Re-send
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {resend.isError ? (
        <p className="mt-3 text-sm text-(--danger)">
          {resend.error instanceof Error ? resend.error.message : "Could not re-send."}
        </p>
      ) : null}
    </section>
  );
}
