import type { NotificationKind, NotificationPayload } from "@/lib/notifications/types";

type OrderTemplateInput = {
  orderId: string;
  tracking?: string | null;
  storeName?: string | null;
  driverName?: string | null;
};

const ORDER_COPY: Record<
  string,
  (input: OrderTemplateInput) => { title: string; body: string }
> = {
  "order.confirmed": ({ orderId, tracking }) => ({
    title: "Your order has been confirmed.",
    body: tracking
      ? `Order ${orderId} is confirmed. Tracking ${tracking}.`
      : `Order ${orderId} is confirmed. We’ll update you as it progresses.`,
  }),
  "order.preparing": ({ orderId }) => ({
    title: "Your order is being prepared.",
    body: `We’re packing order ${orderId} now.`,
  }),
  "order.ready": ({ orderId, storeName }) => ({
    title: "Your order is ready.",
    body: storeName
      ? `Order ${orderId} is ready at ${storeName}.`
      : `Order ${orderId} is ready.`,
  }),
  "order.driver_assigned": ({ orderId, driverName }) => ({
    title: "A driver has been assigned.",
    body: driverName
      ? `${driverName} is assigned to order ${orderId}.`
      : `A driver is assigned to order ${orderId}.`,
  }),
  "order.picked_up": ({ orderId }) => ({
    title: "Your driver has picked up your order.",
    body: `Order ${orderId} is with your driver.`,
  }),
  "order.out_for_delivery": ({ orderId }) => ({
    title: "Your order is out for delivery.",
    body: `Order ${orderId} is on the way.`,
  }),
  "order.arriving_soon": ({ orderId }) => ({
    title: "Your order is arriving soon.",
    body: `Order ${orderId} should arrive shortly.`,
  }),
  "order.delivered": ({ orderId }) => ({
    title: "Your order has been delivered.",
    body: `Order ${orderId} was delivered. Enjoy responsibly.`,
  }),
  "order.ready_for_pickup": ({ orderId, storeName }) => ({
    title: "Your order is ready for pickup.",
    body: storeName
      ? `Order ${orderId} is ready at ${storeName}. Bring a valid ID.`
      : `Order ${orderId} is ready for pickup. Bring a valid ID.`,
  }),
  "order.cancelled": ({ orderId }) => ({
    title: "Your order was cancelled.",
    body: `Order ${orderId} has been cancelled. Contact the store if you have questions.`,
  }),
};

export function orderNotificationPayload(
  kind: NotificationKind,
  input: OrderTemplateInput & {
    email?: string | null;
    phone?: string | null;
    userId?: string | null;
  },
): NotificationPayload | null {
  const builder = ORDER_COPY[kind];
  if (!builder) return null;
  const { title, body } = builder(input);
  return {
    kind,
    userId: input.userId,
    email: input.email,
    phone: input.phone,
    title,
    body,
    data: {
      orderId: input.orderId,
      tracking: input.tracking ?? null,
    },
  };
}

export function promoPayload(input: {
  userId?: string | null;
  email?: string | null;
  title: string;
  body: string;
  promotionId?: string;
}): NotificationPayload {
  return {
    kind: "promo.offer",
    userId: input.userId,
    email: input.email,
    title: input.title,
    body: input.body,
    data: { promotionId: input.promotionId },
  };
}

export function loyaltyPayload(input: {
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  points?: number;
  tier?: string;
  message?: string;
}): NotificationPayload {
  const points = input.points ?? 0;
  return {
    kind: "loyalty.reward",
    userId: input.userId,
    email: input.email,
    phone: input.phone,
    title: "Loyalty reward update",
    body:
      input.message ??
      (points > 0
        ? `You earned ${points} loyalty points${input.tier ? ` · ${input.tier}` : ""}.`
        : `Your loyalty rewards were updated${input.tier ? ` · ${input.tier}` : ""}.`),
    data: { points, tier: input.tier },
  };
}

export function backInStockPayload(input: {
  userId?: string | null;
  email?: string | null;
  productName: string;
  productId: string;
}): NotificationPayload {
  return {
    kind: "stock.back_in_stock",
    userId: input.userId,
    email: input.email,
    title: "Back in stock",
    body: `${input.productName} is available again.`,
    data: { productId: input.productId },
  };
}

export function priceAlertPayload(input: {
  userId?: string | null;
  email?: string | null;
  productName: string;
  productId: string;
  price: number;
}): NotificationPayload {
  return {
    kind: "price.alert",
    userId: input.userId,
    email: input.email,
    title: "Price alert",
    body: `${input.productName} is now $${input.price.toFixed(2)}.`,
    data: { productId: input.productId, price: input.price },
  };
}

export function abandonedCartPayload(input: {
  userId?: string | null;
  email?: string | null;
  itemCount: number;
}): NotificationPayload {
  return {
    kind: "cart.abandoned",
    userId: input.userId,
    email: input.email,
    title: "Your cart is waiting",
    body:
      input.itemCount === 1
        ? "You left 1 bottle in your cart. Finish checkout when you’re ready."
        : `You left ${input.itemCount} bottles in your cart. Finish checkout when you’re ready.`,
    data: { itemCount: input.itemCount },
  };
}

/** Map order status → notification kind(s). */
export function notificationKindsForOrderStatus(
  fulfillment: string,
  status: string,
): NotificationKind[] {
  if (status === "new" || status === "accepted" || status === "processing") {
    return ["order.confirmed"];
  }
  if (status === "preparing") return ["order.preparing"];
  if (status === "ready") return fulfillment === "pickup" ? ["order.ready_for_pickup"] : ["order.ready"];
  if (status === "ready_for_pickup") return ["order.ready_for_pickup"];
  if (status === "assigned") return ["order.driver_assigned"];
  if (status === "picked_up") {
    // Delivery: driver picked up. Pickup: customer collected (terminal) — skip duplicate blast.
    return fulfillment === "delivery" ? ["order.picked_up"] : [];
  }
  if (status === "out_for_delivery" || status === "shipped") {
    return ["order.out_for_delivery", "order.arriving_soon"];
  }
  if (status === "delivered") return ["order.delivered"];
  if (status === "cancelled") return ["order.cancelled"];
  return [];
}
