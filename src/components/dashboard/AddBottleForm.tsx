"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { getCategories } from "@/data/categories";
import { getAllLocations } from "@/data/locations";
import type { CategorySlug, Product } from "@/types";
import { useCatalogStore, type NewBottleInput } from "@/store/catalog";
import { Button } from "@/components/ui/Button";
import { CoverImageUpload, GalleryImageUpload } from "@/components/ui/ImageUpload";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { AbbrTooltip } from "@/components/ui/AbbrTooltip";
import { cn } from "@/lib/utils";
import {
  parseFiniteNumber,
  positiveMoneySchema,
  sanitizeMoneyInput,
} from "@/lib/validation/money";

type FormState = {
  name: string;
  brand: string;
  category: CategorySlug;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  sku: string;
  upc: string;
  minQty: string;
  maxQty: string;
  abv: string;
  volumeMl: string;
  origin: string;
  country: string;
  description: string;
  brandStory: string;
  imageUrl: string;
  images: string[];
  tastingNotes: string;
  foodPairings: string;
  isPremium: boolean;
  isImported: boolean;
  initialStock: string;
};

const emptyForm = (): FormState => ({
  name: "",
  brand: "",
  category: "whiskey",
  price: "35",
  compareAtPrice: "",
  costPrice: "",
  sku: "",
  upc: "",
  minQty: "1",
  maxQty: "",
  abv: "40",
  volumeMl: "750",
  origin: "",
  country: "USA",
  description: "",
  brandStory: "",
  imageUrl: "",
  images: [],
  tastingNotes: "",
  foodPairings: "",
  isPremium: false,
  isImported: false,
  initialStock: "12",
});

function fromProduct(product: Product): FormState {
  return {
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: String(product.price),
    compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : "",
    costPrice: product.costPrice ? String(product.costPrice) : "",
    sku: product.sku ?? "",
    upc: product.upc ?? "",
    minQty: String(product.minQty ?? 1),
    maxQty: product.maxQty != null ? String(product.maxQty) : "",
    abv: String(product.abv),
    volumeMl: String(product.volumeMl),
    origin: product.origin,
    country: product.country,
    description: product.description,
    brandStory: product.brandStory,
    imageUrl: product.images[0] ?? "",
    images: product.images.slice(1),
    tastingNotes: product.tastingNotes.join(", "),
    foodPairings: product.foodPairings.join(", "),
    isPremium: product.isPremium,
    isImported: product.isImported,
    initialStock: "0",
  };
}

const labelClass = "block text-[10px] uppercase tracking-[0.16em] text-muted";
const hintClass = "mt-1.5 block normal-case tracking-normal text-[11px] text-white/40";
const fieldShell = "mt-1.5";
const textareaClass =
  "mt-1.5 min-h-[88px] w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-cream outline-none transition focus:border-(--gold)/50 focus:bg-white/[0.07]";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-white/10 pb-5 last:border-b-0 last:pb-0">
      <div>
        <h4 className="text-[10px] font-medium uppercase tracking-[0.18em] text-gold">{title}</h4>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-white/45">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn(labelClass, className)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {required ? <span className="text-(--danger)">*</span> : null}
      </span>
      <div className={fieldShell}>{children}</div>
      {hint ? <span className={hintClass}>{hint}</span> : null}
    </label>
  );
}

type Props = {
  open: boolean;
  product?: Product;
  onSaved?: (productId: string) => void;
  defaultLocationId?: string;
  onClose: () => void;
};

