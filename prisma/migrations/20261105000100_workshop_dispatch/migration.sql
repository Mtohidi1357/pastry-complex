CREATE TABLE `workshop_deliveries` (
 `id` VARCHAR(191) NOT NULL,
 `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
 `clientRequestId` VARCHAR(191) NOT NULL,
 `createHash` CHAR(64) NOT NULL,
 `sourceBranchId` VARCHAR(191) NOT NULL,
 `destinationBranchId` VARCHAR(191) NOT NULL,
 `sourceRequestId` VARCHAR(191) NULL,
 `businessDate` DATETIME(3) NOT NULL,
 `status` ENUM('DRAFT','DISPATCHED','RECEIVED','RETURNED','RESOLVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 `version` INTEGER NOT NULL DEFAULT 1,
 `note` TEXT NOT NULL,
 `createdById` VARCHAR(191) NOT NULL,
 `dispatchedById` VARCHAR(191) NULL,
 `dispatchedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `workshop_deliveries_trackingNumber_key` (`trackingNumber`),
 UNIQUE INDEX `workshop_deliveries_clientRequestId_key` (`clientRequestId`),
 UNIQUE INDEX `workshop_deliveries_sourceRequestId_key` (`sourceRequestId`),
 INDEX `workshop_deliveries_sourceBranchId_status_createdAt_idx` (`sourceBranchId`,`status`,`createdAt`),
 INDEX `workshop_deliveries_destinationBranchId_status_createdAt_idx` (`destinationBranchId`,`status`,`createdAt`),
 INDEX `workshop_deliveries_createdById_idx` (`createdById`),
 INDEX `workshop_deliveries_dispatchedById_idx` (`dispatchedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workshop_delivery_lines` (
 `id` VARCHAR(191) NOT NULL,
 `deliveryId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `quantity` DECIMAL(18,3) NOT NULL,
 `receivedQuantity` DECIMAL(18,3) NOT NULL DEFAULT 0,
 `returnedQuantity` DECIMAL(18,3) NOT NULL DEFAULT 0,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `workshop_delivery_lines_deliveryId_productId_key` (`deliveryId`,`productId`),
 INDEX `workshop_delivery_lines_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workshop_delivery_events` (
 `id` VARCHAR(191) NOT NULL,
 `deliveryId` VARCHAR(191) NOT NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `action` VARCHAR(191) NOT NULL,
 `version` INTEGER NOT NULL,
 `clientRequestId` VARCHAR(191) NULL,
 `payloadHash` CHAR(64) NULL,
 `note` TEXT NOT NULL,
 `payload` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 UNIQUE INDEX `workshop_delivery_events_clientRequestId_key` (`clientRequestId`),
 INDEX `workshop_delivery_events_deliveryId_createdAt_idx` (`deliveryId`,`createdAt`),
 INDEX `workshop_delivery_events_actorId_idx` (`actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_document_leases` (
 `key` VARCHAR(191) NOT NULL,
 `ownerId` VARCHAR(191) NOT NULL,
 `token` VARCHAR(191) NOT NULL,
 `expiresAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`key`),
 INDEX `stock_document_leases_ownerId_idx` (`ownerId`),
 INDEX `stock_document_leases_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `workshop_deliveries` ADD CONSTRAINT `workshop_deliveries_sourceBranchId_fkey` FOREIGN KEY (`sourceBranchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_deliveries` ADD CONSTRAINT `workshop_deliveries_destinationBranchId_fkey` FOREIGN KEY (`destinationBranchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_deliveries` ADD CONSTRAINT `workshop_deliveries_sourceRequestId_fkey` FOREIGN KEY (`sourceRequestId`) REFERENCES `daily_requests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_deliveries` ADD CONSTRAINT `workshop_deliveries_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_deliveries` ADD CONSTRAINT `workshop_deliveries_dispatchedById_fkey` FOREIGN KEY (`dispatchedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_delivery_lines` ADD CONSTRAINT `workshop_delivery_lines_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `workshop_deliveries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `workshop_delivery_lines` ADD CONSTRAINT `workshop_delivery_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_delivery_events` ADD CONSTRAINT `workshop_delivery_events_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `workshop_deliveries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_delivery_events` ADD CONSTRAINT `workshop_delivery_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_document_leases` ADD CONSTRAINT `stock_document_leases_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements`
 ADD COLUMN `deliveryId` VARCHAR(191) NULL,
 ADD INDEX `stock_movements_deliveryId_idx` (`deliveryId`),
 MODIFY `kind` ENUM('RECEIPT','RECEIPT_REVERSAL','OPENING_BALANCE','COUNT_ADJUSTMENT','WASTE','WASTE_REVERSAL','PRODUCTION','PRODUCTION_REVERSAL','DISPATCH','DELIVERY_RECEIVING','DISPATCH_RETURN') NOT NULL;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `workshop_deliveries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
