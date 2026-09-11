-- Convert monetary / rate columns from DOUBLE to DECIMAL for industry-standard money math.
-- Also applied idempotently by ensureOrganizationSchema() → ensureMoneyDecimalColumns().

ALTER TABLE `products`
  MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL,
  MODIFY COLUMN `compare_at_price` DECIMAL(12,2) NULL,
  MODIFY COLUMN `cost_price` DECIMAL(12,2) NULL;

ALTER TABLE `locations`
  MODIFY COLUMN `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 12.50,
  MODIFY COLUMN `delivery_free_minimum` DECIMAL(12,2) NOT NULL DEFAULT 150.00,
  MODIFY COLUMN `minimum_order_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  MODIFY COLUMN `tax_rate` DECIMAL(8,6) NOT NULL DEFAULT 0.088750;

ALTER TABLE `location_inventory`
  MODIFY COLUMN `base_price` DECIMAL(12,2) NULL,
  MODIFY COLUMN `sale_price` DECIMAL(12,2) NULL,
  MODIFY COLUMN `cost_price` DECIMAL(12,2) NULL,
  MODIFY COLUMN `promo_price` DECIMAL(12,2) NULL;

ALTER TABLE `events`
  MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL;

ALTER TABLE `orders`
  MODIFY COLUMN `total` DECIMAL(12,2) NOT NULL,
  MODIFY COLUMN `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  MODIFY COLUMN `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  MODIFY COLUMN `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  MODIFY COLUMN `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE `order_items`
  MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL;

ALTER TABLE `organization_customers`
  MODIFY COLUMN `total_spent` DECIMAL(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE `promotions`
  MODIFY COLUMN `value` DECIMAL(12,4) NOT NULL,
  MODIFY COLUMN `min_subtotal` DECIMAL(12,2) NULL;

ALTER TABLE `loyalty_programs`
  MODIFY COLUMN `points_per_dollar` DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
  MODIFY COLUMN `redeem_rate` DECIMAL(8,4) NOT NULL DEFAULT 0.0200;
