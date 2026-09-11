-- Align relational integrity with industry-standard PKs / FKs.
-- Idempotent application also runs from ensureOrganizationSchema() at boot.
-- This migration documents the intended constraints for Prisma migrate deploy.

-- Prefer cleaning orphans before ADD CONSTRAINT (runtime path does this too).

-- Organization owner
-- ALTER TABLE `organizations` ADD CONSTRAINT `organizations_owner_user_id_fkey`
--   FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Locations belong to organizations
-- ALTER TABLE `locations` ADD CONSTRAINT `locations_organization_id_fkey`
--   FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Users preferred branch + org membership
-- ALTER TABLE `users` ADD CONSTRAINT `users_preferred_branch_id_fkey`
--   FOREIGN KEY (`preferred_branch_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- ALTER TABLE `users` ADD CONSTRAINT `users_organization_id_fkey`
--   FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Orders optional refs
-- ALTER TABLE `orders` ADD CONSTRAINT `orders_assigned_staff_id_fkey`
--   FOREIGN KEY (`assigned_staff_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- ALTER TABLE `orders` ADD CONSTRAINT `orders_promotion_id_fkey`
--   FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- ALTER TABLE `orders` ADD CONSTRAINT `orders_organization_id_fkey`
--   FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- ALTER TABLE `orders` ADD CONSTRAINT `orders_driver_id_fkey`
--   FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Inventory ledger integrity
-- ALTER TABLE `inventory_ledger` ADD CONSTRAINT `inventory_ledger_location_id_fkey`
--   FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- ALTER TABLE `inventory_ledger` ADD CONSTRAINT `inventory_ledger_product_id_fkey`
--   FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- ALTER TABLE `inventory_ledger` ADD CONSTRAINT `inventory_ledger_transfer_id_fkey`
--   FOREIGN KEY (`transfer_id`) REFERENCES `inventory_transfers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Transfer lines unique product per transfer
-- CREATE UNIQUE INDEX `inventory_transfer_lines_transfer_id_product_id_key`
--   ON `inventory_transfer_lines`(`transfer_id`, `product_id`);

-- Promotion codes unique per organization
-- CREATE UNIQUE INDEX `promotions_organization_id_code_key`
--   ON `promotions`(`organization_id`, `code`);

SELECT 1;
