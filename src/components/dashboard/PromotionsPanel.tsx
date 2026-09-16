"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BadgePercent, BarChart3, Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { PromotionsPerformancePanel } from "@/components/dashboard/PromotionsPerformancePanel";
import {
  compareValues,
  SortableTh,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import { cn, nativeSelectClass } from "@/lib/utils";
import { categories as shopCategories } from "@/data/categories";
import { getAllLocations } from "@/data/locations";
import { useUserStore } from "@/store/user";
import { accessibleLocations } from "@/lib/auth/location-access";
import {
  hasAtMostDecimals,
  moneyAmountSchema,
  parseFiniteNumber,
  percentFractionSchema,
  prioritySchema,
  roundMoney,
  sanitizeMoneyInput,
  sanitizePercentFractionInput,
} from "@/lib/validation/money";

type PromoRules = {
  categories?: string[];
  brands?: string[];
  buyQty?: number;
  getQty?: number;
  firstOrderOnly?: boolean;
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
};

type Promo = {
  id: string;
  scope: string;
  name: string;
  code: string | null;
  type: string;
  value: number;
  priority: number;
  active: boolean;
  minSubtotal: number | null;
  locationId: string | null;
  stackable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  rules: PromoRules;
};

type PromoType = "percent" | "fixed" | "free_delivery" | "bogo";
type PromoScope = "organization" | "location" | "platform";

type FormState = {
  name: string;
  code: string;
  type: PromoType;
  value: string;
  priority: string;
  scope: PromoScope;
  locationId: string;
  minSubtotal: string;
  active: boolean;
  stackable: boolean;
  firstOrderOnly: boolean;
  category: string;
  brand: string;
  buyQty: string;
  getQty: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
};

const DAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const fieldClass = cn(nativeSelectClass, "mt-1.5 w-full");
const fieldErrorClass = cn(
  nativeSelectClass,
  "mt-1.5 w-full border-(--danger)/55 bg-(--danger)/5 focus:border-(--danger)/70",
);
const labelClass = "block text-[10px] uppercase tracking-[0.16em] text-muted";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="mt-1.5 flex items-start gap-1.5 normal-case tracking-normal text-xs text-(--danger)">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </span>
  );
}

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string) {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function emptyForm(defaultLocationId: string): FormState {
  return {
    name: "",
    code: "",
    type: "percent",
    value: "0.10",
    priority: "100",
    scope: "organization",
    locationId: defaultLocationId,
    minSubtotal: "",
    active: true,
    stackable: false,
    firstOrderOnly: false,
    category: "",
    brand: "",
    buyQty: "2",
    getQty: "1",
    daysOfWeek: [],
    startTime: "",
    endTime: "",
    startsAt: "",
    endsAt: "",
  };
}

function formFromPromo(promo: Promo, defaultLocationId: string): FormState {
  const type = (["percent", "fixed", "free_delivery", "bogo"].includes(promo.type)
    ? promo.type
    : "percent") as PromoType;
  const scope = (["organization", "location", "platform"].includes(promo.scope)
    ? promo.scope
    : "organization") as PromoScope;
  return {
    name: promo.name,
    code: promo.code ?? "",
    type,
    value:
      type === "percent"
        ? String(promo.value)
        : type === "fixed"
          ? Number(promo.value).toFixed(2)
          : "0",
    priority: String(promo.priority ?? 100),
    scope,
    locationId: promo.locationId ?? defaultLocationId,
    minSubtotal: promo.minSubtotal == null ? "" : Number(promo.minSubtotal).toFixed(2),
    active: Boolean(promo.active),
    stackable: Boolean(promo.stackable),
    firstOrderOnly: Boolean(promo.rules?.firstOrderOnly),
    category: promo.rules?.categories?.[0] ?? "",
    brand: promo.rules?.brands?.[0] ?? "",
    buyQty: String(promo.rules?.buyQty ?? 2),
    getQty: String(promo.rules?.getQty ?? 1),
    daysOfWeek: promo.rules?.daysOfWeek ?? [],
    startTime: promo.rules?.startTime ?? "",
    endTime: promo.rules?.endTime ?? "",
    startsAt: toLocalInputValue(promo.startsAt),
    endsAt: toLocalInputValue(promo.endsAt),
  };
}

function discountValueHint(
  type: "percent" | "fixed",
  raw: string,
): { text: string; tone: "muted" | "live" | "warn" } {
  const trimmed = raw.trim();

  if (type === "percent") {
    if (!trimmed || trimmed === ".") {
      return { text: "Fraction 0–1. Example: 0.20 = 20% off.", tone: "muted" };
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return { text: "Enter a number between 0 and 1.", tone: "warn" };
    }
    if (n < 0) return { text: "Percent cannot be negative.", tone: "warn" };
    if (n > 1) {
      return {
        text: "Use a fraction ≤ 1 (e.g. 0.25 for 25%, not 25).",
        tone: "warn",
      };
    }
    const pct = n * 100;
    const pctLabel =
      Math.abs(pct - Math.round(pct)) < 1e-9
        ? String(Math.round(pct))
        : pct
            .toFixed(2)
            .replace(/\.?0+$/, "");
    const fracLabel = trimmed.endsWith(".") ? trimmed : trimmed;
    return {
      text: `${fracLabel} = ${pctLabel}% off`,
      tone: "live",
    };
  }

  if (!trimmed || trimmed === ".") {
    return { text: "USD amount off the eligible subtotal (e.g. 10.00).", tone: "muted" };
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) {
    return { text: "Enter a valid dollar amount.", tone: "warn" };
  }
  if (amount < 0) return { text: "Amount cannot be negative.", tone: "warn" };
  return {
    text: `$${amount.toFixed(2)} off`,
    tone: "live",
  };
}

function ActiveSwitch({
  active,
  disabled,
  onChange,
  label = "Active",
}: {
  active: boolean;
  disabled?: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--gold)/40",
        active
          ? "border-emerald-500/40 bg-emerald-500/[0.08] hover:border-emerald-400/55 hover:bg-emerald-500/[0.12]"
          : "border-white/12 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
        disabled && "cursor-wait opacity-60",
      )}
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          active ? "bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-cream shadow-sm transition-transform duration-200 ease-out",
            active && "translate-x-4",
          )}
        />
      </span>
      <span
        className={cn(
          "min-w-[4.25rem] text-[10px] font-semibold uppercase tracking-[0.16em]",
          active ? "text-emerald-100" : "text-muted",
        )}
      >
        {active ? "Active" : "Inactive"}
      </span>
    </button>
  );
}

