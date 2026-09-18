"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronDown, MapPin, Package, ShieldAlert, Truck } from "lucide-react";
import { ShipdaySettingsCard } from "@/components/dashboard/ShipdaySettingsCard";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { PanelLoading } from "@/components/dashboard/DashboardLoading";
import { apiFetchDeliverySettings, apiPatchDeliverySettings } from "@/lib/api-mutations";
import { ALCOHOL_HANDOFF_NOTE, type DispatchPolicy } from "@/lib/commerce/dispatch";
import { upsertRuntimeLocation } from "@/lib/runtime-data";
import { useServerConnection } from "@/hooks/useServerConnection";
import { getAllLocations } from "@/data/locations";
import { cn } from "@/lib/utils";

type StoreDispatchRow = {
  id: string;
  shortName: string;
  name: string;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  internalDeliveryEnabled: boolean;
  shipdayEnabled: boolean;
  dispatchPolicy: DispatchPolicy;
};

const POLICIES: {
  id: DispatchPolicy;
  label: string;
  hint: string;
}[] = [
  { id: "manual", label: "Manual", hint: "Staff assign a driver or send to Shipday." },
  {
    id: "internal_first",
    label: "Internal first",
    hint: "Assign a free driver at confirm; otherwise Shipday.",
  },
  {
    id: "shipday_always",
    label: "Shipday always",
    hint: "Send to Shipday first; own drivers only as fallback.",
  },
];

function policyHint(policy: DispatchPolicy) {
  return POLICIES.find((item) => item.id === policy)?.hint ?? "";
}

function policyLabel(policy: DispatchPolicy) {
  return POLICIES.find((item) => item.id === policy)?.label ?? policy;
}

function StatusChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        on
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-white/10 bg-white/[0.03] text-muted",
      )}
    >
      {label} {on ? "on" : "off"}
    </span>
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
        "inline-flex min-h-11 items-center gap-3 rounded-sm px-1 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
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
      <span className="text-sm text-cream">{label}</span>
    </button>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof Package;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-[5.5rem] w-full items-start justify-between gap-3 rounded-sm border px-3.5 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)",
        checked
          ? "border-(--gold)/35 bg-(--gold)/[0.07]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <Icon size={14} className={checked ? "text-gold" : "text-muted"} aria-hidden />
          <span className="text-sm font-medium text-cream">{title}</span>
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted">{description}</span>
      </span>
      <span
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
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

