/**
 * Client-safe commerce helpers. Server code resolves real offers with
 * resolvePromotionDiscount from "@/lib/commerce/promotions" (database-backed).
 */
export { COUPONS, isValidCoupon, getCouponDiscount } from "@/lib/commerce/legacy-coupons";

export { calculateShipping, calculateTax } from "@/lib/fulfillment-pricing";
