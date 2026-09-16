"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  LayoutGrid,
  Plus,
  Search,
  Table2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { getAllProducts } from "@/data/products";
import { useInventoryStore } from "@/store/inventory";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { NativeSelect } from "@/components/ui/NativeSelect";
import {
  compareValues,
  SortableTh,
  tableCellClass,
  tableHeadRowClass,
  tableRowClass,
  tableWrapClass,
  useTableSort,
} from "@/components/ui/SortableTh";
import { cn } from "@/lib/utils";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import type { StoreLocation } from "@/types";

const TRANSFERS_VIEW_KEY = "sams.dashboard.view.transfers";
type TransferSortKey = "when" | "from" | "to" | "items" | "status";

const fieldBase =
  "mt-1.5 w-full appearance-none rounded-sm border bg-(--bg-elevated) px-3 py-2.5 text-sm text-cream scheme-dark outline-none transition [&_option]:bg-(--bg-elevated) [&_option]:text-cream";

const fieldOk =
  "border-white/10 hover:border-white/20 focus:border-(--gold)/45";

const fieldError =
  "border-(--danger)/55 bg-(--danger)/5 focus:border-(--danger)/70";

type TransferRow = {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  status: string;
  createdAt: string;
  lines: { productId: string; quantity: number }[];
};

