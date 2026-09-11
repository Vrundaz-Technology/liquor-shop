"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Eye, EyeOff, FileSpreadsheet, Package, Pencil, RotateCcw, Tags, Trash2, Upload, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllLocations, getLocationById } from "@/data/locations";
import { dashboardPath } from "@/lib/dashboard/routes";
import { getCategories } from "@/data/categories";
import { getAllProducts, getProductById } from "@/data/products";
import { useInventoryStore } from "@/store/inventory";
import { useCatalogStore } from "@/store/catalog";
import {
  getCatalogStock,
  REORDER_POINT,
  stockStatus,
} from "@/lib/inventory";
import { apiFetch, apiFetchBlob, triggerBrowserDownload } from "@/lib/api-client";
import { apiSetLocationPricing } from "@/lib/api-mutations";
import { availableStock } from "@/lib/commerce/order-status";
import { formatPrice } from "@/lib/utils";
import { parseFiniteNumber, sanitizeMoneyInput } from "@/lib/validation/money";
import type { CategorySlug, Product } from "@/types";
import { BottleForm } from "@/components/dashboard/AddBottleForm";
import { CategoriesPanel } from "@/components/dashboard/CategoriesPanel";
import { AccessDenied } from "@/components/dashboard/AccessDenied";
import { Button } from "@/components/ui/Button";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { compareValues, MobileSortBar, SortableTh, tableCellClass, tableHeadRowClass, tableRowClass, tableWrapClass, useTableSort } from "@/components/ui/SortableTh";
import { hasPermission } from "@/lib/auth/permissions";
import { useUserStore } from "@/store/user";

type Props = {
  locationId: string | "all";
  onLocationChange?: (id: string | "all") => void;
  locations?: ReturnType<typeof getAllLocations>;
  initialView?: "stock" | "categories";
};

type StockFilter = "all" | "low" | "out" | "ok";
type SortKey = "name" | "status" | "stock" | "price";
type InventoryView = "stock" | "categories";

function productImage(product: Product) {
  return product.images?.[0] || "";
}

const QUICK_ADD_OPTIONS = [5, 10, 15] as const;

function QuickAddSelect({
  productName,
  onAdd,
}: {
  productName: string;
  onAdd: (qty: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<(typeof QUICK_ADD_OPTIONS)[number]>(5);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex justify-end">
      <button
        type="button"
        aria-label={`Quick add stock for ${productName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 min-w-[4.75rem] items-center justify-between gap-2 rounded-sm border border-white/15 bg-black/35 px-2.5 text-sm text-gold transition hover:border-(--gold)/40 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)"
      >
        <span className="tabular-nums">+{selected}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 top-[calc(100%+4px)] z-[90] min-w-full overflow-hidden rounded-sm border border-white/10 bg-(--bg-elevated) py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          {QUICK_ADD_OPTIONS.map((qty) => {
            const active = qty === selected;
            return (
              <li key={qty} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(qty);
                    setOpen(false);
                    onAdd(qty);
                  }}
                  className={`flex w-full items-center justify-center px-3 py-2 text-sm tabular-nums transition ${
                    active
                      ? "bg-(--gold)/15 text-gold"
                      : "text-cream hover:bg-white/10"
                  }`}
                >
                  +{qty}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: ReturnType<typeof stockStatus> }) {
  const label =
    status === "out" ? "Out" : status === "low" ? "Low" : "In stock";
  const tone =
    status === "out"
      ? "border-red-400/25 bg-red-400/10 text-red-200"
      : status === "low"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
        : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${tone}`}
    >
      {label}
    </span>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-(--gold)/35 hover:bg-white/5 hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)"
    >
      {children}
    </button>
  );
}

function QtyControl({
  value,
  label,
  onSet,
  onAdjust,
  disabled,
}: {
  value: number;
  label: string;
  onSet: (n: number) => void;
  onAdjust: (delta: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center border border-white/15 bg-black/35">
      <button
        type="button"
        className="min-h-10 min-w-10 text-muted disabled:opacity-30"
        disabled={disabled || value <= 0}
        onClick={() => onAdjust(-1)}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        value={value}
        readOnly={disabled}
        onChange={(e) => {
          if (disabled) return;
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= 0) onSet(Math.floor(next));
        }}
        className="w-14 bg-transparent py-2 text-center text-base tabular-nums text-cream outline-none disabled:opacity-50 sm:text-sm"
        aria-label={label}
        disabled={disabled}
      />
      <button
        type="button"
        className="min-h-10 min-w-10 text-muted disabled:opacity-30"
        disabled={disabled}
        onClick={() => onAdjust(1)}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  );
}

