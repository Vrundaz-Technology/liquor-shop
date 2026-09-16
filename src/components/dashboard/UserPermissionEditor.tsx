"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import {
  PERMISSION_GROUPS,
  PERMISSION_META,
  PERMISSIONS,
  hasPermission,
  permissionGroupTree,
  rolePermissions,
  withPermissionImplications,
  type AccessInput,
  type Permission,
} from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/auth/roles";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Props = {
  role: string;
  enabled: Permission[];
  actor: AccessInput;
  onChange: (enabled: Permission[]) => void;
  locked?: boolean;
  /** user = Role/Added/Removed tags; template = building a role default set */
  mode?: "user" | "template";
  showReset?: boolean;
};

export function UserPermissionEditor({
  role,
  enabled,
  actor,
  onChange,
  locked,
  mode = "user",
  showReset = false,
}: Props) {
  const isTemplate = mode === "template";
  const base = useMemo(() => new Set(rolePermissions(role)), [role]);
  const on = useMemo(() => new Set(enabled), [enabled]);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PERMISSION_GROUPS.map((group, index) => [group, index === 0])),
  );

  const overrideStats = useMemo(() => {
    if (isTemplate || role === "owner") return { added: 0, removed: 0 };
    let added = 0;
    let removed = 0;
    for (const permission of PERMISSIONS) {
      const checked = on.has(permission);
      const inRole = base.has(permission);
      if (checked && !inRole) added += 1;
      if (!checked && inRole) removed += 1;
    }
    return { added, removed };
  }, [base, isTemplate, on, role]);

  const emit = (next: Set<Permission>) => {
    onChange(withPermissionImplications(PERMISSIONS.filter((item) => next.has(item))));
  };

  const toggle = (permission: Permission) => {
    if (locked || (!isTemplate && role === "owner")) return;
    if (!hasPermission(actor, permission)) return;
    const next = new Set(on);
    const { items, read, actions } = permissionGroupTree(PERMISSION_META[permission].group);
    if (next.has(permission)) {
      next.delete(permission);
      if (permission === read) {
        for (const action of actions) next.delete(action);
      }
    } else {
      next.add(permission);
      if (read && items.includes(permission) && permission !== read) next.add(read);
    }
    emit(next);
  };

  const toggleGroup = (group: string) => {
    if (locked || (!isTemplate && role === "owner")) return;
    const { items } = permissionGroupTree(group);
    const togglable = items.filter((permission) => hasPermission(actor, permission));
    if (togglable.length === 0) return;
    const allOn = togglable.every((permission) => on.has(permission));
    const next = new Set(on);
    for (const permission of togglable) {
      if (allOn) next.delete(permission);
      else next.add(permission);
    }
    emit(next);
  };

  const resetDefaults = () => {
    if (locked || role === "owner") return;
    onChange(rolePermissions(role));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold">
            {isTemplate ? "Default permissions" : "Permissions for this user"}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-muted">
            {isTemplate
              ? "Choose the default access this role grants. Checking an action also enables its read permission."
              : `${roleLabel(role)} defaults show as Role. Add extras or remove defaults for this person only.`}
          </p>
        </div>
        {!isTemplate && (overrideStats.added > 0 || overrideStats.removed > 0 || showReset) ? (
          <div className="flex flex-wrap items-center gap-2">
            {overrideStats.added > 0 ? (
              <span className="rounded-sm border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-200">
                +{overrideStats.added} added
              </span>
            ) : null}
            {overrideStats.removed > 0 ? (
              <span className="rounded-sm border border-red-400/25 bg-red-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-red-200">
                −{overrideStats.removed} removed
              </span>
            ) : null}
            {showReset && !locked && role !== "owner" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-9"
                onClick={resetDefaults}
                disabled={overrideStats.added === 0 && overrideStats.removed === 0}
              >
                <RotateCcw size={13} aria-hidden />
                Reset
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-sm border border-white/10 bg-white/[0.015]">
        {PERMISSION_GROUPS.map((group) => {
          const { items, read, actions } = permissionGroupTree(group);
          const expanded = Boolean(open[group]);
          const togglable = items.filter((permission) => hasPermission(actor, permission));
          const togglableOn = togglable.filter((permission) => on.has(permission)).length;
          const checkedCount = items.filter((permission) => on.has(permission)).length;
          const allOn = togglable.length > 0 && togglableOn === togglable.length;
          const someOn = togglableOn > 0 && !allOn;
          const canToggleGroup =
            !locked &&
            (isTemplate || role !== "owner") &&
            togglable.length > 0;
          const parentPartial =
            Boolean(read) &&
            on.has(read!) &&
            actions.some((action) => on.has(action)) &&
            !actions.every((action) => on.has(action));

          return (
            <div key={group} className="border-b border-white/10 last:border-b-0">
              <div className="flex items-center gap-2 bg-gradient-to-r from-white/[0.05] to-transparent px-3 py-2.5">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setOpen((state) => ({ ...state, [group]: !expanded }))}
                  aria-expanded={expanded}
                >
                  <ChevronRight
                    size={14}
                    className={cn(
                      "shrink-0 text-gold/80 transition-transform duration-200",
                      expanded && "rotate-90",
                    )}
                  />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-gold">{group}</span>
                  <span className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
                    {checkedCount}/{items.length}
                  </span>
                </button>
                <GroupCheckbox
                  checked={allOn}
                  indeterminate={someOn}
                  disabled={!canToggleGroup}
                  onChange={() => toggleGroup(group)}
                  label={`Toggle all ${group} permissions`}
                />
              </div>
              {expanded ? (
                <ul className="bg-black/20">
                  {read ? (
                    <PermissionRow
                      permission={read}
                      checked={on.has(read)}
                      indeterminate={parentPartial}
                      inRole={base.has(read) || role === "owner"}
                      canToggle={
                        !locked &&
                        (isTemplate || role !== "owner") &&
                        hasPermission(actor, read)
                      }
                      isTemplate={isTemplate}
                      onToggle={() => toggle(read)}
                    />
                  ) : null}
                  {actions.map((permission) => (
                    <PermissionRow
                      key={permission}
                      permission={permission}
                      checked={on.has(permission)}
                      inRole={base.has(permission) || role === "owner"}
                      canToggle={
                        !locked &&
                        (isTemplate || role !== "owner") &&
                        hasPermission(actor, permission)
                      }
                      indent={Boolean(read)}
                      isTemplate={isTemplate}
                      onToggle={() => toggle(permission)}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      {!isTemplate && role === "owner" ? (
        <p className="text-xs text-muted">Owner accounts always keep full access.</p>
      ) : locked ? (
        <p className="text-xs text-muted">
          You can view these permissions, but not change them on this account.
        </p>
      ) : null}
    </div>
  );
}

function PermissionRow({
  permission,
  checked,
  indeterminate,
  inRole,
  canToggle,
  indent,
  isTemplate,
  onToggle,
}: {
  permission: Permission;
  checked: boolean;
  indeterminate?: boolean;
  inRole: boolean;
  canToggle: boolean;
  indent?: boolean;
  isTemplate?: boolean;
  onToggle: () => void;
}) {
  const meta = PERMISSION_META[permission];
  const tag = isTemplate
    ? null
    : checked && !inRole
      ? "Added"
      : !checked && inRole
        ? "Removed"
        : inRole
          ? "Role"
          : null;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && checked;
  }, [indeterminate, checked]);

  return (
    <li>
      <label
        className={cn(
          "flex min-h-11 cursor-pointer items-start gap-3 border-t border-white/5 py-2.5 pr-3 transition-colors",
          indent ? "pl-10" : "pl-3",
          checked ? "bg-gold/[0.03]" : "hover:bg-white/[0.02]",
          !canToggle && "cursor-default opacity-60",
        )}
        title={
          !canToggle
            ? "You don’t have this permission, so you can’t grant or remove it."
            : undefined
        }
      >
        <input
          ref={ref}
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-(--gold)"
          checked={checked}
          disabled={!canToggle}
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("text-sm", checked ? "text-cream" : "text-muted")}>{meta.label}</p>
            {tag ? (
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]",
                  tag === "Added"
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                    : tag === "Removed"
                      ? "border-red-400/30 bg-red-400/10 text-red-200"
                      : "border-white/15 bg-white/5 text-muted",
                )}
              >
                {tag}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">{meta.description}</p>
        </div>
      </label>
    </li>
  );
}

function GroupCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-5 w-5 accent-(--gold)"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
    />
  );
}
