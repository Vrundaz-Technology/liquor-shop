"use client";

import { SupportAttachmentList } from "@/components/support/SupportAttachments";
import { cn } from "@/lib/utils";
import type { SupportMessage } from "@/types";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SupportThread({
  messages,
  empty = "No messages yet.",
  viewer = "customer",
}: {
  messages?: SupportMessage[];
  empty?: string;
  viewer?: "customer" | "staff";
}) {
  if (!messages?.length) {
    return <p className="text-sm text-muted">{empty}</p>;
  }

  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        if (message.authorRole === "system") {
          return (
            <li key={message.id} className="px-1 py-1 text-center text-xs text-muted">
              {message.body}
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.12em]">
                {formatWhen(message.createdAt)}
              </span>
            </li>
          );
        }
        const staff = message.authorRole === "staff";
        return (
          <li
            key={message.id}
            className={cn(
              "rounded-sm border px-3 py-2.5 text-sm",
              staff ? "border-(--gold)/25 bg-(--gold)/5" : "border-white/10 bg-black/30",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted">
                {message.authorName}
                {" · "}
                {staff ? (viewer === "staff" ? "Staff" : "Store reply") : viewer === "staff" ? "Customer" : "You"}
              </p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted">
                {formatWhen(message.createdAt)}
              </p>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-cream">{message.body}</p>
            <SupportAttachmentList attachments={message.attachments} />
          </li>
        );
      })}
    </ol>
  );
}