export function InventoryPanel({
  locationId,
  onLocationChange,
  locations,
  initialView = "stock",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = useUserStore((s) => s.profile);
  const canAdjust = hasPermission(profile, "inventory.adjust");
  const canRestock = hasPermission(profile, "inventory.restock");
  const canReset = hasPermission(profile, "inventory.reset");
  const canAddBottle = hasPermission(profile, "catalog.create");
  const canEditBottle = hasPermission(profile, "catalog.edit");
  const canDeleteBottle = hasPermission(profile, "catalog.delete");
  const canManageCategories =
    hasPermission(profile, "catalog.create") ||
    hasPermission(profile, "catalog.edit") ||
    hasPermission(profile, "catalog.delete");
  const stocks = useInventoryStore((s) => s.stocks);
  const ledger = useInventoryStore((s) => s.ledger);
  const setOnHand = useInventoryStore((s) => s.setOnHand);
  const adjust = useInventoryStore((s) => s.adjust);
  const resetToCatalog = useInventoryStore((s) => s.resetToCatalog);
  const isHidden = useInventoryStore((s) => s.isHidden);
  const setHidden = useInventoryStore((s) => s.setHidden);
  const syncFromServer = useInventoryStore((s) => s.syncFromServer);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  const catalogRevision = useCatalogStore((s) => s.revision);
  const removeBottle = useCatalogStore((s) => s.removeBottle);
  const custom = useCatalogStore((s) => s.custom);
  const canViewStock = hasPermission(profile, "inventory.view");

  const [view, setView] = useState<InventoryView>(
    !canViewStock && canManageCategories
      ? "categories"
      : initialView === "categories" && canManageCategories
        ? "categories"
        : "stock",
  );

  useEffect(() => {
    if (!canViewStock && canManageCategories) {
      setView("categories");
      return;
    }
    const next =
      initialView === "categories" && canManageCategories ? "categories" : "stock";
    setView(next);
  }, [initialView, canManageCategories, canViewStock]);

  const setInventoryView = (next: InventoryView) => {
    if (next === "stock" && !canViewStock) return;
    if (next === "categories" && !canManageCategories) return;
    setView(next);
    router.replace(
      next === "categories"
        ? dashboardPath("inventory", { categories: true })
        : dashboardPath("inventory"),
      { scroll: false },
    );
  };
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [category, setCategory] = useState<CategorySlug | "all">("all");

  // Deep-links from overview (top products / low stock): ?q=&location=&status=
  useEffect(() => {
    const qParam = searchParams.get("q");
    const statusParam = searchParams.get("status");
    const locationParam = searchParams.get("location");
    if (qParam !== null) setQuery(qParam);
    if (
      statusParam === "all" ||
      statusParam === "low" ||
      statusParam === "out" ||
      statusParam === "ok"
    ) {
      setStockFilter(statusParam);
    }
    if (locationParam && locationParam !== "all") {
      onLocationChange?.(locationParam);
    }
  }, [searchParams, onLocationChange]);
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("status");
  const [showLedger, setShowLedger] = useState(false);
  const [editor, setEditor] = useState<Product | "new" | null>(null);
  const [pricingProduct, setPricingProduct] = useState<Product | null>(null);
  const [priceForm, setPriceForm] = useState({
    basePrice: "",
    salePrice: "",
    costPrice: "",
    promoPrice: "",
  });
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exportOpen, setExportOpen] = useState(false);
  const [ioBusy, setIoBusy] = useState(false);
  const [ioMessage, setIoMessage] = useState("");
  const [ioError, setIoError] = useState("");
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const stores = locations?.length ? locations : getAllLocations();
  const qc = useQueryClient();

  useEffect(() => {
    if (!exportOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  useEffect(() => {
    if (!ioMessage && !ioError) return;
    const timer = window.setTimeout(() => {
      setIoMessage("");
      setIoError("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [ioMessage, ioError]);

  const clearIoBanner = () => {
    setIoMessage("");
    setIoError("");
  };

  const { data: invMeta } = useQuery({
    queryKey: ["inventory-meta"],
    queryFn: async () =>
      apiFetch<{
        stocks: Record<string, number>;
        reserved?: Record<string, number>;
        prices?: Record<
          string,
          {
            basePrice: number | null;
            salePrice: number | null;
            costPrice: number | null;
            promoPrice: number | null;
          }
        >;
        seats: Record<string, number>;
        hidden?: Record<string, boolean>;
      }>("/api/inventory"),
    staleTime: 15_000,
  });

  // Always one store — never list the same SKU across all branches
  const storeId =
    locationId !== "all" && stores.some((loc) => loc.id === locationId)
      ? locationId
      : stores[0]?.id ?? "";

  useEffect(() => {
    if (!storeId) return;
    if (locationId === "all" || !stores.some((loc) => loc.id === locationId)) {
      onLocationChange?.(storeId);
    }
  }, [locationId, storeId, onLocationChange, stores]);

  const activeLocation = storeId
    ? getLocationById(storeId) ?? stores[0] ?? null
    : null;

  const filtersActive =
    Boolean(query.trim()) || category !== "all" || stockFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setStockFilter("all");
    setPage(1);
  };

  const downloadInventory = async (format: "csv" | "xlsx") => {
    if (!storeId) return;
    setExportOpen(false);
    setIoBusy(true);
    setIoError("");
    setIoMessage("");
    try {
      const params = new URLSearchParams({
        locationId: storeId,
        format,
      });
      if (query.trim()) params.set("q", query.trim());
      if (category !== "all") params.set("category", category);
      if (stockFilter !== "all") params.set("status", stockFilter);

      const { blob, filename, contentType } = await apiFetchBlob(
        `/api/inventory/export?${params.toString()}`,
      );
      const fallbackName = `inventory-${(activeLocation?.shortName || storeId)
        .replace(/[^\w.-]+/g, "-")
        .toLowerCase()}.${format === "xlsx" ? "xlsx" : "csv"}`;
      const mime =
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv;charset=utf-8";
      triggerBrowserDownload(blob, filename || fallbackName, contentType || mime);
      setIoMessage(
        format === "xlsx"
          ? `Excel file ready${filtersActive ? " (current filters)" : ""} — check your downloads.`
          : `CSV file ready${filtersActive ? " (current filters)" : ""} — check your downloads.`,
      );
    } catch (err) {
      setIoError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setIoBusy(false);
    }
  };

  const importInventoryFile = async (file: File) => {
    if (!storeId) return;
    setIoBusy(true);
    setIoError("");
    setIoMessage("");
    try {
      const body = new FormData();
      body.set("locationId", storeId);
      body.set("file", file);
      const result = await apiFetch<{
        ok: true;
        updated: number;
        skipped: number;
        errors?: string[];
        inventory?: {
          stocks: Record<string, number>;
          seats?: Record<string, number>;
          hidden?: Record<string, boolean>;
          reserved?: Record<string, number>;
        };
      }>("/api/inventory/export", {
        method: "POST",
        body,
      });
      if (result.inventory?.stocks) {
        syncFromServer(
          result.inventory.stocks,
          result.inventory.seats ?? {},
          result.inventory.hidden,
          result.inventory.reserved,
        );
      }
      void qc.invalidateQueries({ queryKey: ["inventory-meta"] });
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      setIoMessage(
        `Imported ${result.updated} row${result.updated === 1 ? "" : "s"}` +
          (result.skipped ? ` · ${result.skipped} skipped` : "") +
          ".",
      );
      if (result.errors?.length) {
        setIoError(result.errors.slice(0, 3).join(" · "));
      }
    } catch (err) {
      setIoError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIoBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const rows = useMemo(() => {
    const catalog = getAllProducts();
    const q = query.trim().toLowerCase();
    const list: {
      product: Product;
      onHand: number;
      seed: number;
      status: ReturnType<typeof stockStatus>;
      hidden: boolean;
    }[] = [];

    for (const product of catalog) {
      if (category !== "all" && product.category !== category) continue;
      const onHand =
        stocks[`${storeId}:${product.id}`] ??
        getCatalogStock(storeId, product.id);
      const seed = getCatalogStock(storeId, product.id);
      const status = stockStatus(onHand);
      if (stockFilter === "low" && status !== "low") continue;
      if (stockFilter === "out" && status !== "out") continue;
      if (stockFilter === "ok" && status !== "ok") continue;
      if (
        q &&
        !`${product.name} ${product.brand} ${product.category}`
          .toLowerCase()
          .includes(q)
      ) {
        continue;
      }
      list.push({
        product,
        onHand,
        seed,
        status,
        hidden: isHidden(storeId, product.id),
      });
    }

    const rank = { out: 0, low: 1, ok: 2 };
    const shelfPrice = (product: Product) => {
      const key = `${storeId}:${product.id}`;
      const locPrice = invMeta?.prices?.[key];
      return (
        locPrice?.salePrice ??
        locPrice?.promoPrice ??
        locPrice?.basePrice ??
        product.price
      );
    };
    return list.sort((a, b) => {
      if (sortKey === "status") return compareValues(rank[a.status], rank[b.status], sortDir);
      if (sortKey === "stock") return compareValues(a.onHand, b.onHand, sortDir);
      if (sortKey === "price") return compareValues(shelfPrice(a.product), shelfPrice(b.product), sortDir);
      return compareValues(a.product.name, b.product.name, sortDir);
    });
  }, [storeId, stocks, query, stockFilter, category, sortKey, sortDir, catalogRevision, inventoryRevision, isHidden, invMeta]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, rows.length);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [storeId, query, stockFilter, category, sortKey, sortDir, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const stats = useMemo(() => {
    const catalog = getAllProducts();
    let totalUnits = 0;
    let skuCount = 0;
    let low = 0;
    let out = 0;
    let value = 0;
    for (const product of catalog) {
      const onHand =
        stocks[`${storeId}:${product.id}`] ??
        getCatalogStock(storeId, product.id);
      skuCount += 1;
      totalUnits += onHand;
      value += onHand * product.price;
      const status = stockStatus(onHand);
      if (status === "low") low += 1;
      if (status === "out") out += 1;
    }
    return { totalUnits, skuCount, low, out, value };
  }, [storeId, stocks, catalogRevision]);

  const recentLedger = ledger
    .filter((e) => e.locationId === storeId || e.locationId === "all")
    .slice(0, 8);

  const restockLowOut = () => {
    for (const { product, onHand, seed } of rows) {
      if (onHand > REORDER_POINT) continue;
      const target = Math.max(seed, 12, REORDER_POINT + 5);
      if (onHand < target) setOnHand(storeId, product.id, target, "restock");
    }
  };

  const selectStore = (id: string) => onLocationChange?.(id);
  const showCategories = view === "categories" && canManageCategories;
  const canOpenInventory = canViewStock || canManageCategories;

  if (!canOpenInventory) {
    return (
      <AccessDenied message="Inventory is not enabled for this account. Ask an owner to grant inventory or catalog access." />
    );
  }

  if (!storeId || !activeLocation) {
    return (
      <div className="rounded-sm border border-dashed border-white/15 px-4 py-14 text-center">
        <p className="text-sm text-cream">No stores available</p>
        <p className="mt-1 text-sm text-muted">
          Ask an owner to grant location access for inventory.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-0">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
        <div className="min-w-0">
          <p className="hidden text-[10px] uppercase tracking-[0.22em] text-gold lg:flex lg:items-center lg:gap-2">
            <Package size={12} className="text-gold" />
            Inventory
          </p>
          <h2 className="hidden font-display text-3xl text-cream lg:mt-2 lg:block xl:text-4xl">
            Inventory
          </h2>
          <p className="max-w-2xl text-sm text-muted lg:mt-2">
            {showCategories
              ? "Shop collections used when adding and filtering bottles."
              : "Manage bottle counts, categories, restock, and products per store."}
          </p>
        </div>
        {!showCategories ? (
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            {canAddBottle && !editor && (
              <Button size="sm" onClick={() => setEditor("new")}>
                Add bottle
              </Button>
            )}
            {canViewStock && storeId ? (
              <div className="flex flex-wrap gap-2">
                <div ref={exportMenuRef} className="relative">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={ioBusy}
                    onClick={() => setExportOpen((open) => !open)}
                    aria-expanded={exportOpen}
                    aria-haspopup="menu"
                  >
                    <Download size={14} />
                    {filtersActive ? `Export (${rows.length})` : "Export"}
                    <ChevronDown size={14} className={exportOpen ? "rotate-180" : ""} />
                  </Button>
                  {exportOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 z-30 mt-1 min-w-[13rem] overflow-hidden rounded-sm border border-white/10 bg-(--bg-elevated) py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
                    >
                      {filtersActive ? (
                        <p className="border-b border-white/10 px-3 py-2 text-[11px] leading-snug text-muted">
                          Exports the {rows.length} filtered bottle
                          {rows.length === 1 ? "" : "s"} on screen.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-cream transition hover:bg-white/5"
                        onClick={() => void downloadInventory("csv")}
                      >
                        <Download size={14} className="text-muted" />
                        CSV (.csv)
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-cream transition hover:bg-white/5"
                        onClick={() => void downloadInventory("xlsx")}
                      >
                        <FileSpreadsheet size={14} className="text-muted" />
                        Excel (.xlsx)
                      </button>
                    </div>
                  ) : null}
                </div>
                {canAdjust ? (
                  <>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void importInventoryFile(file);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={ioBusy}
                      onClick={() => importInputRef.current?.click()}
                      title="CSV or Excel with product_id/sku, on_hand, prices, hidden"
                    >
                      <Upload size={14} />
                      {ioBusy ? "Working…" : "Import"}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
            {canReset && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => resetToCatalog(storeId)}
              >
                <RotateCcw size={14} />
                Reset store
              </Button>
            )}
            {canRestock && (
              <Button size="sm" variant="secondary" onClick={restockLowOut}>
                Restock low / out
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {ioMessage || ioError ? (
        <div
          className={`mt-3 flex items-start justify-between gap-3 rounded-sm border px-3 py-2.5 text-sm ${
            ioError
              ? "border-(--danger)/30 bg-(--danger)/10 text-(--danger)"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
          }`}
          role="status"
        >
          <p className="min-w-0 leading-relaxed">{ioError || ioMessage}</p>
          <button
            type="button"
            onClick={clearIoBanner}
            className="shrink-0 rounded-sm p-1 text-current/70 transition hover:bg-white/10 hover:text-current"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {canManageCategories || canViewStock ? (
        <div
          className="mt-5 -mx-3 h-scroll border-b border-white/10 px-3 sm:-mx-5 sm:px-5 md:mx-0 md:px-0"
          role="tablist"
          aria-label="Inventory sections"
        >
          <div className="flex min-w-max gap-1">
            {(
              [
                ...(canViewStock
                  ? [{ id: "stock" as const, label: "Stock", icon: Package }]
                  : []),
                ...(canManageCategories
                  ? [{ id: "categories" as const, label: "Categories", icon: Tags }]
                  : []),
              ] as const
            ).map((tab) => {
              const active = view === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setInventoryView(tab.id)}
                  className={`relative inline-flex min-h-11 items-center gap-2 px-3 py-2.5 text-[11px] uppercase tracking-[0.16em] transition ${
                    active ? "text-cream" : "text-muted hover:text-cream"
                  }`}
                >
                  <Icon size={14} className={active ? "text-gold" : ""} />
                  {tab.label}
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-px bg-(--gold)" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showCategories ? <CategoriesPanel embedded /> : null}

      {!showCategories ? (
        <>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-lg text-cream sm:text-xl">
            {activeLocation.name}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {activeLocation.address}, {activeLocation.city}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted">
              <AbbrTooltip term="SKU" full="Stock Keeping Units">
                SKUs
              </AbbrTooltip>
            </dt>
            <dd className="tabular-nums text-cream">{stats.skuCount}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">On hand</dt>
            <dd className="tabular-nums text-cream">{stats.totalUnits}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Low</dt>
            <dd className="tabular-nums text-amber-200">{stats.low}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Out</dt>
            <dd className="tabular-nums text-red-300">{stats.out}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Value</dt>
            <dd className="tabular-nums text-cream">
              ${Math.round(stats.value).toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      {/* Filters — search + category + stock + store */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-muted sm:col-span-2 lg:col-span-1">
          Search
          <SearchInput
            className="mt-1"
            inputClassName="py-2.5"
            placeholder="Search…"
            value={query}
            onChange={setQuery}
            aria-label="Search inventory"
          />
        </label>
        <label className="block text-xs text-muted">
          Category
          <NativeSelect
            className="mt-1"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as CategorySlug | "all")
            }
            aria-label="Category"
          >
            <option value="all">All categories</option>
            {getCategories().map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="block text-xs text-muted">
          Status
          <NativeSelect
            className="mt-1"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as StockFilter)}
            aria-label="Stock status"
          >
            <option value="all">Any status</option>
            <option value="ok">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </NativeSelect>
        </label>
        <label className="block text-xs text-muted">
          Store
          <NativeSelect
            className="mt-1"
            value={storeId}
            onChange={(e) => selectStore(e.target.value)}
            aria-label="Store inventory"
          >
            {stores.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.shortName} · {loc.city}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      {filtersActive ? (
        <ActiveFiltersBar
          className="mt-4"
          resultCount={rows.length}
          chips={[
            ...(query.trim()
              ? [
                  {
                    id: "q",
                    label: `“${query.trim()}”`,
                    onRemove: () => setQuery(""),
                  },
                ]
              : []),
            ...(category !== "all"
              ? [
                  {
                    id: "category",
                    label:
                      getCategories().find((c) => c.slug === category)?.name ?? category,
                    onRemove: () => setCategory("all"),
                  },
                ]
              : []),
            ...(stockFilter !== "all"
              ? [
                  {
                    id: "status",
                    label:
                      stockFilter === "ok"
                        ? "In stock"
                        : stockFilter === "low"
                          ? "Low stock"
                          : "Out of stock",
                    onRemove: () => setStockFilter("all"),
                  },
                ]
              : []),
          ]}
          onClearAll={clearFilters}
        />
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          {rows.length === 0
            ? "No products"
            : `Showing ${from}–${to} of ${rows.length}`}
          {` · ${activeLocation.shortName}`}
        </p>
        <PageSizeSelect
          className="shrink-0"
          value={pageSize}
          options={[5, 10, 15, 25, 50]}
          onChange={setPageSize}
        />
      </div>

      <MobileSortBar
        className="mt-3 lg:hidden"
        columns={[
          { key: "name", label: "Bottle" },
          { key: "status", label: "Status" },
          { key: "stock", label: "On hand" },
          { key: "price", label: "Price" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />

      {/* Desktop / tablet table */}
      <div className={`mt-3 hidden lg:block ${tableWrapClass}`}>
        <table className="w-full min-w-[72rem] text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <SortableTh
                label="Bottle"
                column="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="min-w-[16rem]"
              />
              <SortableTh
                label="Status"
                column="status"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="w-[7.5rem]"
              />
              <SortableTh
                label="On hand"
                column="stock"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="w-[11rem]"
              />
              <SortableTh
                label="Price"
                column="price"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="w-[8.5rem]"
              />
              <th className="w-[6.5rem] whitespace-nowrap px-4 py-3 text-right font-medium">
                Quick add
              </th>
              <th className="w-[7rem] whitespace-nowrap px-4 py-3 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  No bottles match these filters.
                </td>
              </tr>
            ) : (
              pageRows.map(({ product, onHand, status, hidden }) => {
                const img = productImage(product);
                const key = `${storeId}:${product.id}`;
                const reservedQty = invMeta?.reserved?.[key] ?? 0;
                const avail = availableStock(onHand, reservedQty);
                const locPrice = invMeta?.prices?.[key];
                const shelf =
                  locPrice?.salePrice ??
                  locPrice?.promoPrice ??
                  locPrice?.basePrice ??
                  product.price;
                const openPricing = () => {
                  setPricingProduct(product);
                  setPriceForm({
                    basePrice:
                      locPrice?.basePrice != null
                        ? String(locPrice.basePrice)
                        : String(product.price),
                    salePrice:
                      locPrice?.salePrice != null ? String(locPrice.salePrice) : "",
                    costPrice:
                      locPrice?.costPrice != null ? String(locPrice.costPrice) : "",
                    promoPrice:
                      locPrice?.promoPrice != null ? String(locPrice.promoPrice) : "",
                  });
                  setPriceError("");
                };
                return (
                  <tr key={product.id} className={tableRowClass}>
                    <td className={tableCellClass}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-12 w-9 shrink-0 overflow-hidden bg-black/30">
                          {img ? (
                            <Image
                              src={img}
                              alt=""
                              fill
                              className="object-contain p-0.5"
                              sizes="36px"
                              unoptimized={img.startsWith("data:") || img.startsWith("/uploads/")}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-cream">
                            {product.name}
                            {hidden ? (
                              <span className="ml-2 align-middle text-[10px] uppercase tracking-wider text-white/45">
                                Hidden
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-[11px] text-white/50">
                            {product.brand} · {product.category} · catalog{" "}
                            {formatPrice(product.price)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <StatusPill status={status} />
                    </td>
                    <td className={tableCellClass}>
                      <QtyControl
                        value={onHand}
                        label={`${product.name} at ${activeLocation.shortName}`}
                        disabled={!canAdjust}
                        onSet={(n) => setOnHand(storeId, product.id, n)}
                        onAdjust={(d) =>
                          adjust(
                            storeId,
                            product.id,
                            d,
                            d > 0 && canRestock ? "restock" : "adjustment",
                          )
                        }
                      />
                      <p className="mt-1.5 whitespace-nowrap text-[11px] tabular-nums text-white/55">
                        <AbbrTooltip
                          term="Rsv"
                          abbrClassName="text-white/40"
                        />{" "}
                        {reservedQty}
                        <span className="mx-1.5 text-white/25">·</span>
                        <AbbrTooltip
                          term="Avail"
                          abbrClassName="text-white/40"
                        />{" "}
                        {avail}
                      </p>
                    </td>
                    <td className={tableCellClass}>
                      <p className="whitespace-nowrap tabular-nums text-cream">
                        {formatPrice(shelf)}
                      </p>
                      {canAdjust ? (
                        <button
                          type="button"
                          className="mt-1 whitespace-nowrap text-[11px] text-gold/90 transition hover:text-gold"
                          onClick={openPricing}
                        >
                          Edit prices
                        </button>
                      ) : null}
                    </td>
                    <td className={`${tableCellClass} text-right`}>
                      {canRestock ? (
                        <QuickAddSelect
                          productName={product.name}
                          onAdd={(qty) => adjust(storeId, product.id, qty, "restock")}
                        />
                      ) : (
                        <span className="text-[11px] text-white/35">—</span>
                      )}
                    </td>
                    <td className={`${tableCellClass} text-right`}>
                      <div className="inline-flex flex-nowrap items-center justify-end gap-1.5">
                        {canAdjust ? (
                          <IconAction
                            label={
                              hidden
                                ? "Show this bottle on the website for this store"
                                : "Hide this bottle from the website for this store"
                            }
                            onClick={() => setHidden(storeId, product.id, !hidden)}
                          >
                            {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                          </IconAction>
                        ) : null}
                        {canEditBottle ? (
                          <IconAction
                            label={`Edit ${product.name}`}
                            onClick={() => setEditor(product)}
                          >
                            <Pencil size={15} />
                          </IconAction>
                        ) : !canAdjust ? (
                          <span className="whitespace-nowrap text-[11px] text-white/40">
                            View only
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <ul className="mt-3 space-y-0 divide-y divide-white/10 lg:hidden">
        {pageRows.length === 0 ? (
          <li className="py-10 text-center text-sm text-muted">
            No bottles match these filters.
          </li>
        ) : (
          pageRows.map(({ product, onHand, status, hidden }) => {
            const img = productImage(product);
            const key = `${storeId}:${product.id}`;
            const reservedQty = invMeta?.reserved?.[key] ?? 0;
            const avail = availableStock(onHand, reservedQty);
            const locPrice = invMeta?.prices?.[key];
            const shelf =
              locPrice?.salePrice ??
              locPrice?.promoPrice ??
              locPrice?.basePrice ??
              product.price;
            return (
              <li key={product.id} className="py-4">
                <div className="flex gap-3">
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden bg-black/30">
                    {img ? (
                      <Image
                        src={img}
                        alt=""
                        fill
                        className="object-contain p-0.5"
                        sizes="40px"
                        unoptimized={img.startsWith("data:") || img.startsWith("/uploads/")}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-cream">
                          {product.name}
                          {hidden ? (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-white/45">
                              Hidden
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-white/50">
                          {product.brand} · {formatPrice(shelf)}
                        </p>
                      </div>
                      <StatusPill status={status} />
                    </div>
                    <p className="mt-1 text-[11px] tabular-nums text-white/55">
                      <AbbrTooltip term="Rsv" /> {reservedQty}
                      {" · "}
                      <AbbrTooltip term="Avail" /> {avail}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <QtyControl
                        value={onHand}
                        label={`${product.name} count`}
                        disabled={!canAdjust}
                        onSet={(n) => setOnHand(storeId, product.id, n)}
                        onAdjust={(d) =>
                          adjust(
                            storeId,
                            product.id,
                            d,
                            d > 0 && canRestock ? "restock" : "adjustment",
                          )
                        }
                      />
                      {canRestock ? (
                        <QuickAddSelect
                          productName={product.name}
                          onAdd={(qty) => adjust(storeId, product.id, qty, "restock")}
                        />
                      ) : null}
                      {canAdjust ? (
                        <IconAction
                          label={hidden ? "Show on website" : "Hide from website"}
                          onClick={() => setHidden(storeId, product.id, !hidden)}
                        >
                          {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                        </IconAction>
                      ) : null}
                      {canAdjust ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-sm border border-white/10 px-3 text-[11px] text-gold transition hover:border-(--gold)/35 hover:bg-white/5"
                          onClick={() => {
                            setPricingProduct(product);
                            setPriceForm({
                              basePrice:
                                locPrice?.basePrice != null
                                  ? String(locPrice.basePrice)
                                  : String(product.price),
                              salePrice:
                                locPrice?.salePrice != null ? String(locPrice.salePrice) : "",
                              costPrice:
                                locPrice?.costPrice != null ? String(locPrice.costPrice) : "",
                              promoPrice:
                                locPrice?.promoPrice != null ? String(locPrice.promoPrice) : "",
                            });
                            setPriceError("");
                          }}
                        >
                          Price
                        </button>
                      ) : null}
                      {canEditBottle ? (
                        <IconAction
                          label={`Edit ${product.name}`}
                          onClick={() => setEditor(product)}
                        >
                          <Pencil size={15} />
                        </IconAction>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <Pagination
        className="mt-6"
        page={safePage}
        totalPages={totalPages}
        onChange={setPage}
      />

      {/* Custom bottles */}
      {custom.length > 0 && (
        <div className="mt-8 border-t border-white/10 pt-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
            Owner-added ({custom.length})
          </p>
          <ul className="mt-3 space-y-2">
            {custom.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-cream">
                  {p.name}
                  <span className="text-muted"> · {p.brand}</span>
                </span>
                {canDeleteBottle ? (
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] uppercase tracking-wider text-muted hover:text-red-300"
                    onClick={() => void removeBottle(p.id)}
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Ledger */}
      {recentLedger.length > 0 && (
        <div className="mt-8 border-t border-white/10 pt-5">
          <button
            type="button"
            className="text-[10px] uppercase tracking-[0.18em] text-gold hover:text-cream"
            onClick={() => setShowLedger((v) => !v)}
          >
            {showLedger ? "Hide" : "Show"} recent movements
          </button>
          {showLedger && (
            <ul className="mt-3 space-y-2 text-xs text-muted">
              {recentLedger.map((entry) => {
                const product = getProductById(entry.productId);
                const loc = getAllLocations().find((l) => l.id === entry.locationId);
                return (
                  <li key={entry.id} className="flex items-start gap-2">
                    <Package size={12} className="mt-0.5 shrink-0 text-gold" />
                    <span>
                      <span className="capitalize text-cream">
                        {entry.reason}
                      </span>
                      {product
                        ? ` · ${product.name}`
                        : entry.productId === "*"
                          ? (
                              <>
                                {" · all "}
                                <AbbrTooltip
                                  term="SKU"
                                  full="Stock Keeping Units"
                                >
                                  SKUs
                                </AbbrTooltip>
                              </>
                            )
                          : ""}
                      {loc ? ` @ ${loc.shortName}` : ""}
                      {entry.delta !== 0
                        ? ` · ${entry.delta > 0 ? "+" : ""}${entry.delta}`
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <BottleForm
        key={editor === "new" ? "new" : editor?.id ?? "closed"}
        open={Boolean(editor)}
        product={editor && editor !== "new" ? editor : undefined}
        defaultLocationId={storeId}
        onSaved={() => setEditor(null)}
        onClose={() => setEditor(null)}
      />

      <Modal
        open={Boolean(pricingProduct)}
        onClose={() => setPricingProduct(null)}
        title="Store pricing"
        subtitle={
          pricingProduct
            ? `${pricingProduct.name} at ${activeLocation?.shortName ?? "this store"}`
            : undefined
        }
        className="sm:max-w-md"
      >
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pricingProduct || !storeId) return;
            const parseOptional = (raw: string) => {
              if (!raw.trim()) return null;
              return parseFiniteNumber(raw);
            };
            const basePrice = parseOptional(priceForm.basePrice);
            const salePrice = parseOptional(priceForm.salePrice);
            const costPrice = parseOptional(priceForm.costPrice);
            const promoPrice = parseOptional(priceForm.promoPrice);
            if (
              (priceForm.basePrice && basePrice == null) ||
              (priceForm.salePrice && salePrice == null) ||
              (priceForm.costPrice && costPrice == null) ||
              (priceForm.promoPrice && promoPrice == null)
            ) {
              setPriceError("Enter valid amounts with at most 2 decimals.");
              return;
            }
            setPriceBusy(true);
            setPriceError("");
            try {
              await apiSetLocationPricing(storeId, pricingProduct.id, {
                basePrice,
                salePrice,
                costPrice,
                promoPrice,
              });
              await qc.invalidateQueries({ queryKey: ["inventory-meta"] });
              setPricingProduct(null);
            } catch (err) {
              setPriceError(err instanceof Error ? err.message : "Could not save prices.");
            } finally {
              setPriceBusy(false);
            }
          }}
        >
          {(
            [
              ["basePrice", "Base price ($)"],
              ["salePrice", "Sale price ($)"],
              ["costPrice", "Cost price ($)"],
              ["promoPrice", "Promo price ($)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs text-muted">
              {label}
              <Input
                className="mt-1"
                inputMode="decimal"
                value={priceForm[key]}
                onChange={(e) =>
                  setPriceForm((f) => ({
                    ...f,
                    [key]: sanitizeMoneyInput(e.target.value, 2),
                  }))
                }
                placeholder="Optional"
              />
            </label>
          ))}
          {priceError ? <p className="text-sm text-(--danger)">{priceError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPricingProduct(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={priceBusy}>
              Save prices
            </Button>
          </div>
        </form>
      </Modal>
        </>
      ) : null}
    </section>
  );
}
