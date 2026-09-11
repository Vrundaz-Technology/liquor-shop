"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Eye, LayoutGrid, Pencil, Table2, Trash2 } from "lucide-react";
import {
  apiCreateRole,
  apiDeleteRole,
  apiFetchRoles,
  apiPatchRole,
} from "@/lib/api-mutations";
import type { CustomRoleDefinition } from "@/lib/auth/role-catalog";
import { setCustomRoleCatalog } from "@/lib/auth/role-catalog";
import { hasPermission, rolePermissions, type Permission } from "@/lib/auth/permissions";
import { ROLE_BLURBS, roleLabel } from "@/lib/auth/roles";
import { isConnectionError } from "@/lib/connection-messages";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { UserPermissionEditor } from "@/components/dashboard/UserPermissionEditor";
import { useUserStore } from "@/store/user";
import { isDbConnected } from "@/lib/runtime-data";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
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
import type { UserRole } from "@/types";

type RoleForm = {
  label: string;
  slug: string;
  description: string;
  permissions: Permission[];
};

type DirectoryRole = {
  key: string;
  label: string;
  slug: string;
  description: string;
  permissionCount: number;
  kind: "built-in" | "custom";
  custom?: CustomRoleDefinition;
};

const ROLES_VIEW_KEY = "sams.dashboard.view.roles";

const BUILTIN_AFTER_CUSTOM: UserRole[] = ["customer", "staff", "admin"];

function emptyForm(): RoleForm {
  return { label: "", slug: "", description: "", permissions: [] };
}

function validateForm(form: RoleForm) {
  if (form.label.trim().length < 2) return "Enter a role name.";
  if (form.permissions.length === 0) return "Choose at least one permission.";
  if (form.slug.trim() && !/^[a-z][a-z0-9-]*$/.test(form.slug.trim())) {
    return "Slug must be lowercase letters, numbers, and hyphens.";
  }
  return null;
}

function builtInEntry(role: UserRole): DirectoryRole {
  return {
    key: role,
    label: roleLabel(role),
    slug: role,
    description: ROLE_BLURBS[role],
    permissionCount: rolePermissions(role).length,
    kind: "built-in",
  };
}

type Props = {
  highlight?: string;
  /** When true on mount/update, opens the create-role modal once. */
  autoOpenCreate?: boolean;
  onCreateOpened?: () => void;
};

