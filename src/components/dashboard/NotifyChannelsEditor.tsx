"use client";

import { Bell, Mail, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  MAX_NOTIFY_EMAILS,
  MAX_NOTIFY_PHONES,
  formatNotifyPhone,
  newNotifyId,
} from "@/lib/notifications/destinations";
import { cn } from "@/lib/utils";
import type { NotifyEmailDestination, NotifyPhoneDestination } from "@/types";

type Channels = { emails: boolean; sms: boolean; push: boolean };

function ChannelPill({
  icon: Icon,
  title,
  checked,
  onChange,
}: {
  icon: typeof Mail;
  title: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 py-2 text-sm transition",
        checked
          ? "border-(--gold)/35 bg-(--gold)/[0.07] text-cream"
          : "border-white/10 bg-white/[0.02] text-muted hover:border-white/20 hover:text-cream",
      )}
    >
      <Icon size={14} className={checked ? "text-gold" : undefined} aria-hidden />
      {title}
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-200",
          checked ? "bg-(--gold)" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-sm transition-all duration-200 ease-out",
            checked ? "translate-x-4 bg-[#1a1408]" : "bg-cream",
          )}
        />
      </span>
    </button>
  );
}

function GoldSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-200",
          checked ? "bg-(--gold)" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-sm transition-all duration-200 ease-out",
            checked ? "translate-x-4 bg-[#1a1408]" : "bg-cream",
          )}
        />
      </span>
    </button>
  );
}

function StaticChip({ children }: { children: string }) {
  return (
    <span className="inline-flex h-11 shrink-0 items-center rounded-sm border border-white/10 bg-black/30 px-3 text-sm text-muted">
      {children}
    </span>
  );
}

export function NotifyChannelsEditor({
  channels,
  emails,
  phones,
  receiptPhone,
  onChannels,
  onEmails,
  onPhones,
}: {
  channels: Channels;
  emails: NotifyEmailDestination[];
  phones: NotifyPhoneDestination[];
  receiptPhone?: string | null;
  onChannels: (value: Channels) => void;
  onEmails: (value: NotifyEmailDestination[]) => void;
  onPhones: (value: NotifyPhoneDestination[]) => void;
}) {
  const addEmail = () => {
    if (emails.length >= MAX_NOTIFY_EMAILS) return;
    onEmails([
      ...emails,
      { id: newNotifyId(), email: "", label: "", active: true },
    ]);
  };

  const addPhone = () => {
    if (phones.length >= MAX_NOTIFY_PHONES) return;
    onPhones([
      ...phones,
      { id: newNotifyId(), phone: "", countryCode: "+1", label: "", active: true },
    ]);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Channels</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <ChannelPill
            icon={Mail}
            title="Email"
            checked={channels.emails}
            onChange={(next) => onChannels({ ...channels, emails: next })}
          />
          <ChannelPill
            icon={MessageSquare}
            title="SMS"
            checked={channels.sms}
            onChange={(next) => onChannels({ ...channels, sms: next })}
          />
          <ChannelPill
            icon={Bell}
            title="Push"
            checked={channels.push}
            onChange={(next) => onChannels({ ...channels, push: next })}
          />
        </div>
      </div>

      <div className={cn(!channels.emails && "opacity-60")}>
        <p className="text-sm font-medium text-cream">Email recipients</p>
        <p className="mt-1 text-xs text-muted">
          Order updates go to every address that is on. Pause one without removing it.
          If none are on, the account email is used.
        </p>
        <ul className="mt-3 space-y-2">
          {emails.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="email"
                value={row.email}
                readOnly={row.locked}
                placeholder="email@example.com"
                aria-label={row.locked ? "Account email" : "Email address"}
                className={cn("min-w-0 flex-1", row.locked && "opacity-80")}
                onChange={(e) =>
                  onEmails(
                    emails.map((item) =>
                      item.id === row.id ? { ...item, email: e.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                value={row.label}
                placeholder="Label"
                aria-label="Email label"
                className="sm:w-36"
                onChange={(e) =>
                  onEmails(
                    emails.map((item) =>
                      item.id === row.id ? { ...item, label: e.target.value } : item,
                    ),
                  )
                }
              />
              <div className="flex items-center gap-2 sm:shrink-0">
                <GoldSwitch
                  checked={row.active}
                  onChange={(next) =>
                    onEmails(
                      emails.map((item) =>
                        item.id === row.id ? { ...item, active: next } : item,
                      ),
                    )
                  }
                  label={row.active ? `Pause ${row.email || "email"}` : `Enable ${row.email || "email"}`}
                />
                {row.locked ? (
                  <span className="inline-flex h-11 w-11" aria-hidden />
                ) : (
                  <Tooltip content="Remove email">
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-white/20 hover:text-cream"
                      onClick={() => onEmails(emails.filter((item) => item.id !== row.id))}
                    >
                      <Trash2 size={15} aria-hidden />
                      <span className="sr-only">Remove email</span>
                    </button>
                  </Tooltip>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={emails.length >= MAX_NOTIFY_EMAILS}
          onClick={addEmail}
        >
          <Plus size={14} aria-hidden />
          Add email
        </Button>
      </div>

      <div className={cn("border-t border-white/10 pt-5", !channels.sms && "opacity-60")}>
        <p className="text-sm font-medium text-cream">Phone numbers</p>
        <p className="mt-1 text-xs text-muted">
          SMS always goes to the phone on the receipt when one is present. Numbers added here also
          get a copy. Pause an extra number without removing it.
        </p>
        <ul className="mt-3 space-y-2">
          {phones.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <StaticChip>SMS</StaticChip>
                <StaticChip>+1</StaticChip>
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={row.phone}
                  placeholder="(555) 123-4567"
                  aria-label="Phone number"
                  className="min-w-0 flex-1"
                  onChange={(e) =>
                    onPhones(
                      phones.map((item) =>
                        item.id === row.id
                          ? { ...item, phone: formatNotifyPhone(e.target.value) }
                          : item,
                      ),
                    )
                  }
                />
                <Input
                  value={row.label}
                  placeholder="Label"
                  aria-label="Phone label"
                  className="sm:w-36"
                  onChange={(e) =>
                    onPhones(
                      phones.map((item) =>
                        item.id === row.id ? { ...item, label: e.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <GoldSwitch
                  checked={row.active}
                  onChange={(next) =>
                    onPhones(
                      phones.map((item) =>
                        item.id === row.id ? { ...item, active: next } : item,
                      ),
                    )
                  }
                  label={row.active ? `Pause ${row.phone || "number"}` : `Enable ${row.phone || "number"}`}
                />
                <Tooltip content="Remove number">
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-white/20 hover:text-cream"
                    onClick={() => onPhones(phones.filter((item) => item.id !== row.id))}
                  >
                    <Trash2 size={15} aria-hidden />
                    <span className="sr-only">Remove number</span>
                  </button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
        {phones.length === 0 ? (
          <p className="mt-3 text-xs text-muted">
            {receiptPhone
              ? `No extra numbers yet. With SMS on, texts go to the receipt number ${receiptPhone}.`
              : "No extra numbers yet. With SMS on, texts go to the phone on the receipt when the customer gives one."}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={phones.length >= MAX_NOTIFY_PHONES}
          onClick={addPhone}
        >
          <Plus size={14} aria-hidden />
          Add number
        </Button>
      </div>
    </div>
  );
}
