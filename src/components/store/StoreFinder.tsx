"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Store, Truck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useBranchStore } from "@/store/branch";
import { useUserStore } from "@/store/user";
import { switchShoppingStore } from "@/lib/switch-store";
import { cn } from "@/lib/utils";

type NearbyRow = {
  id: string;
  shortName: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  miles: number;
  milesLabel: string;
  canDeliver: boolean;
  canPickup: boolean;
  deliveryEta: { min: number; max: number; label: string } | null;
  deliveryFee: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelected?: (storeId: string) => void;
};

function resolveSavedZip(customerZip: string, addresses: { zip?: string; isDefault?: boolean }[]) {
  const fromStore = customerZip.trim();
  if (/^\d{5}/.test(fromStore)) return fromStore.slice(0, 5);
  const preferred =
    addresses.find((a) => a.isDefault && a.zip)?.zip ??
    addresses.find((a) => a.zip)?.zip ??
    "";
  const clean = preferred.trim();
  return /^\d{5}/.test(clean) ? clean.slice(0, 5) : "";
}

export function StoreFinder({ open, onClose, onSelected }: Props) {
  const branchId = useBranchStore((s) => s.branchId);
  const customerZip = useBranchStore((s) => s.customerZip);
  const setCustomerLocation = useBranchStore((s) => s.setCustomerLocation);
  const setPreferredBranch = useUserStore((s) => s.setPreferredBranch);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const addresses = useUserStore((s) => s.profile.addresses ?? []);

  const [zip, setZip] = useState(customerZip || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [stores, setStores] = useState<NearbyRow[]>([]);
  const autoSearchedFor = useRef<string | null>(null);

  const runSearch = useCallback(
    async (rawZip: string) => {
      const clean = rawZip.trim();
      if (!/^\d{5}(-\d{4})?$/.test(clean)) {
        setError("Enter a valid 5-digit ZIP code.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const res = await fetch(
          `/api/locations/nearby?zip=${encodeURIComponent(clean.slice(0, 5))}`,
        );
        const data = (await res.json()) as {
          error?: string;
          point?: { lat?: number; lng?: number; label?: string } | null;
          stores?: NearbyRow[];
        };
        if (!res.ok) throw new Error(data.error || "Could not find stores.");
        setCustomerLocation({
          zip: clean.slice(0, 5),
          lat: data.point?.lat ?? null,
          lng: data.point?.lng ?? null,
        });
        setLabel(data.point?.label || clean.slice(0, 5));
        setStores(data.stores ?? []);
        if (!(data.stores ?? []).length) {
          setError("No stores deliver or offer pickup near that ZIP yet.");
        }
      } catch (err) {
        setStores([]);
        setError(err instanceof Error ? err.message : "Could not find stores.");
      } finally {
        setBusy(false);
      }
    },
    [setCustomerLocation],
  );

  useEffect(() => {
    if (!open) {
      autoSearchedFor.current = null;
      return;
    }
    const saved = resolveSavedZip(customerZip || "", addresses);
    setZip(saved || customerZip || "");
    if (!saved || autoSearchedFor.current === saved) return;
    autoSearchedFor.current = saved;
    void runSearch(saved);
  }, [open, customerZip, addresses, runSearch]);

  const search = async (event?: FormEvent) => {
    event?.preventDefault();
    await runSearch(zip);
  };

  const choose = (id: string) => {
    switchShoppingStore(id);
    if (isLoggedIn) setPreferredBranch(id);
    onSelected?.(id);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Find your store">
      <p className="text-sm text-muted">
        Enter your ZIP to see nearby Sam&apos;s locations, distance, and delivery windows.
        Product availability follows the store you pick.
      </p>

      <form onSubmit={(e) => void search(e)} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="block min-w-0 flex-1 text-xs text-muted">
          ZIP code
          <Input
            className="mt-1.5"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="e.g. 10013"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
        </label>
        <Button type="submit" className="sm:mt-6 sm:self-start" loading={busy}>
          <Navigation size={14} aria-hidden />
          Find stores
        </Button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {busy && !stores.length ? (
        <p className="mt-4 text-sm text-muted">Searching nearby stores…</p>
      ) : null}
      {label && stores.length > 0 ? (
        <p className="mt-4 text-xs uppercase tracking-[0.16em] text-gold">
          Near {label}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {stores.map((row) => {
          const active = row.id === branchId;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => choose(row.id)}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-sm border px-3 py-3 text-left transition sm:flex-row sm:items-center sm:justify-between",
                  active
                    ? "border-(--gold)/45 bg-(--gold)/10"
                    : "border-white/10 hover:border-white/25",
                )}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-cream">
                    <Store size={14} className="shrink-0 text-gold" aria-hidden />
                    {row.shortName}
                    <span className="text-xs font-normal text-muted">· {row.milesLabel}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {row.address}, {row.city} {row.zip}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {row.canDeliver && row.deliveryEta ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-(--gold)/25 bg-(--gold)/10 px-2 py-1 text-gold">
                        <Truck size={12} aria-hidden />
                        Delivery {row.deliveryEta.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-white/10 px-2 py-1 text-muted">
                        Delivery unavailable
                      </span>
                    )}
                    {row.canPickup ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-white/10 px-2 py-1 text-muted">
                        <MapPin size={12} aria-hidden />
                        Pickup
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-gold">
                  {active ? "Selected" : "Shop here"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
