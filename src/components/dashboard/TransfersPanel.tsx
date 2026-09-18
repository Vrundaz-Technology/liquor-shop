"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Eye,
  LayoutGrid,
  Plus,
  Search,
  Table2,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiFetch } from "@/lib/api-client";
import { apiCreateTransfer } from "@/lib/api-mutations";
import { getAllProducts, getProductById } from "@/data/products";
import { useInventoryStore } from "@/store/inventory";
import { availableStock } from "@/lib/commerce/order-status";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/ui/Modal";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { SmartImage } from "@/components/ui/SmartImage";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
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
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
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
  notes?: string;
  createdByUserId?: string;
  completedAt?: string;
  lines: { id?: string; productId: string; quantity: number }[];
};

function stripQuotes(value: string) {
  return value.replace(/^[\s"'“”]+|[\s"'“”]+$/g, "").trim();
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripPrefix(title: string, prefix: string) {
  const needle = normalizeLabel(prefix);
  if (!needle) return title;
  const words = title.trim().split(/\s+/);
  const take = needle.split(" ").length;
  if (normalizeLabel(words.slice(0, take).join(" ")) !== needle) return title;
  return words.slice(take).join(" ").replace(/^[\s—–-]+/, "").trim() || title;
}

function cleanCatalogName(brand: string, name: string) {
  let title = name.trim();
  const quoted = title.match(/^["“]([^"”]+)["”]\s*(.*)$/);
  const quotedBrand = quoted?.[1] ? stripQuotes(quoted[1]) : "";
  if (quoted) title = (quoted[2] || quoted[1]).trim();
  const cleanBrand = stripQuotes(quotedBrand || brand);
  title = stripPrefix(title, cleanBrand);
  if (quotedBrand) title = stripPrefix(title, quotedBrand);
  return { brand: cleanBrand, title };
}

function catalogLabel(productId: string) {
  const product = getProductById(productId);
  if (!product) return { brand: "", title: productId, image: "", sku: "", volumeMl: 0 };
  const { brand, title } = cleanCatalogName(product.brand, product.name);
  return {
    brand,
    title,
    image: product.images[0] || "",
    sku: product.sku || "",
    volumeMl: product.volumeMl,
  };
}

function formatStamp(iso?: string) {
  if (!iso) return "—";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return format(when, "MMM d, yyyy · h:mm a");
}

export function TransfersPanel({ locations }: { locations: StoreLocation[] }) {
  const qc = useQueryClient();
  const products = useMemo(() => getAllProducts(), []);
  const getOnHand = useInventoryStore((s) => s.getOnHand);
  const getReserved = useInventoryStore((s) => s.getReserved);
  const syncFromServer = useInventoryStore((s) => s.syncFromServer);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  void inventoryRevision;

  const [modalOpen, setModalOpen] = useState(false);
  const [viewing, setViewing] = useState<TransferRow | null>(null);
  const [notice, setNotice] = useState("");
  const [historyView, setHistoryView] = usePersistedViewMode(TRANSFERS_VIEW_KEY, "cards");
  const { sortKey, sortDir, toggleSort } = useTableSort<TransferSortKey>("when", "desc", ["when"]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
    fromLocationId && productId
      ? availableStock(getOnHand(fromLocationId, productId), getReserved(fromLocationId, productId))
      : 0;

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
    staleTime: 15_000,
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

  const locationFor = (id: string) => locations.find((l) => l.id === id);
  const nameFor = (id: string) => locationFor(id)?.shortName ?? id;

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
      const result = await apiCreateTransfer({
        fromLocationId,
        toLocationId,
        notes: notes.trim() || undefined,
        lines: [{ productId, quantity }],
      });
      if (!result.inventory?.stocks || Object.keys(result.inventory.stocks).length === 0) {
        const snapshot = await apiFetch<{
          stocks: Record<string, number>;
          seats: Record<string, number>;
          hidden?: Record<string, boolean>;
          reserved?: Record<string, number>;
        }>("/api/inventory");
        return { ...result, inventory: snapshot };
      }
      return result;
    },
    onSuccess: (result) => {
      const snap = result.inventory;
      if (snap?.stocks && Object.keys(snap.stocks).length > 0) {
        syncFromServer(snap.stocks, snap.seats, snap.hidden, snap.reserved);
      }
      void qc.invalidateQueries({ queryKey: ["transfers"] });
      void qc.invalidateQueries({ queryKey: ["staff-notifications"] });
      void qc.invalidateQueries({ queryKey: ["inventory-meta"] });
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["owner-analytics"] });
      const fromName = nameFor(fromLocationId);
      const toName = nameFor(toLocationId);
      const item = catalogLabel(productId);
      setNotice(
        `Moved ${quantity} ${item.title || "bottle"} from ${fromName} to ${toName}. Stock is live on POS, shop, and inventory.`,
      );
      setPage(1);
      setModalOpen(false);
      resetForm();
    },
  });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (create.isPending) return;
    setModalOpen(false);
    setPickerOpen(false);
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

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize]);

  const total = sortedTransfers.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const pageTransfers = useMemo(
    () => sortedTransfers.slice((safePage - 1) * pageSize, (safePage - 1) * pageSize + pageSize),
    [pageSize, safePage, sortedTransfers],
  );

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

      {notice ? (
        <p
          role="status"
          className="rounded-sm border border-(--gold)/30 bg-(--gold)/8 px-3 py-3 text-sm text-cream"
        >
          {notice}
        </p>
      ) : null}

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-[10px] uppercase tracking-[0.16em] text-muted">Transfer history</h4>
            {transfers.length > 0 ? (
              <p className="mt-1 text-xs text-muted">
                Showing {from}–{to} of {total} transfer{total === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
          {transfers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <PageSizeSelect
                value={pageSize}
                onChange={setPageSize}
                options={[5, 10, 20, 50]}
              />
              <div
                className="inline-flex shrink-0 rounded-sm border border-white/10 p-0.5"
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
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageTransfers.map((t) => {
                  const units = t.lines.reduce((sum, line) => sum + line.quantity, 0);
                  return (
                  <tr key={t.id} className={tableRowClass}>
                    <td className={cn(tableCellClass, "whitespace-nowrap text-muted")}>
                      {formatStamp(t.createdAt)}
                    </td>
                    <td className={cn(tableCellClass, "text-cream")}>{nameFor(t.fromLocationId)}</td>
                    <td className={cn(tableCellClass, "text-cream")}>{nameFor(t.toLocationId)}</td>
                    <td className={cn(tableCellClass, "max-w-[18rem] text-cream/85")}>
                      <p className="text-cream">
                        {t.lines.length} SKU{t.lines.length === 1 ? "" : "s"} · {units} bottle
                        {units === 1 ? "" : "s"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {t.lines
                          .map((line) => catalogLabel(line.productId).title)
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    </td>
                    <td className={tableCellClass}>
                      <span className="inline-flex rounded-sm border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] capitalize text-muted">
                        {t.status}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setViewing(t)}
                      >
                        <Eye size={13} aria-hidden />
                        View
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pageTransfers.map((t) => {
              const units = t.lines.reduce((sum, line) => sum + line.quantity, 0);
              return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setViewing(t)}
                  className="flex h-full w-full min-w-0 flex-col rounded-sm border border-white/10 bg-gradient-to-b from-white/[0.035] to-black/25 p-4 text-left transition hover:border-white/18 hover:bg-white/[0.02]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[15px] font-medium text-cream">
                      <span className="truncate">{nameFor(t.fromLocationId)}</span>
                      <span className="text-gold">→</span>
                      <span className="truncate">{nameFor(t.toLocationId)}</span>
                    </p>
                    <span className="shrink-0 rounded-sm border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                      {t.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{formatStamp(t.createdAt)}</p>

                  <ul className="mt-4 flex-1 space-y-3">
                    {t.lines.map((line) => {
                      const item = catalogLabel(line.productId);
                      return (
                        <li key={`${t.id}-${line.productId}`} className="flex items-center gap-3">
                          <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black/40">
                            {item.image ? (
                              <SmartImage
                                src={item.image}
                                alt=""
                                fill
                                className="object-contain p-0.5"
                                sizes="36px"
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center text-[10px] text-muted">
                                —
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-cream">{item.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {[item.brand, item.volumeMl ? `${item.volumeMl} ml` : ""]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-cream">
                            × {line.quantity}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-sm border border-white/10 px-2.5 py-1.5 text-xs text-cream/85">
                    <Eye size={13} aria-hidden />
                    View
                    <span className="text-muted">
                      · {units} bottle{units === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              </li>
              );
            })}
          </ul>
        )}
        {transfers.length > 0 ? (
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} className="mt-8" />
        ) : null}
      </section>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="Transfer details"
        subtitle={
          viewing
            ? `${nameFor(viewing.fromLocationId)} → ${nameFor(viewing.toLocationId)}`
            : undefined
        }
        className="sm:max-w-2xl"
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setViewing(null)}>
              Close
            </Button>
          </div>
        }
      >
        {viewing ? (
          <TransferDetail
            transfer={viewing}
            from={locationFor(viewing.fromLocationId)}
            to={locationFor(viewing.toLocationId)}
          />
        ) : null}
      </Modal>

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

            <Tooltip content={needsTwoStores ? "Need two stores to swap" : "Swap stores"}>
            <button
              type="button"
              onClick={swapStores}
              disabled={needsTwoStores}
              className={cn(
                "mx-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border transition sm:mb-0.5 sm:mx-0 sm:self-end",
                needsTwoStores
                  ? "cursor-not-allowed border-white/10 text-white/30"
                  : "border-white/10 text-gold hover:border-(--gold)/40 hover:bg-(--gold)/10",
              )}
            >
              <ArrowLeftRight className="h-4 w-4 rotate-90 sm:rotate-0" />
              <span className="sr-only">Swap from and to stores</span>
            </button>
            </Tooltip>

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
                    <Tooltip content="Clear search">
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted transition hover:bg-white/10 hover:text-cream"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                      <span className="sr-only">Clear search</span>
                    </button>
                    </Tooltip>
                  ) : null}
                </div>
                <ul className="max-h-52 overflow-y-auto overscroll-contain py-1">
                  {filtered.map((p) => {
                    const onHand = fromLocationId
                      ? availableStock(getOnHand(fromLocationId, p.id), getReserved(fromLocationId, p.id))
                      : 0;
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

function TransferDetail({
  transfer,
  from,
  to,
}: {
  transfer: TransferRow;
  from?: StoreLocation;
  to?: StoreLocation;
}) {
  const units = transfer.lines.reduce((sum, line) => sum + line.quantity, 0);
  const when = new Date(transfer.createdAt);
  const whenLabel = Number.isNaN(when.getTime())
    ? transfer.createdAt
    : formatDistanceToNow(when, { addSuffix: true });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <StoreChip label="From" location={from} fallback={transfer.fromLocationId} />
        <ArrowLeftRight className="mx-auto hidden h-4 w-4 text-gold sm:block" aria-hidden />
        <StoreChip label="To" location={to} fallback={transfer.toLocationId} />
      </div>

      <dl className="grid gap-3 rounded-sm border border-white/10 bg-black/20 p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">When</dt>
          <dd className="mt-1 text-cream">{formatStamp(transfer.createdAt)}</dd>
          <dd className="mt-0.5 text-xs text-muted">{whenLabel}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">Status</dt>
          <dd className="mt-1 capitalize text-cream">{transfer.status}</dd>
          {transfer.completedAt ? (
            <dd className="mt-0.5 text-xs text-muted">
              Completed {formatStamp(transfer.completedAt)}
            </dd>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">Transfer ID</dt>
          <dd className="mt-1 break-all font-mono text-xs text-cream/80">{transfer.id}</dd>
        </div>
        {transfer.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">Notes</dt>
            <dd className="mt-1 text-cream/90">{transfer.notes}</dd>
          </div>
        ) : null}
      </dl>

      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
          Bottles · {transfer.lines.length} SKU{transfer.lines.length === 1 ? "" : "s"} · {units}{" "}
          total
        </p>
        <ul className="mt-2 divide-y divide-white/5 rounded-sm border border-white/10">
          {transfer.lines.map((line) => {
            const item = catalogLabel(line.productId);
            return (
              <li
                key={`${transfer.id}-${line.productId}`}
                className="flex items-start gap-3 px-3 py-3"
              >
                <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black/40">
                  {item.image ? (
                    <SmartImage
                      src={item.image}
                      alt=""
                      fill
                      className="object-contain p-1"
                      sizes="44px"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-[10px] text-muted">
                      —
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cream">{item.title}</p>
                  {item.brand ? (
                    <p className="mt-0.5 truncate text-xs text-muted">{item.brand}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    {item.sku ? (
                      <span>
                        <AbbrTooltip term="SKU" /> {item.sku}
                      </span>
                    ) : null}
                    {item.volumeMl ? <span>{item.volumeMl} ml</span> : null}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm tabular-nums text-cream">
                  × {line.quantity}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function StoreChip({
  label,
  location,
  fallback,
}: {
  label: string;
  location?: StoreLocation;
  fallback: string;
}) {
  return (
    <div className="min-w-0 rounded-sm border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-gold">{label}</p>
      <p className="mt-1 truncate text-sm text-cream">{location?.shortName ?? fallback}</p>
      {location ? (
        <p className="mt-0.5 truncate text-xs text-muted">
          {location.city}
          {location.state ? `, ${location.state}` : ""}
        </p>
      ) : null}
    </div>
  );
}
