"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Truck } from "lucide-react";
import {
  apiCreateDriver,
  apiDeactivateDriver,
  apiFetchDrivers,
  apiPatchDriver,
} from "@/lib/api-mutations";
import { getAllLocations } from "@/data/locations";
import { drivers as seedDrivers } from "@/data/drivers";
import { accessibleLocations } from "@/lib/auth/location-access";
import { hasPermission } from "@/lib/auth/permissions";
import { isDbConnected } from "@/lib/runtime-data";
import { isConnectionError } from "@/lib/connection-messages";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { useUserStore } from "@/store/user";
import { useDeliveryStore } from "@/store/delivery";
import type { Driver, DriverStatus } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  compareValues,
  MobileSortBar,
  SortableTh,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import { cn, formatUsPhone, isUsPhone } from "@/lib/utils";

type DriverForm = {
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  locationId: string;
  photoUrl: string;
  status: DriverStatus;
  active: boolean;
};

const STATUS_LABEL: Record<DriverStatus, string> = {
  available: "Available",
  on_route: "On route",
  offline: "Offline",
};

const STATUS_TONE: Record<DriverStatus, string> = {
  available: "border-(--success)/30 bg-(--success)/10 text-(--success)",
  on_route: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  offline: "border-white/15 bg-white/5 text-muted",
};

function emptyForm(locationId: string): DriverForm {
  return {
    name: "",
    phone: "",
    email: "",
    vehicle: "",
    locationId,
    photoUrl: "",
    status: "available",
    active: true,
  };
}

function validateForm(form: DriverForm) {
  if (form.name.trim().length < 2) return "Enter the driver's full name.";
  if (!isUsPhone(form.phone) && form.phone.replace(/\D/g, "").length < 10) {
    return "Enter a valid phone number.";
  }
  if (form.vehicle.trim().length < 2) return "Enter the vehicle description.";
  if (!form.locationId) return "Choose a home store.";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Enter a valid email address.";
  }
  return null;
}

