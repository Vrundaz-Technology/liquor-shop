"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useUserStore } from "@/store/user";

type Props = {
  productId: string;
  productName: string;
  locationId?: string;
  price?: number;
  className?: string;
};

export function ProductAlertButtons({
  productId,
  locationId,
  price,
  className,
}: Props) {
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isLoggedIn) return null;

  const subscribe = async (kind: "back_in_stock" | "price") => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "subscribe",
          kind,
          productId,
          locationId: locationId ?? null,
          targetPrice: kind === "price" ? price ?? null : null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Could not save alert.");
        return;
      }
      setMsg(
        kind === "back_in_stock"
          ? "We’ll email you when this is back in stock."
          : "Price alert saved.",
      );
    } catch {
      setMsg("Could not save alert.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => void subscribe("back_in_stock")}
        >
          <Bell size={13} />
          Back in stock
        </Button>
        {price != null ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => void subscribe("price")}
          >
            <Bell size={13} />
            Price alert
          </Button>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-xs text-gold">{msg}</p> : null}
    </div>
  );
}
