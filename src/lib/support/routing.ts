import type { SupportCategory, SupportRouteScope } from "@/types";

export const SUPPORT_CATEGORIES: {
  value: SupportCategory;
  label: string;
  description: string;
}[] = [
  { value: "order_issue", label: "Order issue", description: "Wrong status, delay, or order problem" },
  { value: "missing_item", label: "Missing item", description: "Something was missing from your order" },
  { value: "damaged_product", label: "Damaged product", description: "Bottle arrived broken or leaking" },
  { value: "delivery_issue", label: "Delivery issue", description: "Driver, ETA, or delivery address trouble" },
  { value: "refund", label: "Refund", description: "Request a refund or adjustment" },
  { value: "payment", label: "Payment", description: "Charged wrong, card, or payment failure" },
  { value: "account", label: "Account", description: "Login, profile, loyalty, or preferences" },
  { value: "product_question", label: "Product question", description: "Ask about a bottle or availability" },
];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = Object.fromEntries(
  SUPPORT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<SupportCategory, string>;

export type TicketRouteResult = {
  scope: SupportRouteScope;
  organizationId: string;
  locationId: string | null;
  reason: string;
};

/**
 * Auto-route Customer → Support → Ticket → Store / Owner / Platform.
 * Order-linked store issues go to the fulfilling store; account/payment escalate to owner/platform.
 */
export function routeSupportTicket(input: {
  category: SupportCategory;
  organizationId: string;
  orderLocationId?: string | null;
  preferredLocationId?: string | null;
  selectedLocationId?: string | null;
}): TicketRouteResult {
  const storeId =
    input.orderLocationId ??
    input.selectedLocationId ??
    input.preferredLocationId ??
    null;

  switch (input.category) {
    case "order_issue":
    case "missing_item":
    case "damaged_product":
    case "delivery_issue":
    case "refund":
      if (storeId) {
        return {
          scope: "store",
          organizationId: input.organizationId,
          locationId: storeId,
          reason: "Routed to the store that fulfilled (or should fulfill) this request.",
        };
      }
      return {
        scope: "owner",
        organizationId: input.organizationId,
        locationId: null,
        reason: "No store on the ticket — routed to the organization owner queue.",
      };

    case "product_question":
      if (storeId) {
        return {
          scope: "store",
          organizationId: input.organizationId,
          locationId: storeId,
          reason: "Product questions go to the selected / preferred store.",
        };
      }
      return {
        scope: "owner",
        organizationId: input.organizationId,
        locationId: null,
        reason: "No store selected — routed to the owner queue.",
      };

    case "payment":
      return {
        scope: "platform",
        organizationId: input.organizationId,
        locationId: storeId,
        reason: "Payment issues escalate to platform / owner billing support.",
      };

    case "account":
      return {
        scope: "owner",
        organizationId: input.organizationId,
        locationId: null,
        reason: "Account issues are handled by the organization owner team.",
      };

    default:
      return {
        scope: "owner",
        organizationId: input.organizationId,
        locationId: storeId,
        reason: "Default owner routing.",
      };
  }
}
