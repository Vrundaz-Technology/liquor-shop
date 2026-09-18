"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Bell,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Headphones,
  Package,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import { useNotificationDevicePrefs } from "@/hooks/useNotificationDevicePrefs";
import {
  MAX_CUSTOM,
  customSoundFromFile,
  playNotificationSound,
  soundOptions,
  unlockNotificationAudio,
} from "@/lib/notifications/device-prefs";
import { formatStaffNotificationWhen } from "@/lib/notifications/format";
import { confirmAction } from "@/store/dialog";

export type StaffInboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
  severity: string;
};

function typeIcon(type: string) {
  if (type.startsWith("order")) return Package;
  if (type.startsWith("transfer")) return ArrowLeftRight;
  if (type.startsWith("support")) return Headphones;
  return Bell;
}

function SettingsAccordion({
  title,
  description,
  open,
  onToggle,
  overflowVisible,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  overflowVisible?: boolean;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <div
      className={cn(
        "glass border border-white/10",
        overflowVisible && open ? "relative z-20 overflow-visible" : "overflow-hidden",
        open && "border-(--gold)/25",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full min-h-12 items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--gold) sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-cream">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-xs text-muted">{description}</span>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            "shrink-0 text-muted transition-transform duration-200",
            open && "rotate-180 text-gold",
          )}
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-white/10">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SettingSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)",
        checked ? "bg-(--gold)" : "bg-white/20",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-sm transition-all duration-200 ease-out",
          checked ? "translate-x-5 bg-[#1a1408]" : "bg-cream",
        )}
      />
    </button>
  );
}