export function BottleForm({ open, product, onSaved, defaultLocationId, onClose }: Props) {
  const addBottle = useCatalogStore((s) => s.addBottle);
  const updateBottle = useCatalogStore((s) => s.updateBottle);
  const editing = Boolean(product);
  const [form, setForm] = useState<FormState>(() => (product ? fromProduct(product) : emptyForm()));
  const [stockScope, setStockScope] = useState<"all" | "one">(defaultLocationId ? "one" : "all");
  const [stockLocationId, setStockLocationId] = useState(
    defaultLocationId ?? getAllLocations()[0]?.id ?? "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  const payload = (): NewBottleInput => {
    const price = parseFiniteNumber(form.price) ?? 0;
    const compare = form.compareAtPrice.trim()
      ? parseFiniteNumber(form.compareAtPrice)
      : null;
    const cost = form.costPrice.trim() ? parseFiniteNumber(form.costPrice) : null;
    const minQty = Math.max(1, Math.floor(Number(form.minQty) || 1));
    const maxRaw = form.maxQty.trim() ? Math.floor(Number(form.maxQty)) : null;
    return {
      name: form.name,
      brand: form.brand,
      category: form.category,
      price,
      compareAtPrice: compare != null && compare > 0 ? compare : null,
      costPrice: cost != null && cost >= 0 ? cost : null,
      sku: form.sku.trim() || undefined,
      upc: form.upc.trim() || undefined,
      minQty,
      maxQty: maxRaw != null && maxRaw >= minQty ? maxRaw : null,
      abv: Number(form.abv) || 0,
      volumeMl: Number(form.volumeMl) || 0,
      origin: form.origin,
      country: form.country,
      description: form.description,
      brandStory: form.brandStory,
      imageUrl: form.imageUrl,
      images: form.images,
      tastingNotes: form.tastingNotes,
      foodPairings: form.foodPairings,
      isPremium: form.isPremium,
      isImported: form.isImported,
      initialStock: Number(form.initialStock) || 0,
      stockLocationIds:
        !editing && stockScope === "one" && stockLocationId ? [stockLocationId] : undefined,
    };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const priceCheck = positiveMoneySchema.safeParse(parseFiniteNumber(form.price));
    if (!priceCheck.success) {
      setError(priceCheck.error.issues[0]?.message ?? "Enter a valid price.");
      return;
    }
    if (form.compareAtPrice.trim()) {
      const compareCheck = positiveMoneySchema.safeParse(
        parseFiniteNumber(form.compareAtPrice),
      );
      if (!compareCheck.success) {
        setError(compareCheck.error.issues[0]?.message ?? "Enter a valid compare-at price.");
        return;
      }
    }
    setBusy(true);
    try {
      const body = payload();
      const result = product
        ? await updateBottle(product.id, body)
        : await addBottle(body);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved?.(result.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit bottle" : "Add bottle"}
      subtitle={
        editing
          ? "Update catalog details for this bottle."
          : "Photos, pricing, and copy for the shop and inventory."
      }
      className="sm:max-w-2xl md:max-w-3xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="bottle-form"
            className="w-full sm:min-w-[9.5rem] sm:w-auto"
            loading={busy}
          >
            {busy ? "Saving…" : editing ? "Save bottle" : "Add bottle"}
          </Button>
        </div>
      }
    >
      <form id="bottle-form" onSubmit={submit} className="space-y-5">
        <Section
          title="Photos"
          description="Cover image appears in shop, inventory, and product pages."
        >
          <div className="sm:col-span-2">
            <CoverImageUpload
              label="Bottle photo"
              hint="JPG or PNG. Prefer a clear bottle shot on a dark or neutral background."
              fit="contain"
              value={form.imageUrl}
              onChange={set("imageUrl")}
            />
          </div>
          <div className="sm:col-span-2">
            <GalleryImageUpload
              label="Gallery"
              hint="Optional extras for the product page. Up to 6 images."
              value={form.images}
              onChange={set("images")}
              max={6}
            />
          </div>
        </Section>

        <Section title="Basics" description="Core catalog identity for this bottle.">
          <Field label="Bottle name" required className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. Highland Reserve 12"
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Brand" required>
            <Input
              value={form.brand}
              onChange={(e) => set("brand")(e.target.value)}
              placeholder="e.g. Macallan"
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Category" required>
            <Select
              ariaLabel="Category"
              value={form.category}
              onChange={(value) => set("category")(value as CategorySlug)}
              className="w-full"
              options={getCategories().map((category) => ({
                value: category.slug,
                label: category.name,
              }))}
            />
          </Field>
        </Section>

        <Section
          title="Pricing & codes"
          description="Shelf price, optional compare-at / cost, and identifiers."
        >
          <Field
            label={
              <>
                Price (<AbbrTooltip term="USD" />)
              </>
            }
            required
            hint="Greater than 0, at most 2 decimals."
          >
            <Input
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set("price")(sanitizeMoneyInput(e.target.value, 2))}
              required
            />
          </Field>
          <Field label="Compare-at price" hint="Optional strike-through price.">
            <Input
              inputMode="decimal"
              value={form.compareAtPrice}
              onChange={(e) => set("compareAtPrice")(sanitizeMoneyInput(e.target.value, 2))}
              placeholder="0.00"
            />
          </Field>
          <Field
            label="Cost price"
            hint={
              <>
                Optional <AbbrTooltip term="COGS" /> for profit estimates.
              </>
            }
          >
            <Input
              inputMode="decimal"
              value={form.costPrice}
              onChange={(e) => set("costPrice")(sanitizeMoneyInput(e.target.value, 2))}
              placeholder="0.00"
            />
          </Field>
          <Field label={<AbbrTooltip term="SKU" />}>
            <Input
              value={form.sku}
              maxLength={64}
              onChange={(e) => set("sku")(e.target.value.toUpperCase())}
              placeholder="Optional"
              autoComplete="off"
            />
          </Field>
          <Field label={<AbbrTooltip term="UPC" suffix=" / barcode" />}>
            <Input
              inputMode="numeric"
              value={form.upc}
              maxLength={32}
              onChange={(e) => set("upc")(e.target.value.replace(/[^0-9-]/g, ""))}
              placeholder="Optional"
              autoComplete="off"
            />
          </Field>
          <div className="hidden sm:block" aria-hidden />
        </Section>

        <Section title="Specs" description="Bottle size, strength, origin, and purchase limits.">
          <Field label={<AbbrTooltip term="ABV" suffix=" %" />}>
            <Input
              type="number"
              min={0.1}
              max={80}
              step={0.1}
              value={form.abv}
              onChange={(e) => set("abv")(e.target.value)}
            />
          </Field>
          <Field
            label={
              <>
                Volume (<AbbrTooltip term="ml" />)
              </>
            }
          >
            <Input
              type="number"
              min={50}
              step={50}
              value={form.volumeMl}
              onChange={(e) => set("volumeMl")(e.target.value)}
            />
          </Field>
          <Field label="Origin">
            <Input
              value={form.origin}
              onChange={(e) => set("origin")(e.target.value)}
              placeholder="e.g. Speyside, Scotland"
            />
          </Field>
          <Field label="Country">
            <Input
              value={form.country}
              onChange={(e) => set("country")(e.target.value)}
              placeholder="e.g. USA"
            />
          </Field>
          <Field
            label={
              <>
                Min purchase <AbbrTooltip term="Qty" />
              </>
            }
          >
            <Input
              type="number"
              min={1}
              max={99}
              value={form.minQty}
              onChange={(e) => set("minQty")(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            />
          </Field>
          <Field
            label={
              <>
                Max purchase <AbbrTooltip term="Qty" />
              </>
            }
            hint="Leave blank for no maximum."
          >
            <Input
              type="number"
              min={1}
              max={999}
              value={form.maxQty}
              onChange={(e) => set("maxQty")(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              placeholder="Optional"
            />
          </Field>
        </Section>

        <Section
          title="Merchandising"
          description="Copy and flags shown on the product experience."
        >
          <Field label="Description" className="sm:col-span-2">
            <textarea
              className={textareaClass}
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="Short tasting description for the product page"
            />
          </Field>
          <Field label="Brand story" className="sm:col-span-2">
            <textarea
              className={cn(textareaClass, "min-h-[72px]")}
              value={form.brandStory}
              onChange={(e) => set("brandStory")(e.target.value)}
              placeholder="Optional background for the product page"
            />
          </Field>
          <Field label="Tasting notes" hint="Comma-separated." className="sm:col-span-2">
            <Input
              value={form.tastingNotes}
              onChange={(e) => set("tastingNotes")(e.target.value)}
              placeholder="Vanilla, Oak, Honey"
            />
          </Field>
          <Field label="Food pairings" hint="Comma-separated." className="sm:col-span-2">
            <Input
              value={form.foodPairings}
              onChange={(e) => set("foodPairings")(e.target.value)}
              placeholder="BBQ ribs, Dark chocolate"
            />
          </Field>
          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-3 text-sm text-cream">
              <input
                type="checkbox"
                className="h-4 w-4 accent-(--gold)"
                checked={form.isPremium}
                onChange={(e) => set("isPremium")(e.target.checked)}
              />
              Premium bottle
            </label>
            <label className="flex min-h-11 items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-3 text-sm text-cream">
              <input
                type="checkbox"
                className="h-4 w-4 accent-(--gold)"
                checked={form.isImported}
                onChange={(e) => set("isImported")(e.target.checked)}
              />
              Imported
            </label>
          </div>
        </Section>

        {!editing ? (
          <Section
            title="Opening stock"
            description="Seed on-hand counts when this bottle is created."
          >
            <Field label="Initial stock count" className="sm:col-span-2">
              <Input
                type="number"
                min={0}
                value={form.initialStock}
                onChange={(e) => set("initialStock")(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 space-y-2">
              <p className={labelClass}>Seed stock at</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStockScope("all")}
                  className={cn(
                    "min-h-10 border px-3 py-2 text-[11px] uppercase tracking-[0.14em] transition",
                    stockScope === "all"
                      ? "border-(--gold)/50 bg-(--gold)/10 text-cream"
                      : "border-white/10 text-muted hover:text-cream",
                  )}
                >
                  All stores
                </button>
                <button
                  type="button"
                  onClick={() => setStockScope("one")}
                  className={cn(
                    "min-h-10 border px-3 py-2 text-[11px] uppercase tracking-[0.14em] transition",
                    stockScope === "one"
                      ? "border-(--gold)/50 bg-(--gold)/10 text-cream"
                      : "border-white/10 text-muted hover:text-cream",
                  )}
                >
                  One store
                </button>
              </div>
              {stockScope === "one" ? (
                <NativeSelect
                  className="mt-1.5 py-3"
                  value={stockLocationId}
                  onChange={(e) => setStockLocationId(e.target.value)}
                  aria-label="Seed stock location"
                >
                  {getAllLocations().map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <p className={hintClass}>Same opening quantity will be applied to every store.</p>
              )}
            </div>
          </Section>
        ) : null}

        {error ? (
          <p className="rounded-sm border border-(--danger)/30 bg-(--danger)/10 px-3 py-2 text-sm text-(--danger)">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/** @deprecated Use BottleForm. Kept so older imports still type-check. */
export function AddBottleForm(
  props: Props & { alwaysOpen?: boolean; onCreated?: (id: string) => void },
) {
  return (
    <BottleForm
      open={props.open ?? props.alwaysOpen ?? true}
      product={props.product}
      defaultLocationId={props.defaultLocationId}
      onSaved={props.onSaved ?? props.onCreated}
      onClose={props.onClose}
    />
  );
}
