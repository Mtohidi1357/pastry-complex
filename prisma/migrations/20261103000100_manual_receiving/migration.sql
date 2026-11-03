-- Additive manual receiving ledger. Existing tables/data are not modified.
CREATE TABLE `stock_receipts` (
 `id` VARCHAR(191) NOT NULL,
 `clientRequestId` VARCHAR(191) NOT NULL,
 `createHash` CHAR(64) NOT NULL,
 `branchId` VARCHAR(191) NOT NULL,
 `businessDate` DATETIME(3) NOT NULL,
 `sourceType` VARCHAR(191) NOT NULL DEFAULT 'MANUAL_RECEIPT',
 `status` ENUM('DRAFT','CONFIRMED','REVERSED') NOT NULL DEFAULT 'DRAFT',
 `version` INTEGER NOT NULL DEFAULT 1,
 `note` TEXT NULL,
 `createdById` VARCHAR(191) NOT NULL,
 `confirmedById` VARCHAR(191) NULL,
 `reversedById` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 `confirmedAt` DATETIME(3) NULL,
 `reversedAt` DATETIME(3) NULL,
 `reversalReason` TEXT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_receipts_clientRequestId_key` (`clientRequestId`),
 INDEX `stock_receipts_branchId_businessDate_idx` (`branchId`,`businessDate`),
 INDEX `stock_receipts_createdById_idx` (`createdById`),
 INDEX `stock_receipts_confirmedById_idx` (`confirmedById`),
 INDEX `stock_receipts_reversedById_idx` (`reversedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `stock_receipt_lines` (
 `id` VARCHAR(191) NOT NULL,
 `receiptId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `quantity` DECIMAL(18,3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_receipt_lines_receiptId_productId_key` (`receiptId`,`productId`),
 INDEX `stock_receipt_lines_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `branch_stock_balances` (
 `branchId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `quantity` DECIMAL(18,3) NOT NULL DEFAULT 0,
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`branchId`,`productId`),
 INDEX `branch_stock_balances_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `stock_movements` (
 `id` VARCHAR(191) NOT NULL,
 `branchId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `receiptId` VARCHAR(191) NULL,
 `sourceKey` VARCHAR(191) NOT NULL,
 `kind` ENUM('RECEIPT','RECEIPT_REVERSAL') NOT NULL,
 `quantityDelta` DECIMAL(18,3) NOT NULL,
 `businessDate` DATETIME(3) NOT NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `postedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `reason` TEXT NULL,
 `originalMovementId` VARCHAR(191) NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_movements_sourceKey_key` (`sourceKey`),
 UNIQUE INDEX `stock_movements_originalMovementId_key` (`originalMovementId`),
 INDEX `stock_movements_branchId_productId_postedAt_idx` (`branchId`,`productId`,`postedAt`),
 INDEX `stock_movements_productId_idx` (`productId`),
 INDEX `stock_movements_receiptId_idx` (`receiptId`),
 INDEX `stock_movements_actorId_idx` (`actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_reversedById_fkey` FOREIGN KEY (`reversedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `stock_receipt_lines` ADD CONSTRAINT `stock_receipt_lines_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `stock_receipts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_receipt_lines` ADD CONSTRAINT `stock_receipt_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `branch_stock_balances` ADD CONSTRAINT `branch_stock_balances_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `branch_stock_balances` ADD CONSTRAINT `branch_stock_balances_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `stock_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_originalMovementId_fkey` FOREIGN KEY (`originalMovementId`) REFERENCES `stock_movements`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
