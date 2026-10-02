"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarDays, Clock, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { dashboardPath } from "@/lib/dashboard/routes";
import { getAllLocations } from "@/data/locations";
import {
  apiCreateLocation,
  apiDeleteLocation,
  apiPatchLocation,
} from "@/lib/api-mutations";
import { hasPermission } from "@/lib/auth/permissions";
import { accessibleLocations, hasAllLocationAccess } from "@/lib/auth/location-access";
import {
  removeRuntimeLocation,
  upsertRuntimeLocation,
} from "@/lib/runtime-data";
import { useServerConnection } from "@/hooks/useServerConnection";
import { useUserStore } from "@/store/user";
import { confirmAction } from "@/store/dialog";
import type { StoreLocation } from "@/types";
import { Button } from "@/components/ui/Button";
import { CoverImageUpload, GalleryImageUpload } from "@/components/ui/ImageUpload";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { compareValues, MobileSortBar, SortableTh, tableCellClass, tableHeadRowClass, tableRowClass, tableWrapClass, useTableSort } from "@/components/ui/SortableTh";
import { cn, formatUsPhone, isUsPhone } from "@/lib/utils";
import { formatDeliveryPricingSummary } from "@/lib/fulfillment-pricing";
import {
  moneyAmountAtMost,
  parseFiniteNumber,
  sanitizeMoneyInput,
  taxPercentSchema,
} from "@/lib/validation/money";

type LocationForm = {
  name: string;
  shortName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  description: string;
  parking: string;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  active: boolean;
  deliveryRadiusKm: string;
  deliveryFee: string;
  deliveryFreeMinimum: string;
  minimumOrderAmount: string;
  taxRatePercent: string;
  lat: string;
  lng: string;
  heroImage: string;
  gallery: string[];
  hours: { day: string; open: string; close: string }[];
  holidayHours: { date: string; open: string; close: string; closed: boolean }[];
};

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
  "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
  "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatUsZip(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function isUsZip(value: string) {
  return /^\d{5}(-\d{4})?$/.test(value.trim());
}

const inputErrorClass = "border-(--danger)/55 bg-(--danger)/5 focus:border-(--danger)/70";

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="mt-1.5 flex items-start gap-1.5 text-xs text-(--danger)">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </span>
  );
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
}

function formatDisplayTime(hhmm: string) {
  const [hourRaw, minuteRaw] = hhmm.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return hhmm;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

type OverlayPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "data-field"?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | undefined;
  "aria-describedby"?: string;
  onBlur?: () => void;
};

function OverlayDateField({
  value,
  onChange,
  invalid,
  disabled,
  className: _className,
  ...rest
}: OverlayPickerProps) {
  return (
    <div className="relative">
      <Input
        readOnly
        tabIndex={-1}
        value={value ? formatDisplayDate(value) : ""}
        placeholder="Select date"
        aria-hidden
        className={cn(
          "pointer-events-none mt-1 pr-10 sm:mt-0",
          invalid && inputErrorClass,
          disabled && "opacity-40",
        )}
      />
      <CalendarDays
        size={15}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gold/75"
        aria-hidden
      />
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...rest}
      />
    </div>
  );
}

function OverlayTimeField({
  value,
  onChange,
  invalid,
  disabled,
  className: _className,
  ...rest
}: OverlayPickerProps) {
  return (
    <div className="relative">
      <Input
        readOnly
        tabIndex={-1}
        value={value ? formatDisplayTime(value) : ""}
        placeholder="10:00 AM"
        aria-hidden
        disabled={disabled}
        className={cn(
          "pointer-events-none mt-1 pr-9 sm:mt-0",
          invalid && inputErrorClass,
          disabled && "opacity-40",
        )}
      />
      <Clock
        size={14}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gold/75"
        aria-hidden
      />
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...rest}
      />
    </div>
  );
}

const DEFAULT_FORM_HOURS = [
  { day: "Mon–Thu", open: "11:00", close: "21:00" },
  { day: "Fri–Sat", open: "10:00", close: "23:00" },
  { day: "Sun", open: "12:00", close: "20:00" },
];

const emptyForm = (): LocationForm => ({
  name: "",
  shortName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  email: "",
  description: "",
  parking: "",
  pickupAvailable: true,
  deliveryAvailable: true,
  active: true,
  deliveryRadiusKm: "8",
  deliveryFee: "12.5",
  deliveryFreeMinimum: "150",
  minimumOrderAmount: "0",
  taxRatePercent: "8.875",
  lat: "",
  lng: "",
  heroImage: "",
  gallery: [],
  hours: DEFAULT_FORM_HOURS.map((h) => ({ ...h })),
  holidayHours: [],
});

