"use client";

import { useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { recheckServerConnection } from "@/lib/connection-messages";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Props = {
  /** Short hint about what needs the server, e.g. "manage team accounts". */
  feature?: string;
  /** When true, explain that local preview data is still visible. */
  preview?: boolean;
  className?: string;
  onConnected?: () => void;
};

export function ConnectionNotice({ feature, preview = false, className, onConnected }: Props) {
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);

  const checkConnection = async () => {
    setChecking(true);
    setStillOffline(false);
    try {
      const connected = await recheckServerConnection();
      if (connected) {
        onConnected?.();
        window.location.reload();
        return;
      }
      setStillOffline(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-sm border border-white/10 bg-white/[0.03] p-4 sm:flex sm:items-start sm:justify-between sm:gap-4",
        className,
      )}
      role="status"
    >
      <div className="flex gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-gold">
          <WifiOff size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-cream">Server connection unavailable</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {preview
              ? "You can still browse preview data here. Changes will not sync until the connection is restored."
              : feature
                ? `Unable to ${feature} right now. Check your connection or try again in a moment.`
                : "Check your connection or try again in a moment."}
          </p>
          {stillOffline ? (
            <p className="mt-2 text-xs text-muted">Still offline. Verify the server is running, then try again.</p>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-3 w-full shrink-0 sm:mt-0 sm:w-auto"
        loading={checking}
        onClick={() => void checkConnection()}
      >
        {!checking ? <RefreshCw size={14} /> : null}
        {checking ? "Checking…" : "Check connection"}
      </Button>
    </div>
  );
}
