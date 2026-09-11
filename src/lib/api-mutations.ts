import { apiFetch } from "@/lib/api-client";
import type { ActivityLogEntry, ManagedUser, Order, Product, UserProfile } from "@/types";
import type { NewBottleInput } from "@/types";
import { withActor } from "@/lib/current-actor";
import { clearClientAccessToken } from "@/lib/auth/client-token";

type InventorySnapshot = {
  stocks: Record<string, number>;
  seats: Record<string, number>;
  hidden?: Record<string, boolean>;
  reserved?: Record<string, number>;
};

export async function apiSetInventory(
  locationId: string,
  productId: string,
  quantity: number,
  reason = "adjustment",
) {
  await apiFetch("/api/inventory", {
    method: "PATCH",
    body: JSON.stringify(
      withActor({
        action: "set",
        locationId,
        productId,
        quantity,
        reason,
      }),
    ),
  });
}

export async function apiSetLocationPricing(
  locationId: string,
  productId: string,
  prices: {
    basePrice?: number | null;
    salePrice?: number | null;
    costPrice?: number | null;
    promoPrice?: number | null;
  },
) {
  await apiFetch("/api/inventory", {
    method: "PATCH",
    body: JSON.stringify(
      withActor({
        action: "pricing",
        locationId,
        productId,
        ...prices,
      }),
    ),
  });
}

export async function apiSetProductVisibility(
  locationId: string,
  productId: string,
  hidden: boolean,
) {
  return apiFetch<{ ok: true; hidden: boolean; inventory?: InventorySnapshot }>("/api/inventory", {
    method: "PATCH",
    body: JSON.stringify(
      withActor({
        action: "visibility",
        locationId,
        productId,
        hidden,
      }),
    ),
  });
}

export async function apiAdjustInventory(
  locationId: string,
  productId: string,
  delta: number,
  reason = "adjustment",
  orderId?: string,
) {
  await apiFetch("/api/inventory", {
    method: "PATCH",
    body: JSON.stringify(
      withActor({
        action: "adjust",
        locationId,
        productId,
        delta,
        reason,
        orderId,
      }),
    ),
  });
}

export async function apiResetInventory(locationId?: string) {
  const res = await apiFetch("/api/inventory", {
    method: "PATCH",
    body: JSON.stringify(withActor({ action: "reset", locationId })),
  });
  return res as { inventory: InventorySnapshot };
}

export async function apiBookSeats(eventId: string, qty: number) {
  return apiFetch<{ ok: true; inventory?: InventorySnapshot }>("/api/events", {
    method: "POST",
    body: JSON.stringify(withActor({ eventId, qty })),
  });
}

