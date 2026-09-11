"use client";

import { accessibleLocations, hasAllLocationAccess } from "@/lib/auth/location-access";
import { getAllLocations } from "@/data/locations";
import type { UserProfile } from "@/types";

type Props = {
  actor: UserProfile;
  role: string;
  value: string[] | null;
  onChange: (ids: string[] | null) => void;
  locked?: boolean;
};

export function LocationAccessFields({ actor, role, value, onChange, locked }: Props) {
  if (role === "owner" || role === "customer") {
    return (
      <div className="rounded-sm border border-white/10 bg-white/[0.02] px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Store access</p>
        <p className="mt-1.5 text-xs text-muted">
          {role === "owner"
            ? "Owners can operate every store."
            : "Customers do not get store operations access."}
        </p>
      </div>
    );
  }

  const stores = accessibleLocations(actor, getAllLocations());
  const assignableIds = stores.map((store) => store.id);
  const selected = new Set(value ?? []);
  const actorIsOrgWide = hasAllLocationAccess(actor);
  const all =
    value == null ||
    value.length === 0 ||
    (assignableIds.length > 0 &&
      assignableIds.every((id) => selected.has(id)) &&
      selected.size === assignableIds.length);

  return (
    <div className="space-y-3 rounded-sm border border-white/10 bg-white/[0.02] px-4 py-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-gold">Store access</p>
        <p className="mt-1 text-[12px] leading-5 text-muted">
          Limit this person to specific stores for inventory, events, and analytics.
          {actorIsOrgWide
            ? " All stores is the default."
            : " You can only assign stores you can access."}
        </p>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm text-cream">
        <input
          type="checkbox"
          className="h-5 w-5 accent-(--gold)"
          checked={all}
          disabled={locked || stores.length === 0}
          onChange={(event) => {
            if (event.target.checked) {
              onChange(actorIsOrgWide ? null : assignableIds);
              return;
            }
            onChange(assignableIds.slice(0, 1));
          }}
        />
        <span>
          All stores
          {!actorIsOrgWide ? (
            <span className="ml-2 text-[11px] text-muted">(only stores you can assign)</span>
          ) : null}
        </span>
      </label>
      {!all ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {stores.map((store) => (
            <li key={store.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-sm border border-white/5 bg-black/20 px-3 text-sm text-cream">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-(--gold)"
                  checked={selected.has(store.id)}
                  disabled={locked}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(store.id)) next.delete(store.id);
                    else next.add(store.id);
                    const ids = assignableIds.filter((id) => next.has(id));
                    if (ids.length === 0) {
                      onChange(assignableIds.slice(0, 1));
                      return;
                    }
                    if (ids.length === assignableIds.length) {
                      onChange(actorIsOrgWide ? null : assignableIds);
                      return;
                    }
                    onChange(ids);
                  }}
                />
                {store.shortName}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
