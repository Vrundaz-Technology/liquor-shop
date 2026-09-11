"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { getCategories } from "@/data/categories";
import { getAllProducts } from "@/data/products";
import { ProductCard } from "@/components/product/ProductCard";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import { ShopFiltersPanel } from "@/components/shop/ShopFiltersPanel";
import { StoreFinder } from "@/components/store/StoreFinder";
import { Button } from "@/components/ui/Button";
import type { CategorySlug } from "@/types";
import { useBranchStore } from "@/store/branch";
import { switchShoppingStore } from "@/lib/switch-store";
import { useInventoryStore } from "@/store/inventory";
import { useCatalogStore } from "@/store/catalog";
import {
  filterAndSortProducts,
  uniqueBrands,
  uniqueTypes,
  type ShopFilters,
} from "@/lib/shop-catalog";
import { getAllLocations } from "@/data/locations";

export function CategoryPage() {
  const params = useParams<{ category: string }>();
  const category = params.category as CategorySlug;
  const meta = getCategories().find((c) => c.slug === category);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [filters, setFilters] = useState<ShopFilters>({
    q: "",
    category,
    brand: "all",
    type: "all",
    size: "all",
    maxPrice: 5000,
    minRating: 0,
    inStockOnly: false,
    maxDeliveryMinutes: 0,
    sort: "popular",
  });

  const branchId = useBranchStore((s) => s.branchId);
  const customerZip = useBranchStore((s) => s.customerZip);
  const customerLat = useBranchStore((s) => s.customerLat);
  const customerLng = useBranchStore((s) => s.customerLng);
  const getAvailable = useInventoryStore((s) => s.getAvailable);
  const isHidden = useInventoryStore((s) => s.isHidden);
  const inventoryRevision = useInventoryStore((s) => s.revision);
  const catalogRevision = useCatalogStore((s) => s.revision);

  useEffect(() => {
    setFilters((f) => ({ ...f, category }));
  }, [category]);

  const base = useMemo(
    () =>
      getAllProducts().filter(
        (p) =>
          !isHidden(branchId, p.id) &&
          (p.category === category ||
            (category === "whiskey" && ["scotch", "bourbon"].includes(p.category))),
      ),
    [category, catalogRevision, branchId, isHidden, inventoryRevision],
  );

  const brands = useMemo(() => uniqueBrands(base), [base]);
  const types = useMemo(() => uniqueTypes(base), [base]);

  const effectiveStoreId =
    filters.storeId && filters.storeId !== "current" ? filters.storeId : branchId;

  const filtered = useMemo(
    () =>
      filterAndSortProducts(getAllProducts(), { ...filters, category }, {
        branchId: effectiveStoreId,
        getOnHand: getAvailable,
        isHidden,
        customerLat,
        customerLng,
      }),
    [
      filters,
      category,
      effectiveStoreId,
      getAvailable,
      isHidden,
      customerLat,
      customerLng,
      catalogRevision,
      inventoryRevision,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [category, filters, branchId, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (filters.storeId && filters.storeId !== "current" && filters.storeId !== branchId) {
      switchShoppingStore(filters.storeId);
    }
  }, [filters.storeId, branchId]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const from = filtered.length ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, filtered.length);
  const currentStore =
    getAllLocations().find((l) => l.id === branchId) ?? getAllLocations()[0];

  if (!meta) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-14 md:px-8 md:py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.28em] text-gold">{meta.tagline}</p>
          <h1 className="mt-2 font-display text-3xl text-cream sm:text-4xl md:text-6xl">
            {meta.name}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">{meta.description}</p>
          <p className="mt-2 text-xs text-muted">
            At <span className="text-cream">{currentStore?.shortName}</span>
            {customerZip ? <> · ZIP {customerZip}</> : null}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setFinderOpen(true)}>
          <MapPin size={14} aria-hidden />
          {customerZip ? `Near ${customerZip}` : "Find store by ZIP"}
        </Button>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[240px_1fr]">
        <div>
          <div className="mb-3 lg:hidden">
            <SearchInput
              placeholder="Search…"
              value={filters.q ?? ""}
              onChange={(q) => setFilters((f) => ({ ...f, q }))}
              aria-label="Filter by name"
            />
          </div>
          <button
            type="button"
            className="mb-3 flex w-full items-center justify-between rounded-sm border border-white/10 px-4 py-3 text-left text-sm text-cream lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <span>Filters & sort</span>
            <span className="text-gold">{filtersOpen ? "Hide" : "Show"}</span>
          </button>
          <aside
            className={`h-fit border border-white/10 bg-black/20 p-4 ${
              filtersOpen ? "block" : "hidden"
            } lg:block`}
          >
            <div className="mb-4 hidden lg:block">
              <SearchInput
                placeholder="Search…"
                value={filters.q ?? ""}
                onChange={(q) => setFilters((f) => ({ ...f, q }))}
                aria-label="Filter by name"
              />
            </div>
            <ShopFiltersPanel
              value={filters}
              onChange={setFilters}
              brands={brands}
              types={types}
              showCategory={false}
            />
          </aside>
        </div>

        <div>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              {filtered.length
                ? `Showing ${from}–${to} of ${filtered.length} bottle${filtered.length === 1 ? "" : "s"}`
                : "0 bottles"}
            </p>
            <PageSizeSelect
              value={pageSize}
              onChange={(size) => {
                setPageSize(size);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 md:gap-6">
            {pageItems.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} locationId={effectiveStoreId} />
            ))}
          </div>
          {!filtered.length && (
            <p className="mt-4 text-muted">No bottles match these filters.</p>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(next) => {
              setPage(next);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>
      </div>

      <StoreFinder open={finderOpen} onClose={() => setFinderOpen(false)} />
    </div>
  );
}
