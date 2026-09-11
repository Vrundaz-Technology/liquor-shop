"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { getAllLocations, getLocationById } from "@/data/locations";
import {
  apiCreateEvent,
  apiDeleteEvent,
  apiPatchEvent,
} from "@/lib/api-mutations";
import { hasPermission } from "@/lib/auth/permissions";
import { accessibleLocations, canAccessLocation } from "@/lib/auth/location-access";
import { isDbConnected, removeRuntimeEvent, upsertRuntimeEvent } from "@/lib/runtime-data";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { useRuntimeEvents } from "@/hooks/useRuntimeEvents";
import { useUserStore } from "@/store/user";
import type { EventItem } from "@/types";
import { Button } from "@/components/ui/Button";
import { CoverImageUpload } from "@/components/ui/ImageUpload";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { compareValues, MobileSortBar, SortableTh, tableCellClass, tableHeadRowClass, tableRowClass, tableWrapClass, useTableSort } from "@/components/ui/SortableTh";
import { formatPrice } from "@/lib/utils";
import {
  moneyAmountAtMost,
  parseFiniteNumber,
  sanitizeMoneyInput,
} from "@/lib/validation/money";

const EVENT_TYPES: { value: EventItem["type"]; label: string }[] = [
  { value: "wine-tasting", label: "Wine tasting" },
  { value: "whiskey-tasting", label: "Whiskey tasting" },
  { value: "launch", label: "Launch" },
  { value: "festival", label: "Festival" },
];

type EventForm = {
  title: string;
  type: EventItem["type"];
  description: string;
  locationId: string;
  date: string;
  startTime: string;
  endTime: string;
  price: string;
  seatsTotal: string;
  hosts: string;
  image: string;
  active: boolean;
};

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function validateEventForm(form: EventForm) {
  if (form.title.trim().length < 3) return "Enter a title with at least 3 characters.";
  if (form.description.trim().length < 8) return "Enter a description with at least 8 characters.";
  if (!form.locationId) return "Choose a store.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return "Pick a valid date.";
  if (!form.startTime || !form.endTime) return "Start and end times are required.";
  if (form.endTime <= form.startTime) return "End time must be after start time.";
  const priceCheck = moneyAmountAtMost(10_000, "Ticket price cannot exceed $10,000").safeParse(
    parseFiniteNumber(form.price),
  );
  if (!priceCheck.success) {
    return priceCheck.error.issues[0]?.message ?? "Enter a valid price.";
  }
  const seats = Number(form.seatsTotal);
  if (!Number.isInteger(seats) || seats < 1) return "Seats must be a whole number of at least 1.";
  return null;
}

