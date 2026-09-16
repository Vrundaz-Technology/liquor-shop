/** Re-export commerce helpers. Prefer resolvePromotionDiscount for checkout. */
export {
  COUPONS,
  isValidCoupon,
  getCouponDiscount,
  resolvePromotionDiscount,
} from "@/lib/commerce/promotions";

export { calculateShipping, calculateTax } from "@/lib/fulfillment-pricing";
