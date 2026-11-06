CREATE TABLE `workshop_receipts` (
 `id` VARCHAR(191) NOT NULL,
 `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
 `clientRequestId` VARCHAR(191) NOT NULL,
 `createHash` CHAR(64) NOT NULL,
 `branchId` VARCHAR(191) NOT NULL,
 `businessDate` DATETIME(3) NOT NULL,
 `sourceType` ENUM('MANUAL_PRODUCTION','REQUEST_PRODUCTION','OPENING_STOCK') NOT NULL,
 `sourceRequestId` VARCHAR(191) NULL,
 `status` ENUM('DRAFT','POSTED','REVERSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 `version` INTEGER NOT NULL DEFAULT 1,
 `note` TEXT NOT NULL,
 `createdById` VARCHAR(191) NOT NULL,
 `postedById` VARCHAR(191) NULL,
 `reversedById` VARCHAR(191) NULL,
 `postedAt` DATETIME(3) NULL,
 `reversedAt` DATETIME(3) NULL,
 `cancelledAt` DATETIME(3) NULL,
 `reversalReason` TEXT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `workshop_receipts_trackingNumber_key` (`trackingNumber`),
 UNIQUE INDEX `workshop_receipts_clientRequestId_key` (`clientRequestId`),
 UNIQUE INDEX `workshop_receipts_sourceRequestId_key` (`sourceRequestId`),
 INDEX `workshop_receipts_branchId_createdAt_idx` (`branchId`,`createdAt`),
 INDEX `workshop_receipts_createdById_idx` (`createdById`),
 INDEX `workshop_receipts_postedById_idx` (`postedById`),
 INDEX `workshop_receipts_reversedById_idx` (`reversedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `workshop_receipt_lines` (
 `id` VARCHAR(191) NOT NULL,
 `receiptId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `quantity` DECIMAL(18,3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `workshop_receipt_lines_receiptId_productId_key` (`receiptId`,`productId`),
 INDEX `workshop_receipt_lines_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `workshop_receipt_events` (
 `id` VARCHAR(191) NOT NULL,
 `receiptId` VARCHAR(191) NOT NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `action` VARCHAR(191) NOT NULL,
 `version` INTEGER NOT NULL,
 `note` TEXT NULL,
 `payload` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 INDEX `workshop_receipt_events_receiptId_createdAt_idx` (`receiptId`,`createdAt`),
 INDEX `workshop_receipt_events_actorId_idx` (`actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `workshop_receipts` ADD CONSTRAINT `workshop_receipts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_receipts` ADD CONSTRAINT `workshop_receipts_sourceRequestId_fkey` FOREIGN KEY (`sourceRequestId`) REFERENCES `daily_requests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_receipts` ADD CONSTRAINT `workshop_receipts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_receipts` ADD CONSTRAINT `workshop_receipts_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_receipts` ADD CONSTRAINT `workshop_receipts_reversedById_fkey` FOREIGN KEY (`reversedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_receipt_lines` ADD CONSTRAINT `workshop_receipt_lines_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `workshop_receipts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `workshop_receipt_lines` ADD CONSTRAINT `workshop_receipt_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_receipt_events` ADD CONSTRAINT `workshop_receipt_events_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `workshop_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `workshop_receipt_events` ADD CONSTRAINT `workshop_receipt_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements`
 ADD COLUMN `workshopReceiptId` VARCHAR(191) NULL,
 ADD INDEX `stock_movements_workshopReceiptId_idx` (`workshopReceiptId`),
 MODIFY `kind` ENUM('RECEIPT','RECEIPT_REVERSAL','OPENING_BALANCE','COUNT_ADJUSTMENT','WASTE','WASTE_REVERSAL','PRODUCTION','PRODUCTION_REVERSAL') NOT NULL;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_workshopReceiptId_fkey` FOREIGN KEY (`workshopReceiptId`) REFERENCES `workshop_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
