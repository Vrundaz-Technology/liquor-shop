/**
 * CRM types and copy shared by the API (src/lib/db/crm.ts) and client panels.
 * Must stay free of server-only imports so it can ship in the browser bundle.
 */
import type { OrderNotifySummary } from "@/lib/notifications/order-log";
import type { NotifyEmailDestination, NotifyPhoneDestination, UserPreferences, UserProfile } from "@/types";

export type CustomerSegment = "VIP" | "Frequent" | "Inactive" | "New" | "Regular";

/** Shown in CRM. Keep in lockstep with computeSegment. */
export const CUSTOMER_SEGMENT_GUIDE: {
  id: CustomerSegment;
  rule: string;
  detail: string;
}[] = [
  {
    id: "VIP",
    rule: "$2,000+ spent",
    detail: "Lifetime spend of $2,000 or more. Checked first.",
  },
  {
    id: "Frequent",
    rule: "10+ orders",
    detail: "Ten or more orders with you, if they are not already VIP.",
  },
  {
    id: "New",
    rule: "First order",
    detail: "Exactly one order. First-time buyers, even if that order was a while ago.",
  },
  {
    id: "Inactive",
    rule: "60+ days quiet",
    detail: "No order in 60 days, or never ordered. Typical for seeded accounts with $0.",
  },
  {
    id: "Regular",
    rule: "Recent 2–9 orders",
    detail: "Everyone else who ordered in the last 60 days and is not VIP, Frequent, or New.",
  },
];

export const CUSTOMER_METRIC_GUIDE = [
  { id: "orders", label: "Orders", detail: "How many orders this customer has placed with your stores." },
  { id: "spent", label: "Spent", detail: "Net they have paid after refunds (lifetime, this organization)." },
  { id: "aov", label: "AOV", detail: "Average order value: spent ÷ orders. Shows $0 when they have no orders." },
  { id: "loyalty", label: "Loyalty", detail: "Points and tier in your store program." },
  { id: "lastOrder", label: "Last order", detail: "Date of their most recent order." },
  { id: "marketing", label: "Marketing", detail: "Whether they opted in to promotional email and offers." },
] as const;

export type CrmAddress = {
  label: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
};

export type CrmFavorite = {
  id: string;
  name: string;
  count: number;
};

export type CrmMarketingPrefs = {
  consent: boolean;
  emails: boolean;
  sms: boolean;
  push: boolean;
  notifyEmails: NotifyEmailDestination[];
  notifyPhones: NotifyPhoneDestination[];
};

export type CrmCustomer = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  notes?: string;
  marketingConsent: boolean;
  segment: CustomerSegment;
  totalSpent: number;
  orderCount: number;
  averageOrderValue: number;
  lastOrderAt: string | null;
  loyaltyPoints: number;
  loyaltyTier: string;
  createdAt: string;
};

export type CrmCustomerOrder = {
  id: string;
  date: string;
  createdAt: string | null;
  status: string;
  fulfillment: string;
  locationId: string;
  total: number;
  itemCount: number;
  paymentStatus: string;
  couponCode: string | null;
  promotionName: string | null;
  discountAmount: number;
  refundedAmount: number;
  notify?: OrderNotifySummary;
};

export type CrmCustomerDetail = CrmCustomer & {
  addresses: CrmAddress[];
  favoriteProducts: CrmFavorite[];
  favoriteCategories: CrmFavorite[];
  marketingPrefs: CrmMarketingPrefs;
  orders: CrmCustomerOrder[];
  loyaltyPointsUsed: number;
};
