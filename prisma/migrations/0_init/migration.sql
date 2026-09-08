-- CreateTable
CREATE TABLE `categories` (
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `tagline` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `category_slug` VARCHAR(191) NOT NULL,
    `subcategory` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `brand_story` TEXT NOT NULL,
    `origin` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `abv` DOUBLE NOT NULL,
    `volume_ml` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL,
    `compare_at_price` DOUBLE NULL,
    `rating` DOUBLE NOT NULL,
    `review_count` INTEGER NOT NULL,
    `tasting_notes` JSON NOT NULL,
    `food_pairings` JSON NOT NULL,
    `cocktails` JSON NOT NULL,
    `images` JSON NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `accent_color` VARCHAR(191) NOT NULL,
    `label_color` VARCHAR(191) NOT NULL,
    `bottle_height` DOUBLE NOT NULL,
    `is_premium` BOOLEAN NOT NULL,
    `is_imported` BOOLEAN NOT NULL,
    `tags` JSON NOT NULL,
    `nutrition` JSON NULL,
    `glb_url` VARCHAR(512) NULL,
    `usdz_url` VARCHAR(512) NULL,
    `is_custom` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `products_slug_key`(`slug`),
    INDEX `products_category_slug_idx`(`category_slug`),
    INDEX `products_brand_idx`(`brand`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locations` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `short_name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `zip` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `hours` JSON NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `hero_image` VARCHAR(512) NOT NULL,
    `gallery` JSON NOT NULL,
    `staff` JSON NOT NULL,
    `services` JSON NOT NULL,
    `parking` VARCHAR(191) NOT NULL,
    `pickup_available` BOOLEAN NOT NULL,
    `delivery_available` BOOLEAN NOT NULL DEFAULT true,
    `delivery_radius_km` DOUBLE NOT NULL,
    `delivery_fee` DOUBLE NOT NULL DEFAULT 12.5,
    `delivery_free_minimum` DOUBLE NOT NULL DEFAULT 150,
    `tax_rate` DOUBLE NOT NULL DEFAULT 0.08875,
    `featured_offers` JSON NOT NULL,
    `description` TEXT NOT NULL,

    UNIQUE INDEX `locations_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drivers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `vehicle` VARCHAR(191) NOT NULL,
    `location_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'available',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `photo_url` VARCHAR(512) NULL,

    INDEX `drivers_location_id_idx`(`location_id`),
    INDEX `drivers_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `location_inventory` (
    `location_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `seed_stock` INTEGER NOT NULL,
    `on_hand` INTEGER NOT NULL,
    `promo_price` DOUBLE NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `hidden` BOOLEAN NOT NULL DEFAULT false,

    INDEX `location_inventory_product_id_idx`(`product_id`),
    PRIMARY KEY (`location_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `location_id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `start_time` VARCHAR(191) NOT NULL,
    `end_time` VARCHAR(191) NOT NULL,
    `price` DOUBLE NOT NULL,
    `seats_total` INTEGER NOT NULL,
    `seats_available` INTEGER NOT NULL,
    `image` VARCHAR(512) NOT NULL,
    `hosts` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `events_slug_key`(`slug`),
    INDEX `events_location_id_idx`(`location_id`),
    INDEX `events_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `user_name` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `verified` BOOLEAN NOT NULL,
    `images` JSON NULL,
    `helpful` INTEGER NOT NULL,

    INDEX `reviews_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `preferred_branch_id` VARCHAR(191) NOT NULL,
    `loyalty_points` INTEGER NOT NULL,
    `loyalty_tier` VARCHAR(191) NOT NULL,
    `addresses` JSON NOT NULL,
    `recently_viewed` JSON NOT NULL,
    `avatar_url` TEXT NULL,
    `permission_grants` JSON NOT NULL,
    `permission_revokes` JSON NOT NULL,
    `allowed_location_ids` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `total` DOUBLE NOT NULL,
    `fulfillment` VARCHAR(191) NOT NULL,
    `location_id` VARCHAR(191) NOT NULL,
    `tracking` VARCHAR(191) NULL,
    `driver_id` VARCHAR(191) NULL,
    `delivery_status` VARCHAR(191) NULL,
    `delivery_phone` VARCHAR(191) NULL,
    `delivery_address` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `orders_user_id_idx`(`user_id`),
    INDEX `orders_location_id_idx`(`location_id`),
    INDEX `orders_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL,

    INDEX `order_items_order_id_idx`(`order_id`),
    INDEX `order_items_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `location_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `on_hand_after` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_ledger_location_id_product_id_idx`(`location_id`, `product_id`),
    INDEX `inventory_ledger_order_id_idx`(`order_id`),
    INDEX `inventory_ledger_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `actor_name` VARCHAR(191) NOT NULL,
    `actor_email` VARCHAR(191) NULL,
    `actor_role` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `summary` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `location_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_created_at_idx`(`created_at`),
    INDEX `activity_logs_actor_user_id_idx`(`actor_user_id`),
    INDEX `activity_logs_action_idx`(`action`),
    INDEX `activity_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` VARCHAR(1000) NOT NULL DEFAULT '',
    `permissions` JSON NOT NULL,
    `rank` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `role_definitions_slug_key`(`slug`),
    INDEX `role_definitions_rank_idx`(`rank`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_slug_fkey` FOREIGN KEY (`category_slug`) REFERENCES `categories`(`slug`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `location_inventory` ADD CONSTRAINT `location_inventory_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `location_inventory` ADD CONSTRAINT `location_inventory_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_ledger` ADD CONSTRAINT `inventory_ledger_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

