"use client";

import { FormEvent, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { getAllLocations } from "@/data/locations";
import {
  apiCreateLocation,
  apiDeleteLocation,
  apiPatchLocation,
} from "@/lib/api-mutations";
import { hasPermission } from "@/lib/auth/permissions";
import { accessibleLocations, hasAllLocationAccess } from "@/lib/auth/location-access";
import {
  isDbConnected,
  removeRuntimeLocation,
  upsertRuntimeLocation,
} from "@/lib/runtime-data";
import { useUserStore } from "@/store/user";
import type { StoreLocation } from "@/types";
import { Button } from "@/components/ui/Button";
import { CoverImageUpload, GalleryImageUpload } from "@/components/ui/ImageUpload";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { compareValues, MobileSortBar, SortableTh, tableCellClass, tableHeadRowClass, tableRowClass, tableWrapClass, useTableSort } from "@/components/ui/SortableTh";
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

function validateLocationForm(form: LocationForm) {
  if (form.name.trim().length < 2) return "Enter the full store name.";
  if (form.shortName.trim().length < 2) return "Enter a short name.";
  if (form.address.trim().length < 3) return "Enter a street address.";
  if (form.city.trim().length < 2) return "Enter a city.";
  if (form.state.trim().length < 2) return "Enter a state.";
  if (!/^\d{5}(-\d{4})?$/.test(form.zip.trim())) return "Enter a valid ZIP code.";
  if (form.phone.trim().length < 7) return "Enter a phone number.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email.";
  const radius = Number(form.deliveryRadiusKm);
  if (form.deliveryRadiusKm.trim() && (!Number.isFinite(radius) || radius < 0 || radius > 200)) {
    return "Delivery radius must be between 0 and 200 km.";
  }
  const deliveryFee = parseFiniteNumber(form.deliveryFee);
  const feeCheck = moneyAmountAtMost(500, "Delivery fee cannot exceed $500").safeParse(deliveryFee);
  if (!feeCheck.success) {
    return feeCheck.error.issues[0]?.message ?? "Enter a valid delivery fee.";
  }
  const deliveryFreeMinimum = parseFiniteNumber(form.deliveryFreeMinimum);
  const freeCheck = moneyAmountAtMost(
    10_000,
    "Free delivery minimum cannot exceed $10,000",
  ).safeParse(deliveryFreeMinimum);
  if (!freeCheck.success) {
    return freeCheck.error.issues[0]?.message ?? "Enter a valid free-delivery minimum.";
  }
  const minimumOrderAmount = parseFiniteNumber(form.minimumOrderAmount);
  const minOrderCheck = moneyAmountAtMost(
    10_000,
    "Minimum order cannot exceed $10,000",
  ).safeParse(minimumOrderAmount);
  if (!minOrderCheck.success) {
    return minOrderCheck.error.issues[0]?.message ?? "Enter a valid minimum order amount.";
  }
  const taxRatePercent = parseFiniteNumber(form.taxRatePercent);
  const taxCheck = taxPercentSchema.safeParse(taxRatePercent);
  if (!taxCheck.success) {
    return taxCheck.error.issues[0]?.message ?? "Enter a valid tax percent.";
  }
  if (form.lat.trim()) {
    const lat = Number(form.lat);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return "Latitude must be between -90 and 90.";
  }
  if (form.lng.trim()) {
    const lng = Number(form.lng);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return "Longitude must be between -180 and 180.";
    }
  }
  if (form.hours.length === 0) return "Add at least one business-hours row.";
  for (const row of form.hours) {
    if (!row.day.trim()) return "Each hours row needs a day label.";
    if (!row.open.trim() || !row.close.trim()) return "Each hours row needs open and close times.";
  }
  for (const row of form.holidayHours) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return "Holiday dates must use YYYY-MM-DD.";
    if (!row.closed && (!row.open.trim() || !row.close.trim())) {
      return "Holiday hours need open/close times, or mark Closed.";
    }
  }
  return null;
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
    state: form.state.trim(),
    zip: form.zip.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    description: form.description.trim(),
    parking: form.parking.trim(),
    pickupAvailable: form.pickupAvailable,
    deliveryAvailable: form.deliveryAvailable,
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
  const { sortKey, sortDir, toggleSort } = useTableSort<"store" | "address" | "delivery" | "contact">(
    "store",
  );
  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
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
      return compareValues(a.shortName, b.shortName, sortDir);
    });
  }, [locations, sortDir, sortKey]);
  const [editing, setEditing] = useState<StoreLocation | "new" | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dbReady = isDbConnected();
  const canCreate = hasPermission(actor, "locations.create") && dbReady;
  const canEdit = hasPermission(actor, "locations.edit") && dbReady;
  const canDelete = hasPermission(actor, "locations.delete") && dbReady;

  const openCreate = () => {
    setForm(emptyForm());
    setError("");
    setEditing("new");
  };

  const openEdit = (location: StoreLocation) => {
    setForm({
      name: location.name,
      shortName: location.shortName,
      address: location.address,
      city: location.city,
      state: location.state,
      zip: location.zip,
      phone: location.phone,
      email: location.email,
      description: location.description,
      parking: location.parking ?? "",
      pickupAvailable: location.pickupAvailable,
      deliveryAvailable: location.deliveryAvailable,
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
    setError("");
    setEditing(location);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateLocationForm(form);
    if (validationError) {
      setError(validationError);
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
    if (!window.confirm(`Remove ${location.shortName}? Events at this store will also be deleted.`)) {
      return;
    }
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

      <MobileSortBar
        className="mt-5 lg:hidden"
        columns={[
          { key: "store", label: "Store" },
          { key: "address", label: "Address" },
          { key: "delivery", label: "Delivery & tax" },
          { key: "contact", label: "Contact" },
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
                <p className="mt-2 text-xs text-muted">
                  {location.address}, {location.city} {location.state} {location.zip}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {location.phone} · {location.email}
                </p>
                <p className="mt-2 text-[11px] text-gold">{formatDeliveryPricingSummary(location)}</p>
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
      {locations.length === 0 ? (
        <div className="mt-3 border border-white/10 px-4 py-14 text-center text-sm text-muted lg:hidden">
          <MapPin className="mx-auto mb-3 text-gold/70" size={28} />
          No stores assigned to this account.
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
                    {location.deliveryAvailable
                      ? `${location.deliveryRadiusKm} km radius`
                      : "Delivery disabled"}
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
        {locations.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-muted">
            <MapPin className="mx-auto mb-3 text-gold/70" size={28} />
            No stores assigned to this account.
          </div>
        ) : null}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add store" : "Edit store"}
        subtitle="This location appears in pickup, inventory, and events."
        className="sm:max-w-2xl"
      >
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
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
            Full name
            <Input
              className="mt-1"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              minLength={2}
            />
          </label>
          <label className="block text-xs text-muted">
            Short name
            <Input
              className="mt-1"
              value={form.shortName}
              onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
              required
              minLength={2}
            />
          </label>
          <label className="block text-xs text-muted">
            Phone
            <Input
              className="mt-1"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              required
              minLength={7}
            />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Address
            <Input
              className="mt-1"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              required
              minLength={3}
            />
          </label>
          <label className="block text-xs text-muted">
            City
            <Input
              className="mt-1"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              required
              minLength={2}
            />
          </label>
          <label className="block text-xs text-muted">
            State
            <Input
              className="mt-1"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              required
              minLength={2}
            />
          </label>
          <label className="block text-xs text-muted">
            ZIP
            <Input
              className="mt-1"
              value={form.zip}
              onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
              required
              pattern="\d{5}(-\d{4})?"
            />
          </label>
          <label className="block text-xs text-muted">
            Email
            <Input
              className="mt-1"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Parking notes
            <Input
              className="mt-1"
              value={form.parking}
              onChange={(e) => setForm((f) => ({ ...f, parking: e.target.value }))}
              placeholder="Street parking nearby"
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-cream sm:col-span-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-(--gold)"
              checked={form.pickupAvailable}
              onChange={(e) => setForm((f) => ({ ...f, pickupAvailable: e.target.checked }))}
            />
            Pickup available at this store
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-cream sm:col-span-2">
            <input
              type="checkbox"
              className="h-5 w-5 accent-(--gold)"
              checked={form.deliveryAvailable}
              onChange={(e) => setForm((f) => ({ ...f, deliveryAvailable: e.target.checked }))}
            />
            Delivery available from this store
          </label>

          <div className="sm:col-span-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Business hours</p>
            <p className="mt-1 text-xs text-muted">Day ranges and open/close times for this store.</p>
            <div className="mt-3 space-y-2">
              {form.hours.map((row, idx) => (
                <div key={`hours-${idx}`} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Input
                    value={row.day}
                    placeholder="Mon–Thu"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        hours: f.hours.map((h, i) =>
                          i === idx ? { ...h, day: e.target.value } : h,
                        ),
                      }))
                    }
                  />
                  <Input
                    type="time"
                    value={row.open}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        hours: f.hours.map((h, i) =>
                          i === idx ? { ...h, open: e.target.value } : h,
                        ),
                      }))
                    }
                  />
                  <Input
                    type="time"
                    value={row.close}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        hours: f.hours.map((h, i) =>
                          i === idx ? { ...h, close: e.target.value } : h,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={form.hours.length <= 1}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        hours: f.hours.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    hours: [...f.hours, { day: "", open: "10:00", close: "20:00" }],
                  }))
                }
              >
                Add hours row
              </Button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Holiday hours</p>
            <p className="mt-1 text-xs text-muted">Optional exceptions for specific dates.</p>
            <div className="mt-3 space-y-2">
              {form.holidayHours.map((row, idx) => (
                <div key={`hol-${idx}`} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <Input
                    type="date"
                    value={row.date}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        holidayHours: f.holidayHours.map((h, i) =>
                          i === idx ? { ...h, date: e.target.value } : h,
                        ),
                      }))
                    }
                  />
                  <Input
                    type="time"
                    value={row.open}
                    disabled={row.closed}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        holidayHours: f.holidayHours.map((h, i) =>
                          i === idx ? { ...h, open: e.target.value } : h,
                        ),
                      }))
                    }
                  />
                  <Input
                    type="time"
                    value={row.close}
                    disabled={row.closed}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        holidayHours: f.holidayHours.map((h, i) =>
                          i === idx ? { ...h, close: e.target.value } : h,
                        ),
                      }))
                    }
                  />
                  <label className="flex min-h-11 items-center gap-2 text-sm text-cream">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-(--gold)"
                      checked={row.closed}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          holidayHours: f.holidayHours.map((h, i) =>
                            i === idx ? { ...h, closed: e.target.checked } : h,
                          ),
                        }))
                      }
                    />
                    Closed
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        holidayHours: f.holidayHours.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    holidayHours: [
                      ...f.holidayHours,
                      { date: "", open: "10:00", close: "18:00", closed: false },
                    ],
                  }))
                }
              >
                Add holiday
              </Button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Delivery & pricing</p>
            <p className="mt-1 text-xs text-muted">
              Cart, checkout, and orders use these rates for this store only.
            </p>
          </div>
          <label className="block text-xs text-muted">
            Delivery fee ($)
            <Input
              className="mt-1"
              inputMode="decimal"
              value={form.deliveryFee}
              disabled={!form.deliveryAvailable}
              onChange={(e) =>
                setForm((f) => ({ ...f, deliveryFee: sanitizeMoneyInput(e.target.value, 2) }))
              }
            />
          </label>
          <label className="block text-xs text-muted">
            Free delivery over ($)
            <Input
              className="mt-1"
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
          </label>
          <label className="block text-xs text-muted">
            Minimum order ($)
            <Input
              className="mt-1"
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
          </label>
          <label className="block text-xs text-muted">
            Tax rate (%)
            <Input
              className="mt-1"
              inputMode="decimal"
              value={form.taxRatePercent}
              onChange={(e) =>
                setForm((f) => ({ ...f, taxRatePercent: sanitizeMoneyInput(e.target.value, 4) }))
              }
            />
            <span className="mt-1 block text-[10px] text-muted/80">0–25%, up to 4 decimals.</span>
          </label>
          <label className="block text-xs text-muted">
            Delivery radius (km)
            <Input
              className="mt-1"
              type="number"
              min={0}
              max={200}
              step={0.5}
              value={form.deliveryRadiusKm}
              disabled={!form.deliveryAvailable}
              onChange={(e) => setForm((f) => ({ ...f, deliveryRadiusKm: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-muted">
            Latitude
            <Input
              className="mt-1"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={form.lat}
              onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
              placeholder="40.7209"
            />
            <span className="mt-1 block text-[10px] text-muted/80">Used for the public map pin. Defaults to NYC if blank.</span>
          </label>
          <label className="block text-xs text-muted">
            Longitude
            <Input
              className="mt-1"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={form.lng}
              onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
              placeholder="-74.0007"
            />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Description
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-sm border border-white/10 bg-(--bg-elevated) px-3 py-2 text-sm text-cream outline-none"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
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
