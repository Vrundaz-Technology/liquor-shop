"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { fileToJpegBlob } from "@/lib/image-file";
import { getClientAccessToken } from "@/lib/auth/client-token";
import { cn } from "@/lib/utils";
import type { SupportAttachment } from "@/types";

const MAX_FILES = 5;
const MAX_IMAGE_SOURCE = 8 * 1024 * 1024;
const MAX_PDF = 6 * 1024 * 1024;

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function uploadSupportAttachment(file: File): Promise<SupportAttachment> {
  const pdf = isPdfFile(file);
  if (!pdf && !file.type.startsWith("image/")) {
    throw new Error("Use a photo (JPG, PNG, WebP) or a PDF.");
  }
  if (pdf && file.size > MAX_PDF) throw new Error("PDF must be under 6 MB.");
  if (!pdf && file.size > MAX_IMAGE_SOURCE) throw new Error("Photo must be under 8 MB.");

  const body = new FormData();
  if (pdf) {
    body.append("file", file, file.name);
  } else {
    const blob = await fileToJpegBlob(file);
    body.append("file", blob, file.name.replace(/\.[^.]+$/, ".jpg") || "photo.jpg");
  }
  body.append("purpose", "support");

  const headers: HeadersInit = {};
  const bearer = getClientAccessToken();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch("/api/uploads", {
    method: "POST",
    credentials: "same-origin",
    headers,
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    name?: string;
    type?: string;
    size?: number;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error || "Could not upload that file.");
  }
  return {
    url: data.url,
    name: file.name || data.name || "Attachment",
    type: data.type || (pdf ? "application/pdf" : "image/jpeg"),
    size: data.size ?? file.size,
  };
}

export function SupportAttachmentList({
  attachments,
  className,
}: {
  attachments?: SupportAttachment[];
  className?: string;
}) {
  if (!attachments?.length) return null;
  return (
    <ul className={cn("mt-3 flex flex-wrap gap-2", className)}>
      {attachments.map((file) => {
        const image = file.type.startsWith("image/");
        return (
          <li key={file.url}>
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-sm border border-white/10 bg-black/30"
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt={file.name} className="h-20 w-20 object-cover" />
              ) : (
                <span className="flex h-20 w-36 items-center gap-2 px-3 text-xs text-cream">
                  <FileText size={14} className="shrink-0 text-gold" />
                  <span className="min-w-0 truncate">{file.name}</span>
                </span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function SupportAttachmentField({
  value,
  onChange,
  disabled,
  label = "Attachments",
}: {
  value: SupportAttachment[];
  onChange: (next: SupportAttachment[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return;
    const remaining = MAX_FILES - value.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const uploaded: SupportAttachment[] = [];
      for (const file of Array.from(files).slice(0, remaining)) {
        uploaded.push(await uploadSupportAttachment(file));
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that file.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{label}</p>
        <button
          type="button"
          disabled={disabled || busy || value.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-white/10 px-2.5 text-xs text-cream hover:border-white/20 disabled:opacity-50"
        >
          <Paperclip size={13} />
          {busy ? "Uploading…" : "Add photo or PDF"}
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Receipts, damaged bottles, or delivery photos. JPG, PNG, WebP, or PDF · up to 5 files.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        hidden
        onChange={(event) => void addFiles(event.target.files)}
      />
      {value.length ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((file) => (
            <li
              key={file.url}
              className="relative overflow-hidden rounded-sm border border-white/10 bg-black/30"
            >
              {file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt="" className="h-16 w-16 object-cover" />
              ) : (
                <span className="flex h-16 w-32 items-center gap-1.5 px-2 text-[11px] text-cream">
                  <FileText size={13} className="text-gold" />
                  <span className="min-w-0 truncate">{file.name}</span>
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="absolute right-0.5 top-0.5 rounded-sm bg-black/70 p-0.5 text-cream"
                onClick={() => onChange(value.filter((item) => item.url !== file.url))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