function locationFormErrors(form: LocationForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.name.trim().length < 2) errors.name = "Enter the full store name.";
  else if (form.name.trim().length > 160) errors.name = "Name must be 160 characters or less.";

  if (form.shortName.trim().length < 2) errors.shortName = "Enter a short display name.";
  else if (form.shortName.trim().length > 40) errors.shortName = "Short name must be 40 characters or less.";

  if (form.address.trim().length < 3) errors.address = "Enter a street address.";
  else if (form.address.trim().length > 200) errors.address = "Address must be 200 characters or less.";

  if (form.city.trim().length < 2) errors.city = "Enter a city.";
  else if (form.city.trim().length > 80) errors.city = "City must be 80 characters or less.";

  const state = form.state.trim().toUpperCase();
  if (!state) errors.state = "Enter a 2-letter state.";
  else if (!US_STATE_CODES.has(state)) errors.state = "Use a valid US state code, like NY.";

  if (!form.zip.trim()) errors.zip = "Enter a ZIP code.";
  else if (!isUsZip(form.zip)) errors.zip = "Enter a 5-digit ZIP, or ZIP+4.";

  if (!form.phone.trim()) errors.phone = "Enter a phone number.";
  else if (!isUsPhone(form.phone)) errors.phone = "Enter a phone like (212) 555-0100.";

  if (!form.email.trim()) errors.email = "Enter a store email.";
  else if (!EMAIL_PATTERN.test(form.email.trim()) || form.email.trim().length > 191) {
    errors.email = "Enter a valid email address.";
  }

  if (form.parking.trim().length > 400) errors.parking = "Parking notes must be 400 characters or less.";
  if (form.description.trim().length > 4000) {
    errors.description = "Description must be 4,000 characters or less.";
  }

  if (form.deliveryAvailable) {
    const radius = parseFiniteNumber(form.deliveryRadiusKm);
    if (radius == null) errors.deliveryRadiusKm = "Enter a delivery radius.";
    else if (radius < 0 || radius > 200) errors.deliveryRadiusKm = "Radius must be between 0 and 200 km.";
    else if (Math.abs(radius * 2 - Math.round(radius * 2)) > 1e-9) {
      errors.deliveryRadiusKm = "Use 0.5 km steps.";
    }

    const deliveryFee = parseFiniteNumber(form.deliveryFee);
    const feeCheck = moneyAmountAtMost(500, "Delivery fee cannot exceed $500").safeParse(deliveryFee);
    if (deliveryFee == null) errors.deliveryFee = "Enter a delivery fee.";
    else if (!feeCheck.success) {
      errors.deliveryFee = feeCheck.error.issues[0]?.message ?? "Enter a valid delivery fee.";
    }

    const deliveryFreeMinimum = parseFiniteNumber(form.deliveryFreeMinimum);
    const freeCheck = moneyAmountAtMost(
      10_000,
      "Free delivery minimum cannot exceed $10,000",
    ).safeParse(deliveryFreeMinimum);
    if (deliveryFreeMinimum == null) errors.deliveryFreeMinimum = "Enter a free-delivery minimum, or 0.";
    else if (!freeCheck.success) {
      errors.deliveryFreeMinimum =
        freeCheck.error.issues[0]?.message ?? "Enter a valid free-delivery minimum.";
    }
  }

  const minimumOrderAmount = parseFiniteNumber(form.minimumOrderAmount);
  const minOrderCheck = moneyAmountAtMost(
    10_000,
    "Minimum order cannot exceed $10,000",
  ).safeParse(minimumOrderAmount);
  if (minimumOrderAmount == null) errors.minimumOrderAmount = "Enter a minimum order, or 0.";
  else if (!minOrderCheck.success) {
    errors.minimumOrderAmount =
      minOrderCheck.error.issues[0]?.message ?? "Enter a valid minimum order amount.";
  }

  const taxRatePercent = parseFiniteNumber(form.taxRatePercent);
  const taxCheck = taxPercentSchema.safeParse(taxRatePercent);
  if (taxRatePercent == null) errors.taxRatePercent = "Enter a tax rate.";
  else if (!taxCheck.success) {
    errors.taxRatePercent = taxCheck.error.issues[0]?.message ?? "Enter a tax rate between 0 and 25%.";
  }

  const latRaw = form.lat.trim();
  const lngRaw = form.lng.trim();
  if (latRaw || lngRaw) {
    const lat = parseFiniteNumber(form.lat);
    const lng = parseFiniteNumber(form.lng);
    if (lat == null || lat < -90 || lat > 90) errors.lat = "Latitude must be between -90 and 90.";
    if (lng == null || lng < -180 || lng > 180) errors.lng = "Longitude must be between -180 and 180.";
    if ((latRaw && !lngRaw) || (!latRaw && lngRaw)) {
      if (!errors.lat && !latRaw) errors.lat = "Enter both coordinates, or leave both blank.";
      if (!errors.lng && !lngRaw) errors.lng = "Enter both coordinates, or leave both blank.";
    }
  }

  if (form.hours.length === 0) errors.hours = "Add at least one business-hours row.";
  form.hours.forEach((row, idx) => {
    if (!row.day.trim()) errors[`hours.${idx}.day`] = "Enter a day or range.";
    else if (row.day.trim().length > 40) errors[`hours.${idx}.day`] = "Keep this under 40 characters.";
    if (!row.open.trim()) errors[`hours.${idx}.open`] = "Set an opening time.";
    if (!row.close.trim()) errors[`hours.${idx}.close`] = "Set a closing time.";
    if (row.open.trim() && row.close.trim() && row.open >= row.close) {
      errors[`hours.${idx}.close`] = "Closing time must be after opening.";
    }
  });

  form.holidayHours.forEach((row, idx) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) errors[`holiday.${idx}.date`] = "Choose a date.";
    if (!row.closed) {
      if (!row.open.trim()) errors[`holiday.${idx}.open`] = "Set hours or mark Closed.";
      if (!row.close.trim()) errors[`holiday.${idx}.close`] = "Set hours or mark Closed.";
      if (row.open.trim() && row.close.trim() && row.open >= row.close) {
        errors[`holiday.${idx}.close`] = "Closing time must be after opening.";
      }
    }
  });

  return errors;
}