export function CustomRolesPanel({ highlight, autoOpenCreate, onCreateOpened }: Props) {
  const actor = useUserStore((s) => s.profile);
  const canManage = hasPermission(actor, "users.assign_roles");
  const [customRoles, setCustomRoles] = useState<CustomRoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<CustomRoleDefinition | "new" | null>(null);
  const [viewing, setViewing] = useState<DirectoryRole | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [view, setView] = usePersistedViewMode(ROLES_VIEW_KEY, "cards");
  const { sortKey, sortDir, toggleSort } = useTableSort<
    "label" | "slug" | "kind" | "permissions" | "description"
  >("label");

  const openCreate = () => {
    setForm(emptyForm());
    setEditing("new");
    setError("");
  };

  useEffect(() => {
    if (!autoOpenCreate || !canManage) return;
    openCreate();
    onCreateOpened?.();
  }, [autoOpenCreate, canManage, onCreateOpened]);

  const load = async () => {
    if (!isDbConnected()) {
      setCustomRoles([]);
      setCustomRoleCatalog([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetchRoles();
      setCustomRoles(data.roles);
      setCustomRoleCatalog(data.roles);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load roles.";
      setError(isConnectionError(message) ? "" : message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const directory = useMemo((): DirectoryRole[] => {
    const customs = [...customRoles]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(
        (role): DirectoryRole => ({
          key: role.id,
          label: role.label,
          slug: role.slug,
          description: role.description || "Custom role with a tailored permission set.",
          permissionCount: role.permissions.length,
          kind: "custom",
          custom: role,
        }),
      );

    return [
      builtInEntry("owner"),
      ...customs,
      ...BUILTIN_AFTER_CUSTOM.map(builtInEntry),
    ];
  }, [customRoles]);

  const sortedDirectory = useMemo(() => {
    return [...directory].sort((a, b) => {
      switch (sortKey) {
        case "slug":
          return compareValues(a.slug, b.slug, sortDir);
        case "kind":
          return compareValues(a.kind, b.kind, sortDir);
        case "permissions":
          return compareValues(a.permissionCount, b.permissionCount, sortDir);
        case "description":
          return compareValues(a.description, b.description, sortDir);
        case "label":
        default:
          return compareValues(a.label, b.label, sortDir);
      }
    });
  }, [directory, sortDir, sortKey]);

  const openEdit = (role: CustomRoleDefinition) => {
    setForm({
      label: role.label,
      slug: role.slug,
      description: role.description,
      permissions: [...role.permissions],
    });
    setEditing(role);
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateForm(form);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        label: form.label.trim(),
        description: form.description.trim(),
        permissions: form.permissions,
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      };
      if (editing === "new") {
        await apiCreateRole(payload);
      } else if (editing) {
        await apiPatchRole({ roleId: editing.id, patch: payload });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save role.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role: CustomRoleDefinition) => {
    if (!window.confirm(`Delete the ${role.label} role? Users must be reassigned first.`)) return;
    setBusy(true);
    setError("");
    try {
      await apiDeleteRole(role.id);
      if (editing && editing !== "new" && editing.id === role.id) setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete role.");
    } finally {
      setBusy(false);
    }
  };

  const renderActions = (entry: DirectoryRole, opts?: { hideYou?: boolean }) => {
    const isYou = highlight === entry.slug;
    const canEditDelete = entry.kind === "custom" && Boolean(entry.custom) && canManage;

    const youBadge =
      isYou && !opts?.hideYou ? (
        <span className="text-[10px] uppercase tracking-[0.14em] text-gold">You</span>
      ) : null;

    if (canEditDelete) {
      return (
        <div className="flex shrink-0 items-center gap-2">
          {youBadge}
          <div className="flex gap-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-(--gold)/40 hover:text-cream"
              aria-label={`Edit ${entry.label}`}
              onClick={() => openEdit(entry.custom!)}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-red-400/40 hover:text-red-200"
              aria-label={`Delete ${entry.label}`}
              onClick={() => void remove(entry.custom!)}
              disabled={busy}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex shrink-0 items-center gap-2">
        {youBadge}
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-muted transition hover:border-(--gold)/40 hover:text-cream"
          aria-label={`View ${entry.label}`}
          onClick={() => setViewing(entry)}
        >
          <Eye size={14} />
        </button>
      </div>
    );
  };

  const viewingPermissions = viewing
    ? viewing.kind === "custom" && viewing.custom
      ? viewing.custom.permissions
      : rolePermissions(viewing.slug)
    : [];

  return (
    <div className="mt-5 space-y-4">
      {!isDbConnected() ? (
        <ConnectionNotice className="mt-2" feature="save custom roles" preview />
      ) : null}
      {error && !editing ? <p className="text-sm text-red-300">{error}</p> : null}

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-[10px] uppercase tracking-[0.16em] text-muted">Role directory</h4>
          <div
            className="inline-flex shrink-0 self-start rounded-sm border border-white/10 p-0.5 sm:self-auto"
            role="group"
            aria-label="Role directory view"
          >
            <button
              type="button"
              onClick={() => setView("cards")}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition",
                view === "cards" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
              )}
              aria-pressed={view === "cards"}
            >
              <LayoutGrid size={14} aria-hidden />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition",
                view === "table" ? "bg-gold/15 text-gold" : "text-muted hover:text-cream",
              )}
              aria-pressed={view === "table"}
            >
              <Table2 size={14} aria-hidden />
              Table
            </button>
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading roles…</p>
        ) : view === "cards" ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sortedDirectory.map((entry) => {
              const active = highlight === entry.slug;
              return (
                <article
                  key={entry.key}
                  className={cn(
                    "flex min-h-[120px] flex-col border px-4 py-3 sm:min-h-[132px]",
                    active
                      ? "border-(--gold)/45 bg-(--gold)/8"
                      : "border-white/10 bg-white/[0.02]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-cream">{entry.label}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                        {entry.slug}
                      </p>
                    </div>
                    {renderActions(entry)}
                  </div>
                  <p className="mt-2 flex-1 text-[12px] leading-5 text-muted line-clamp-3">
                    {entry.description}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-gold">
                      {entry.permissionCount} permission
                      {entry.permissionCount === 1 ? "" : "s"}
                    </p>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted">
                      {entry.kind === "built-in" ? "Built-in" : "Custom"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={`mt-3 ${tableWrapClass}`}>
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className={tableHeadRowClass}>
                  <SortableTh
                    label="Role"
                    column="label"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Slug"
                    column="slug"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Type"
                    column="kind"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Permissions"
                    column="permissions"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Description"
                    column="description"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedDirectory.map((entry) => {
                  const active = highlight === entry.slug;
                  return (
                    <tr
                      key={entry.key}
                      className={cn(tableRowClass, active && "bg-(--gold)/8")}
                    >
                      <td className={cn(tableCellClass, "font-medium text-cream")}>
                        <span className="inline-flex items-center gap-2">
                          {entry.label}
                          {active ? (
                            <span className="text-[10px] uppercase tracking-[0.14em] text-gold">
                              You
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className={cn(tableCellClass, "uppercase tracking-wider text-muted")}>
                        {entry.slug}
                      </td>
                      <td className={cn(tableCellClass, "text-muted")}>
                        {entry.kind === "built-in" ? "Built-in" : "Custom"}
                      </td>
                      <td className={cn(tableCellClass, "tabular-nums text-gold")}>
                        {entry.permissionCount}
                      </td>
                      <td className={cn(tableCellClass, "max-w-[18rem] text-muted")}>
                        <span className="line-clamp-2">{entry.description}</span>
                      </td>
                      <td className={cn(tableCellClass, "text-right")}>
                        <div className="inline-flex justify-end">
                          {renderActions(entry, { hideYou: true })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(viewing)}
        title={viewing ? viewing.label : "View role"}
        subtitle={
          viewing
            ? viewing.kind === "built-in"
              ? "Built-in role — defaults are fixed. Per-user extras still work in Edit profile."
              : "Read-only preview of this role’s default permissions."
            : undefined
        }
        onClose={() => setViewing(null)}
        className="sm:max-w-2xl"
      >
        {viewing ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-sm border border-white/10 bg-white/[0.02] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Slug</p>
                <p className="mt-1 text-sm uppercase tracking-wider text-cream">{viewing.slug}</p>
              </div>
              <div className="rounded-sm border border-white/10 bg-white/[0.02] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Type</p>
                <p className="mt-1 text-sm text-cream">
                  {viewing.kind === "built-in" ? "Built-in" : "Custom"}
                  <span className="ml-2 text-gold">
                    {viewing.permissionCount} permission
                    {viewing.permissionCount === 1 ? "" : "s"}
                  </span>
                </p>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted">{viewing.description}</p>
            <div className="rounded-sm border border-white/10 bg-white/[0.02] px-3 py-3">
              <UserPermissionEditor
                role={viewing.slug}
                mode={viewing.kind === "custom" ? "template" : "user"}
                enabled={viewingPermissions}
                actor={actor}
                locked
                onChange={() => undefined}
              />
            </div>
            <div className="flex justify-end border-t border-white/10 pt-4">
              <Button type="button" variant="secondary" onClick={() => setViewing(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editing)}
        title={editing === "new" ? "Add role" : "Edit role"}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
      >
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-xs text-muted">
            Role name
            <Input
              className="mt-1"
              value={form.label}
              onChange={(event) => setForm((state) => ({ ...state, label: event.target.value }))}
              placeholder="Inventory lead"
              autoFocus
            />
          </label>
          <label className="block text-xs text-muted">
            Slug
            <Input
              className="mt-1"
              value={form.slug}
              onChange={(event) => setForm((state) => ({ ...state, slug: event.target.value }))}
              placeholder="inventory-lead"
            />
            <span className="mt-1 block text-[11px] text-muted/80">
              Optional. Used when assigning this role to users.
            </span>
          </label>
          <label className="block text-xs text-muted">
            Description
            <Input
              className="mt-1"
              value={form.description}
              onChange={(event) =>
                setForm((state) => ({ ...state, description: event.target.value }))
              }
              placeholder="Restock and adjust inventory without catalog access."
            />
          </label>

          <div>
            <p className="text-xs text-muted">Default permissions</p>
            <div className="mt-2 rounded-sm border border-white/10 p-3">
              <UserPermissionEditor
                role="__custom__"
                mode="template"
                enabled={form.permissions}
                actor={actor}
                onChange={(permissions) =>
                  setForm((state) => ({ ...state, permissions }))
                }
              />
            </div>
          </div>

          {error && editing ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {busy ? "Saving…" : editing === "new" ? "Create role" : "Save role"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function roleTone(role: string) {
  if (role === "owner") return "border-(--gold)/40 bg-(--gold)/10 text-gold";
  if (role === "admin") return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  if (role === "staff") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  if (role === "customer") return "border-white/15 bg-white/5 text-muted";
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]",
        roleTone(role),
        className,
      )}
    >
      {roleLabel(role)}
    </span>
  );
}