function PolicyPicker({
  value,
  disabled,
  onChange,
}: {
  value: DispatchPolicy;
  disabled?: boolean;
  onChange: (next: DispatchPolicy) => void;
}) {
  return (
    <div>
      <div
        className="grid grid-cols-1 gap-1 rounded-sm border border-white/10 bg-white/[0.03] p-1 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Dispatch policy at confirmation"
      >
        {POLICIES.map((policy) => {
          const active = value === policy.id;
          return (
            <button
              key={policy.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(policy.id)}
              className={cn(
                "min-h-11 rounded-sm px-3 text-center text-xs font-medium tracking-wide transition sm:min-h-10 sm:px-2 sm:text-[11px] md:text-xs",
                active
                  ? "bg-(--gold)/18 text-gold shadow-[inset_0_0_0_1px_rgba(201,169,98,0.35)]"
                  : "text-muted hover:bg-white/[0.04] hover:text-cream",
                disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted",
              )}
            >
              {policy.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{policyHint(value)}</p>
    </div>
  );
}

function StoreAccordion({
  row,
  open,
  busy,
  onToggle,
  onSave,
}: {
  row: StoreDispatchRow;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (patch: Partial<StoreDispatchRow>) => void;
}) {
  const panelId = useId();
  const dispatchDisabled = !row.deliveryAvailable || busy;
  const onlineClosed = !row.pickupAvailable && !row.deliveryAvailable;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-sm border transition-colors",
        open ? "border-(--gold)/35 bg-(--gold)/[0.04]" : "border-white/10 bg-black/25",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full min-h-14 items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--gold) sm:px-5"
      >
        <MapPin size={14} className="shrink-0 text-gold" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-cream">{row.shortName}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{row.name}</span>
        </span>
        <span className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
          {busy ? (
            <span className="text-[11px] uppercase tracking-wider text-muted">Saving…</span>
          ) : null}
          <StatusChip on={row.pickupAvailable} label="Pickup" />
          <StatusChip on={row.deliveryAvailable} label="Delivery" />
          {row.deliveryAvailable ? (
            <span className="inline-flex items-center rounded-sm border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
              {policyLabel(row.dispatchPolicy)}
            </span>
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
        <div id={panelId} className="border-t border-white/10 px-4 py-4 sm:px-5 sm:py-5">
          <div className="mb-4 flex flex-wrap gap-1.5 sm:hidden">
            <StatusChip on={row.pickupAvailable} label="Pickup" />
            <StatusChip on={row.deliveryAvailable} label="Delivery" />
          </div>

          <p className="text-[10px] uppercase tracking-[0.16em] text-gold">
            {row.shortName} · customer fulfillment
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ChannelCard
              icon={Package}
              title="Pickup"
              description="Customers collect at this store after kitchen packs."
              checked={row.pickupAvailable}
              disabled={busy}
              onChange={(next) => onSave({ pickupAvailable: next })}
            />
            <ChannelCard
              icon={Truck}
              title="Delivery"
              description="Customers receive orders by own driver or Shipday."
              checked={row.deliveryAvailable}
              disabled={busy}
              onChange={(next) => onSave({ deliveryAvailable: next })}
            />
          </div>
          {onlineClosed ? (
            <p className="mt-2 text-xs text-amber-200/90">
              Pickup and delivery are both off. This store will not take those orders online. POS is
              unchanged.
            </p>
          ) : null}

          <div
            className={cn(
              "mt-5 border-t border-white/10 pt-4",
              !row.deliveryAvailable && "opacity-60",
            )}
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-gold">
              {row.shortName} · delivery dispatch
            </p>
            {!row.deliveryAvailable ? (
              <p className="mt-1 text-xs text-muted">
                Turn delivery on to choose own drivers, Shipday, and confirmation policy.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Runs when the order is confirmed — not when kitchen marks Ready.
              </p>
            )}
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start">
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
                <SettingSwitch
                  label="Own drivers"
                  checked={row.internalDeliveryEnabled}
                  disabled={dispatchDisabled}
                  onChange={(next) => onSave({ internalDeliveryEnabled: next })}
                />
                <SettingSwitch
                  label="Shipday"
                  checked={row.shipdayEnabled}
                  disabled={dispatchDisabled}
                  onChange={(next) => onSave({ shipdayEnabled: next })}
                />
              </div>
              <PolicyPicker
                value={row.dispatchPolicy}
                disabled={dispatchDisabled}
                onChange={(next) => onSave({ dispatchPolicy: next })}
              />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function DeliverySettingsPanel() {
  const [rows, setRows] = useState<StoreDispatchRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { ready: dbReady } = useServerConnection();

  const load = useCallback(async () => {
    if (!dbReady) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetchDeliverySettings();
      setRows(data.locations);
      setOpenId((current) => {
        if (current && data.locations.some((loc) => loc.id === current)) return current;
        return data.locations[0]?.id ?? null;
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load delivery settings.");
    } finally {
      setLoading(false);
    }
  }, [dbReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRow = async (locationId: string, patch: Partial<StoreDispatchRow>) => {
    setBusyId(locationId);
    setError("");
    try {
      const saved = await apiPatchDeliverySettings({ locationId, ...patch });
      setRows((list) =>
        list.map((row) =>
          row.id === locationId
            ? {
                ...row,
                pickupAvailable: saved.pickupAvailable,
                deliveryAvailable: saved.deliveryAvailable,
                internalDeliveryEnabled: saved.internalDeliveryEnabled,
                shipdayEnabled: saved.shipdayEnabled,
                dispatchPolicy: saved.dispatchPolicy,
              }
            : row,
        ),
      );
      const existing = getAllLocations().find((loc) => loc.id === locationId);
      if (existing) {
        upsertRuntimeLocation({
          ...existing,
          pickupAvailable: saved.pickupAvailable,
          deliveryAvailable: saved.deliveryAvailable,
          internalDeliveryEnabled: saved.internalDeliveryEnabled,
          shipdayEnabled: saved.shipdayEnabled,
          dispatchPolicy: saved.dispatchPolicy,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save store settings.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-w-0 pt-6">
      <div className="border-b border-white/10 pb-5">
        <h2 className="font-display text-2xl text-cream sm:text-3xl">Settings</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Turn pickup and delivery on per store, then choose how delivery is dispatched. Fees and
          radius stay in Locations.
        </p>
      </div>

      {!dbReady ? <ConnectionNotice className="mt-4" feature="save delivery settings" preview /> : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-6 space-y-6">
        <ShipdaySettingsCard />

        <section>
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Truck size={14} className="text-gold" aria-hidden />
              <h3 className="font-display text-lg text-cream">Stores</h3>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Open a store to edit its pickup, delivery, and dispatch. One store at a time keeps
              each location’s settings separate.
            </p>
          </div>

          {loading ? (
            <div className="rounded-sm border border-white/10 bg-black/20">
              <PanelLoading label="Loading stores…" />
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-sm border border-white/10 bg-black/20 px-4 py-8 text-sm text-muted sm:px-5">
              No stores in your scope.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <StoreAccordion
                  key={row.id}
                  row={row}
                  open={openId === row.id}
                  busy={busyId === row.id}
                  onToggle={() => setOpenId((current) => (current === row.id ? null : row.id))}
                  onSave={(patch) => void saveRow(row.id, patch)}
                />
              ))}
            </div>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldAlert size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden />
            {ALCOHOL_HANDOFF_NOTE}
          </p>
        </section>
      </div>
    </div>
  );
}
