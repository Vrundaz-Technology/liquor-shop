type ShipdayInsertInput = {
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  customerPhoneNumber: string;
  customerEmail?: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhoneNumber?: string;
  orderItem?: { name: string; quantity: number; unitPrice: number }[];
  totalCost?: number;
  deliveryFee?: number;
  paymentMethod?: "cash" | "credit_card";
  deliveryInstruction?: string;
  pickupInstruction?: string;
  expectedPickupTime?: string;
};

type ShipdayInsertResult = {
  success: boolean;
  orderId?: number | string;
  response?: string;
};

const API_ROOT = "https://api.shipday.com";

function authHeaders(apiKey: string) {
  return {
    Authorization: `Basic ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function shipdayInsertOrder(
  apiKey: string,
  body: ShipdayInsertInput,
): Promise<{ ok: true; orderId: string; raw: unknown } | { ok: false; error: string; raw: unknown }> {
  const res = await fetch(`${API_ROOT}/orders`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const raw = await readJson(res);
  if (!res.ok) {
    const message =
      raw && typeof raw === "object" && "message" in raw
        ? String((raw as { message: unknown }).message)
        : `Shipday insert failed (${res.status})`;
    return { ok: false, error: message, raw };
  }
  const parsed = raw as ShipdayInsertResult | null;
  const orderId = parsed?.orderId != null ? String(parsed.orderId) : "";
  if (!orderId) {
    return { ok: false, error: "Shipday did not return an order id.", raw };
  }
  return { ok: true, orderId, raw };
}

export async function shipdayUpdateStatus(apiKey: string, shipdayOrderId: string, status: string) {
  const res = await fetch(`${API_ROOT}/orders/${encodeURIComponent(shipdayOrderId)}/status`, {
    method: "PUT",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ status }),
    cache: "no-store",
  });
  const raw = await readJson(res);
  if (!res.ok) {
    return { ok: false as const, error: `Shipday status update failed (${res.status})`, raw };
  }
  return { ok: true as const, raw };
}

export async function shipdayCancelOrder(apiKey: string, shipdayOrderId: string) {
  const incomplete = await shipdayUpdateStatus(apiKey, shipdayOrderId, "INCOMPLETE");
  if (incomplete.ok) return incomplete;
  const res = await fetch(`${API_ROOT}/orders/${encodeURIComponent(shipdayOrderId)}`, {
    method: "DELETE",
    headers: authHeaders(apiKey),
    cache: "no-store",
  });
  const raw = await readJson(res);
  if (!res.ok) {
    return { ok: false as const, error: incomplete.error, raw };
  }
  return { ok: true as const, raw };
}
