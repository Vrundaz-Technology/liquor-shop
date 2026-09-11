"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, UserPlus, Users } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiCreateUser, apiFetchRoles, apiFetchUsers, apiPatchUser } from "@/lib/api-mutations";
import { setCustomRoleCatalog } from "@/lib/auth/role-catalog";
import type { CustomRoleDefinition } from "@/lib/auth/role-catalog";
import {
  roleLabel,
  USER_ROLES,
  canAssignRole,
  canDeactivateUser,
  canEditUser,
  canResetPassword,
  hasCustomPermissions,
  hasPermission,
  isDemoAccountEmail,
} from "@/lib/auth/roles";
import { isDbConnected } from "@/lib/runtime-data";
import { isConnectionError } from "@/lib/connection-messages";
import { ConnectionNotice } from "@/components/dashboard/ConnectionNotice";
import { useUserStore } from "@/store/user";
import type { ManagedUser, UserProfile } from "@/types";
import { Input } from "@/components/ui/Input";
import { SearchInput } from "@/components/ui/SearchInput";
import { ActiveFiltersBar } from "@/components/ui/ActiveFiltersBar";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { Pagination } from "@/components/ui/Pagination";
import { MobileSortBar, SortableTh, tableHeadRowClass, useTableSort } from "@/components/ui/SortableTh";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Modal } from "@/components/ui/Modal";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { UserFormModal, type UserFormValues } from "@/components/dashboard/UserFormModal";
import { CustomRolesPanel, roleTone } from "@/components/dashboard/CustomRolesPanel";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<string, string> = {
  owner: roleTone("owner"),
  admin: roleTone("admin"),
  staff: roleTone("staff"),
  customer: roleTone("customer"),
};

type UsersView = "directory" | "permissions";