export function NotificationsPanel() {
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { prefs, update } = useNotificationDevicePrefs();
  const [addError, setAddError] = useState("");
  const [openSection, setOpenSection] = useState({
    actions: true,
    sounds: true,
    inbox: true,
  });
  const toggleSection = (id: keyof typeof openSection) => {
    setOpenSection((current) => ({ ...current, [id]: !current[id] }));
  };

  const inbox = useQuery({
    queryKey: ["staff-notifications", "inbox"],
    queryFn: async () =>
      apiFetch<{ ok: true; items: StaffInboxItem[]; unread: number }>(
        "/api/staff-notifications?limit=80",
      ),
    staleTime: 15_000,
  });

  const mutateInbox = useMutation({
    mutationFn: async (
      payload: { all: true } | { ids: string[] } | { clear: true } | { clearIds: string[] },
    ) =>
      apiFetch<{ ok: true; unread: number }>("/api/staff-notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff-notifications"] });
    },
  });

  const items = inbox.data?.items ?? [];
  const unread = inbox.data?.unread ?? 0;

  const preview = () => {
    unlockNotificationAudio();
    playNotificationSound({ ...prefs, enabled: true, soundEnabled: true }, { force: true });
  };

  const addSound = async (file: File | undefined) => {
    setAddError("");
    if (!file) return;
    if (prefs.customSounds.length >= MAX_CUSTOM) {
      setAddError(`You can save up to ${MAX_CUSTOM} custom sounds on this device.`);
      return;
    }
    try {
      const clip = await customSoundFromFile(file);
      update({
        customSounds: [...prefs.customSounds, clip],
        soundId: clip.id,
        soundEnabled: true,
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add that sound.");
    }
  };

  const removeCustom = () => {
    const next = prefs.customSounds.filter((s) => s.id !== prefs.soundId);
    update({
      customSounds: next,
      soundId: next[0]?.id ?? "chime",
    });
  };

  const clearAll = async () => {
    if (!items.length) return;
    const ok = await confirmAction({
      title: "Clear all notifications?",
      description: "They’ll leave your inbox. Other staff still see theirs.",
      confirmLabel: "Clear all",
      tone: "danger",
    });
    if (ok) mutateInbox.mutate({ clear: true });
  };

  const openItem = (item: StaffInboxItem) => {
    if (!item.readAt) mutateInbox.mutate({ ids: [item.id] });
    if (item.href) router.push(item.href);
  };

  const isCustomSelected = prefs.customSounds.some((s) => s.id === prefs.soundId);

  return (
    <section className="mt-0 min-w-0 space-y-5">
      <p className="text-sm text-muted lg:hidden">Sounds and read behaviour for this device.</p>

      <SettingsAccordion
        title="Actions"
        description="Read behaviour for this device."
        open={openSection.actions}
        onToggle={() => toggleSection("actions")}
      >
        <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--gold)]"
            checked={prefs.autoMarkRead}
            onChange={(e) => update({ autoMarkRead: e.target.checked })}
          />
          <span className="text-sm text-cream">Auto mark notifications as read</span>
        </label>
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <span className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--gold)]"
              checked={!prefs.enabled}
              onChange={(e) => update({ enabled: !e.target.checked })}
            />
            <span className="text-sm text-cream">Disable notifications</span>
          </span>
          <Tooltip content="Stops the unread badge and alert sound on this device. Your inbox stays available.">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-muted"
          >
            <CircleHelp size={14} aria-hidden />
            <span className="sr-only">
              Stops the unread badge and alert sound on this device. Your inbox stays available.
            </span>
          </span>
          </Tooltip>
        </label>
      </SettingsAccordion>

      <SettingsAccordion
        title="Sounds"
        description="Pick a built-in clip or add your own. Browsers may need one click on the page before audio is allowed."
        open={openSection.sounds}
        onToggle={() => toggleSection("sounds")}
        overflowVisible
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-sm text-cream">Notifications</p>
            <p className="mt-0.5 text-xs text-muted">
              Play a short sound when an order, transfer, or support update arrives.
            </p>
          </div>
          <SettingSwitch
            checked={prefs.soundEnabled && prefs.enabled}
            disabled={!prefs.enabled}
            onChange={(next) => {
              update({ soundEnabled: next });
              if (next) unlockNotificationAudio();
            }}
            label="Notification sounds"
          />
        </div>
        <div className="relative z-10 flex flex-col gap-3 overflow-visible px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <NativeSelect
            aria-label="Notification sound"
            value={prefs.soundId}
            disabled={!prefs.enabled || !prefs.soundEnabled}
            onChange={(e) => update({ soundId: e.target.value })}
            wrapperClassName="min-w-0 flex-1"
          >
            {soundOptions(prefs).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </NativeSelect>
          <div className="flex shrink-0 flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void addSound(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!prefs.enabled || prefs.customSounds.length >= MAX_CUSTOM}
              onClick={() => fileRef.current?.click()}
            >
              Add sound
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!prefs.enabled || !prefs.soundEnabled}
              onClick={preview}
            >
              <Volume2 size={14} aria-hidden />
              Preview
            </Button>
            {isCustomSelected ? (
              <Button type="button" size="sm" variant="ghost" onClick={removeCustom}>
                Remove clip
              </Button>
            ) : null}
          </div>
        </div>
        {addError ? <p className="px-4 pb-3 text-xs text-(--danger) sm:px-5">{addError}</p> : null}
      </SettingsAccordion>

      <SettingsAccordion
        title="Inbox"
        description={
          unread > 0
            ? `${unread} unread · mark read or clear from this device’s view.`
            : "All caught up · mark read or clear from this device’s view."
        }
        open={openSection.inbox}
        onToggle={() => toggleSection("inbox")}
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-white/10 px-4 py-2.5 text-[12px] sm:px-5">
          <button
            type="button"
            disabled={unread === 0 || mutateInbox.isPending}
            onClick={() => mutateInbox.mutate({ all: true })}
            className="inline-flex items-center gap-1.5 text-gold transition hover:text-cream disabled:opacity-40"
          >
            <CheckCheck size={13} aria-hidden />
            Mark all read
          </button>
          <button
            type="button"
            disabled={!items.length || mutateInbox.isPending}
            onClick={() => void clearAll()}
            className="inline-flex items-center gap-1.5 text-muted transition hover:text-cream disabled:opacity-40"
          >
            <Trash2 size={13} aria-hidden />
            Clear all
          </button>
        </div>

        {inbox.isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Loading…</p>
        ) : inbox.isError ? (
          <p className="px-4 py-10 text-center text-sm text-(--danger)">Could not load notifications.</p>
        ) : !items.length ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <Bell size={28} className="text-white/25" aria-hidden />
            <p className="mt-3 text-sm text-muted">No notifications</p>
            <p className="mt-1 max-w-[18rem] text-xs text-white/35">
              New orders, stock transfers, and support tickets will show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {items.map((item) => {
              const Icon = typeIcon(item.type);
              const unreadItem = !item.readAt;
              return (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3.5 pr-12 text-left transition hover:bg-white/[0.04] sm:px-5",
                      unreadItem && "bg-(--gold)/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border",
                        unreadItem
                          ? "border-(--gold)/35 bg-(--gold)/10 text-gold"
                          : "border-white/10 text-muted",
                      )}
                    >
                      <Icon size={15} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm leading-snug",
                          unreadItem ? "font-medium text-cream" : "text-cream/90",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">{item.body}</span>
                      <span className="mt-1.5 block text-[11px] text-white/35">
                        {formatStaffNotificationWhen(item.createdAt, "full")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Clear notification"
                    onClick={() => mutateInbox.mutate({ clearIds: [item.id] })}
                    className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted transition hover:bg-white/10 hover:text-cream"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsAccordion>
    </section>
  );
}
