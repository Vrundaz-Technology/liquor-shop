"use client";

import { useMemo } from "react";
import { Check, LayoutGrid, MapPin, Pencil, Plus, Star, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  SortableTh,
  compareValues,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { confirmAction } from "@/store/dialog";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types";

type AddressSortKey = "label" | "street" | "city" | "state" | "zip" | "default";

const ACCOUNT_ADDRESSES_VIEW_KEY = "account-addresses-view";

type Address = UserProfile["addresses"][number];

const ADDRESS_LIMIT = 12;

function emptyAddress(makeDefault: boolean): Address {
  return {
    id: `addr-${crypto.randomUUID()}`,
    label: "Home",
    line1: "",
    city: "",
    state: "",
    zip: "",
    isDefault: makeDefault,
  };
}

function formatLines(address: Address) {
  return {
    street: address.line1,
    locality: [address.city, address.state].filter(Boolean).join(", "),
    zip: address.zip,
  };
}

type Props = {
  addresses: Address[];
  editing: Address | null;
  busy: boolean;
  onEdit: (address: Address | null) => void;
  onChangeDraft: (address: Address) => void;
  onSave: (next: Address[]) => void;
};

export function CustomerAddressesPanel({
  addresses,
  editing,
  busy,
  onEdit,
  onChangeDraft,
  onSave,
}: Props) {
  const [view, setView] = usePersistedViewMode(ACCOUNT_ADDRESSES_VIEW_KEY, "cards");
  const { sortKey, sortDir, toggleSort } = useTableSort<AddressSortKey>(
    "label",
    "asc",
    ["default"],
  );
  const sortedAddresses = useMemo(() => {
    return [...addresses].sort((a, b) => {
      switch (sortKey) {
        case "street":
          return compareValues(a.line1, b.line1, sortDir);
        case "city":
          return compareValues(a.city, b.city, sortDir);
        case "state":
          return compareValues(a.state, b.state, sortDir);
        case "zip":
          return compareValues(a.zip, b.zip, sortDir);
        case "default":
          return compareValues(a.isDefault ? 1 : 0, b.isDefault ? 1 : 0, sortDir);
        case "label":
        default:
          return compareValues(a.label || "Address", b.label || "Address", sortDir);
      }
    });
  }, [addresses, sortDir, sortKey]);
  const atLimit = addresses.length >= ADDRESS_LIMIT;
  const isNew = Boolean(editing && !addresses.some((row) => row.id === editing.id));

  const startAdd = () => {
    if (atLimit || busy) return;
    onEdit(emptyAddress(addresses.length === 0));
  };

  const removeAddress = async (address: Address) => {
    const ok = await confirmAction({
      title: "Remove this address?",
      description: `${address.label} will be deleted from checkout. This cannot be undone.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    const next = addresses.filter((row) => row.id !== address.id);
    if (address.isDefault && next[0] && !next.some((row) => row.isDefault)) {
      next[0] = { ...next[0], isDefault: true };
    }
    if (editing?.id === address.id) onEdit(null);
    onSave(next);
  };

  const setDefault = (address: Address) => {
    if (address.isDefault) return;
    onSave(addresses.map((row) => ({ ...row, isDefault: row.id === address.id })));
  };

  const saveDraft = () => {
    if (!editing) return;
    const exists = addresses.some((row) => row.id === editing.id);
    const next = exists
      ? addresses.map((row) => (row.id === editing.id ? editing : row))
      : [...addresses, editing];
    onSave(
      editing.isDefault
        ? next.map((row) => ({ ...row, isDefault: row.id === editing.id }))
        : next,
    );
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {addresses.length === 0
            ? "No saved addresses yet."
            : `${addresses.length} of ${ADDRESS_LIMIT} saved`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {addresses.length > 0 ? (
            <div className="inline-flex rounded-sm border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setView("cards")}
                className={cn(
                  "inline-flex min-h-10 min-w-10 items-center justify-center transition",
                  view === "cards" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
                )}
                aria-label="Grid view"
                aria-pressed={view === "cards"}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                className={cn(
                  "inline-flex min-h-10 min-w-10 items-center justify-center transition",
                  view === "table" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
                )}
                aria-label="Table view"
                aria-pressed={view === "table"}
              >
                <Table2 size={15} />
              </button>
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || atLimit || Boolean(editing)}
            onClick={startAdd}
          >
            <Plus size={14} />
            Add address
          </Button>
        </div>
      </div>

      {editing ? (
        <form
          className="rounded-sm border border-gold/30 bg-gold/[0.04] p-4 sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveDraft();
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.16em] text-gold">
            {isNew ? "New address" : "Edit address"}
          </p>
          <h3 className="mt-1 font-display text-xl text-cream">
            {isNew ? "Where should we deliver?" : editing.label || "Address"}
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-6">
            <label className="block text-xs text-muted sm:col-span-2">
              Label
              <Input
                className="mt-1"
                value={editing.label}
                onChange={(e) => onChangeDraft({ ...editing, label: e.target.value })}
                placeholder="Home, Work…"
                autoComplete="address-line3"
              />
            </label>
            <label className="block text-xs text-muted sm:col-span-4">
              Street address
              <Input
                className="mt-1"
                value={editing.line1}
                onChange={(e) => onChangeDraft({ ...editing, line1: e.target.value })}
                placeholder="128 Grand Avenue"
                autoComplete="address-line1"
                required
              />
            </label>
            <label className="block text-xs text-muted sm:col-span-3">
              City
              <Input
                className="mt-1"
                value={editing.city}
                onChange={(e) => onChangeDraft({ ...editing, city: e.target.value })}
                placeholder="New York"
                autoComplete="address-level2"
                required
              />
            </label>
            <label className="block text-xs text-muted sm:col-span-1">
              State
              <Input
                className="mt-1"
                value={editing.state}
                onChange={(e) => onChangeDraft({ ...editing, state: e.target.value })}
                placeholder="NY"
                autoComplete="address-level1"
                required
              />
            </label>
            <label className="block text-xs text-muted sm:col-span-2">
              ZIP
              <Input
                className="mt-1"
                value={editing.zip}
                onChange={(e) => onChangeDraft({ ...editing, zip: e.target.value })}
                placeholder="10013"
                inputMode="numeric"
                autoComplete="postal-code"
                required
              />
            </label>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-cream">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--gold)]"
              checked={editing.isDefault}
              onChange={(e) => onChangeDraft({ ...editing, isDefault: e.target.checked })}
            />
            Use as my default delivery address
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onEdit(null)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={busy}>
              {isNew ? "Save address" : "Update address"}
            </Button>
          </div>
        </form>
      ) : null}

      {addresses.length === 0 && !editing ? (
        <div className="rounded-sm border border-dashed border-white/15 px-4 py-12 text-center">
          <MapPin className="mx-auto h-8 w-8 text-gold/80" aria-hidden />
          <p className="mt-3 font-display text-xl text-cream">Add a delivery address</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Save Home or Work so checkout can fill itself in.
          </p>
          <Button type="button" size="sm" className="mt-4" onClick={startAdd}>
            <Plus size={14} />
            Add address
          </Button>
        </div>
      ) : (
        view === "table" ? (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
              {sortedAddresses.map((address) => (
                <AddressCard
                  key={address.id}
                  address={address}
                  dimmed={editing?.id === address.id}
                  busy={busy}
                  onEdit={onEdit}
                  onDefault={setDefault}
                  onRemove={removeAddress}
                />
              ))}
            </ul>
            <div className={cn(tableWrapClass, "hidden min-w-0 lg:block")}>
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[24%]" />
                  <col className="w-[15%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[11%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead>
                  <tr className={tableHeadRowClass}>
                    <SortableTh
                      label="Label"
                      column="label"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      className="px-5"
                    />
                    <SortableTh
                      label="Street"
                      column="street"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      className="px-5"
                    />
                    <SortableTh
                      label="City"
                      column="city"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      className="px-5"
                    />
                    <SortableTh
                      label="State"
                      column="state"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      className="px-5"
                    />
                    <SortableTh
                      label="ZIP"
                      column="zip"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      className="px-5"
                    />
                    <SortableTh
                      label="Default"
                      column="default"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      className="px-5"
                    />
                    <th className={cn(tableCellClass, "px-5 text-right font-medium")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAddresses.map((address) => (
                    <tr
                      key={address.id}
                      className={cn(tableRowClass, editing?.id === address.id && "opacity-50")}
                    >
                      <td className={cn(tableCellClass, "px-5 font-medium text-cream")}>
                        <span className="line-clamp-2">{address.label || "Address"}</span>
                      </td>
                      <td className={cn(tableCellClass, "px-5")}>
                        <span className="line-clamp-2">{address.line1}</span>
                      </td>
                      <td className={cn(tableCellClass, "px-5")}>
                        <span className="line-clamp-2">{address.city}</span>
                      </td>
                      <td className={cn(tableCellClass, "px-5")}>{address.state}</td>
                      <td className={cn(tableCellClass, "px-5 tabular-nums")}>{address.zip}</td>
                      <td className={cn(tableCellClass, "px-5")}>
                        {address.isDefault ? <DefaultBadge /> : <span className="text-muted">—</span>}
                      </td>
                      <td className={cn(tableCellClass, "px-5 text-right")}>
                        <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="shrink-0 whitespace-nowrap px-2.5"
                            disabled={busy}
                            onClick={() => onEdit(address)}
                          >
                            <Pencil size={13} className="shrink-0" />
                            Edit
                          </Button>
                          {!address.isDefault ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="shrink-0 whitespace-nowrap px-2.5"
                              disabled={busy}
                              onClick={() => setDefault(address)}
                            >
                              <Check size={13} className="shrink-0" />
                              Default
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="shrink-0 whitespace-nowrap px-2.5 text-red-300 hover:text-red-200"
                            disabled={busy}
                            onClick={() => void removeAddress(address)}
                          >
                            <Trash2 size={13} className="shrink-0" />
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                dimmed={editing?.id === address.id}
                busy={busy}
                onEdit={onEdit}
                onDefault={setDefault}
                onRemove={removeAddress}
              />
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function DefaultBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-gold/35 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
      <Star size={9} aria-hidden />
      Default
    </span>
  );
}

function AddressCard({
  address,
  dimmed,
  busy,
  onEdit,
  onDefault,
  onRemove,
}: {
  address: Address;
  dimmed: boolean;
  busy: boolean;
  onEdit: (address: Address) => void;
  onDefault: (address: Address) => void;
  onRemove: (address: Address) => void;
}) {
  const lines = formatLines(address);
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col rounded-sm border bg-black/20 p-4",
        address.isDefault ? "border-gold/35" : "border-white/10",
        dimmed && "opacity-50",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border",
            address.isDefault
              ? "border-gold/35 bg-gold/10 text-gold"
              : "border-white/10 bg-white/[0.03] text-muted",
          )}
          aria-hidden
        >
          <MapPin size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-cream">{address.label || "Address"}</p>
            {address.isDefault ? <DefaultBadge /> : null}
          </div>
          <p className="mt-1.5 text-sm text-cream">{lines.street}</p>
          <p className="mt-0.5 text-sm text-muted">
            {lines.locality}
            {lines.zip ? ` ${lines.zip}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="whitespace-nowrap"
          disabled={busy}
          onClick={() => onEdit(address)}
        >
          <Pencil size={13} />
          Edit
        </Button>
        {!address.isDefault ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="whitespace-nowrap"
            disabled={busy}
            onClick={() => onDefault(address)}
          >
            <Check size={13} />
            Set default
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto whitespace-nowrap text-red-300 hover:text-red-200"
          disabled={busy}
          onClick={() => onRemove(address)}
        >
          <Trash2 size={13} />
          Remove
        </Button>
      </div>
    </li>
  );
}