function toLocationPayload(form: LocationForm) {
  const radius = Number(form.deliveryRadiusKm);
  const lat = form.lat.trim() ? Number(form.lat) : undefined;
  const lng = form.lng.trim() ? Number(form.lng) : undefined;
  const taxRatePercent = parseFiniteNumber(form.taxRatePercent);
  return {
    name: form.name.trim(),
    shortName: form.shortName.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state.trim().toUpperCase(),
    zip: formatUsZip(form.zip),
    phone: formatUsPhone(form.phone),
    email: form.email.trim(),
    description: form.description.trim(),
    parking: form.parking.trim(),
    active: form.active,
    deliveryRadiusKm: Number.isFinite(radius) ? radius : 8,
    deliveryFee: parseFiniteNumber(form.deliveryFee) ?? 0,
    deliveryFreeMinimum: parseFiniteNumber(form.deliveryFreeMinimum) ?? 0,
    minimumOrderAmount: parseFiniteNumber(form.minimumOrderAmount) ?? 0,
    taxRate: taxRatePercent != null ? taxRatePercent / 100 : 0.08875,
    hours: form.hours.map((h) => ({
      day: h.day.trim(),
      open: h.open.trim(),
      close: h.close.trim(),
    })),
    holidayHours: form.holidayHours.map((h) => ({
      date: h.date,
      open: h.closed ? "" : h.open.trim(),
      close: h.closed ? "" : h.close.trim(),
      closed: h.closed,
    })),
    heroImage: form.heroImage.trim(),
    gallery: form.gallery,
    ...(lat != null && Number.isFinite(lat) ? { lat } : {}),
    ...(lng != null && Number.isFinite(lng) ? { lng } : {}),
  };
}