export function EventsPanel() {
  const actor = useUserStore((s) => s.profile);
  const stores = accessibleLocations(actor, getAllLocations());
  const allEvents = useRuntimeEvents();
  const events = useMemo(
    () => allEvents.filter((event) => canAccessLocation(actor, event.locationId)),
    [actor, allEvents],
  );
  const { sortKey, sortDir, toggleSort } = useTableSort<"event" | "store" | "when" | "seats" | "status">(
    "when",
    "asc",
  );
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      if (sortKey === "store") {
        return compareValues(
          getLocationById(a.locationId)?.shortName ?? a.locationId,
          getLocationById(b.locationId)?.shortName ?? b.locationId,
          sortDir,
        );
      }
      if (sortKey === "when") {
        return compareValues(`${a.date} ${a.startTime}`, `${b.date} ${b.startTime}`, sortDir);
      }
      if (sortKey === "seats") return compareValues(a.seatsAvailable, b.seatsAvailable, sortDir);
      if (sortKey === "status") {
        return compareValues(
          a.active !== false ? "Active" : "Inactive",
          b.active !== false ? "Active" : "Inactive",
          sortDir,
        );
      }
      return compareValues(a.title, b.title, sortDir);
    });
  }, [events, sortDir, sortKey]);
  const [editing, setEditing] = useState<EventItem | "new" | null>(null);
  const [form, setForm] = useState<EventForm>(() => emptyEventForm(stores[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canCreate = hasPermission(actor, "events.create") && isDbConnected();
  const canEdit = hasPermission(actor, "events.edit") && isDbConnected();
  const canDelete = hasPermission(actor, "events.delete") && isDbConnected();
  const dbReady = isDbConnected();

  const openCreate = () => {
    setForm(emptyEventForm(stores[0]?.id ?? ""));
    setError("");
    setEditing("new");
  };

  const openEdit = (event: EventItem) => {
    setForm({
      title: event.title,
      type: event.type,
      description: event.description,
      locationId: event.locationId,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      price: String(event.price),
      seatsTotal: String(event.seatsTotal),
      hosts: event.hosts.join(", "),
      image: event.image,
      active: event.active !== false,
    });
    setError("");
    setEditing(event);
  };

  const payload = () => ({
    title: form.title.trim(),
    type: form.type,
    description: form.description.trim(),
    locationId: form.locationId,
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    price: Number(form.price) || 0,
    seatsTotal: Math.floor(Number(form.seatsTotal) || 1),
    hosts: form.hosts
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    // Always send image so clearing the cover persists.
    image: form.image.trim(),
    active: form.active,
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateEventForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing === "new") {
        const { event: created } = await apiCreateEvent(payload());
        upsertRuntimeEvent(created);
      } else if (editing) {
        const { event: updated } = await apiPatchEvent(editing.id, payload());
        upsertRuntimeEvent(updated);
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save event.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (event: EventItem) => {
    setBusy(true);
    setError("");
    try {
      const { event: updated } = await apiPatchEvent(event.id, { active: event.active === false });
      upsertRuntimeEvent(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update event visibility.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (event: EventItem) => {
    if (!window.confirm(`Remove “${event.title}”?`)) return;
    setBusy(true);
    setError("");
    try {
      await apiDeleteEvent(event.id);
      removeRuntimeEvent(event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove event.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-0">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
        <div className="min-w-0">
          <p className="hidden text-[10px] uppercase tracking-[0.22em] text-gold lg:flex lg:items-center lg:gap-2">
            <CalendarDays size={12} className="text-gold" />
            Events
          </p>
          <h2 className="hidden font-display text-3xl text-cream lg:mt-2 lg:block xl:text-4xl">
            Events
          </h2>
          <p className="max-w-2xl text-sm text-muted lg:mt-2">
            Create and manage tastings, launches, and in-store events.
          </p>
        </div>
        {canCreate && stores.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} />
              Add event
            </Button>
          </div>
        ) : null}
      </div>
      {!dbReady ? (
        <ConnectionNotice className="mt-4" feature="add or edit events" preview />
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <MobileSortBar
        className="mt-5 lg:hidden"
        columns={[
          { key: "event", label: "Event" },
          { key: "store", label: "Store" },
          { key: "when", label: "When" },
          { key: "seats", label: "Seats" },
          { key: "status", label: "Status" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />
      <ul className="mt-3 divide-y divide-white/10 border border-white/10 lg:hidden">
        {sortedEvents.map((event) => (
          <li key={event.id} className="p-4">
            <div className="flex items-start gap-3">
              {event.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.image} alt="" className="h-14 w-20 shrink-0 object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-cream">{event.title}</p>
                <p className="text-xs text-muted">
                  {EVENT_TYPES.find((item) => item.value === event.type)?.label} · {formatPrice(event.price)}
                  {" · "}
                  <span className={event.active !== false ? "text-emerald-300/90" : "text-amber-200/90"}>
                    {event.active !== false ? "Active" : "Inactive"}
                  </span>
                </p>
                <p className="mt-2 text-xs text-muted">
                  {getLocationById(event.locationId)?.shortName ?? event.locationId}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {event.date} · {event.startTime}–{event.endTime} · {event.seatsAvailable}/{event.seatsTotal} seats
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 px-2.5"
                      onClick={() => void toggleActive(event)}
                      disabled={busy}
                    >
                      {event.active !== false ? "Hide" : "Show"}
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button size="sm" variant="ghost" className="h-9 px-2.5" onClick={() => openEdit(event)}>
                      <Pencil size={13} />
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button size="sm" variant="secondary" className="h-9 px-2.5" onClick={() => void remove(event)} disabled={busy}>
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
      {events.length === 0 ? (
        <div className="mt-3 border border-white/10 px-4 py-14 text-center text-sm text-muted lg:hidden">
          <CalendarDays className="mx-auto mb-3 text-gold/70" size={28} />
          No events for the stores you can access.
        </div>
      ) : null}

      <div className={`mt-5 hidden lg:block ${tableWrapClass}`}>
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <SortableTh label="Event" column="event" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Store" column="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="When" column="when" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Seats" column="seats" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event) => (
              <tr key={event.id} className={tableRowClass}>
                <td className={tableCellClass}>
                  <div className="flex items-center gap-3">
                    {event.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={event.image} alt="" className="h-10 w-14 shrink-0 object-cover" />
                    ) : null}
                    <div>
                      <p className="font-medium text-cream">{event.title}</p>
                      <p className="text-xs text-muted">
                        {EVENT_TYPES.find((item) => item.value === event.type)?.label} · {formatPrice(event.price)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={`${tableCellClass} text-xs text-muted`}>
                  {getLocationById(event.locationId)?.shortName ?? event.locationId}
                </td>
                <td className={`${tableCellClass} text-xs text-muted whitespace-nowrap`}>
                  {event.date} · {event.startTime}–{event.endTime}
                </td>
                <td className={`${tableCellClass} text-xs text-muted`}>
                  {event.seatsAvailable}/{event.seatsTotal}
                </td>
                <td className={tableCellClass}>
                  <span
                    className={`inline-block text-[10px] uppercase tracking-[0.14em] ${
                      event.active !== false ? "text-emerald-300/90" : "text-amber-200/90"
                    }`}
                  >
                    {event.active !== false ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className={tableCellClass}>
                  <div className="flex flex-nowrap justify-end gap-2">
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5"
                        onClick={() => void toggleActive(event)}
                        disabled={busy}
                      >
                        {event.active !== false ? "Hide" : "Show"}
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <Button size="sm" variant="ghost" className="h-8 px-2.5" onClick={() => openEdit(event)}>
                        <Pencil size={13} />
                        Edit
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button size="sm" variant="secondary" className="h-8 px-2.5" onClick={() => void remove(event)} disabled={busy}>
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
        {events.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-muted">
            <CalendarDays className="mx-auto mb-3 text-gold/70" size={28} />
            No events for the stores you can access.
          </div>
        ) : null}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add event" : "Edit event"}
        subtitle="Active events appear on the public site. Inactive events stay hidden."
        className="sm:max-w-xl"
      >
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <CoverImageUpload
            className="sm:col-span-2"
            label="Event image"
            hint="Shown on the events list and event page. JPG or PNG."
            value={form.image}
            onChange={(image) => setForm((f) => ({ ...f, image }))}
          />
          <label className="flex items-center justify-between gap-3 border border-white/10 px-3 py-2.5 text-sm text-cream sm:col-span-2">
            <span>
              <span className="block font-medium">Visible on site</span>
              <span className="mt-0.5 block text-xs text-muted">
                {form.active ? "Public pages will show this event." : "Hidden from public listings and booking."}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                form.active ? "bg-emerald-600/80" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-cream transition ${
                  form.active ? "translate-x-5" : ""
                }`}
              />
            </button>
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Title
            <Input
              className="mt-1"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              minLength={3}
            />
          </label>
          <label className="block text-xs text-muted">
            Type
            <div className="mt-1">
              <Select
                value={form.type}
                onChange={(value) => setForm((f) => ({ ...f, type: value as EventItem["type"] }))}
                options={EVENT_TYPES}
              />
            </div>
          </label>
          <label className="block text-xs text-muted">
            Store
            <div className="mt-1">
              <Select
                value={form.locationId}
                onChange={(value) => setForm((f) => ({ ...f, locationId: value }))}
                options={stores.map((store) => ({ value: store.id, label: store.shortName }))}
              />
            </div>
          </label>
          <label className="block text-xs text-muted">
            Date
            <Input className="mt-1" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </label>
          <label className="block text-xs text-muted">
            Price
            <Input
              className="mt-1"
              inputMode="decimal"
              min={0}
              value={form.price}
              onChange={(e) =>
                setForm((f) => ({ ...f, price: sanitizeMoneyInput(e.target.value, 2) }))
              }
              required
            />
          </label>
          <label className="block text-xs text-muted">
            Start
            <Input className="mt-1" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} required />
          </label>
          <label className="block text-xs text-muted">
            End
            <Input className="mt-1" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} required />
          </label>
          <label className="block text-xs text-muted">
            Seats
            <Input
              className="mt-1"
              type="number"
              min={1}
              step={1}
              value={form.seatsTotal}
              onChange={(e) => setForm((f) => ({ ...f, seatsTotal: e.target.value }))}
              required
            />
          </label>
          <label className="block text-xs text-muted">
            Hosts
            <Input className="mt-1" value={form.hosts} onChange={(e) => setForm((f) => ({ ...f, hosts: e.target.value }))} placeholder="Comma separated" />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Description
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-sm border border-white/10 bg-(--bg-elevated) px-3 py-2 text-sm text-cream outline-none"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="text-sm text-red-300 sm:col-span-2">{error}</p> : null}
          <div className="modal-actions border-t border-white/10 pt-4 sm:col-span-2">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={busy} disabled={stores.length === 0}>
              {busy ? "Saving…" : "Save event"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function emptyEventForm(locationId: string): EventForm {
  return {
    title: "",
    type: "wine-tasting",
    description: "",
    locationId,
    date: localToday(),
    startTime: "18:00",
    endTime: "20:00",
    price: "45",
    seatsTotal: "20",
    hosts: "",
    image: "",
    active: true,
  };
}
