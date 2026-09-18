"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { apiFetchShipdaySettings, apiSaveShipdaySettings } from "@/lib/api-mutations";
import { useServerConnection } from "@/hooks/useServerConnection";
import { cn } from "@/lib/utils";

function StatusPill({
  ok,
  okLabel,
  warnLabel,
}: {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        ok
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
          : "border-amber-400/35 bg-amber-400/10 text-amber-100",
      )}
    >
      {ok ? <ShieldCheck size={12} aria-hidden /> : <ShieldAlert size={12} aria-hidden />}
      {ok ? okLabel : warnLabel}
    </span>
  );
}

export function ShipdaySettingsCard() {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [masked, setMasked] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [webhookSet, setWebhookSet] = useState(false);
  const [source, setSource] = useState("none");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const { ready: dbReady } = useServerConnection();
  const canSave = Boolean(apiKey.trim() || webhookSecret.trim());
  const localWebhook =
    webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1");

  const load = useCallback(async () => {
    if (!dbReady) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetchShipdaySettings();
      setMasked(data.apiKeyMasked);
      setConfigured(data.configured);
      setWebhookSet(data.webhookSecretSet);
      setWebhookUrl(data.webhookUrl);
      setSource(data.apiKeySource);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Shipday settings.");
    } finally {
      setLoading(false);
    }
  }, [dbReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const payload: { apiKey?: string; webhookSecret?: string } = {};
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
      const data = await apiSaveShipdaySettings(payload);
      setMasked(data.apiKeyMasked);
      setConfigured(data.configured);
      setWebhookSet(data.webhookSecretSet);
      setWebhookUrl(data.webhookUrl);
      setApiKey("");
      setWebhookSecret("");
      setSaved("Credentials saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Shipday settings.");
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy webhook URL.");
    }
  };

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="rounded-sm border border-white/10 bg-black/20"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-gold" aria-hidden />
            <h3 className="font-display text-lg text-cream">Shipday</h3>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">
            One organization key for third-party courier dispatch. Status comes back on the webhook.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill ok={configured} okLabel="Connected" warnLabel="Not connected" />
          <StatusPill ok={webhookSet} okLabel="Webhook ready" warnLabel="Webhook secret missing" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-4 sm:p-5" aria-busy aria-live="polite">
          <div className="h-11 animate-pulse rounded-sm bg-white/5" />
          <div className="h-11 animate-pulse rounded-sm bg-white/5" />
          <p className="text-sm text-muted">Loading Shipday account…</p>
        </div>
      ) : (
        <div className="space-y-5 p-4 sm:p-5">
          {configured ? (
            <p className="text-xs text-muted">
              Using {source === "env" ? "the environment key" : "the saved organization key"}
              {masked ? ` (${masked})` : ""}. Leave a field blank to keep the current value.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Paste the API key from Shipday to send orders. DoorDash and Uber are not connected here.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="text-xs uppercase tracking-[0.14em] text-muted">API key</span>
              <PasswordInput
                className="mt-1.5"
                value={apiKey}
                autoComplete="off"
                placeholder={masked ? `${masked} — leave blank to keep` : "Paste API key"}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
            <label className="block min-w-0">
              <span className="text-xs uppercase tracking-[0.14em] text-muted">Webhook secret</span>
              <PasswordInput
                className="mt-1.5"
                value={webhookSecret}
                autoComplete="off"
                placeholder={webhookSet ? "Stored — leave blank to keep" : "Same token as in Shipday"}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </label>
          </div>

          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted">
              <Link2 size={12} aria-hidden />
              Webhook URL
            </p>
            <div className="mt-1.5 flex gap-2">
              <input
                readOnly
                value={webhookUrl}
                aria-label="Shipday webhook URL"
                className="h-11 min-w-0 flex-1 truncate rounded-sm border border-white/10 bg-white/5 px-3 font-mono text-xs text-cream"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-11 shrink-0 px-3"
                onClick={() => void copyUrl()}
                aria-label={copied ? "Webhook URL copied" : "Copy webhook URL"}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Paste this into the Shipday dashboard under webhooks.
              {localWebhook
                ? " Localhost only works on this machine — use a public HTTPS URL in production."
                : null}
            </p>
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {saved ? <p className="text-sm text-emerald-300">{saved}</p> : null}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
            <Button type="submit" size="sm" loading={busy} disabled={!dbReady || !canSave}>
              Save credentials
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
