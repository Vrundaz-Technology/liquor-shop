"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getAllProducts } from "@/data/products";
import { getCategories } from "@/data/categories";
import { useCatalogStore } from "@/store/catalog";
import { useBranchStore } from "@/store/branch";
import { switchShoppingStore } from "@/lib/switch-store";
import { useInventoryStore } from "@/store/inventory";
import { ProductCard } from "@/components/product/ProductCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Pagination } from "@/components/ui/Pagination";
import { PageSizeSelect } from "@/components/ui/PageSizeSelect";
import { SearchInput } from "@/components/ui/SearchInput";
import { ShopFiltersPanel } from "@/components/shop/ShopFiltersPanel";
import { StoreFinder } from "@/components/store/StoreFinder";
import { Button } from "@/components/ui/Button";
import { MapPin } from "lucide-react";
import {
  filterAndSortProducts,
  uniqueBrands,
  uniqueTypes,
  type ShopFilters,
} from "@/lib/shop-catalog";
import { DEFAULT_SHOP_FILTERS, parseShopFilters, shopFiltersToSearchParams } from "@/lib/shop-url";
import { getAllLocations } from "@/data/locations";

export function ShopCatalog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [filters, setFilters] = useState<ShopFilters>(() =>
    parseShopFilters(new URLSearchParams(searchParams.toString())),
  );

  const catalogRevision = useCatalogStore((s) => s.revision);
  const branchId = useBranchStore((s) => s.branchId);
  const customerZip = useBranchStore((s) => s.customerZip);
  const customerLat = useBranchStore((s) => s.customerLat);
  const customerLng = useBranchStore((s) => s.customerLng);
  const isHidden = useInventoryStore((s) => s.isHidden);
  const getAvailable = useInventoryStore((s) => s.getAvailable);
  const inventoryRevision = useInventoryStore((s) => s.revision);

  // Hydrate from URL (shareable /shop?q=Casamigos).
  useEffect(() => {
    setFilters(parseShopFilters(new URLSearchParams(searchParams.toString())));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when query string changes
  }, [searchParams]);

  // Push filter state into the URL for deep links.
  useEffect(() => {
    const next = shopFiltersToSearchParams(filters).toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [filters, pathname, router, searchParams]);

  const allVisible = useMemo(
    () => getAllProducts().filter((p) => !isHidden(branchId, p.id)),
    [catalogRevision, branchId, isHidden, inventoryRevision],
  );

  const brands = useMemo(() => uniqueBrands(allVisible), [allVisible]);
  const types = useMemo(() => uniqueTypes(allVisible), [allVisible]);

  const effectiveStoreId =
    filters.storeId && filters.storeId !== "current" ? filters.storeId : branchId;

  const filtered = useMemo(
    () =>
      filterAndSortProducts(getAllProducts(), filters, {
        branchId: effectiveStoreId,
        getOnHand: getAvailable,
        isHidden,
        customerLat,
        customerLng,
      }),
    [
      filters,
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
  }, [pageSize, filters, branchId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // When user picks a store filter, sync global branch so cards/prices match.
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
  const queryLabel =
    (filters.q ?? "").trim().length > 28
      ? `${(filters.q ?? "").trim().slice(0, 28)}…`
      : (filters.q ?? "").trim();
  const currentStore =
    getAllLocations().find((l) => l.id === branchId) ?? getAllLocations()[0];
  const hasDeliveryLocation = customerLat != null && customerLng != null;

  const goToPage = (next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-10 sm:px-4 sm:py-14 md:px-8 md:py-16">
      <SectionHeading
        eyebrow="Shop"
        title="All collections"
        description="Search bottles like Casamigos, filter by store availability, and sort by what matters."
        as="h1"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-scroll h-scroll-wrap -mx-1 min-w-0 flex-1 px-1 md:gap-2">
          {getCategories().map((c) => (
            <Link
              key={c.slug}
              href={`/shop/${c.slug}`}
              className="shrink-0 rounded-sm border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted transition hover:border-(--gold)/40 hover:text-gold"
            >
              {c.name}
            </Link>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => setFinderOpen(true)}
        >
          <MapPin size={14} aria-hidden />
          {customerZip ? `Near ${customerZip}` : "Find store by ZIP"}
        </Button>
      </div>

      <p className="mb-4 text-xs text-muted">
        Shopping at{" "}
        <span className="text-cream">{currentStore?.shortName}</span>
        {customerZip ? (
          <>
            {" "}
            · delivery estimates for ZIP <span className="text-cream">{customerZip}</span>
          </>
        ) : null}
        {" · "}
        one cart = one store
      </p>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div>
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
            <ShopFiltersPanel
              value={filters}
              onChange={setFilters}
              brands={brands}
              types={types}
              hasDeliveryLocation={hasDeliveryLocation}
              onNeedDeliveryLocation={() => setFinderOpen(true)}
            />
          </aside>
        </div>

        <div className="min-w-0">
          <div className="mb-4 space-y-3 sm:mb-6">
            <SearchInput
              value={filters.q ?? ""}
              onChange={(q) => setFilters((f) => ({ ...f, q }))}
              placeholder='Search bottles, brands… try "Casamigos"'
              aria-label="Search collections"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm text-muted">
                {filtered.length
                  ? `Showing ${from}–${to} of ${filtered.length}`
                  : "No bottles match"}
                {queryLabel ? (
                  <span className="text-cream/80"> for “{queryLabel}”</span>
                ) : (
                  " bottles"
                )}
              </p>
              <PageSizeSelect
                className="shrink-0"
                value={pageSize}
                onChange={(size) => {
                  setPageSize(size);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          </div>

          {pageItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
              {pageItems.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} locationId={effectiveStoreId} />
              ))}
            </div>
          ) : (
            <p className="border border-white/10 px-4 py-10 text-center text-sm text-muted">
              No bottles match your filters.
              {(filters.maxDeliveryMinutes ?? 0) > 0 && !hasDeliveryLocation
                ? " Set your ZIP to use delivery-time filters."
                : filters.maxDeliveryMinutes
                  ? " Try a wider delivery window or find your store by ZIP."
                  : " Try another brand, category, or clear filters."}
            </p>
          )}

          <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
        </div>
      </div>

      <StoreFinder open={finderOpen} onClose={() => setFinderOpen(false)} />
    </div>
  );
}

// Keep default export surface stable for pages that re-export filters defaults.
export { DEFAULT_SHOP_FILTERS };
