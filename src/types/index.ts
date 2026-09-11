export type CategorySlug = string;

export type ShopCategory = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  color: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: CategorySlug;
  subcategory?: string;
  description: string;
  brandStory: string;
  origin: string;
  country: string;
  abv: number;
  volumeMl: number;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  sku?: string;
  upc?: string;
  minQty?: number;
  maxQty?: number;
  organizationId?: string;
  rating: number;
  reviewCount: number;
  tastingNotes: string[];
  foodPairings: string[];
  cocktails: { name: string; ingredients: string[]; method: string }[];
  images: string[];
  color: string;
  accentColor: string;
  labelColor: string;
  bottleHeight: number;
  isPremium: boolean;
  isImported: boolean;
  tags: string[];
  nutrition?: { calories: number; carbs: number; sugar: number };
  glbUrl?: string;
  usdzUrl?: string;
  createdAt?: string;
  /** Optional sales volume for best-selling sort (falls back to reviewCount). */
  unitsSold?: number;
};

export type InventoryItem = {
  productId: string;
  /** Catalog / seed on-hand count for this branch. Live stock lives in the inventory store. */
  stock: number;
  reserved?: number;
  basePrice?: number;
  salePrice?: number;
  costPrice?: number;
  promoPrice?: number;
  featured?: boolean;
  /** Hidden from the public shop at this branch only. */
  hidden?: boolean;
  lowStockThreshold?: number;
};

export type InventoryLedgerReason =
  | "sale"
  | "restock"
  | "adjustment"
  | "cancel"
  | "reset"
  | "transfer_out"
  | "transfer_in"
  | "reserve"
  | "release"
  | "damaged"
  | "receiving";

export type InventoryLedgerEntry = {
  id: string;
  locationId: string;
  productId: string;
  delta: number;
  onHandAfter: number;
  reason: InventoryLedgerReason;
  orderId?: string;
  createdAt: string;
};

export type ActivityAction =
  | "auth.login"
  | "auth.signup"
  | "order.placed"
  | "pos.sale"
  | "order.cancelled"
  | "order.status"
  | "inventory.set"
  | "inventory.adjust"
  | "inventory.restock"
  | "inventory.reset"
  | "inventory.visibility"
  | "catalog.created"
  | "catalog.updated"
  | "catalog.deleted"
  | "category.created"
  | "category.updated"
  | "category.deleted"
  | "event.booked"
  | "user.created"
  | "user.role_updated"
  | "user.deactivated"
  | "user.activated"
  | "user.password_reset"
  | "user.profile_updated"
  | "user.permissions_updated"
  | "user.points_redeemed"
  | "location.created"
  | "location.updated"
  | "location.deleted"
  | "event.created"
  | "event.updated"
  | "event.deleted"
  | "delivery.assigned"
  | "delivery.status"
  | "driver.created"
  | "driver.updated"
  | "driver.deactivated"
  | "role.created"
  | "role.updated"
  | "role.deleted"
  | "inventory.transfer"
  | "inventory.pricing"
  | "inventory.import"
  | "inventory.export"
  | "promotion.created"
  | "promotion.updated"
  | "promotion.deleted"
  | "crm.updated"
  | "loyalty.updated"
  | "loyalty.birthday_claimed"
  | "review.created"
  | "review.moderate"
  | "review.respond"
  | "support.ticket_created"
  | "support.ticket_updated"
  | "support.reply";

export type ActivityEntityType =
  | "user"
  | "order"
  | "product"
  | "category"
  | "inventory"
  | "event"
  | "location"
  | "profile"
  | "delivery"
  | "driver"
  | "role"
  | "promotion"
  | "customer"
  | "loyalty"
  | "review"
  | "support";

export type ActivityLogEntry = {
  id: string;
  actorUserId?: string;
  actorName: string;
  actorEmail?: string;
  actorRole: string;
  action: ActivityAction | string;
  entityType: ActivityEntityType | string;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
  locationId?: string;
  createdAt: string;
};

export type StoreLocation = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  organizationId?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  hours: { day: string; open: string; close: string }[];
  holidayHours?: { date: string; open: string; close: string; closed?: boolean }[];
  lat: number;
  lng: number;
  heroImage: string;
  gallery: string[];
  staff: { name: string; role: string; image: string }[];
  services: string[];
  parking: string;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryRadiusKm: number;
  deliveryFee: number;
  deliveryFreeMinimum: number;
  minimumOrderAmount?: number;
  taxRate: number;
  paymentSettings?: Record<string, unknown>;
  inventory: InventoryItem[];
  featuredOffers: string[];
  description: string;
};

export type EventItem = {
  id: string;
  slug: string;
  title: string;
  type: "wine-tasting" | "whiskey-tasting" | "launch" | "festival";
  description: string;
  locationId: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  seatsTotal: number;
  seatsAvailable: number;
  image: string;
  hosts: string[];
  /** When false, hidden from public event listings and booking pages. */
  active: boolean;
};

export type Review = {
  id: string;
  productId: string;
  userName: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
  images?: string[];
  helpful: number;
};

export type ReviewTargetType = "product" | "store" | "delivery";
export type ReviewStatus = "published" | "hidden" | "flagged";

