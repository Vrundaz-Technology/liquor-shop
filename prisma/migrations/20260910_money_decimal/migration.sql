-- Convert monetary / rate columns from DOUBLE to DECIMAL.
-- Safe on both:
--   * 0_init databases (no cost_price / promo tables yet)
--   * later schemas that already have those columns
-- Runtime ensureOrganizationSchema() → ensureMoneyDecimalColumns() is also idempotent.

-- Columns that exist after 0_init.
ALTER TABLE `products`
  MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL,
  MODIFY COLUMN `compare_at_price` DECIMAL(12,2) NULL;

ALTER TABLE `locations`
  MODIFY COLUMN `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 12.50,
  MODIFY COLUMN `delivery_free_minimum` DECIMAL(12,2) NOT NULL DEFAULT 150.00,
  MODIFY COLUMN `tax_rate` DECIMAL(8,6) NOT NULL DEFAULT 0.088750;

ALTER TABLE `location_inventory`
  MODIFY COLUMN `promo_price` DECIMAL(12,2) NULL;

ALTER TABLE `events`
  MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL;

ALTER TABLE `orders`
  MODIFY COLUMN `total` DECIMAL(12,2) NOT NULL;

ALTER TABLE `order_items`
  MODIFY COLUMN `price` DECIMAL(12,2) NOT NULL;

-- Later columns: ADD if missing, otherwise MODIFY to DECIMAL.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cost_price'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `products` ADD COLUMN `cost_price` DECIMAL(12,2) NULL',
  'ALTER TABLE `products` MODIFY COLUMN `cost_price` DECIMAL(12,2) NULL'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations' AND COLUMN_NAME = 'minimum_order_amount'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `locations` ADD COLUMN `minimum_order_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00',
  'ALTER TABLE `locations` MODIFY COLUMN `minimum_order_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location_inventory' AND COLUMN_NAME = 'base_price'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `location_inventory` ADD COLUMN `base_price` DECIMAL(12,2) NULL',
  'ALTER TABLE `location_inventory` MODIFY COLUMN `base_price` DECIMAL(12,2) NULL'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location_inventory' AND COLUMN_NAME = 'sale_price'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `location_inventory` ADD COLUMN `sale_price` DECIMAL(12,2) NULL',
  'ALTER TABLE `location_inventory` MODIFY COLUMN `sale_price` DECIMAL(12,2) NULL'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location_inventory' AND COLUMN_NAME = 'cost_price'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `location_inventory` ADD COLUMN `cost_price` DECIMAL(12,2) NULL',
  'ALTER TABLE `location_inventory` MODIFY COLUMN `cost_price` DECIMAL(12,2) NULL'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'subtotal'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `orders` ADD COLUMN `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00',
  'ALTER TABLE `orders` MODIFY COLUMN `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tax_amount'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `orders` ADD COLUMN `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00',
  'ALTER TABLE `orders` MODIFY COLUMN `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'discount_amount'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `orders` ADD COLUMN `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00',
  'ALTER TABLE `orders` MODIFY COLUMN `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'delivery_fee'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `orders` ADD COLUMN `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00',
  'ALTER TABLE `orders` MODIFY COLUMN `delivery_fee` DECIMAL(12,2) NOT NULL DEFAULT 0.00'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Tables that only exist after the later commerce schema.
SET @tbl_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organization_customers'
);
SET @ddl := IF(
  @tbl_exists = 0,
  'SELECT 1',
  'ALTER TABLE `organization_customers` MODIFY COLUMN `total_spent` DECIMAL(12,2) NOT NULL DEFAULT 0.00'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotions'
);
SET @ddl := IF(
  @tbl_exists = 0,
  'SELECT 1',
  'ALTER TABLE `promotions` MODIFY COLUMN `value` DECIMAL(12,4) NOT NULL, MODIFY COLUMN `min_subtotal` DECIMAL(12,2) NULL'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loyalty_programs'
);
SET @ddl := IF(
  @tbl_exists = 0,
  'SELECT 1',
  'ALTER TABLE `loyalty_programs` MODIFY COLUMN `points_per_dollar` DECIMAL(8,4) NOT NULL DEFAULT 1.0000, MODIFY COLUMN `redeem_rate` DECIMAL(8,4) NOT NULL DEFAULT 0.0200'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
