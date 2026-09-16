"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Button } from "@/components/ui/Button";
import { fileToJpegBlob } from "@/lib/image-file";
import { getClientAccessToken } from "@/lib/auth/client-token";
import { cn } from "@/lib/utils";

const MAX_SOURCE_BYTES = 6 * 1024 * 1024;

type Props = {
  name: string;
  value?: string;
  onChange: (value: string) => void;
  layout?: "horizontal" | "stacked" | "responsive";
  /** When set, persists immediately after a successful upload/remove. */
  onPersist?: (value: string) => Promise<void>;
};

async function uploadAvatarFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image must be under 6 MB.");
  }
  const blob = await fileToJpegBlob(file, 512, 0.86);
  const body = new FormData();
  body.append("file", blob, "avatar.jpg");
  const headers: HeadersInit = {};
  const bearer = getClientAccessToken();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch("/api/uploads", {
    method: "POST",
    credentials: "same-origin",
    headers,
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Could not upload that image.");
  }
  return data.url;
}

export function AvatarUpload({
  name,
  value,
  onChange,
  layout = "horizontal",
  onPersist,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const applyValue = async (next: string) => {
    onChange(next);
    if (onPersist) {
      await onPersist(next);
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const url = await uploadAvatarFile(file);
      await applyValue(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setBusy(true);
    setError("");
    try {
      await applyValue("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo.");
    } finally {
      setBusy(false);
    }
  };

  const avatarSize = layout === "horizontal" ? 88 : layout === "responsive" ? 96 : 112;
  const isCentered = layout === "stacked" || layout === "responsive";

  return (
    <div
      className={cn(
        "flex gap-4",
        layout === "horizontal" && "items-center",
        layout === "stacked" && "flex-col items-center",
        layout === "responsive" &&
          "flex-row items-center text-left lg:flex-col lg:items-center",
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => void onPick(e.target.files?.[0])}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "group relative shrink-0 rounded-full transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)",
          "disabled:opacity-60",
        )}
        aria-label={value ? "Change profile photo" : "Add profile photo"}
      >
        <UserAvatar
          name={name || "New user"}
          src={value}
          size={avatarSize}
          className="ring-1 ring-white/15 transition group-hover:ring-(--gold)/40"
        />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border border-white/15 bg-[#12110f] text-gold shadow-sm transition group-hover:border-(--gold)/45 group-hover:bg-(--gold)/15",
            layout === "responsive" ? "h-8 w-8" : "h-8 w-8",
          )}
        >
          <Camera size={14} aria-hidden />
        </span>
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[10px] uppercase tracking-[0.14em] text-cream">
            …
          </span>
        ) : null}
      </button>

      <div
        className={cn(
          "min-w-0",
          layout === "horizontal" && "flex-1",
          layout === "stacked" && "w-full",
          layout === "responsive" && "flex-1 lg:mt-3 lg:w-full lg:flex-none",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            isCentered && "lg:justify-center",
            layout === "stacked" && "justify-center",
          )}
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {value ? (
              <>
                <ImagePlus size={14} aria-hidden />
                {busy ? "Uploading…" : "Replace"}
              </>
            ) : (
              <>
                <Camera size={14} aria-hidden />
                {busy ? "Uploading…" : "Add photo"}
              </>
            )}
          </Button>
          {value ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void onRemove()}
              className="text-muted hover:text-red-300"
            >
              <Trash2 size={14} aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>
        {error ? (
          <p
            className={cn(
              "mt-2 text-xs text-red-300",
              (layout === "stacked" || layout === "responsive") && "lg:text-center",
              layout === "stacked" && "text-center",
            )}
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