export function DriversPanel({ embedded = false }: { embedded?: boolean }) {
  const actor = useUserStore((s) => s.profile);
  const stores = useMemo(() => accessibleLocations(actor, getAllLocations()), [actor]);
  const upsertLocal = useDeliveryStore((s) => s.upsertDriver);
  const setLocalActive = useDeliveryStore((s) => s.setDriverActive);
  const localDrivers = useDeliveryStore((s) => s.drivers);

  const [drivers, setDrivers] = useState<Driver[]>(seedDrivers);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<Driver | "new" | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyForm(stores[0]?.id ?? "loc1"));
  const [busy, setBusy] = useState(false);
  const dbReady = isDbConnected();
  const canManage = hasPermission(actor, "deliveries.manage");

  const { sortKey, sortDir, toggleSort } = useTableSort<"name" | "store" | "vehicle" | "contact" | "status">(
    "name",
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!dbReady) {
        setDrivers(localDrivers.filter((driver) => stores.some((store) => store.id === driver.locationId)));
        return;
      }
      const data = await apiFetchDrivers({
        all: true,
        locationId: storeFilter === "all" ? undefined : storeFilter,
      });
      setDrivers(data.drivers);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load drivers.";
      setError(isConnectionError(message) ? "" : message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilter, dbReady]);

  const filteredDrivers = useMemo(() => {
    return drivers
      .filter((driver) => (showInactive ? true : driver.active))
      .filter((driver) => storeFilter === "all" || driver.locationId === storeFilter)
      .sort((a, b) => {
        const storeA = stores.find((store) => store.id === a.locationId)?.shortName ?? a.locationId;
        const storeB = stores.find((store) => store.id === b.locationId)?.shortName ?? b.locationId;
        if (sortKey === "store") return compareValues(storeA, storeB, sortDir);
        if (sortKey === "vehicle") return compareValues(a.vehicle, b.vehicle, sortDir);
        if (sortKey === "contact") {
          return compareValues(
            `${a.phone} ${a.email ?? ""}`,
            `${b.phone} ${b.email ?? ""}`,
            sortDir,
          );
        }
        if (sortKey === "status") return compareValues(a.status, b.status, sortDir);
        return compareValues(a.name, b.name, sortDir);
      });
  }, [drivers, showInactive, sortDir, sortKey, storeFilter, stores]);

  const openCreate = () => {
    setForm(emptyForm(storeFilter === "all" ? stores[0]?.id ?? "loc1" : storeFilter));
    setError("");
    setEditing("new");
  };

  const openEdit = (driver: Driver) => {
    setForm({
      name: driver.name,
      phone: driver.phone,
      email: driver.email ?? "",
      vehicle: driver.vehicle,
      locationId: driver.locationId,
      photoUrl: driver.photoUrl ?? "",
      status: driver.status,
      active: driver.active,
    });
    setError("");
    setEditing(driver);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      vehicle: form.vehicle.trim(),
      locationId: form.locationId,
      photoUrl: form.photoUrl.trim() || undefined,
      status: form.status,
      active: form.active,
    };
    try {
      if (!dbReady) {
        const driver: Driver =
          editing === "new"
            ? {
                id: `drv-local-${Date.now().toString(36)}`,
                ...payload,
                email: payload.email,
                status: "available",
                active: true,
              }
            : {
                ...(editing as Driver),
                ...payload,
                email: payload.email,
              };
        upsertLocal(driver);
        setEditing(null);
        setDrivers((current) => {
          const idx = current.findIndex((item) => item.id === driver.id);
          if (idx >= 0) return current.map((item, index) => (index === idx ? driver : item));
          return [...current, driver];
        });
        return;
      }

      if (editing === "new") {
        const { driver } = await apiCreateDriver(payload);
        upsertLocal(driver);
      } else if (editing) {
        const { driver } = await apiPatchDriver(editing.id, payload);
        upsertLocal(driver);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save driver.");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (driver: Driver) => {
    if (!canManage) return;
    if (!window.confirm(`Deactivate ${driver.name}? They will no longer appear in delivery assignment.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!dbReady) {
        setLocalActive(driver.id, false);
        setDrivers((current) =>
          current.map((item) =>
            item.id === driver.id ? { ...item, active: false, status: "offline" } : item,
          ),
        );
        return;
      }
      const { driver: updated } = await apiDeactivateDriver(driver.id);
      upsertLocal(updated);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not deactivate driver.");
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async (driver: Driver) => {
    setBusy(true);
    setError("");
    try {
      if (!dbReady) {
        const next = { ...driver, active: true, status: "available" as const };
        upsertLocal(next);
        setDrivers((current) => current.map((item) => (item.id === driver.id ? next : item)));
        return;
      }
      const { driver: updated } = await apiPatchDriver(driver.id, { active: true, status: "available" });
      upsertLocal(updated);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reactivate driver.");
    } finally {
      setBusy(false);
    }
  };

  const activeCount = filteredDrivers.filter((driver) => driver.active && driver.status === "available").length;

  const Root = embedded ? "div" : "section";

  return (
    <Root className={embedded ? "min-w-0 pt-6" : "mt-6 min-w-0"}>
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {!embedded ? (
            <h2 className="font-display text-2xl text-cream sm:text-3xl">Drivers</h2>
          ) : null}
          <p className={embedded ? "text-sm text-muted" : "mt-1 text-sm text-muted"}>
            Sam&apos;s own delivery team — add drivers per store, then assign them from the Deliveries
            tab.
          </p>
          <p className="mt-2 text-xs uppercase tracking-wider text-gold">
            {activeCount} available · {filteredDrivers.filter((d) => d.active).length} active roster
          </p>
        </div>
        {canManage ? (
          <Button size="sm" className="self-start lg:self-auto" onClick={openCreate}>
            <Plus size={14} />
            Add driver
          </Button>
        ) : null}
      </div>

      {!dbReady ? (
        <ConnectionNotice className="mt-4" feature="sync the driver roster" preview />
      ) : null}
      {error && !editing ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-[10rem] flex-1 text-xs text-muted sm:max-w-xs">
          Store
          <Select
            className="mt-1"
            value={storeFilter}
            onChange={setStoreFilter}
            options={[
              { value: "all", label: "All stores" },
              ...stores.map((store) => ({ value: store.id, label: store.shortName })),
            ]}
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm text-cream">
          <input
            type="checkbox"
            className="h-4 w-4 accent-(--gold)"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <ActiveFiltersBar
        className="mt-3"
        resultCount={filteredDrivers.length}
        resultNoun="driver"
        chips={[
          ...(storeFilter !== "all"
            ? [
                {
                  id: "store",
                  label: stores.find((s) => s.id === storeFilter)?.shortName ?? storeFilter,
                  onRemove: () => setStoreFilter("all"),
                },
              ]
            : []),
          ...(!showInactive
            ? [
                {
                  id: "active",
                  label: "Active only",
                  onRemove: () => setShowInactive(true),
                },
              ]
            : []),
        ]}
        onClearAll={() => {
          setStoreFilter("all");
          setShowInactive(true);
        }}
      />

      <MobileSortBar
        className="mt-5 lg:hidden"
        columns={[
          { key: "name", label: "Driver" },
          { key: "store", label: "Store" },
          { key: "vehicle", label: "Vehicle" },
          { key: "contact", label: "Contact" },
          { key: "status", label: "Status" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />

      <ul className="mt-3 divide-y divide-white/10 border border-white/10 lg:hidden">
        {loading ? (
          <li className="p-6 text-center text-sm text-muted">Loading drivers…</li>
        ) : filteredDrivers.length === 0 ? (
          <li className="p-8 text-center text-sm text-muted">No drivers yet.</li>
        ) : (
          filteredDrivers.map((driver) => {
            const store = stores.find((item) => item.id === driver.locationId);
            return (
              <li key={driver.id} className="p-4">
                <div className="flex items-start gap-3">
                  <UserAvatar name={driver.name} src={driver.photoUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-cream">{driver.name}</p>
                      {!driver.active ? (
                        <span className="rounded-sm border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted">{store?.shortName ?? driver.locationId}</p>
                    <p className="mt-1 text-xs text-muted">{driver.vehicle}</p>
                    <p className="mt-1 text-xs text-muted">{driver.phone}</p>
                    <span
                      className={cn(
                        "mt-2 inline-flex rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                        STATUS_TONE[driver.status],
                      )}
                    >
                      {STATUS_LABEL[driver.status]}
                    </span>
                    {canManage ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" className="h-9 px-2.5" onClick={() => openEdit(driver)}>
                          <Pencil size={13} />
                          Edit
                        </Button>
                        {driver.active ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-9 px-2.5"
                            disabled={busy || driver.status === "on_route"}
                            onClick={() => void deactivate(driver)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" className="h-9 px-2.5" disabled={busy} onClick={() => void reactivate(driver)}>
                            Reactivate
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div className={`mt-5 hidden lg:block ${tableWrapClass}`}>
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <SortableTh label="Driver" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Store" column="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Vehicle" column="vehicle" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Contact" column="contact" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Loading drivers…
                </td>
              </tr>
            ) : filteredDrivers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  <Truck className="mx-auto mb-3 text-gold/70" size={28} />
                  No drivers yet.
                </td>
              </tr>
            ) : (
              filteredDrivers.map((driver) => {
                const store = stores.find((item) => item.id === driver.locationId);
                return (
                  <tr key={driver.id} className={cn(tableRowClass, !driver.active && "opacity-60")}>
                    <td className={tableCellClass}>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={driver.name} src={driver.photoUrl} size={36} />
                        <div>
                          <p className="font-medium text-cream">{driver.name}</p>
                          {!driver.active ? (
                            <p className="text-[10px] uppercase tracking-wider text-muted">Inactive</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={tableCellClass}>{store?.shortName ?? driver.locationId}</td>
                    <td className={`${tableCellClass} max-w-[14rem] truncate text-muted`}>{driver.vehicle}</td>
                    <td className={`${tableCellClass} text-xs text-muted`}>
                      <p>{driver.phone}</p>
                      {driver.email ? <p className="mt-0.5">{driver.email}</p> : null}
                    </td>
                    <td className={tableCellClass}>
                      <span
                        className={cn(
                          "inline-flex rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                          STATUS_TONE[driver.status],
                        )}
                      >
                        {STATUS_LABEL[driver.status]}
                      </span>
                    </td>
                    <td className={`${tableCellClass} text-right`}>
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" className="h-8 px-2.5" onClick={() => openEdit(driver)}>
                            <Pencil size={13} />
                            Edit
                          </Button>
                          {driver.active ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 px-2.5"
                              disabled={busy || driver.status === "on_route"}
                              onClick={() => void deactivate(driver)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" className="h-8 px-2.5" disabled={busy} onClick={() => void reactivate(driver)}>
                              Reactivate
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add driver" : "Edit driver"}
        subtitle="Drivers belong to one store and appear when assigning deliveries from that branch."
        className="sm:max-w-xl"
      >
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <AvatarUpload layout="horizontal" name={form.name} value={form.photoUrl} onChange={(photoUrl) => setForm((f) => ({ ...f, photoUrl }))} />
          </div>
          <label className="block text-xs text-muted sm:col-span-2">
            Full name
            <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label className="block text-xs text-muted">
            Phone
            <Input
              className="mt-1"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatUsPhone(e.target.value) }))}
              placeholder="(212) 555-0100"
              required
            />
          </label>
          <label className="block text-xs text-muted">
            Email
            <Input
              className="mt-1"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Vehicle
            <Input
              className="mt-1"
              value={form.vehicle}
              onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
              placeholder="Sprinter van · NY-4412"
              required
            />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            Home store
            <Select
              className="mt-1"
              value={form.locationId}
              onChange={(locationId) => setForm((f) => ({ ...f, locationId }))}
              options={stores.map((store) => ({ value: store.id, label: store.shortName }))}
            />
          </label>
          {editing !== "new" && form.status !== "on_route" ? (
            <label className="block text-xs text-muted sm:col-span-2">
              Manual status
              <Select
                className="mt-1"
                value={form.status}
                onChange={(value) => setForm((f) => ({ ...f, status: value as DriverStatus }))}
                options={[
                  { value: "available", label: "Available" },
                  { value: "offline", label: "Offline" },
                ]}
              />
            </label>
          ) : null}
          {error ? <p className="text-sm text-red-300 sm:col-span-2">{error}</p> : null}
          <div className="modal-actions border-t border-white/10 pt-4 sm:col-span-2">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={busy}>
              {busy ? "Saving…" : editing === "new" ? "Add driver" : "Save driver"}
            </Button>
          </div>
        </form>
      </Modal>
    </Root>
  );
}