export function LocationsPanel() {
  const actor = useUserStore((s) => s.profile);
  const [tick, setTick] = useState(0);
  const locations = useMemo(
    () => accessibleLocations(actor, getAllLocations()),
    [actor, tick],
  );
  const { sortKey, sortDir, toggleSort } = useTableSort<
    "store" | "address" | "delivery" | "contact" | "status"
  >("store");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const statusCounts = useMemo(
    () => ({
      all: locations.length,
      active: locations.filter((loc) => loc.active !== false).length,
      inactive: locations.filter((loc) => loc.active === false).length,
    }),
    [locations],
  );
  const visibleLocations = useMemo(() => {
    if (statusFilter === "active") return locations.filter((loc) => loc.active !== false);
    if (statusFilter === "inactive") return locations.filter((loc) => loc.active === false);
    return locations;
  }, [locations, statusFilter]);
  const sortedLocations = useMemo(() => {
    return [...visibleLocations].sort((a, b) => {
      if (sortKey === "address") {
        return compareValues(
          `${a.city} ${a.address}`,
          `${b.city} ${b.address}`,
          sortDir,
        );
      }
      if (sortKey === "delivery") {
        const deliveryValue = (loc: (typeof locations)[number]) => {
          if (!loc.deliveryAvailable) return -1;
          return loc.deliveryFee * 1000 + loc.taxRate;
        };
        return compareValues(deliveryValue(a), deliveryValue(b), sortDir);
      }
      if (sortKey === "contact") return compareValues(a.email, b.email, sortDir);
      if (sortKey === "status") {
        return compareValues(a.active !== false ? 1 : 0, b.active !== false ? 1 : 0, sortDir);
      }
      return compareValues(a.shortName, b.shortName, sortDir);
    });
  }, [visibleLocations, sortDir, sortKey]);
  const [editing, setEditing] = useState<StoreLocation | "new" | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm());
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errors = useMemo(() => locationFormErrors(form), [form]);
  const show = (key: string) => (submitted || touched[key] ? errors[key] : undefined);
  const markTouched = (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const fieldProps = (key: string) => ({
    "data-field": key,
    "aria-invalid": Boolean(show(key)) || undefined,
    "aria-describedby": show(key) ? `${key}-error` : undefined,
    onBlur: () => markTouched(key),
    className: cn("mt-1", show(key) && inputErrorClass),
  });
  const { ready: dbReady } = useServerConnection();
  const canCreate = hasPermission(actor, "locations.create") && dbReady;
  const canEdit = hasPermission(actor, "locations.edit") && dbReady;
  const canDelete = hasPermission(actor, "locations.delete") && dbReady;

  const openCreate = () => {
    setForm(emptyForm());
    setTouched({});
    setSubmitted(false);
    setError("");
    setEditing("new");
  };

  const openEdit = (location: StoreLocation) => {
    setForm({
      name: location.name,
      shortName: location.shortName,
      address: location.address,
      city: location.city,
      state: location.state.trim().toUpperCase().slice(0, 2),
      zip: formatUsZip(location.zip),
      phone: formatUsPhone(location.phone),
      email: location.email,
      description: location.description,
      parking: location.parking ?? "",
      pickupAvailable: location.pickupAvailable,
      deliveryAvailable: location.deliveryAvailable,
      active: location.active !== false,
      deliveryRadiusKm: String(location.deliveryRadiusKm ?? 8),
      deliveryFee: String(location.deliveryFee ?? 12.5),
      deliveryFreeMinimum: String(location.deliveryFreeMinimum ?? 150),
      minimumOrderAmount: String(location.minimumOrderAmount ?? 0),
      taxRatePercent: String(Number(((location.taxRate ?? 0.08875) * 100).toFixed(3))),
      lat: location.lat != null ? String(location.lat) : "",
      lng: location.lng != null ? String(location.lng) : "",
      heroImage: location.heroImage,
      gallery: location.gallery.filter((url) => url !== location.heroImage),
      hours:
        location.hours?.length > 0
          ? location.hours.map((h) => ({ ...h }))
          : DEFAULT_FORM_HOURS.map((h) => ({ ...h })),
      holidayHours: (location.holidayHours ?? []).map((h) => ({
        date: h.date,
        open: h.open ?? "",
        close: h.close ?? "",
        closed: Boolean(h.closed),
      })),
    });
    setTouched({});
    setSubmitted(false);
    setError("");
    setEditing(location);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const nextErrors = locationFormErrors(form);
    const firstKey = Object.keys(nextErrors)[0];
    if (firstKey) {
      setError("Fix the highlighted fields before saving.");
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-field="${firstKey}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
        document.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
      });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = toLocationPayload(form);
      if (editing === "new") {
        const { location } = await apiCreateLocation(payload);
        upsertRuntimeLocation(location);
        // Keep scoped accounts able to see the store they just created.
        if (!hasAllLocationAccess(actor) && actor.allowedLocationIds?.length) {
          const next = [...new Set([...actor.allowedLocationIds, location.id])];
          useUserStore.setState((state) => ({
            profile: { ...state.profile, allowedLocationIds: next },
          }));
        }
      } else if (editing) {
        const { location } = await apiPatchLocation(editing.id, payload);
        upsertRuntimeLocation(location);
      }
      setEditing(null);
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save store.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (location: StoreLocation) => {
    const ok = await confirmAction({
      title: "Remove store",
      description: `Remove ${location.shortName}? Events at this store will also be deleted.`,
      confirmLabel: "Remove store",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await apiDeleteLocation(location.id);
      removeRuntimeLocation(location.id);
      setTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove store.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-0">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
        <div className="min-w-0">
          <p className="hidden text-[10px] uppercase tracking-[0.22em] text-gold lg:flex lg:items-center lg:gap-2">
            <MapPin size={12} className="text-gold" />
            Locations
          </p>
          <h2 className="hidden font-display text-3xl text-cream lg:mt-2 lg:block xl:text-4xl">
            Locations
          </h2>
          <p className="max-w-2xl text-sm text-muted lg:mt-2">
            Add, edit, or remove stores in the Sam&apos;s network.
          </p>
        </div>
        {canCreate ? (
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} />
              Add store
            </Button>
          </div>
        ) : null}
      </div>
      {!dbReady ? (
        <ConnectionNotice className="mt-4" feature="add or edit stores" preview />
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div
        className="mt-5 inline-flex rounded-sm border border-white/10 p-0.5"
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
              statusFilter === tab.key ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
            )}
          >
            {tab.label}
            <span className="tabular-nums text-white/40">{tab.count}</span>
          </button>
        ))}
      </div>

      <MobileSortBar
        className="mt-5 lg:hidden"
        columns={[
          { key: "store", label: "Store" },
          { key: "address", label: "Address" },
          { key: "delivery", label: "Delivery & tax" },
          { key: "contact", label: "Contact" },
          { key: "status", label: "Status" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />
      <ul className="mt-3 divide-y divide-white/10 border border-white/10 lg:hidden">
        {sortedLocations.map((location) => (
          <li key={location.id} className="p-4">
            <div className="flex items-start gap-3">
              {location.heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={location.heroImage} alt="" className="h-14 w-20 shrink-0 object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-cream">{location.shortName}</p>
                <p className="text-xs text-muted">{location.name}</p>
                <p
                  className={`mt-1 text-[10px] uppercase tracking-[0.14em] ${
                    location.active !== false ? "text-emerald-300/90" : "text-amber-200/90"
                  }`}
                >
                  {location.active !== false ? "Active" : "Inactive"}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {location.address}, {location.city} {location.state} {location.zip}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {location.phone} · {location.email}
                </p>
                <p className="mt-2 text-[11px] text-gold">{formatDeliveryPricingSummary(location)}</p>
                <p className="mt-1 text-[11px] text-muted">
                  Pickup {location.pickupAvailable ? "on" : "off"} · Delivery{" "}
                  {location.deliveryAvailable ? "on" : "off"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit ? (
                    <Button size="sm" variant="ghost" className="h-9 px-2.5" onClick={() => openEdit(location)}>
                      <Pencil size={13} />
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9 px-2.5"
                      onClick={() => void remove(location)}
                      disabled={busy}
                    >
                      <Trash2 size={13} />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {sortedLocations.length === 0 ? (
        <div className="mt-3 border border-white/10 px-4 py-14 text-center text-sm text-muted lg:hidden">
          <MapPin className="mx-auto mb-3 text-gold/70" size={28} />
          {locations.length === 0
            ? "No stores assigned to this account."
            : statusFilter === "inactive"
              ? "No inactive stores."
              : "No active stores."}
        </div>
      ) : null}

      <div className={`mt-5 hidden lg:block ${tableWrapClass}`}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <SortableTh label="Store" column="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Address" column="address" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh
                label="Delivery & tax"
                column="delivery"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableTh label="Contact" column="contact" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedLocations.map((location) => (
              <tr key={location.id} className={tableRowClass}>
                <td className={tableCellClass}>
                  <div className="flex items-center gap-3">
                    {location.heroImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={location.heroImage} alt="" className="h-10 w-14 shrink-0 object-cover" />
                    ) : null}
                    <div>
                      <p className="font-medium text-cream">{location.shortName}</p>
                      <p className="text-xs text-muted">{location.name}</p>
                    </div>
                  </div>
                </td>
                <td className={`${tableCellClass} text-xs text-muted`}>
                  <p>{location.address}</p>
                  <p>
                    {location.city}, {location.state} {location.zip}
                  </p>
                </td>
                <td className={`${tableCellClass} text-xs`}>
                  <p className="text-gold">{formatDeliveryPricingSummary(location)}</p>
                  <p className="mt-1 text-muted">
                    Pickup {location.pickupAvailable ? "on" : "off"} ·{" "}
                    {location.deliveryAvailable
                      ? `${location.deliveryRadiusKm} km radius`
                      : "Delivery off"}
                  </p>
                  <p className="mt-1 text-muted">
                    Tax {(location.taxRate * 100).toFixed(3).replace(/\.?0+$/, "")}%
                  </p>
                </td>
                <td className={`${tableCellClass} text-xs text-muted`}>
                  <p>{location.phone}</p>
                  <p>{location.email}</p>
                </td>
                <td className={tableCellClass}>
                  <span
                    className={`inline-block text-[10px] uppercase tracking-[0.14em] ${
                      location.active !== false ? "text-emerald-300/90" : "text-amber-200/90"
                    }`}
                  >
                    {location.active !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className={tableCellClass}>
                  <div className="flex flex-nowrap justify-end gap-2">
                    {canEdit ? (
                      <Button size="sm" variant="ghost" className="h-8 px-2.5" onClick={() => openEdit(location)}>
                        <Pencil size={13} />
                        Edit
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2.5"
                        onClick={() => void remove(location)}
                        disabled={busy}
                      >
                        <Trash2 size={13} />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedLocations.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-muted">
            <MapPin className="mx-auto mb-3 text-gold/70" size={28} />
            {locations.length === 0
              ? "No stores assigned to this account."
              : statusFilter === "inactive"
                ? "No inactive stores."
                : "No active stores."}
          </div>
        ) : null}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add store" : "Edit store"}
        subtitle="Active stores appear on the website, picker, and events. Inactive stores stay hidden from shoppers."
        className="sm:max-w-3xl"
      >
        <form noValidate onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 px-3.5 py-3.5 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gold [word-spacing:0.35em]">
                Store status
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {form.active
                  ? "Active — shoppers can find this store, pick it in checkout, and see its events."
                  : "Inactive — hidden from the website, store picker, map, and public events."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              aria-label="Store active"
              onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
              className={cn(
                "inline-flex shrink-0 items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-colors",
                form.active
                  ? "border-emerald-500/40 bg-emerald-500/[0.08]"
                  : "border-white/12 bg-white/[0.03]",
              )}
            >
              <span
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  form.active ? "bg-emerald-500" : "bg-white/20",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-cream transition-transform",
                    form.active && "translate-x-4",
                  )}
                />
              </span>
              <span
                className={cn(
                  "min-w-[4.25rem] text-[10px] font-semibold uppercase tracking-[0.16em]",
                  form.active ? "text-emerald-100" : "text-muted",
                )}
              >
                {form.active ? "Active" : "Inactive"}
              </span>
            </button>
          </div>
          <CoverImageUpload
            className="sm:col-span-2"
            label="Cover image"
            hint="Hero photo on the store page. JPG or PNG."
            value={form.heroImage}
            onChange={(heroImage) => setForm((f) => ({ ...f, heroImage }))}
          />
          <GalleryImageUpload
            className="sm:col-span-2"
            label="Interior gallery"
            hint="Extra photos for the location page. Up to 8."
            value={form.gallery}
            onChange={(gallery) => setForm((f) => ({ ...f, gallery }))}
            max={8}
          />
          <label className="block text-xs text-muted sm:col-span-2">
            Full name <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("name")}
              value={form.name}
              maxLength={160}
              autoComplete="organization"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <FieldError id="name-error" message={show("name")} />
          </label>
          <label className="block text-xs text-muted">
            Short name <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("shortName")}
              value={form.shortName}
              maxLength={40}
              onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
            />
            <FieldError id="shortName-error" message={show("shortName")} />
          </label>
          <label className="block text-xs text-muted">
            Phone <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("phone")}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="(212) 555-0100"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatUsPhone(e.target.value) }))}
            />
            <FieldError id="phone-error" message={show("phone")} />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Address <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("address")}
              autoComplete="street-address"
              maxLength={200}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <FieldError id="address-error" message={show("address")} />
          </label>
          <label className="block text-xs text-muted">
            City <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("city")}
              autoComplete="address-level2"
              maxLength={80}
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
            <FieldError id="city-error" message={show("city")} />
          </label>
          <label className="block text-xs text-muted">
            State <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("state")}
              autoComplete="address-level1"
              placeholder="NY"
              maxLength={2}
              value={form.state}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  state: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
                }))
              }
            />
            <FieldError id="state-error" message={show("state")} />
          </label>
          <label className="block text-xs text-muted">
            ZIP <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("zip")}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="10013"
              value={form.zip}
              onChange={(e) => setForm((f) => ({ ...f, zip: formatUsZip(e.target.value) }))}
            />
            <FieldError id="zip-error" message={show("zip")} />
          </label>
          <label className="block text-xs text-muted">
            Email <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("email")}
              type="email"
              autoComplete="email"
              placeholder="store@samsdiscountliquor.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <FieldError id="email-error" message={show("email")} />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Parking notes
            <Input
              {...fieldProps("parking")}
              maxLength={400}
              value={form.parking}
              onChange={(e) => setForm((f) => ({ ...f, parking: e.target.value }))}
              placeholder="Street parking nearby"
            />
            <FieldError id="parking-error" message={show("parking")} />
          </label>
          <p className="text-xs text-muted sm:col-span-2">
            Pickup {form.pickupAvailable ? "on" : "off"} · Delivery {form.deliveryAvailable ? "on" : "off"}.
            Turn these on or off in{" "}
            <Link
              href={dashboardPath("deliveries", { settings: true })}
              className="text-gold underline-offset-2 hover:underline"
            >
              Deliveries → Settings
            </Link>
            .
          </p>

          <section className="rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 p-3.5 sm:col-span-2 sm:p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gold [word-spacing:0.35em]">
              Business hours
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Day ranges and open / close times shoppers see for this store.
            </p>
            {show("hours") ? <FieldError id="hours-error" message={show("hours")} /> : null}
            <div className="mt-3 overflow-hidden rounded-sm border border-white/10">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_7.5rem_7.5rem_2.5rem] gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:grid">
                <span>Days</span>
                <span>Opens</span>
                <span>Closes</span>
                <span className="sr-only">Remove</span>
              </div>
              <ul className="divide-y divide-white/10">
                {form.hours.map((row, idx) => (
                  <li
                    key={`hours-${idx}`}
                    className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_7.5rem_7.5rem_2.5rem] sm:items-start sm:gap-2"
                  >
                    <label className="block text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:contents">
                      <span className="sm:hidden">Days</span>
                      <div>
                        <Input
                          {...fieldProps(`hours.${idx}.day`)}
                          className={cn(fieldProps(`hours.${idx}.day`).className, "mt-1 sm:mt-0")}
                          value={row.day}
                          maxLength={40}
                          placeholder="Mon–Thu"
                          aria-label={`Hours row ${idx + 1} days`}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              hours: f.hours.map((h, i) =>
                                i === idx ? { ...h, day: e.target.value } : h,
                              ),
                            }))
                          }
                        />
                        <FieldError id={`hours.${idx}.day-error`} message={show(`hours.${idx}.day`)} />
                      </div>
                    </label>
                    <label className="block text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:contents">
                      <span className="sm:hidden">Opens</span>
                      <div>
                        <OverlayTimeField
                          {...fieldProps(`hours.${idx}.open`)}
                          invalid={Boolean(show(`hours.${idx}.open`))}
                          value={row.open}
                          aria-label={`Hours row ${idx + 1} opens`}
                          onChange={(open) =>
                            setForm((f) => ({
                              ...f,
                              hours: f.hours.map((h, i) => (i === idx ? { ...h, open } : h)),
                            }))
                          }
                        />
                        <FieldError id={`hours.${idx}.open-error`} message={show(`hours.${idx}.open`)} />
                      </div>
                    </label>
                    <label className="block text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:contents">
                      <span className="sm:hidden">Closes</span>
                      <div>
                        <OverlayTimeField
                          {...fieldProps(`hours.${idx}.close`)}
                          invalid={Boolean(show(`hours.${idx}.close`))}
                          value={row.close}
                          aria-label={`Hours row ${idx + 1} closes`}
                          onChange={(close) =>
                            setForm((f) => ({
                              ...f,
                              hours: f.hours.map((h, i) => (i === idx ? { ...h, close } : h)),
                            }))
                          }
                        />
                        <FieldError id={`hours.${idx}.close-error`} message={show(`hours.${idx}.close`)} />
                      </div>
                    </label>
                    <div className="flex sm:justify-end sm:pt-1">
                      <button
                        type="button"
                        disabled={form.hours.length <= 1}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            hours: f.hours.filter((_, i) => i !== idx),
                          }))
                        }
                        className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-white/10 text-xs text-muted transition hover:border-(--danger)/40 hover:text-(--danger) disabled:opacity-40 sm:h-11 sm:w-10"
                        aria-label={`Remove hours row ${idx + 1}`}
                      >
                        <Trash2 size={14} aria-hidden />
                        <span className="sm:hidden">Remove</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  hours: [...f.hours, { day: "", open: "10:00", close: "20:00" }],
                }))
              }
            >
              <Plus size={14} aria-hidden />
              Add hours
            </Button>
          </section>

          <section className="rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/20 p-3.5 sm:col-span-2 sm:p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gold [word-spacing:0.35em]">
              Holiday hours
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Optional exceptions for a specific date, or mark the store closed.
            </p>
            <div className="mt-3 overflow-hidden rounded-sm border border-white/10">
              {form.holidayHours.length > 0 ? (
                <>
                  <div className="hidden grid-cols-[minmax(10.5rem,1.3fr)_7.5rem_7.5rem_5.75rem_2.5rem] gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:grid">
                    <span>Date</span>
                    <span>Opens</span>
                    <span>Closes</span>
                    <span>Status</span>
                    <span className="sr-only">Remove</span>
                  </div>
                  <ul className="divide-y divide-white/10">
                    {form.holidayHours.map((row, idx) => (
                      <li
                        key={`hol-${idx}`}
                        className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(10.5rem,1.3fr)_7.5rem_7.5rem_5.75rem_2.5rem] sm:items-start sm:gap-2"
                      >
                        <label className="block text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:contents">
                          <span className="sm:hidden">Date</span>
                          <div>
                            <OverlayDateField
                              {...fieldProps(`holiday.${idx}.date`)}
                              invalid={Boolean(show(`holiday.${idx}.date`))}
                              value={row.date}
                              aria-label={`Holiday ${idx + 1} date`}
                              onChange={(date) =>
                                setForm((f) => ({
                                  ...f,
                                  holidayHours: f.holidayHours.map((h, i) =>
                                    i === idx ? { ...h, date } : h,
                                  ),
                                }))
                              }
                            />
                            <FieldError id={`holiday.${idx}.date-error`} message={show(`holiday.${idx}.date`)} />
                          </div>
                        </label>
                        <label className="block text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:contents">
                          <span className="sm:hidden">Opens</span>
                          <div>
                            <OverlayTimeField
                              {...fieldProps(`holiday.${idx}.open`)}
                              invalid={Boolean(show(`holiday.${idx}.open`))}
                              value={row.open}
                              disabled={row.closed}
                              aria-label={`Holiday ${idx + 1} opens`}
                              onChange={(open) =>
                                setForm((f) => ({
                                  ...f,
                                  holidayHours: f.holidayHours.map((h, i) =>
                                    i === idx ? { ...h, open } : h,
                                  ),
                                }))
                              }
                            />
                            <FieldError id={`holiday.${idx}.open-error`} message={show(`holiday.${idx}.open`)} />
                          </div>
                        </label>
                        <label className="block text-[10px] uppercase tracking-[0.14em] text-muted [word-spacing:0.35em] sm:contents">
                          <span className="sm:hidden">Closes</span>
                          <div>
                            <OverlayTimeField
                              {...fieldProps(`holiday.${idx}.close`)}
                              invalid={Boolean(show(`holiday.${idx}.close`))}
                              value={row.close}
                              disabled={row.closed}
                              aria-label={`Holiday ${idx + 1} closes`}
                              onChange={(close) =>
                                setForm((f) => ({
                                  ...f,
                                  holidayHours: f.holidayHours.map((h, i) =>
                                    i === idx ? { ...h, close } : h,
                                  ),
                                }))
                              }
                            />
                            <FieldError id={`holiday.${idx}.close-error`} message={show(`holiday.${idx}.close`)} />
                          </div>
                        </label>
                        <div className="flex items-center sm:pt-1">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={row.closed}
                            aria-label={`Holiday ${idx + 1} closed all day`}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                holidayHours: f.holidayHours.map((h, i) =>
                                  i === idx ? { ...h, closed: !h.closed } : h,
                                ),
                              }))
                            }
                            className={cn(
                              "inline-flex h-11 w-full items-center justify-center rounded-sm border px-2 text-xs font-medium transition",
                              row.closed
                                ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                                : "border-white/10 bg-white/[0.03] text-cream hover:border-white/20",
                            )}
                          >
                            {row.closed ? "Closed" : "Open"}
                          </button>
                        </div>
                        <div className="flex sm:justify-end sm:pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                holidayHours: f.holidayHours.filter((_, i) => i !== idx),
                              }))
                            }
                            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-white/10 text-xs text-muted transition hover:border-(--danger)/40 hover:text-(--danger) sm:w-10"
                            aria-label={`Remove holiday ${idx + 1}`}
                          >
                            <Trash2 size={14} aria-hidden />
                            <span className="sm:hidden">Remove</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="px-3 py-6 text-center text-xs text-muted">
                  No holiday exceptions. The regular hours above apply every day.
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  holidayHours: [
                    ...f.holidayHours,
                    { date: todayIso(), open: "10:00", close: "18:00", closed: false },
                  ],
                }))
              }
            >
              <Plus size={14} aria-hidden />
              Add holiday
            </Button>
          </section>

          <div className="sm:col-span-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Delivery & pricing</p>
            <p className="mt-1 text-xs text-muted">
              Cart, checkout, and orders use these rates for this store. Pickup and delivery on/off
              are in{" "}
              <Link
                href={dashboardPath("deliveries", { settings: true })}
                className="text-gold underline-offset-2 hover:underline"
              >
                Deliveries → Settings
              </Link>
              .
            </p>
          </div>
          <label className="block text-xs text-muted">
            Delivery fee ($) <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("deliveryFee")}
              inputMode="decimal"
              value={form.deliveryFee}
              disabled={!form.deliveryAvailable}
              onChange={(e) =>
                setForm((f) => ({ ...f, deliveryFee: sanitizeMoneyInput(e.target.value, 2) }))
              }
            />
            <FieldError id="deliveryFee-error" message={show("deliveryFee")} />
          </label>
          <label className="block text-xs text-muted">
            Free delivery over ($) <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("deliveryFreeMinimum")}
              inputMode="decimal"
              value={form.deliveryFreeMinimum}
              disabled={!form.deliveryAvailable}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  deliveryFreeMinimum: sanitizeMoneyInput(e.target.value, 2),
                }))
              }
            />
            <span className="mt-1 block text-[10px] text-muted/80">Use 0 if delivery is never free.</span>
            <FieldError id="deliveryFreeMinimum-error" message={show("deliveryFreeMinimum")} />
          </label>
          <label className="block text-xs text-muted">
            Minimum order ($) <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("minimumOrderAmount")}
              inputMode="decimal"
              value={form.minimumOrderAmount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  minimumOrderAmount: sanitizeMoneyInput(e.target.value, 2),
                }))
              }
            />
            <span className="mt-1 block text-[10px] text-muted/80">
              Cart must reach this amount before checkout. Use 0 for no minimum.
            </span>
            <FieldError id="minimumOrderAmount-error" message={show("minimumOrderAmount")} />
          </label>
          <label className="block text-xs text-muted">
            Tax rate (%) <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("taxRatePercent")}
              inputMode="decimal"
              value={form.taxRatePercent}
              onChange={(e) =>
                setForm((f) => ({ ...f, taxRatePercent: sanitizeMoneyInput(e.target.value, 4) }))
              }
            />
            <span className="mt-1 block text-[10px] text-muted/80">0–25%, up to 4 decimals.</span>
            <FieldError id="taxRatePercent-error" message={show("taxRatePercent")} />
          </label>
          <label className="block text-xs text-muted">
            Delivery radius (km) <span className="text-(--danger)">*</span>
            <Input
              {...fieldProps("deliveryRadiusKm")}
              inputMode="decimal"
              value={form.deliveryRadiusKm}
              disabled={!form.deliveryAvailable}
              onChange={(e) => setForm((f) => ({ ...f, deliveryRadiusKm: e.target.value }))}
            />
            <FieldError id="deliveryRadiusKm-error" message={show("deliveryRadiusKm")} />
          </label>
          <label className="block text-xs text-muted">
            Latitude
            <Input
              {...fieldProps("lat")}
              inputMode="decimal"
              value={form.lat}
              onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              placeholder="40.7209"
            />
            <span className="mt-1 block text-[10px] text-muted/80">Used for the public map pin. Leave both blank to skip.</span>
            <FieldError id="lat-error" message={show("lat")} />
          </label>
          <label className="block text-xs text-muted">
            Longitude
            <Input
              {...fieldProps("lng")}
              inputMode="decimal"
              value={form.lng}
              onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
              placeholder="-74.0007"
            />
            <FieldError id="lng-error" message={show("lng")} />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Description
            <textarea
              data-field="description"
              aria-invalid={Boolean(show("description")) || undefined}
              aria-describedby={show("description") ? "description-error" : undefined}
              onBlur={() => markTouched("description")}
              className={cn(
                "mt-1 min-h-[88px] w-full rounded-sm border border-white/10 bg-(--bg-elevated) px-3 py-2 text-sm text-cream outline-none",
                show("description") && inputErrorClass,
              )}
              maxLength={4000}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <FieldError id="description-error" message={show("description")} />
          </label>
          {error ? <p className="text-sm text-red-300 sm:col-span-2">{error}</p> : null}
          <div className="modal-actions border-t border-white/10 pt-4 sm:col-span-2">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={busy}>
              {busy ? "Saving…" : "Save store"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
