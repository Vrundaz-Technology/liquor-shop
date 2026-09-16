import { hydrateRuntimeData } from "@/lib/runtime-data";

const CONNECTION_ERROR_PATTERNS = [
  /database is not configured/i,
  /unable to reach the server/i,
  /connect mysql/i,
  /connect postgresql/i,
  /connect the database/i,
  /failed to fetch/i,
  /networkerror/i,
  /bootstrap failed/i,
];

export function isConnectionError(message: string) {
  return CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** User-safe message — never mention MySQL/PostgreSQL or internal setup. */
export function sanitizeApiError(message: string) {
  if (isConnectionError(message)) {
    return SERVER_UNAVAILABLE_MESSAGE;
  }
  return message;
}

export const SERVER_UNAVAILABLE_MESSAGE =
  "Unable to reach the server. Check your connection and try again.";

export async function recheckServerConnection() {
  try {
    const res = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    hydrateRuntimeData({
      products: data.products,
      locations: data.locations,
      categories: data.categories,
      events: data.events,
      reviews: data.reviews,
      dbConnected: data.dbConnected,
    });
    return Boolean(data.dbConnected);
  } catch {
    return false;
  }
}
