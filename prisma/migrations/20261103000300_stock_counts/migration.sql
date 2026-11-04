-- Preserve all existing balances and receipt history; new writes advance revision.
ALTER TABLE `branch_stock_balances` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `stock_movements` MODIFY `kind` ENUM('RECEIPT','RECEIPT_REVERSAL','OPENING_BALANCE','COUNT_ADJUSTMENT') NOT NULL;
CREATE TABLE `stock_counts` (
 `id` VARCHAR(191) NOT NULL,
 `clientRequestId` VARCHAR(191) NOT NULL,
 `branchId` VARCHAR(191) NOT NULL,
 `kind` ENUM('OPENING','COUNT') NOT NULL,
 `status` ENUM('DRAFT','SUBMITTED','APPROVED') NOT NULL DEFAULT 'DRAFT',
 `businessDate` DATETIME(3) NOT NULL,
 `version` INTEGER NOT NULL DEFAULT 1,
 `note` TEXT NULL,
 `approvalReason` TEXT NULL,
 `createdById` VARCHAR(191) NOT NULL,
 `approvedById` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 `submittedAt` DATETIME(3) NULL,
 `approvedAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_counts_clientRequestId_key` (`clientRequestId`),
 INDEX `stock_counts_branchId_createdAt_idx` (`branchId`,`createdAt`),
 INDEX `stock_counts_createdById_idx` (`createdById`),
 INDEX `stock_counts_approvedById_idx` (`approvedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `stock_count_lines` (
 `id` VARCHAR(191) NOT NULL,
 `countId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `expectedQuantity` DECIMAL(18,3) NOT NULL,
 `countedQuantity` DECIMAL(18,3) NULL,
 `snapshotRevision` INTEGER NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `stock_count_lines_countId_productId_key` (`countId`,`productId`),
 INDEX `stock_count_lines_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `stock_count_events` (
 `id` VARCHAR(191) NOT NULL,
 `countId` VARCHAR(191) NOT NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `action` VARCHAR(191) NOT NULL,
 `note` TEXT NULL,
 `version` INTEGER NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 INDEX `stock_count_events_countId_createdAt_idx` (`countId`,`createdAt`),
 INDEX `stock_count_events_actorId_idx` (`actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `stock_count_lines` ADD CONSTRAINT `stock_count_lines_countId_fkey` FOREIGN KEY (`countId`) REFERENCES `stock_counts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_count_lines` ADD CONSTRAINT `stock_count_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_count_events` ADD CONSTRAINT `stock_count_events_countId_fkey` FOREIGN KEY (`countId`) REFERENCES `stock_counts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_count_events` ADD CONSTRAINT `stock_count_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD COLUMN `countId` VARCHAR(191) NULL;
CREATE INDEX `stock_movements_countId_idx` ON `stock_movements`(`countId`);
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_countId_fkey` FOREIGN KEY (`countId`) REFERENCES `stock_counts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
