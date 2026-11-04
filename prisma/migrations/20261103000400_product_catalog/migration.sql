ALTER TABLE `products` ADD COLUMN `catalogVersion` INTEGER NOT NULL DEFAULT 1;
CREATE TABLE `product_images` (
 `productId` VARCHAR(191) NOT NULL,
 `data` MEDIUMBLOB NOT NULL,
 `mime` VARCHAR(32) NOT NULL,
 `updatedById` VARCHAR(191) NOT NULL,
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`productId`),
 INDEX `product_images_updatedById_idx` (`updatedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `catalog_events` (
 `id` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NULL,
 `categoryId` VARCHAR(191) NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `action` VARCHAR(191) NOT NULL,
 `message` TEXT NOT NULL,
 `payload` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 INDEX `catalog_events_productId_createdAt_idx` (`productId`,`createdAt`),
 INDEX `catalog_events_categoryId_idx` (`categoryId`),
 INDEX `catalog_events_actorId_idx` (`actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `catalog_events` ADD CONSTRAINT `catalog_events_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `catalog_events` ADD CONSTRAINT `catalog_events_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `catalog_events` ADD CONSTRAINT `catalog_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