export function PromotionsPanel() {
  const qc = useQueryClient();
  const profile = useUserStore((s) => s.profile);
  const stores = accessibleLocations(profile, getAllLocations());
  const defaultLocationId = stores[0]?.id ?? "";

  const [section, setSection] = useState<"promotions" | "performance">("promotions");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultLocationId));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const { sortKey, sortDir, toggleSort } = useTableSort<
    "name" | "scope" | "type" | "priority" | "status"
  >("priority", "desc", ["priority"]);

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ["promotions"],
    queryFn: async () => {
      const json = await apiFetch<{ ok: true; promotions: Promo[] }>("/api/promotions");
      return json.promotions;
    },
  });

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Promotion name is required.";
    else if (form.name.trim().length > 120) next.name = "Name must be 120 characters or less.";

    if (form.code) {
      if (form.code.length > 40) next.code = "Code must be 40 characters or less.";
      else if (!/^[A-Z0-9_-]+$/.test(form.code)) {
        next.code = "Use only A–Z, 0–9, underscore, or hyphen.";
      }
    }

    if (form.scope === "location" && !form.locationId) {
      next.locationId = "Choose which store this offer applies to.";
    }

    if (form.type === "percent" || form.type === "fixed") {
      const valueNum = parseFiniteNumber(form.value);
      if (valueNum == null) next.value = "Enter a valid number.";
      else if (form.type === "percent") {
        const check = percentFractionSchema.safeParse(valueNum);
        if (!check.success) next.value = check.error.issues[0]?.message ?? "Invalid percent.";
      } else {
        const check = moneyAmountSchema.safeParse(valueNum);
        if (!check.success) next.value = check.error.issues[0]?.message ?? "Invalid amount.";
      }
    }

    if (form.type === "bogo") {
      const buy = parseFiniteNumber(form.buyQty);
      const get = parseFiniteNumber(form.getQty);
      if (buy == null || buy < 1) next.buyQty = "Enter buy quantity.";
      if (get == null || get < 1) next.getQty = "Enter get quantity.";
    }

    if (form.minSubtotal.trim()) {
      const minNum = parseFiniteNumber(form.minSubtotal);
      if (minNum == null) next.minSubtotal = "Enter a valid amount.";
      else {
        const check = moneyAmountSchema.safeParse(minNum);
        if (!check.success) {
          next.minSubtotal = check.error.issues[0]?.message ?? "Invalid min subtotal.";
        }
      }
    }

    const priorityNum = parseFiniteNumber(form.priority);
    if (priorityNum == null) next.priority = "Enter a whole number priority.";
    else {
      const check = prioritySchema.safeParse(priorityNum);
      if (!check.success) next.priority = check.error.issues[0]?.message ?? "Invalid priority.";
    }

    if (form.startsAt && form.endsAt && new Date(form.startsAt) > new Date(form.endsAt)) {
      next.endsAt = "End must be after start.";
    }

    return next;
  }, [form]);

  const canSubmit = Object.keys(errors).length === 0;

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setTouched({});
    setForm(emptyForm(defaultLocationId));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(defaultLocationId));
    setTouched({});
    setModalOpen(true);
  };

  const openEdit = (promo: Promo) => {
    setEditingId(promo.id);
    setForm(formFromPromo(promo, defaultLocationId));
    setTouched({});
    setModalOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const valueNum =
        form.type === "free_delivery" || form.type === "bogo"
          ? 0
          : parseFiniteNumber(form.value) ?? 0;
      const minNum = form.minSubtotal.trim() ? parseFiniteNumber(form.minSubtotal) : null;
      const priorityNum = parseFiniteNumber(form.priority) ?? 100;
      const rules: PromoRules = {};
      if (form.category) rules.categories = [form.category];
      if (form.brand.trim()) rules.brands = [form.brand.trim()];
      if (form.firstOrderOnly) rules.firstOrderOnly = true;
      if (form.daysOfWeek.length) rules.daysOfWeek = form.daysOfWeek;
      if (form.startTime) rules.startTime = form.startTime;
      if (form.endTime) rules.endTime = form.endTime;
      if (form.type === "bogo") {
        rules.buyQty = parseFiniteNumber(form.buyQty) ?? 2;
        rules.getQty = parseFiniteNumber(form.getQty) ?? 1;
      }

      await apiFetch("/api/promotions", {
        method: "POST",
        body: JSON.stringify({
          id: editingId ?? undefined,
          scope: form.scope,
          locationId: form.scope === "location" ? form.locationId : null,
          name: form.name.trim(),
          code: form.code.trim() || null,
          type: form.type,
          value:
            form.type === "percent"
              ? roundMoney(valueNum, 4)
              : form.type === "fixed"
                ? roundMoney(valueNum, 2)
                : 0,
          priority: priorityNum,
          minSubtotal: minNum == null ? null : roundMoney(minNum, 2),
          stackable: form.stackable,
          active: form.active,
          startsAt: fromLocalInputValue(form.startsAt),
          endsAt: fromLocalInputValue(form.endsAt),
          rules: Object.keys(rules).length ? rules : null,
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promotions"] });
      void qc.invalidateQueries({ queryKey: ["promotions-performance"] });
      closeModal();
    },
  });

  const deletePromo = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/promotions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promotions"] });
      void qc.invalidateQueries({ queryKey: ["promotions-performance"] });
    },
  });

  const filteredPromotions = useMemo(() => {
    if (statusFilter === "active") return promotions.filter((p) => p.active);
    if (statusFilter === "inactive") return promotions.filter((p) => !p.active);
    return promotions;
  }, [promotions, statusFilter]);

  const sortedPromotions = useMemo(() => {
    return [...filteredPromotions].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return compareValues(a.name, b.name, sortDir);
        case "scope":
          return compareValues(a.scope, b.scope, sortDir);
        case "type":
          return compareValues(a.type, b.type, sortDir);
        case "status":
          return compareValues(a.active ? 1 : 0, b.active ? 1 : 0, sortDir);
        case "priority":
        default:
          return compareValues(a.priority, b.priority, sortDir);
      }
    });
  }, [filteredPromotions, sortDir, sortKey]);

  const statusCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const p of promotions) {
      if (p.active) active += 1;
      else inactive += 1;
    }
    return { all: promotions.length, active, inactive };
  }, [promotions]);

  const markTouched = (key: string) => setTouched((t) => ({ ...t, [key]: true }));
  const show = (key: string) => (touched[key] ? errors[key] : undefined);

  const toggleDay = (day: number) => {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day].sort(),
    }));
  };

  const submitForm = () => {
    setTouched({
      name: true,
      code: true,
      value: true,
      minSubtotal: true,
      priority: true,
      locationId: true,
      buyQty: true,
      getQty: true,
      endsAt: true,
    });
    if (!canSubmit) return;
    save.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Marketing</p>
          <h3 className="mt-1 font-display text-xl text-cream sm:text-2xl">Promotions</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {section === "performance"
              ? "How each offer is performing — who is using it, and what they spend."
              : "Platform, owner, and store offers. Location beats organization beats platform; higher priority wins within a scope."}
          </p>
        </div>
        {section === "promotions" ? (
          <Button type="button" onClick={openCreate} className="min-h-11 w-full shrink-0 sm:w-auto">
            <Plus size={16} aria-hidden />
            New promotion
          </Button>
        ) : null}
      </div>

      <div
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/10 px-1"
        role="tablist"
        aria-label="Promotions sections"
      >
        {(
          [
            { id: "promotions" as const, label: "Promotions", icon: BadgePercent },
            { id: "performance" as const, label: "Performance", icon: BarChart3 },
          ] as const
        ).map((tab) => {
          const active = section === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(tab.id)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs uppercase tracking-[0.14em] transition-colors sm:px-4 sm:text-sm",
                active
                  ? "border-(--gold) text-cream"
                  : "border-transparent text-muted hover:text-cream",
              )}
            >
              <Icon size={14} className={active ? "text-gold" : undefined} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {section === "performance" ? <PromotionsPerformancePanel /> : null}

      {section === "promotions" ? (
        isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : promotions.length === 0 ? (
          <div className="rounded-sm border border-dashed border-white/15 px-4 py-10 text-center">
            <p className="text-sm text-muted">No promotions yet.</p>
            <Button type="button" className="mt-4 min-h-11" onClick={openCreate}>
              <Plus size={16} aria-hidden />
              Create your first offer
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="inline-flex rounded-sm border border-white/10 p-0.5"
              role="group"
              aria-label="Filter by status"
            >
              {(
                [
                  { key: "all", label: "All", count: statusCounts.all },
                  { key: "active", label: "Active", count: statusCounts.active },
                  { key: "inactive", label: "Inactive", count: statusCounts.inactive },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition",
                    statusFilter === tab.key
                      ? "bg-gold/15 text-gold"
                      : "text-muted hover:text-cream",
                  )}
                  aria-pressed={statusFilter === tab.key}
                >
                  {tab.label}
                  <span className="tabular-nums text-white/40">{tab.count}</span>
                </button>
              ))}
            </div>

            {statusFilter !== "all" ? (
              <ActiveFiltersBar
                className="mt-3"
                resultCount={filteredPromotions.length}
                resultNoun="promotion"
                chips={[
                  {
                    id: "status",
                    label: statusFilter === "active" ? "Active" : "Inactive",
                    onRemove: () => setStatusFilter("all"),
                  },
                ]}
                onClearAll={() => setStatusFilter("all")}
              />
            ) : null}

            {filteredPromotions.length === 0 ? (
              <div className="rounded-sm border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
                No {statusFilter} promotions.
              </div>
            ) : (
              <div className={tableWrapClass}>
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead>
                    <tr className={tableHeadRowClass}>
                      <SortableTh
                        label="Offer"
                        column="name"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Scope"
                        column="scope"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Type"
                        column="type"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Priority"
                        column="priority"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Status"
                        column="status"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPromotions.map((p) => (
                      <tr
                        key={p.id}
                        className={cn(tableRowClass, !p.active && "opacity-75")}
                      >
                        <td className={cn(tableCellClass, "min-w-[12rem]")}>
                          <p className="font-medium text-cream">{p.name}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {p.code ? p.code : "Auto-apply"}
                            {p.type === "percent"
                              ? ` · ${(p.value * 100).toFixed(hasAtMostDecimals(p.value, 2) ? 0 : 2)}%`
                              : p.type === "fixed"
                                ? ` · $${Number(p.value).toFixed(2)}`
                                : ""}
                          </p>
                        </td>
                        <td className={cn(tableCellClass, "capitalize text-muted")}>{p.scope}</td>
                        <td className={cn(tableCellClass, "capitalize text-muted")}>
                          {p.type.replace("_", " ")}
                        </td>
                        <td className={cn(tableCellClass, "tabular-nums text-cream")}>
                          {p.priority}
                        </td>
                        <td className={tableCellClass}>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                              p.active
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                                : "border-white/12 bg-white/[0.03] text-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                p.active ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-white/30",
                              )}
                              aria-hidden
                            />
                            {p.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className={cn(tableCellClass, "text-right")}>
                          <div className="inline-flex justify-end gap-1">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-(--gold)/40 hover:text-cream"
                              aria-label={`Edit ${p.name}`}
                              onClick={() => openEdit(p)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-red-400/40 hover:text-red-200"
                              aria-label={`Delete ${p.name}`}
                              disabled={deletePromo.isPending}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Delete “${p.name}”? This cannot be undone.`,
                                  )
                                ) {
                                  return;
                                }
                                deletePromo.mutate(p.id);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      ) : null}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit promotion" : "New promotion"}
        subtitle={
          editingId
            ? "Update this offer. Changes apply immediately when saved."
            : "Build a coupon or auto-apply offer. Leave code blank to auto-apply."
        }
        className="sm:max-w-2xl"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={cn("text-xs", canSubmit ? "text-muted" : "text-(--danger)/90")}>
              {!canSubmit
                ? "Fix the highlighted fields before saving."
                : save.isPending
                  ? "Saving…"
                  : editingId
                    ? "Ready to update."
                    : "Ready to publish."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full sm:w-auto"
                onClick={closeModal}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="min-h-11 w-full sm:min-w-[10rem] sm:w-auto"
                loading={save.isPending}
                disabled={!canSubmit}
                onClick={submitForm}
              >
                {!save.isPending ? <BadgePercent size={16} aria-hidden /> : null}
                {save.isPending ? "Saving…" : editingId ? "Save changes" : "Save promotion"}
              </Button>
            </div>
          </div>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submitForm();
          }}
        >
          <label className={labelClass}>
            Promotion name
            <span className="normal-case tracking-normal text-(--danger)"> *</span>
            <input
              required
              placeholder="e.g. Weekend wine deal"
              value={form.name}
              maxLength={120}
              onBlur={() => markTouched("name")}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={show("name") ? fieldErrorClass : fieldClass}
              autoComplete="off"
            />
            <FieldError message={show("name")} />
          </label>

          <label className={labelClass}>
            Coupon code
            <span className="ml-1 normal-case tracking-normal text-white/35">(optional)</span>
            <input
              placeholder="e.g. SAMS10"
              value={form.code}
              maxLength={40}
              onBlur={() => markTouched("code")}
              onChange={(e) =>
                setForm({
                  ...form,
                  code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                })
              }
              className={show("code") ? fieldErrorClass : fieldClass}
              autoComplete="off"
            />
            <FieldError message={show("code")} />
          </label>

          <div className="min-w-0">
            <Select
              label="Scope"
              value={form.scope}
              onChange={(scope) => setForm({ ...form, scope: scope as PromoScope })}
              className="w-full"
              options={[
                { value: "organization", label: "Owner / organization" },
                { value: "location", label: "Store / location" },
                { value: "platform", label: "Platform-wide" },
              ]}
            />
          </div>

          {form.scope === "location" ? (
            <div className="min-w-0">
              <Select
                label="Store"
                value={form.locationId}
                onChange={(locationId) => setForm({ ...form, locationId })}
                className="w-full"
                options={stores.map((s) => ({
                  value: s.id,
                  label: `${s.shortName} · ${s.city}`,
                }))}
              />
              <FieldError message={show("locationId")} />
            </div>
          ) : (
            <div className="hidden sm:block" aria-hidden />
          )}

          <div className="min-w-0 sm:col-span-2">
            <Select
              label="Offer type"
              value={form.type}
              onChange={(type) => {
                const next = type as PromoType;
                setForm({
                  ...form,
                  type: next,
                  value: next === "percent" ? "0.10" : next === "fixed" ? "10.00" : "0",
                });
              }}
              className="w-full"
              options={[
                { value: "percent", label: "Percent off" },
                { value: "fixed", label: "Fixed $ off" },
                { value: "bogo", label: "Buy X Get Y (BOGO)" },
                { value: "free_delivery", label: "Free delivery" },
              ]}
            />
          </div>

          {form.type === "percent" || form.type === "fixed" ? (
            <label className={labelClass}>
              {form.type === "percent" ? "Discount (fraction)" : "Discount amount ($)"}
              <input
                inputMode="decimal"
                value={form.value}
                onBlur={() => markTouched("value")}
                onChange={(e) => {
                  const raw =
                    form.type === "percent"
                      ? sanitizePercentFractionInput(e.target.value)
                      : sanitizeMoneyInput(e.target.value, 2);
                  setForm({ ...form, value: raw });
                }}
                className={show("value") ? fieldErrorClass : fieldClass}
                aria-describedby="promo-discount-preview"
              />
              <FieldError message={show("value")} />
              {(() => {
                const hint = discountValueHint(
                  form.type === "percent" ? "percent" : "fixed",
                  form.value,
                );
                return (
                  <span
                    id="promo-discount-preview"
                    className={cn(
                      "mt-1.5 block normal-case tracking-normal text-[11px] tabular-nums",
                      hint.tone === "live" && "font-medium text-gold",
                      hint.tone === "warn" && "text-amber-200/80",
                      hint.tone === "muted" && "text-white/35",
                    )}
                  >
                    {hint.text}
                  </span>
                );
              })()}
            </label>
          ) : form.type === "bogo" ? (
            <>
              <label className={labelClass}>
                Buy qty
                <input
                  inputMode="numeric"
                  value={form.buyQty}
                  onBlur={() => markTouched("buyQty")}
                  onChange={(e) =>
                    setForm({ ...form, buyQty: e.target.value.replace(/\D/g, "").slice(0, 2) })
                  }
                  className={show("buyQty") ? fieldErrorClass : fieldClass}
                />
                <FieldError message={show("buyQty")} />
              </label>
              <label className={labelClass}>
                Get free qty
                <input
                  inputMode="numeric"
                  value={form.getQty}
                  onBlur={() => markTouched("getQty")}
                  onChange={(e) =>
                    setForm({ ...form, getQty: e.target.value.replace(/\D/g, "").slice(0, 2) })
                  }
                  className={show("getQty") ? fieldErrorClass : fieldClass}
                />
                <FieldError message={show("getQty")} />
              </label>
            </>
          ) : (
            <p className="sm:col-span-2 text-xs text-muted">
              Free delivery zeroes the delivery fee when this offer wins (or stacks if marked
              stackable).
            </p>
          )}

          <label className={labelClass}>
            Min. subtotal ($)
            <input
              inputMode="decimal"
              placeholder="e.g. 100"
              value={form.minSubtotal}
              onBlur={() => markTouched("minSubtotal")}
              onChange={(e) =>
                setForm({ ...form, minSubtotal: sanitizeMoneyInput(e.target.value, 2) })
              }
              className={show("minSubtotal") ? fieldErrorClass : fieldClass}
            />
            <FieldError message={show("minSubtotal")} />
          </label>

          <label className={labelClass}>
            Priority
            <input
              inputMode="numeric"
              value={form.priority}
              onBlur={() => markTouched("priority")}
              onChange={(e) =>
                setForm({
                  ...form,
                  priority: e.target.value.replace(/[^\d]/g, "").slice(0, 4),
                })
              }
              className={show("priority") ? fieldErrorClass : fieldClass}
            />
            <FieldError message={show("priority")} />
            <span className="mt-1.5 block normal-case tracking-normal text-[11px] text-white/35">
              Higher number wins within the same scope.
            </span>
          </label>

          <div className="min-w-0">
            <Select
              label="Category target"
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              className="w-full"
              options={[
                { value: "", label: "All categories" },
                ...shopCategories.map((c) => ({ value: c.slug, label: c.name })),
              ]}
            />
          </div>

          <label className={labelClass}>
            Brand target
            <input
              placeholder="e.g. Casamigos"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className={fieldClass}
              autoComplete="off"
            />
          </label>

          <label className={labelClass}>
            Starts
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Ends
            <input
              type="datetime-local"
              value={form.endsAt}
              onBlur={() => markTouched("endsAt")}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              className={show("endsAt") ? fieldErrorClass : fieldClass}
            />
            <FieldError message={show("endsAt")} />
          </label>

          <div className="sm:col-span-2">
            <p className={labelClass}>Days of week</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAY_OPTIONS.map((d) => {
                const on = form.daysOfWeek.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      "min-h-10 rounded-sm border px-3 text-xs uppercase tracking-wider",
                      on
                        ? "border-(--gold)/50 text-gold"
                        : "border-white/10 text-muted hover:text-cream",
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className={labelClass}>
            Daily start
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Daily end
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className={fieldClass}
            />
          </label>

          <div className="flex flex-col gap-3 rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 px-3.5 py-3.5 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gold">Offer status</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {form.active
                  ? "Live — customers can use this offer when schedule rules match."
                  : "Paused — hidden from checkout until you activate it again."}
              </p>
            </div>
            <ActiveSwitch
              active={form.active}
              onChange={() => setForm((f) => ({ ...f, active: !f.active }))}
              label="Offer active"
            />
          </div>

          <label className="flex min-h-11 items-center gap-2 text-sm text-cream sm:col-span-2">
            <input
              type="checkbox"
              checked={form.firstOrderOnly}
              onChange={(e) => setForm({ ...form, firstOrderOnly: e.target.checked })}
              className="size-4 accent-(--gold)"
            />
            First-order only
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-cream sm:col-span-2">
            <input
              type="checkbox"
              checked={form.stackable}
              onChange={(e) => setForm({ ...form, stackable: e.target.checked })}
              className="size-4 accent-(--gold)"
            />
            Stackable (free delivery can combine with a product discount)
          </label>

          {save.error ? (
            <p className="sm:col-span-2 text-sm text-(--danger)">
              {(save.error as Error).message}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
