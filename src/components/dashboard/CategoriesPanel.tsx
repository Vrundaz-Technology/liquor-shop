"use client";

import { FormEvent, useMemo, useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { getCategories } from "@/data/categories";
import { getAllProducts } from "@/data/products";
import {
  apiCreateCategory,
  apiDeleteCategory,
  apiPatchCategory,
} from "@/lib/api-mutations";
import { hasPermission } from "@/lib/auth/permissions";
import { removeRuntimeCategory, upsertRuntimeCategory } from "@/lib/runtime-data";
import { useCatalogStore } from "@/store/catalog";
import { useUserStore } from "@/store/user";
import type { ShopCategory } from "@/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { compareValues, MobileSortBar, SortableTh, tableCellClass, tableHeadRowClass, tableRowClass, tableWrapClass, useTableSort } from "@/components/ui/SortableTh";

type CategoryForm = {
  name: string;
  tagline: string;
  description: string;
  color: string;
};

const emptyForm = (): CategoryForm => ({
  name: "",
  tagline: "",
  description: "",
  color: "#C9A962",
});

export function CategoriesPanel({ embedded = false }: { embedded?: boolean }) {
  const actor = useUserStore((s) => s.profile);
  const bumpRevision = useCatalogStore((s) => s.bumpRevision);
  const catalogRevision = useCatalogStore((s) => s.revision);
  const [tick, setTick] = useState(0);
  const categories = useMemo(() => getCategories(), [tick, catalogRevision]);
  const { sortKey, sortDir, toggleSort } = useTableSort<"category" | "slug" | "bottles">("category");
  const sortedCategories = useMemo(() => {
    return [...categories]
      .map((category) => ({
        category,
        count: getAllProducts().filter((product) => product.category === category.slug).length,
      }))
      .sort((a, b) => {
        if (sortKey === "slug") return compareValues(a.category.slug, b.category.slug, sortDir);
        if (sortKey === "bottles") return compareValues(a.count, b.count, sortDir);
        return compareValues(a.category.name, b.category.name, sortDir);
      });
  }, [categories, sortDir, sortKey]);
  const [editing, setEditing] = useState<ShopCategory | "new" | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canCreate = hasPermission(actor, "catalog.create");
  const canEdit = hasPermission(actor, "catalog.edit");
  const canDelete = hasPermission(actor, "catalog.delete");

  const refresh = () => {
    bumpRevision();
    setTick((n) => n + 1);
  };

  const openCreate = () => {
    setForm(emptyForm());
    setError("");
    setEditing("new");
  };

  const openEdit = (category: ShopCategory) => {
    setForm({
      name: category.name,
      tagline: category.tagline,
      description: category.description,
      color: category.color,
    });
    setError("");
    setEditing(category);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing === "new") {
        const { category } = await apiCreateCategory(form);
        upsertRuntimeCategory(category);
      } else if (editing) {
        const { category } = await apiPatchCategory(editing.slug, form);
        upsertRuntimeCategory(category);
      }
      setEditing(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: ShopCategory) => {
    const used = getAllProducts().filter((product) => product.category === category.slug).length;
    const hint = used
      ? ` ${used} bottle${used === 1 ? "" : "s"} still use this category.`
      : "";
    if (!window.confirm(`Remove “${category.name}”?${hint}`)) return;
    setError("");
    try {
      await apiDeleteCategory(category.slug);
      removeRuntimeCategory(category.slug);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove category.");
    }
  };

  return (
    <section className={embedded ? "mt-5" : "mt-6"}>
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className={`font-display text-cream ${embedded ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"}`}>
            Categories
          </h2>
          <p className="mt-1 text-sm text-muted">
            Shop collections. Bottles must belong to a category, so remove bottles first if you delete one.
          </p>
        </div>
        {canCreate ? (
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            Add category
          </Button>
        ) : null}
      </div>
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <MobileSortBar
        className="mt-5 lg:hidden"
        columns={[
          { key: "category", label: "Category" },
          { key: "slug", label: "Slug" },
          { key: "bottles", label: "Bottles" },
        ]}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
      />
      <ul className="mt-3 divide-y divide-white/10 border border-white/10 lg:hidden">
        {sortedCategories.map(({ category, count }) => (
          <li key={category.slug} className="p-4">
            <div className="flex items-start gap-3">
              <span
                className="h-8 w-8 shrink-0 border border-white/10"
                style={{ background: category.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-cream">{category.name}</p>
                <p className="text-xs text-muted">{category.tagline}</p>
                <p className="mt-1 text-xs text-muted">
                  /{category.slug} · {count} bottle{count === 1 ? "" : "s"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit ? (
                    <Button size="sm" variant="ghost" className="h-9 px-2.5" onClick={() => openEdit(category)}>
                      <Pencil size={13} />
                      Edit
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-9 px-2.5"
                      onClick={() => void remove(category)}
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
      {categories.length === 0 ? (
        <div className="mt-3 border border-white/10 px-4 py-14 text-center text-sm text-muted lg:hidden">
          <Tags className="mx-auto mb-3 text-gold/70" size={28} />
          No categories yet.
        </div>
      ) : null}

      <div className={`mt-5 hidden lg:block ${tableWrapClass}`}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <SortableTh label="Category" column="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Slug" column="slug" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh label="Bottles" column="bottles" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCategories.map(({ category, count }) => {
              return (
                <tr key={category.slug} className={tableRowClass}>
                  <td className={tableCellClass}>
                    <div className="flex items-center gap-3">
                      <span
                        className="h-8 w-8 shrink-0 border border-white/10"
                        style={{ background: category.color }}
                      />
                      <div>
                        <p className="font-medium text-cream">{category.name}</p>
                        <p className="text-xs text-muted">{category.tagline}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`${tableCellClass} text-xs text-muted`}>/{category.slug}</td>
                  <td className={`${tableCellClass} text-xs text-muted`}>{count}</td>
                  <td className={tableCellClass}>
                    <div className="flex flex-nowrap justify-end gap-2">
                      {canEdit ? (
                        <Button size="sm" variant="ghost" className="h-8 px-2.5" onClick={() => openEdit(category)}>
                          <Pencil size={13} />
                          Edit
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 px-2.5"
                          onClick={() => void remove(category)}
                        >
                          <Trash2 size={13} />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {categories.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-muted">
            <Tags className="mx-auto mb-3 text-gold/70" size={28} />
            No categories yet.
          </div>
        ) : null}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add category" : "Edit category"}
        subtitle="This collection appears in the shop and bottle forms."
        className="sm:max-w-lg"
      >
        <form onSubmit={save} className="grid gap-3">
          <label className="block text-xs text-muted">
            Name
            <Input
              className="mt-1"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Mezcal"
              required
            />
          </label>
          <label className="block text-xs text-muted">
            Tagline
            <Input
              className="mt-1"
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder="e.g. Smoke & agave"
            />
          </label>
          <label className="block text-xs text-muted">
            Description
            <textarea
              className="mt-1 min-h-[80px] w-full rounded-sm border border-white/10 bg-(--bg-elevated) px-3 py-2 text-sm text-cream outline-none"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-muted">
            Accent color
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : "#C9A962"}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-10 w-12 cursor-pointer border border-white/10 bg-transparent"
              />
              <Input
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              />
            </div>
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="modal-actions border-t border-white/10 pt-4">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto" loading={busy}>
              {busy ? "Saving…" : "Save category"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