/** Unified product / store / delivery review (platform review management). */
export type PlatformReview = {
  id: string;
  targetType: ReviewTargetType;
  productId?: string;
  locationId?: string;
  orderId?: string;
  userId?: string;
  userName: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
  status: ReviewStatus;
  ownerReply?: string;
  ownerRepliedAt?: string;
  ownerRepliedBy?: string;
  reportCount?: number;
  images?: string[];
  helpful: number;
};

export type SupportCategory =
  | "order_issue"
  | "missing_item"
  | "damaged_product"
  | "delivery_issue"
  | "refund"
  | "payment"
  | "account"
  | "product_question";

export type SupportTicketStatus = "open" | "pending" | "resolved" | "closed";
export type SupportRouteScope = "store" | "owner" | "platform";

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorUserId?: string;
  authorName: string;
  authorRole: "customer" | "staff" | "system";
  body: string;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  organizationId: string;
  locationId?: string;
  orderId?: string;
  userId: string;
  customerName?: string;
  customerEmail?: string;
  category: SupportCategory;
  subject: string;
  status: SupportTicketStatus;
  priority: "low" | "normal" | "high";
  routeScope: SupportRouteScope;
  routeReason?: string;
  assigneeUserId?: string;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
};

export type CartItem = {
  productId: string;
  quantity: number;
  fulfillment: "delivery" | "pickup" | "pos";
};

export type SavedItem = {
  productId: string;
  savedAt: string;
};

/** Legacy delivery sub-status (kept for UI until fully folded into Order.status). */
export type DeliveryStatus =
  | "unassigned"
  | "assigned"
  | "picked_up"
  | "en_route"
  | "delivered";

export type DriverStatus = "available" | "on_route" | "offline";

export type DeliveryAddress = {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  notes?: string;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  vehicle: string;
  locationId: string;
  status: DriverStatus;
  active: boolean;
  photoUrl?: string;
  /** Linked staff user for assigned-only delivery access. */
  userId?: string;
};

export type OrderFulfillment = "delivery" | "pickup" | "pos";

export type OrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "out_for_delivery"
  | "delivered"
  | "ready_for_pickup"
  | "picked_up"
  | "completed"
  | "cancelled"
  /** @deprecated legacy — migrated on read/write */
  | "processing"
  | "shipped";

export type Order = {
  id: string;
  date: string;
  status: OrderStatus;
  items: { productId: string; quantity: number; price: number }[];
  total: number;
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  deliveryFee?: number;
  paymentStatus?: string;
  fulfillment: OrderFulfillment;
  locationId: string;
  organizationId?: string;
  tracking?: string;
  /** Snapshot ETA minutes at place-order (delivery only). */
  etaMinutes?: number | null;
  delivery?: DeliveryAddress;
  deliveryStatus?: DeliveryStatus;
  driverId?: string;
  driver?: Driver;
  assignedStaffId?: string;
  couponCode?: string;
  promotionId?: string;
};

export type UserRole = "customer" | "staff" | "admin" | "owner";
export type LoyaltyTier = "Member" | "Connoisseur" | "Collector" | "VIP";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  hasPassword: boolean;
  loyaltyPoints: number;
  loyaltyTier: LoyaltyTier;
  preferredBranchId: string;
  organizationId?: string | null;
  orderCount: number;
  createdAt: string;
  avatarUrl?: string;
  permissionGrants?: string[];
  permissionRevokes?: string[];
  /** Server-computed RBAC snapshot for client gates. */
  effectivePermissions?: string[];
  allowedLocationIds?: string[] | null;
};

export type NewBottleInput = {
  name: string;
  brand: string;
  category: CategorySlug;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  sku?: string;
  upc?: string;
  minQty?: number;
  maxQty?: number | null;
  abv: number;
  volumeMl: number;
  origin: string;
  country: string;
  description: string;
  brandStory?: string;
  imageUrl: string;
  images?: string[];
  tastingNotes: string;
  foodPairings?: string;
  isPremium: boolean;
  isImported: boolean;
  initialStock: number;
  stockLocationIds?: string[];
};

export type BottlePatch = Partial<Omit<NewBottleInput, "initialStock" | "stockLocationIds">>;

export type UserPreferences = {
  defaultFulfillment?: "delivery" | "pickup";
  marketingEmails?: boolean;
  smsUpdates?: boolean;
  pushUpdates?: boolean;
  orderEmailUpdates?: boolean;
  loyaltyAlerts?: boolean;
  backInStockAlerts?: boolean;
  priceAlerts?: boolean;
  abandonedCartReminders?: boolean;
  favoriteCategory?: string | null;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  preferredBranchId: string;
  organizationId?: string | null;
  loyaltyPoints: number;
  loyaltyTier: LoyaltyTier;
  birthday?: string | null;
  referralCode?: string | null;
  canClaimBirthday?: boolean;
  preferences?: UserPreferences;
  addresses: {
    id: string;
    label: string;
    line1: string;
    city: string;
    state: string;
    zip: string;
    isDefault: boolean;
  }[];
  recentlyViewed: string[];
  orders: Order[];
  createdAt?: string;
  avatarUrl?: string;
  permissionGrants?: string[];
  permissionRevokes?: string[];
  /** Server-computed RBAC snapshot for client gates. */
  effectivePermissions?: string[];
  allowedLocationIds?: string[] | null;
};
