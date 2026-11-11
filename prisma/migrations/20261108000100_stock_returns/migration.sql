CREATE TABLE `stock_returns` (
 `id` VARCHAR(191) NOT NULL,
 `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
 `clientRequestId` VARCHAR(191) NOT NULL,
 `createHash` CHAR(64) NOT NULL,
 `sourceBranchId` VARCHAR(191) NOT NULL,
 `destinationBranchId` VARCHAR(191) NOT NULL,
 `sourceRequestId` VARCHAR(191) NULL,
 `businessDate` DATETIME(3) NOT NULL,
 `status` ENUM('DRAFT','SUBMITTED','DISPATCHED','RECEIVED','RESTORED','RESOLVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 `version` INTEGER NOT NULL DEFAULT 1,
 `note` TEXT NOT NULL,
 `createdById` VARCHAR(191) NOT NULL,
 `dispatchedById` VARCHAR(191) NULL,
 `dispatchedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_returns_trackingNumber_key` (`trackingNumber`),
 UNIQUE INDEX `stock_returns_clientRequestId_key` (`clientRequestId`),
 INDEX `stock_returns_sourceBranchId_status_createdAt_idx` (`sourceBranchId`,`status`,`createdAt`),
 INDEX `stock_returns_destinationBranchId_status_createdAt_idx` (`destinationBranchId`,`status`,`createdAt`),
 INDEX `stock_returns_sourceRequestId_idx` (`sourceRequestId`),
 INDEX `stock_returns_createdById_idx` (`createdById`),
 INDEX `stock_returns_dispatchedById_idx` (`dispatchedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_return_lines` (
 `id` VARCHAR(191) NOT NULL,
 `returnId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `quantity` DECIMAL(18,3) NOT NULL,
 `receivedQuantity` DECIMAL(18,3) NOT NULL DEFAULT 0,
 `restoredQuantity` DECIMAL(18,3) NOT NULL DEFAULT 0,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_return_lines_returnId_productId_key` (`returnId`,`productId`),
 INDEX `stock_return_lines_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_return_events` (
 `id` VARCHAR(191) NOT NULL,
 `returnId` VARCHAR(191) NOT NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `action` VARCHAR(191) NOT NULL,
 `version` INTEGER NOT NULL,
 `clientRequestId` VARCHAR(191) NULL,
 `payloadHash` CHAR(64) NULL,
 `note` TEXT NOT NULL,
 `payload` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_return_events_clientRequestId_key` (`clientRequestId`),
 INDEX `stock_return_events_returnId_createdAt_idx` (`returnId`,`createdAt`),
 INDEX `stock_return_events_actorId_idx` (`actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stock_returns` ADD CONSTRAINT `stock_returns_sourceBranchId_fkey` FOREIGN KEY (`sourceBranchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_returns` ADD CONSTRAINT `stock_returns_destinationBranchId_fkey` FOREIGN KEY (`destinationBranchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_returns` ADD CONSTRAINT `stock_returns_sourceRequestId_fkey` FOREIGN KEY (`sourceRequestId`) REFERENCES `daily_requests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_returns` ADD CONSTRAINT `stock_returns_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_returns` ADD CONSTRAINT `stock_returns_dispatchedById_fkey` FOREIGN KEY (`dispatchedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_return_lines` ADD CONSTRAINT `stock_return_lines_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `stock_returns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `stock_return_lines` ADD CONSTRAINT `stock_return_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_return_events` ADD CONSTRAINT `stock_return_events_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `stock_returns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_return_events` ADD CONSTRAINT `stock_return_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `stock_movements`
 ADD COLUMN `returnId` VARCHAR(191) NULL,
 ADD INDEX `stock_movements_returnId_idx` (`returnId`),
 MODIFY `kind` ENUM('RECEIPT','RECEIPT_REVERSAL','OPENING_BALANCE','COUNT_ADJUSTMENT','WASTE','WASTE_REVERSAL','PRODUCTION','PRODUCTION_REVERSAL','DISPATCH','DELIVERY_RECEIVING','DISPATCH_RETURN','RETURN_DISPATCH','RETURN_RECEIVING','RETURN_RESTORE') NOT NULL;

ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `stock_returns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