export async function apiCreateCategory(input: {
  name: string;
  tagline?: string;
  description?: string;
  color?: string;
}) {
  return apiFetch<{ category: import("@/types").ShopCategory }>("/api/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchCategory(
  slug: string,
  patch: Partial<{ name: string; tagline: string; description: string; color: string }>,
) {
  return apiFetch<{ category: import("@/types").ShopCategory }>("/api/categories", {
    method: "PATCH",
    body: JSON.stringify({ slug, patch }),
  });
}

export async function apiDeleteCategory(slug: string) {
  return apiFetch<{ ok: true; slug: string }>(`/api/categories?slug=${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function apiCreateProduct(input: NewBottleInput) {
  return apiFetch<{ product: Product; inventory?: InventorySnapshot }>("/api/products", {
    method: "POST",
    body: JSON.stringify(withActor({ ...input })),
  });
}

export async function apiDeleteProduct(productId: string) {
  return apiFetch<{ ok: boolean; id: string; inventory?: InventorySnapshot }>(
    `/api/products?id=${encodeURIComponent(productId)}`,
    { method: "DELETE" },
  );
}

export async function apiPatchProduct(
  productId: string,
  patch: import("@/types").BottlePatch,
) {
  return apiFetch<{ product: Product }>("/api/products", {
    method: "PATCH",
    body: JSON.stringify({ productId, patch }),
  });
}

export async function apiPlaceOrder(input: {
  email: string;
  name: string;
  phone?: string;
  userId?: string;
  locationId: string;
  fulfillment: Order["fulfillment"];
  items: { productId: string; quantity: number }[];
  coupon?: string | null;
  loyaltyPointsRedeem?: number;
  ageConfirmed?: true;
  delivery?: import("@/types").DeliveryAddress;
}) {
  return apiFetch<{
    order: Order;
    userId: string;
    loyaltyPoints: number;
    inventory: InventorySnapshot;
  }>("/api/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiValidateCoupon(input: {
  code?: string | null;
  locationId?: string;
  subtotal: number;
  auto?: boolean;
  items?: { productId: string; quantity: number; price: number; category?: string; brand?: string }[];
}) {
  const params = new URLSearchParams({
    subtotal: String(input.subtotal),
  });
  if (input.code?.trim()) params.set("code", input.code.trim());
  if (input.auto || !input.code?.trim()) params.set("auto", "1");
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.items?.length) params.set("items", JSON.stringify(input.items));
  return apiFetch<{
    ok: true;
    code: string | null;
    name: string | null;
    discount: number;
    freeDelivery: boolean;
    promotionId: string | null;
    autoApplied?: boolean;
    type?: string;
  }>(`/api/promotions/validate?${params.toString()}`);
}

export async function apiLoyaltyMember(opts?: { locationId?: string; history?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.locationId) params.set("locationId", opts.locationId);
  if (opts?.history) params.set("history", "1");
  const qs = params.toString();
  return apiFetch<{
    ok: true;
    organizationId?: string;
    program: {
      name: string;
      pointsPerDollar: number;
      redeemRate: number;
      birthdayPoints: number;
      referralPoints: number;
      referralSignupPoints: number;
      rewards: unknown;
      tiers: unknown;
      active: boolean;
    } | null;
    balance: number;
    tier: string;
    entries?: {
      id: string;
      delta: number;
      balanceAfter: number;
      reason: string;
      reasonLabel?: string;
      orderId: string | null;
      createdAt: string;
    }[];
    total?: number;
  }>(`/api/loyalty/member${qs ? `?${qs}` : ""}`);
}

export async function apiPlacePosOrder(input: {
  locationId: string;
  fulfillment: "pos" | "pickup" | "delivery";
  items: { productId: string; quantity: number }[];
  paymentMethod?: "cash" | "card" | "other";
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  coupon?: string | null;
  delivery?: import("@/types").DeliveryAddress;
}) {
  return apiFetch<{
    order: Order;
    userId: string;
    loyaltyPoints: number;
    inventory: InventorySnapshot;
  }>("/api/pos/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiCancelOrder(_userId: string, orderId: string) {
  return apiFetch<{ order: Order; inventory?: InventorySnapshot }>("/api/orders", {
    method: "PATCH",
    body: JSON.stringify({ orderId, action: "cancel" }),
  });
}

export async function apiFetchOrders(opts?: {
  locationId?: string;
  status?: string;
  fulfillment?: string;
  q?: string;
  fromDate?: string;
  toDate?: string;
  unreadOnly?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts?.locationId) params.set("locationId", opts.locationId);
  if (opts?.status && opts.status !== "all") params.set("status", opts.status);
  if (opts?.fulfillment && opts.fulfillment !== "all") params.set("fulfillment", opts.fulfillment);
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  if (opts?.fromDate) params.set("fromDate", opts.fromDate);
  if (opts?.toDate) params.set("toDate", opts.toDate);
  if (opts?.unreadOnly) params.set("unread", "1");
  const qs = params.toString();
  return apiFetch<{
    orders: Array<
      Order & {
        customerId: string;
        customerName: string;
        customerEmail: string;
        unreadForMe?: boolean;
        notificationId?: string | null;
      }
    >;
    unreadOrderCount?: number;
  }>(`/api/orders${qs ? `?${qs}` : ""}`);
}

export async function apiUpdateOrderStatus(orderId: string, status: Order["status"]) {
  return apiFetch<{ order: Order }>("/api/orders", {
    method: "PATCH",
    body: JSON.stringify({ orderId, action: "status", status }),
  });
}

export async function apiLogin(email: string, password: string) {
  return apiFetch<{
    user: UserProfile;
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiSignup(
  name: string,
  email: string,
  password: string,
  referralCode?: string,
) {
  return apiFetch<{
    user: UserProfile;
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
  }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password,
      ...(referralCode?.trim() ? { referralCode: referralCode.trim() } : {}),
    }),
  });
}

export async function apiLogout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } finally {
    clearClientAccessToken();
  }
}

export async function apiMe(options?: { includeOrders?: boolean }) {
  const q = options?.includeOrders ? "?orders=1" : "";
  return apiFetch<{ user: UserProfile }>(`/api/auth/me${q}`);
}

export async function apiUpdateMe(
  patch: Partial<
    Pick<
      UserProfile,
      | "name"
      | "email"
      | "preferredBranchId"
      | "recentlyViewed"
      | "addresses"
      | "birthday"
      | "preferences"
    >
  > & {
    avatarUrl?: string | null;
    password?: string;
    currentPassword?: string;
  },
) {
  return apiFetch<{ user: UserProfile }>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ patch }),
  });
}

export async function apiRedeemPoints(redeemPoints: number) {
  return apiFetch<{ user: UserProfile }>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ redeemPoints }),
  });
}

export async function apiClaimBirthdayReward() {
  return apiFetch<{ ok: true; points: number; balance: number }>("/api/loyalty", {
    method: "POST",
    body: JSON.stringify({ action: "claim-birthday" }),
  });
}

export async function apiFetchUsers(params?: {
  q?: string;
  role?: string;
  limit?: number;
  offset?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.role) search.set("role", params.role);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.sortKey) search.set("sortKey", params.sortKey);
  if (params?.sortDir) search.set("sortDir", params.sortDir);
  const query = search.toString();
  return apiFetch<{ users: ManagedUser[]; total: number }>(
    `/api/users${query ? `?${query}` : ""}`,
  );
}

export async function apiCreateUser(input: {
  name: string;
  email: string;
  password: string;
  role: ManagedUser["role"];
  avatarUrl?: string;
  permissionGrants?: string[];
  permissionRevokes?: string[];
  allowedLocationIds?: string[] | null;
}) {
  return apiFetch<{ user: ManagedUser }>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchUser(input: {
  userId: string;
  name?: string;
  email?: string;
  role?: ManagedUser["role"];
  active?: boolean;
  password?: string;
  avatarUrl?: string | null;
  permissionGrants?: string[];
  permissionRevokes?: string[];
  allowedLocationIds?: string[] | null;
}) {
  return apiFetch<{ user: ManagedUser }>("/api/users", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function apiFetchRoles() {
  return apiFetch<{ roles: import("@/lib/auth/role-catalog").CustomRoleDefinition[] }>("/api/roles");
}

export async function apiCreateRole(input: {
  label: string;
  description?: string;
  slug?: string;
  rank?: number;
  permissions: string[];
}) {
  return apiFetch<{ role: import("@/lib/auth/role-catalog").CustomRoleDefinition }>("/api/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchRole(input: {
  roleId: string;
  patch: {
    label?: string;
    description?: string;
    slug?: string;
    rank?: number;
    permissions?: string[];
  };
}) {
  return apiFetch<{ role: import("@/lib/auth/role-catalog").CustomRoleDefinition }>("/api/roles", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function apiDeleteRole(roleId: string) {
  return apiFetch<{ ok: true }>(`/api/roles?id=${encodeURIComponent(roleId)}`, {
    method: "DELETE",
  });
}

export async function apiFetchActivity(params?: {
  action?: string;
  actorUserId?: string;
  entityType?: string;
  locationId?: string;
  q?: string;
  limit?: number;
  offset?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();
  if (params?.action) search.set("action", params.action);
  if (params?.actorUserId) search.set("actorUserId", params.actorUserId);
  if (params?.entityType) search.set("entityType", params.entityType);
  if (params?.locationId) search.set("locationId", params.locationId);
  if (params?.q) search.set("q", params.q);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  if (params?.sortKey) search.set("sortKey", params.sortKey);
  if (params?.sortDir) search.set("sortDir", params.sortDir);
  const query = search.toString();
  return apiFetch<{ logs: ActivityLogEntry[]; total: number }>(
    `/api/activity${query ? `?${query}` : ""}`,
  );
}

export async function apiCreateLocation(input: {
  name: string;
  shortName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  description?: string;
  pickupAvailable?: boolean;
  deliveryRadiusKm?: number;
  parking?: string;
  heroImage?: string;
  gallery?: string[];
  lat?: number;
  lng?: number;
}) {
  return apiFetch<{ location: import("@/types").StoreLocation }>("/api/locations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchLocation(
  locationId: string,
  patch: Partial<{
    name: string;
    shortName: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
    description: string;
    pickupAvailable: boolean;
    deliveryRadiusKm: number;
    parking: string;
    heroImage: string;
    gallery: string[];
    lat: number;
    lng: number;
  }>,
) {
  return apiFetch<{ location: import("@/types").StoreLocation }>("/api/locations", {
    method: "PATCH",
    body: JSON.stringify({ locationId, patch }),
  });
}

export async function apiDeleteLocation(locationId: string) {
  return apiFetch<{ ok: true; id: string }>(`/api/locations?id=${encodeURIComponent(locationId)}`, {
    method: "DELETE",
  });
}

export async function apiCreateEvent(input: {
  title: string;
  type: import("@/types").EventItem["type"];
  description: string;
  locationId: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  seatsTotal: number;
  image?: string;
  hosts?: string[];
  active?: boolean;
}) {
  return apiFetch<{ event: import("@/types").EventItem }>("/api/events", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function apiPatchEvent(
  eventId: string,
  patch: Partial<{
    title: string;
    type: import("@/types").EventItem["type"];
    description: string;
    locationId: string;
    date: string;
    startTime: string;
    endTime: string;
    price: number;
    seatsTotal: number;
    image: string;
    hosts: string[];
    active: boolean;
  }>,
) {
  return apiFetch<{ event: import("@/types").EventItem }>("/api/events", {
    method: "PATCH",
    body: JSON.stringify({ eventId, patch }),
  });
}

export async function apiDeleteEvent(eventId: string) {
  return apiFetch<{ ok: true; id: string }>(`/api/events?id=${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}

export async function apiFetchDeliveries() {
  return apiFetch<{
    drivers: import("@/types").Driver[];
    orders: Order[];
    linkedDriverId?: string | null;
    canDispatch?: boolean;
  }>("/api/deliveries");
}

export async function apiAssignDelivery(orderId: string, driverId: string) {
  return apiFetch<{ orderId: string; driver: import("@/types").Driver }>("/api/deliveries", {
    method: "PATCH",
    body: JSON.stringify({ action: "assign", orderId, driverId }),
  });
}

export async function apiUpdateDeliveryStatus(
  orderId: string,
  status: import("@/types").DeliveryStatus,
) {
  return apiFetch<{ orderId: string; status: import("@/types").DeliveryStatus }>("/api/deliveries", {
    method: "PATCH",
    body: JSON.stringify({ action: "status", orderId, status }),
  });
}

export async function apiFetchDrivers(opts?: { all?: boolean; locationId?: string }) {
  const params = new URLSearchParams();
  if (opts?.all) params.set("all", "1");
  if (opts?.locationId) params.set("locationId", opts.locationId);
  const qs = params.toString();
  return apiFetch<{ drivers: import("@/types").Driver[] }>(`/api/drivers${qs ? `?${qs}` : ""}`);
}

export async function apiCreateDriver(input: {
  name: string;
  phone: string;
  email?: string;
  vehicle: string;
  locationId: string;
  photoUrl?: string;
}) {
  return apiFetch<{ driver: import("@/types").Driver }>("/api/drivers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiPatchDriver(
  driverId: string,
  patch: Partial<{
    name: string;
    phone: string;
    email: string;
    vehicle: string;
    locationId: string;
    photoUrl: string;
    status: import("@/types").DriverStatus;
    active: boolean;
  }>,
) {
  return apiFetch<{ driver: import("@/types").Driver }>("/api/drivers", {
    method: "PATCH",
    body: JSON.stringify({ driverId, patch }),
  });
}

export async function apiDeactivateDriver(driverId: string) {
  return apiFetch<{ ok: true; driver: import("@/types").Driver }>(
    `/api/drivers?id=${encodeURIComponent(driverId)}`,
    { method: "DELETE" },
  );
}