export function TransfersPanel({ locations }: { locations: StoreLocation[] }) {
  const qc = useQueryClient();
  const products = useMemo(() => getAllProducts(), []);
  const getAvailable = useInventoryStore((s) => s.getAvailable);

  const [modalOpen, setModalOpen] = useState(false);
  const [historyView, setHistoryView] = usePersistedViewMode(TRANSFERS_VIEW_KEY, "cards");
  const { sortKey, sortDir, toggleSort } = useTableSort<TransferSortKey>("when", "desc", ["when"]);
  const [fromLocationId, setFrom] = useState(locations[0]?.id ?? "");
  const [toLocationId, setTo] = useState(locations[1]?.id ?? locations[0]?.id ?? "");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touched, setTouched] = useState({ stores: false, product: false, quantity: false });
  const pickerRef = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === productId);
  const available =
    fromLocationId && productId ? getAvailable(fromLocationId, productId) : 0;

  const sameStore = Boolean(fromLocationId && toLocationId && fromLocationId === toLocationId);
  const needsTwoStores = locations.length < 2;
  const qtyInvalid =
    Boolean(productId) && (quantity < 1 || (available > 0 && quantity > available));
  const noStock = Boolean(productId && !sameStore && available <= 0);
  const storesInvalid = needsTwoStores || sameStore;

  const toOptions = useMemo(
    () => locations.filter((l) => l.id !== fromLocationId),
    [locations, fromLocationId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? products
      : products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q),
        );
    return list.slice(0, 80);
  }, [products, query]);

  useEffect(() => {
    if (!fromLocationId) return;
    if (toLocationId === fromLocationId) {
      const next = locations.find((l) => l.id !== fromLocationId);
      if (next) setTo(next.id);
    }
  }, [fromLocationId, toLocationId, locations]);

  useEffect(() => {
    if (!pickerOpen || !modalOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen, modalOpen]);

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const json = await apiFetch<{ ok: true; transfers: TransferRow[] }>("/api/transfers");
      return json.transfers;
    },
  });

  const resetForm = () => {
    setFrom(locations[0]?.id ?? "");
    setTo(locations[1]?.id ?? locations[0]?.id ?? "");
    setProductId("");
    setQuantity(1);
    setNotes("");
    setQuery("");
    setPickerOpen(false);
    setTouched({ stores: false, product: false, quantity: false });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (needsTwoStores) {
        throw new Error("You need at least two store locations to transfer stock.");
      }
      if (!productId) throw new Error("Choose a product to transfer.");
      if (fromLocationId === toLocationId) {
        throw new Error("Source and destination stores must differ.");
      }
      if (quantity < 1) throw new Error("Quantity must be at least 1.");
      if (quantity > available) {
        throw new Error(`Only ${available} available at the source store.`);
      }
      await apiFetch("/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          fromLocationId,
          toLocationId,
          notes,
          lines: [{ productId, quantity }],
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transfers"] });
      setModalOpen(false);
      resetForm();
    },
  });

  const openModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (create.isPending) return;
    setModalOpen(false);
    setPickerOpen(false);
  };

  const nameFor = (id: string) => locations.find((l) => l.id === id)?.shortName ?? id;
  const productName = (id: string) => {
    const p = products.find((row) => row.id === id);
    return p ? `${p.brand} — ${p.name}` : id;
  };

  const sortedTransfers = useMemo(() => {
    return [...transfers].sort((a, b) => {
      switch (sortKey) {
        case "from":
          return compareValues(nameFor(a.fromLocationId), nameFor(b.fromLocationId), sortDir);
        case "to":
          return compareValues(nameFor(a.toLocationId), nameFor(b.toLocationId), sortDir);
        case "items":
          return compareValues(
            a.lines.reduce((sum, line) => sum + line.quantity, 0),
            b.lines.reduce((sum, line) => sum + line.quantity, 0),
            sortDir,
          );
        case "status":
          return compareValues(a.status, b.status, sortDir);
        case "when":
        default:
          return compareValues(a.createdAt, b.createdAt, sortDir);
      }
    });
  }, [transfers, sortKey, sortDir, locations, products]);

  const swapStores = () => {
    if (needsTwoStores) return;
    setFrom(toLocationId);
    setTo(fromLocationId);
    setTouched((t) => ({ ...t, stores: true }));
  };

  const canSubmit =
    !needsTwoStores &&
    !sameStore &&
    Boolean(productId) &&
    available > 0 &&
    quantity >= 1 &&
    quantity <= available;

  const storeErrorVisible = storesInvalid && (touched.stores || sameStore || needsTwoStores);
  const productErrorVisible = touched.product && !productId;
  const qtyErrorVisible = touched.quantity && qtyInvalid;

  const statusMessage = needsTwoStores
    ? "Need at least two store locations."
    : sameStore
      ? "Choose different From and To stores."
      : !productId
        ? "Select a product to enable transfer."
        : available <= 0
          ? "No available stock at the source store."
          : quantity < 1 || quantity > available
            ? `Enter a quantity between 1 and ${available}.`
            : create.isPending
              ? "Moving stock between stores…"
              : "Ready to complete this transfer.";

  const submitTransfer = () => {
    setTouched({ stores: true, product: true, quantity: true });
    if (!canSubmit) return;
    create.mutate();
  };

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Inventory</p>
          <h3 className="mt-1 font-display text-xl text-cream sm:text-2xl">Transfers</h3>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Move bottles between stores. Open a transfer to choose source, destination, and
            quantity.
          </p>
        </div>
        <Button
          type="button"
          onClick={openModal}
          disabled={needsTwoStores}
          className="min-h-11 w-full shrink-0 sm:w-auto"
        >
          <Plus size={16} aria-hidden />
          New transfer
        </Button>
      </div>

      {needsTwoStores ? (
        <p className="rounded-sm border border-(--danger)/30 bg-(--danger)/5 px-3 py-3 text-sm text-(--danger)">
          Add another store location before transferring stock.
        </p>
      ) : null}

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-[10px] uppercase tracking-[0.16em] text-muted">Transfer history</h4>
          {transfers.length > 0 ? (
            <div
              className="inline-flex shrink-0 self-start rounded-sm border border-white/10 p-0.5 sm:self-auto"
              role="group"
              aria-label="History view"
            >
              <button
                type="button"
                onClick={() => setHistoryView("cards")}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition",
                  historyView === "cards" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
                )}
                aria-pressed={historyView === "cards"}
              >
                <LayoutGrid size={14} aria-hidden />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setHistoryView("table")}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition",
                  historyView === "table" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
                )}
                aria-pressed={historyView === "table"}
              >
                <Table2 size={14} aria-hidden />
                Table
              </button>
            </div>
          ) : null}
        </div>

        {!transfers.length ? (
          <div className="mt-3 rounded-sm border border-dashed border-white/10 px-3 py-8 text-center">
            <p className="text-sm text-muted">No transfers yet.</p>
            <Button
              type="button"
              className="mt-4 min-h-11"
              onClick={openModal}
              disabled={needsTwoStores}
            >
              <Plus size={16} aria-hidden />
              New transfer
            </Button>
          </div>
        ) : historyView === "table" ? (
          <div className={`mt-3 ${tableWrapClass}`}>
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <SortableTh
                    label="When"
                    column="when"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="From"
                    column="from"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="To"
                    column="to"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Items"
                    column="items"
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
                </tr>
              </thead>
              <tbody>
                {sortedTransfers.map((t) => (
                  <tr key={t.id} className={tableRowClass}>
                    <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                      {t.createdAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className={cn(tableCellClass, "text-cream")}>{nameFor(t.fromLocationId)}</td>
                    <td className={cn(tableCellClass, "text-cream")}>{nameFor(t.toLocationId)}</td>
                    <td className={cn(tableCellClass, "max-w-[18rem] text-cream/85")}>
                      <ul className="space-y-0.5">
                        {t.lines.map((line) => (
                          <li key={`${t.id}-${line.productId}`} className="truncate">
                            {productName(line.productId)} × {line.quantity}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className={tableCellClass}>
                      <span className="inline-flex rounded-sm border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] capitalize text-muted">
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {sortedTransfers.map((t) => (
              <li
                key={t.id}
                className="min-w-0 rounded-sm border border-white/10 bg-black/20 px-3 py-3 text-sm"
              >
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-cream">
                  <span className="min-w-0 truncate">{nameFor(t.fromLocationId)}</span>
                  <span className="text-gold">→</span>
                  <span className="min-w-0 truncate">{nameFor(t.toLocationId)}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t.createdAt.slice(0, 19).replace("T", " ")} · {t.status}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-cream/80">
                  {t.lines.map((line) => (
                    <li key={`${t.id}-${line.productId}`} className="min-w-0 truncate">
                      {productName(line.productId)} × {line.quantity}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Transfer stock"
        subtitle="Move bottles between your locations. Available stock is checked at the source store."
        className="sm:max-w-2xl"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p
              className={cn(
                "text-xs leading-relaxed",
                canSubmit ? "text-muted" : "text-(--danger)/90",
              )}
            >
              {statusMessage}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full sm:w-auto"
                onClick={closeModal}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="lg"
                loading={create.isPending}
                disabled={!canSubmit}
                onClick={submitTransfer}
                className="w-full shrink-0 sm:w-auto sm:min-w-[13rem]"
              >
                {!create.isPending ? <ArrowLeftRight size={16} aria-hidden /> : null}
                {create.isPending ? "Transferring…" : "Complete transfer"}
              </Button>
            </div>
          </div>
        }
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submitTransfer();
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Inventory</p>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-4">
            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted">
              From store
              <NativeSelect
                value={fromLocationId}
                aria-invalid={storeErrorVisible || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setTouched((t) => ({ ...t, stores: true }));
                }}
                className={cn(
                  "mt-1.5 text-gold",
                  storeErrorVisible ? fieldError : fieldOk,
                )}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.shortName} — {l.city}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <button
              type="button"
              onClick={swapStores}
              disabled={needsTwoStores}
              title={needsTwoStores ? "Need two stores to swap" : "Swap stores"}
              aria-label="Swap from and to stores"
              className={cn(
                "mx-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border transition sm:mb-0.5 sm:mx-0 sm:self-end",
                needsTwoStores
                  ? "cursor-not-allowed border-white/10 text-white/30"
                  : "border-white/10 text-gold hover:border-(--gold)/40 hover:bg-(--gold)/10",
              )}
            >
              <ArrowLeftRight className="h-4 w-4 rotate-90 sm:rotate-0" />
            </button>

            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted">
              To store
              <NativeSelect
                value={toLocationId}
                aria-invalid={storeErrorVisible || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  setTouched((t) => ({ ...t, stores: true }));
                }}
                className={cn(
                  "mt-1.5 text-gold",
                  storeErrorVisible ? fieldError : fieldOk,
                )}
              >
                {(toOptions.length ? toOptions : locations).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.shortName} — {l.city}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>

          {storeErrorVisible ? (
            <p role="alert" className="flex items-start gap-2 text-xs text-(--danger)">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {needsTwoStores
                ? "Add another store location before transferring stock."
                : "From and To must be different stores."}
            </p>
          ) : (
            <p className="text-xs text-muted">
              Transferring from {nameFor(fromLocationId)} → {nameFor(toLocationId)}.
            </p>
          )}

          <div ref={pickerRef}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Product</p>
            <button
              type="button"
              aria-invalid={productErrorVisible || undefined}
              onClick={() => {
                setPickerOpen((open) => !open);
                setTouched((t) => ({ ...t, product: true }));
              }}
              className={cn(
                fieldBase,
                "flex items-center justify-between gap-3 text-left",
                productErrorVisible ? fieldError : fieldOk,
                !selected && "text-muted",
              )}
            >
              <span className="min-w-0 truncate">
                {selected ? (
                  <>
                    <span className="text-cream">{selected.name}</span>
                    <span className="text-muted"> · {selected.brand}</span>
                  </>
                ) : (
                  "Search catalog…"
                )}
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted", pickerOpen && "rotate-180")}
              />
            </button>

            {pickerOpen ? (
              <div className="relative z-20 mt-2 overflow-hidden rounded-sm border border-white/15 bg-[#121212] shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
                  <Search className="h-4 w-4 shrink-0 text-muted" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or brand"
                    className="min-w-0 w-full bg-transparent text-sm text-cream outline-none placeholder:text-muted"
                    aria-label="Search products"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted transition hover:bg-white/10 hover:text-cream"
                      aria-label="Clear search"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </button>
                  ) : null}
                </div>
                <ul className="max-h-52 overflow-y-auto overscroll-contain py-1">
                  {filtered.map((p) => {
                    const onHand = fromLocationId ? getAvailable(fromLocationId, p.id) : 0;
                    const active = p.id === productId;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setProductId(p.id);
                            setPickerOpen(false);
                            setQuery("");
                            setTouched((t) => ({ ...t, product: true, quantity: true }));
                            if (onHand > 0) setQuantity(Math.min(quantity, onHand) || 1);
                            else setQuantity(1);
                          }}
                          className={cn(
                            "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm transition",
                            active
                              ? "bg-(--gold)/12 text-cream"
                              : "text-cream/90 hover:bg-white/[0.04]",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {p.brand}
                              {fromLocationId ? ` · ${onHand} on hand at source` : ""}
                            </span>
                          </span>
                          {active ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                  {!filtered.length ? (
                    <li className="px-3 py-6 text-center text-sm text-muted">No products match.</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {productErrorVisible ? (
              <p role="alert" className="mt-2 flex items-start gap-2 text-xs text-(--danger)">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Select a product to transfer.
              </p>
            ) : selected && fromLocationId ? (
              <p className="mt-2 text-xs text-muted">
                Available at {nameFor(fromLocationId)}:{" "}
                <span className={available > 0 ? "text-gold" : "text-(--danger)"}>
                  {available}
                </span>
                {noStock ? " — nothing to move from this store." : null}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted">
              Quantity
              <input
                type="number"
                min={1}
                max={Math.max(available, 1)}
                value={quantity}
                aria-invalid={qtyErrorVisible || undefined}
                onChange={(e) => {
                  setQuantity(Number(e.target.value));
                  setTouched((t) => ({ ...t, quantity: true }));
                }}
                onBlur={() => setTouched((t) => ({ ...t, quantity: true }))}
                className={cn(fieldBase, qtyErrorVisible || noStock ? fieldError : fieldOk)}
              />
              {qtyErrorVisible ? (
                <span className="mt-1.5 block normal-case tracking-normal text-xs text-(--danger)">
                  Enter a quantity between 1 and {Math.max(available, 1)}.
                </span>
              ) : productId && available > 0 ? (
                <span className="mt-1.5 block normal-case tracking-normal text-[11px] text-white/35">
                  Max {available} from {nameFor(fromLocationId)}.
                </span>
              ) : null}
            </label>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-muted">
              Notes
              <span className="ml-1 normal-case tracking-normal text-white/35">(optional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason or reference"
                className={cn(fieldBase, fieldOk)}
              />
            </label>
          </div>

          {create.error ? (
            <p role="alert" className="text-sm text-(--danger)">
              {(create.error as Error).message}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
