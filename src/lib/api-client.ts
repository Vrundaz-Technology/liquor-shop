import {
  clearClientAccessToken,
  getClientAccessToken,
  setClientAccessToken,
} from "@/lib/auth/client-token";
import { sanitizeApiError } from "@/lib/connection-messages";
import type { UserProfile } from "@/types";

type AuthTokenResponse = {
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number;
  user?: UserProfile;
};

let refreshInFlight: Promise<{ ok: boolean; user?: UserProfile }> | null = null;

/** Mint a new access token from the httpOnly refresh cookie. */
export async function refreshSession(): Promise<{ accessToken: string; user?: UserProfile } | null> {
  if (refreshInFlight) {
    const result = await refreshInFlight;
    if (!result.ok) return null;
    const token = getClientAccessToken();
    return token ? { accessToken: token, user: result.user } : null;
  }
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) {
        clearClientAccessToken();
        return { ok: false };
      }
      const data = (await res.json()) as AuthTokenResponse;
      if (typeof data.accessToken === "string" && data.accessToken) {
        setClientAccessToken(data.accessToken);
        return { ok: true, user: data.user };
      }
      return { ok: false };
    } catch {
      clearClientAccessToken();
      return { ok: false };
    } finally {
      refreshInFlight = null;
    }
  })();
  const result = await refreshInFlight;
  if (!result.ok) return null;
  const token = getClientAccessToken();
  return token ? { accessToken: token, user: result.user } : null;
}

async function tryRefreshAccessToken(): Promise<boolean> {
  const refreshed = await refreshSession();
  return Boolean(refreshed);
}

function isAuthPublicPath(path: string) {
  return (
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/signup") ||
    path.startsWith("/api/auth/refresh") ||
    path.startsWith("/api/auth/logout")
  );
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const run = async (allowRefresh: boolean): Promise<T> => {
    const headers = new Headers(init?.headers);
    if (
      !headers.has("Content-Type") &&
      !(init?.body instanceof FormData) &&
      init?.body != null
    ) {
      headers.set("Content-Type", "application/json");
    }
    const bearer = getClientAccessToken();
    if (bearer && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${bearer}`);
    }

    const res = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers,
    });

    if (res.status === 401 && allowRefresh && !isAuthPublicPath(path)) {
      const refreshed = await tryRefreshAccessToken();
      if (refreshed) return run(false);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const raw =
        typeof data.error === "string" ? data.error : `Request failed: ${res.status}`;
      throw new Error(sanitizeApiError(raw));
    }

    if (typeof data.accessToken === "string" && data.accessToken) {
      setClientAccessToken(data.accessToken);
    }

    return data as T;
  };

  return run(true);
}

/** Authenticated download for CSV/Excel (and other binary) responses. */
export async function apiFetchBlob(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; filename: string | null; contentType: string | null }> {
  const run = async (
    allowRefresh: boolean,
  ): Promise<{ blob: Blob; filename: string | null; contentType: string | null }> => {
    const headers = new Headers(init?.headers);
    const bearer = getClientAccessToken();
    if (bearer && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${bearer}`);
    }

    const res = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers,
    });

    if (res.status === 401 && allowRefresh && !isAuthPublicPath(path)) {
      const refreshed = await tryRefreshAccessToken();
      if (refreshed) return run(false);
    }

    const contentType = res.headers.get("content-type");

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const raw =
        typeof data.error === "string" ? data.error : `Request failed: ${res.status}`;
      throw new Error(sanitizeApiError(raw));
    }

    if (contentType?.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      const raw =
        typeof data.error === "string" ? data.error : "Export returned an unexpected response.";
      throw new Error(sanitizeApiError(raw));
    }

    const disposition = res.headers.get("content-disposition") || "";
    const match =
      /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(disposition);
    const rawName = match?.[1] || match?.[2] || match?.[3] || null;
    const filename = rawName ? decodeURIComponent(rawName.trim()) : null;
    const blob = await res.blob();
    if (!blob.size) {
      throw new Error("Export file was empty.");
    }

    return { blob, filename, contentType };
  };

  return run(true);
}

/** Trigger a real browser file save without cancelling the blob URL too early. */
export function triggerBrowserDownload(blob: Blob, filename: string, mime?: string) {
  const typed =
    mime && (!blob.type || blob.type === "application/octet-stream")
      ? new Blob([blob], { type: mime })
      : blob;
  const url = URL.createObjectURL(typed);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 4000);
}