export function UsersPanel() {
  const actor = useUserStore((s) => s.profile);
  const [view, setView] = useState<UsersView>("directory");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sortKey, sortDir, toggleSort } = useTableSort<"name" | "role" | "status" | "joined">(
    "joined",
    "desc",
    ["joined"],
  );
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingRoleCreate, setPendingRoleCreate] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [customRoles, setCustomRoles] = useState<CustomRoleDefinition[]>([]);

  const assignableRoles = useMemo(() => {
    const builtIn = USER_ROLES.filter((r) => canAssignRole(actor, r));
    const custom = customRoles
      .filter((r) => canAssignRole(actor, r.slug))
      .map((r) => r.slug);
    return [...builtIn, ...custom];
  }, [actor, customRoles]);
  const canCreate =
    hasPermission(actor, "users.create") && assignableRoles.length > 0;
  const canAssign = hasPermission(actor, "users.assign_roles");
  const canCustomizePermissions = hasPermission(actor, "users.edit");
  const canManageRoles = canAssign;
  const clearPendingRoleCreate = useCallback(() => setPendingRoleCreate(false), []);

  useEffect(() => {
    if (view === "permissions" && !canManageRoles) setView("directory");
  }, [view, canManageRoles]);

  const load = async (
    pageOverride?: number,
    overrides?: { q?: string; role?: string },
  ) => {
    const activePage = pageOverride ?? page;
    const activeQ = overrides?.q ?? q;
    const activeRole = overrides?.role ?? role;
    if (!isDbConnected()) {
      setUsers([]);
      setTotal(0);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiFetchUsers({
        q: activeQ.trim() || undefined,
        role: activeRole === "all" ? undefined : activeRole,
        limit: pageSize,
        offset: (activePage - 1) * pageSize,
        sortKey,
        sortDir,
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load users.";
      setError(isConnectionError(message) ? "" : message);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setQ("");
    setRole("all");
    setPage(1);
    void load(1, { q: "", role: "all" });
  };

  useEffect(() => {
    if (!isDbConnected()) return;
    void apiFetchRoles()
      .then((data) => {
        setCustomRoles(data.roles);
        setCustomRoleCatalog(data.roles);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [role, pageSize, sortKey, sortDir]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, page, pageSize, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const createUser = async (values: UserFormValues) => {
    setFormError("");
    setSaving(true);
    try {
      await apiCreateUser({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
        avatarUrl: values.avatarUrl || undefined,
        permissionGrants: values.permissionGrants,
        permissionRevokes: values.permissionRevokes,
        allowedLocationIds: values.allowedLocationIds,
      });
      setCreateOpen(false);
      setPage(1);
      await load(1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create user.");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (values: UserFormValues) => {
    if (!editing) return;
    setFormError("");
    setSaving(true);
    try {
      const { user } = await apiPatchUser({
        userId: editing.id,
        name: values.name,
        email: values.email,
        role: values.role,
        avatarUrl: values.avatarUrl,
        permissionGrants: values.permissionGrants,
        permissionRevokes: values.permissionRevokes,
        allowedLocationIds: values.allowedLocationIds,
        ...(values.password ? { password: values.password } : {}),
      });
      setUsers((list) => list.map((row) => (row.id === user.id ? user : row)));
      if (user.id === actor.id) {
        await useUserStore.getState().hydrateSession();
      }
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not update user.");
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (password: string) => {
    if (!resetting) return;
    setFormError("");
    setSaving(true);
    try {
      const { user } = await apiPatchUser({ userId: resetting.id, password });
      setUsers((list) => list.map((row) => (row.id === user.id ? user : row)));
      setResetting(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setSaving(false);
    }
  };

  const patch = async (input: Parameters<typeof apiPatchUser>[0]) => {
    setError("");
    try {
      const { user } = await apiPatchUser(input);
      setUsers((list) => list.map((row) => (row.id === user.id ? user : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update user.");
    }
  };

  return (
    <section className="mt-0">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
        <div className="min-w-0">
          <p className="hidden text-[10px] uppercase tracking-[0.22em] text-gold lg:flex lg:items-center lg:gap-2">
            <Users size={12} className="text-gold" />
            Users
          </p>
          <h2 className="hidden font-display text-3xl text-cream lg:mt-2 lg:block xl:text-4xl">
            Users
          </h2>
          <p className="max-w-2xl text-sm text-muted lg:mt-2">
            Create accounts, assign roles, store access, and permissions.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button size="sm" variant="secondary" onClick={() => void load()} loading={loading}>
            {!loading ? <RefreshCw size={14} /> : null}
            Refresh
          </Button>
          {canManageRoles ? (
            <Button
              size="sm"
              onClick={() => {
                setView("permissions");
                setPendingRoleCreate(true);
              }}
            >
              <Plus size={14} />
              Add role
            </Button>
          ) : null}
          {canCreate && (
            <Button
              size="sm"
              onClick={() => {
                setFormError("");
                setCreateOpen(true);
              }}
            >
              <UserPlus size={14} />
              Create user
            </Button>
          )}
        </div>
      </div>

      <div
        className="mt-5 -mx-3 h-scroll border-b border-white/10 px-3 sm:-mx-5 sm:px-5 md:mx-0 md:px-0"
        role="tablist"
        aria-label="Users sections"
      >
        <ViewTab
          active={view === "directory"}
          icon={Users}
          label="Directory"
          onClick={() => setView("directory")}
        />
        {canManageRoles ? (
          <ViewTab
            active={view === "permissions"}
            icon={ShieldCheck}
            label="Roles"
            shortLabel="Roles"
            onClick={() => setView("permissions")}
          />
        ) : null}
      </div>

      {!isDbConnected() ? (
        <ConnectionNotice className="mt-5" feature="manage team accounts" />
      ) : null}

      {view === "permissions" && canManageRoles ? (
        <CustomRolesPanel
          highlight={actor.role}
          autoOpenCreate={pendingRoleCreate}
          onCreateOpened={clearPendingRoleCreate}
        />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(11rem,12rem)_minmax(8rem,9rem)]">
            <label className="min-w-0">
              <span className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-gold">
                Search
              </span>
              <SearchInput
                placeholder="Search name or email…"
                value={q}
                onChange={setQ}
                aria-label="Search users"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    void load(1);
                  }
                }}
              />
            </label>
            <Select
              label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: "all", label: "All roles" },
                ...USER_ROLES.map((r) => ({ value: r, label: roleLabel(r) })),
                ...customRoles.map((r) => ({ value: r.slug, label: r.label })),
              ]}
            />
            <label className="min-w-0">
              <span className="mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-gold">
                Per page
              </span>
              <NativeSelect
                value={pageSize}
                aria-label="Users per page"
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {[5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>

          <ActiveFiltersBar
            className="mt-3"
            resultCount={total}
            resultNoun="user"
            chips={[
              ...(q.trim()
                ? [
                    {
                      id: "q",
                      label: `“${q.trim()}”`,
                      onRemove: () => {
                        setQ("");
                        setPage(1);
                        void load(1, { q: "" });
                      },
                    },
                  ]
                : []),
              ...(role !== "all"
                ? [
                    {
                      id: "role",
                      label:
                        customRoles.find((r) => r.slug === role)?.label ??
                        roleLabel(role),
                      onRemove: () => {
                        setRole("all");
                        setPage(1);
                      },
                    },
                  ]
                : []),
            ]}
            onClearAll={clearFilters}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {loading
                ? "Loading…"
                : !isDbConnected()
                  ? ""
                : total === 0
                  ? "No users"
                  : `Showing ${from}–${to} of ${total} user${total === 1 ? "" : "s"}`}
            </p>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
          </div>

          <div className="mt-3 border border-white/10">
            <MobileSortBar
              className="border-b border-white/10 p-3 lg:hidden"
              columns={[
                { key: "name", label: "User" },
                { key: "role", label: "Role" },
                { key: "status", label: "Status" },
                { key: "joined", label: "Joined" },
              ]}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className={tableHeadRowClass}>
                    <SortableTh label="User" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Role" column="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Joined" column="joined" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <UserTableRow
                      key={user.id}
                      user={user}
                      actor={actor}
                      actorId={actor.id}
                      assignableRoles={assignableRoles}
                      canAssign={canAssign}
                      onPatch={patch}
                      onEdit={() => {
                        setFormError("");
                        setEditing(user);
                      }}
                      onResetPassword={() => {
                        setFormError("");
                        setResetting(user);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-white/10 lg:hidden">
              {users.map((user) => (
                <li key={user.id} className="p-4">
                  <UserCard
                    user={user}
                    actor={actor}
                    actorId={actor.id}
                    assignableRoles={assignableRoles}
                    canAssign={canAssign}
                    onPatch={patch}
                    onEdit={() => {
                      setFormError("");
                      setEditing(user);
                    }}
                    onResetPassword={() => {
                      setFormError("");
                      setResetting(user);
                    }}
                  />
                </li>
              ))}
            </ul>

            {!loading && users.length === 0 && !error && (
              <div className="px-4 py-14 text-center text-sm text-muted">
                <Users className="mx-auto mb-3 text-gold/70" size={28} />
                No users match these filters.
              </div>
            )}
          </div>

          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} className="mt-6" />
        </>
      )}

      <UserFormModal
        open={createOpen}
        mode="create"
        assignableRoles={assignableRoles}
        actor={actor}
        actorId={actor.id}
        canCustomizePermissions={canCustomizePermissions}
        busy={saving}
        error={formError}
        onClose={() => setCreateOpen(false)}
        onSubmit={createUser}
      />
      <UserFormModal
        open={Boolean(editing)}
        mode="edit"
        assignableRoles={assignableRoles}
        actor={actor}
        actorId={actor.id}
        canCustomizePermissions={canCustomizePermissions}
        initial={editing ?? undefined}
        busy={saving}
        error={formError}
        onClose={() => setEditing(null)}
        onSubmit={saveProfile}
      />
      <ResetPasswordModal
        open={Boolean(resetting)}
        user={resetting}
        busy={saving}
        error={formError}
        onClose={() => setResetting(null)}
        onSubmit={resetPassword}
      />
    </section>
  );
}

function ViewTab({
  active,
  icon: Icon,
  label,
  shortLabel,
  onClick,
}: {
  active: boolean;
  icon: typeof Users;
  label: string;
  shortLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-3 text-sm uppercase tracking-[0.14em] transition-colors sm:px-4 ${
        active ? "border-(--gold) text-cream" : "border-transparent text-muted hover:text-cream"
      }`}
    >
      <Icon size={14} className={active ? "text-gold" : ""} />
      <span className="sm:hidden">{shortLabel ?? label}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function RoleBadge({ user }: { user: ManagedUser }) {
  const custom = hasCustomPermissions(user);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
          ROLE_TONE[user.role] ?? roleTone(user.role)
        }`}
      >
        {roleLabel(user.role)}
      </span>
      {custom ? (
        <span className="inline-flex whitespace-nowrap rounded-full border border-(--gold)/30 bg-(--gold)/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-gold">
          Custom
        </span>
      ) : null}
    </div>
  );
}

function StatusBadge({ user }: { user: ManagedUser }) {
  if (!user.active) {
    return (
      <span className="inline-flex rounded-full border border-(--danger)/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-(--danger)">
        Inactive
      </span>
    );
  }
  if (!user.hasPassword) {
    return (
      <span className="inline-flex rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">
        Guest
      </span>
    );
  }
  return (
    <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-200">
      Active
    </span>
  );
}

function UserActions({
  user,
  actor,
  actorId,
  assignableRoles,
  canAssign,
  onPatch,
  onEdit,
  onResetPassword,
  compact = false,
}: {
  user: ManagedUser;
  actor: UserProfile;
  actorId: string;
  assignableRoles: string[];
  canAssign: boolean;
  onPatch: (input: Parameters<typeof apiPatchUser>[0]) => void;
  onEdit: () => void;
  onResetPassword: () => void;
  compact?: boolean;
}) {
  const canEdit = canEditUser(actor, user.role);
  const canReset = canResetPassword(actor, user.role);
  const showRoleSelect =
    !compact && user.id !== actorId && canAssign && canAssignRole(actor, user.role);
  const showAccessToggle =
    user.id !== actorId &&
    canDeactivateUser(actor, user.role) &&
    (!isDemoAccountEmail(user.email) || !user.active);

  if (!canEdit && !canReset && !showRoleSelect && !showAccessToggle) {
    return <span className="text-xs text-muted">View only</span>;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        compact
          ? "flex-nowrap justify-end"
          : "w-full flex-col sm:w-auto sm:flex-row sm:flex-wrap sm:justify-start",
      )}
    >
      {showRoleSelect && (
        <Select
          value={user.role}
          onChange={(value) => void onPatch({ userId: user.id, role: value })}
          options={assignableRoles.map((r) => ({
            value: r,
            label: roleLabel(r),
          }))}
          className={cn(
            "shrink-0",
            compact
              ? "w-32 [&_button]:h-8 [&_button]:py-0 [&_button]:text-xs"
              : "w-full sm:w-36 [&_button]:min-h-10",
          )}
        />
      )}
      {showAccessToggle && (
        <Button
          size="sm"
          variant="secondary"
          className={cn("shrink-0 px-2.5", compact ? "h-8" : "min-h-10 w-full sm:w-auto")}
          onClick={() => void onPatch({ userId: user.id, active: !user.active })}
        >
          {user.active ? "Deactivate" : "Activate"}
        </Button>
      )}
      {canReset && (
        <Button
          size="sm"
          variant="secondary"
          className={cn("shrink-0 px-2.5", compact ? "h-8" : "min-h-10 w-full sm:w-auto")}
          onClick={onResetPassword}
        >
          <KeyRound size={13} />
          Reset
        </Button>
      )}
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          className={cn("shrink-0 px-2.5", compact ? "h-8" : "min-h-10 w-full sm:w-auto")}
          onClick={onEdit}
        >
          <Pencil size={13} />
          Edit
        </Button>
      )}
    </div>
  );
}

function UserTableRow({
  user,
  actor,
  actorId,
  assignableRoles,
  canAssign,
  onPatch,
  onEdit,
  onResetPassword,
}: {
  user: ManagedUser;
  actor: UserProfile;
  actorId: string;
  assignableRoles: string[];
  canAssign: boolean;
  onPatch: (input: Parameters<typeof apiPatchUser>[0]) => void;
  onEdit: () => void;
  onResetPassword: () => void;
}) {
  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
      <td className="px-4 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={user.name} src={user.avatarUrl} size={36} />
          <div className="min-w-0">
            <p className="truncate font-medium text-cream">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <RoleBadge user={user} />
      </td>
      <td className="px-4 py-3 align-middle">
        <StatusBadge user={user} />
      </td>
      <td className="px-4 py-3 align-middle text-xs text-muted">
        <p className="whitespace-nowrap">{format(new Date(user.createdAt), "MMM d, yyyy")}</p>
        <p className="mt-0.5 whitespace-nowrap text-[11px] text-white/40">
          {user.orderCount} order{user.orderCount === 1 ? "" : "s"} ·{" "}
          {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
        </p>
      </td>
      <td className="px-4 py-3 align-middle">
        <UserActions
          user={user}
          actor={actor}
          actorId={actorId}
          assignableRoles={assignableRoles}
          canAssign={canAssign}
          onPatch={onPatch}
          onEdit={onEdit}
          onResetPassword={onResetPassword}
          compact
        />
      </td>
    </tr>
  );
}

function UserCard({
  user,
  actor,
  actorId,
  assignableRoles,
  canAssign,
  onPatch,
  onEdit,
  onResetPassword,
}: {
  user: ManagedUser;
  actor: UserProfile;
  actorId: string;
  assignableRoles: string[];
  canAssign: boolean;
  onPatch: (input: Parameters<typeof apiPatchUser>[0]) => void;
  onEdit: () => void;
  onResetPassword: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <UserAvatar name={user.name} src={user.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-cream">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RoleBadge user={user} />
            <StatusBadge user={user} />
          </div>
          <p className="mt-2 text-[11px] text-white/45">
            {user.orderCount} order{user.orderCount === 1 ? "" : "s"} · joined{" "}
            {format(new Date(user.createdAt), "MMM d, yyyy")}
          </p>
        </div>
      </div>
      <UserActions
        user={user}
        actor={actor}
        actorId={actorId}
        assignableRoles={assignableRoles}
        canAssign={canAssign}
        onPatch={onPatch}
        onEdit={onEdit}
        onResetPassword={onResetPassword}
      />
    </div>
  );
}

function ResetPasswordModal({
  open,
  user,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  user: ManagedUser | null;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void> | void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setLocalError("");
  }, [open, user?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    setLocalError("");
    await onSubmit(password);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset password"
      subtitle={user ? `Set a new sign-in password for ${user.name}.` : undefined}
      className="sm:max-w-md"
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs text-muted">
          New password
          <PasswordInput
            className="mt-1"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
        </label>
        <label className="block text-xs text-muted">
          Confirm password
          <PasswordInput
            className="mt-1"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat the new password"
            minLength={8}
            required
          />
        </label>
        <p className="text-[12px] text-muted">Must include a letter and a number.</p>
        {localError || error ? <p className="text-sm text-red-300">{localError || error}</p> : null}
        <div className="modal-actions border-t border-white/10 pt-4">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" className="w-full sm:w-auto" loading={busy} disabled={!user}>
            {busy ? "Saving…" : "Reset password"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
