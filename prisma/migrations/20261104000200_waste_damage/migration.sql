CREATE TABLE `waste_cases` (
 `id` VARCHAR(191) NOT NULL,
 `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
 `clientRequestId` VARCHAR(191) NOT NULL,
 `createHash` CHAR(64) NOT NULL,
 `branchId` VARCHAR(191) NOT NULL,
 `businessDate` DATETIME(3) NOT NULL,
 `status` ENUM('DRAFT','SUBMITTED','APPROVED','REVERSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 `version` INTEGER NOT NULL DEFAULT 1,
 `note` TEXT NOT NULL,
 `createdById` VARCHAR(191) NOT NULL,
 `approvedById` VARCHAR(191) NULL,
 `reversedById` VARCHAR(191) NULL,
 `approvalReason` TEXT NULL,
 `reversalReason` TEXT NULL,
 `submittedAt` DATETIME(3) NULL,
 `approvedAt` DATETIME(3) NULL,
 `reversedAt` DATETIME(3) NULL,
 `cancelledAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `waste_cases_trackingNumber_key` (`trackingNumber`),
 UNIQUE INDEX `waste_cases_clientRequestId_key` (`clientRequestId`),
 INDEX `waste_cases_branchId_createdAt_idx` (`branchId`,`createdAt`),
 INDEX `waste_cases_createdById_idx` (`createdById`),
 INDEX `waste_cases_approvedById_idx` (`approvedById`),
 INDEX `waste_cases_reversedById_idx` (`reversedById`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `waste_case_lines` (
 `id` VARCHAR(191) NOT NULL,
 `wasteId` VARCHAR(191) NOT NULL,
 `productId` VARCHAR(191) NOT NULL,
 `quantity` DECIMAL(18,3) NOT NULL,
 `reason` ENUM('EXPIRED','DAMAGED','SPOILED','OTHER') NOT NULL,
 `note` TEXT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `waste_case_lines_wasteId_productId_key` (`wasteId`,`productId`),
 INDEX `waste_case_lines_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `waste_case_events` (
 `id` VARCHAR(191) NOT NULL,
 `wasteId` VARCHAR(191) NOT NULL,
 `actorId` VARCHAR(191) NOT NULL,
 `action` VARCHAR(191) NOT NULL,
 `version` INTEGER NOT NULL,
 `note` TEXT NULL,
 `payload` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 INDEX `waste_case_events_wasteId_createdAt_idx` (`wasteId`,`createdAt`),
 INDEX `waste_case_events_actorId_idx` (`actorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `waste_cases` ADD CONSTRAINT `waste_cases_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `waste_cases` ADD CONSTRAINT `waste_cases_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `waste_cases` ADD CONSTRAINT `waste_cases_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `waste_cases` ADD CONSTRAINT `waste_cases_reversedById_fkey` FOREIGN KEY (`reversedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `waste_case_lines` ADD CONSTRAINT `waste_case_lines_wasteId_fkey` FOREIGN KEY (`wasteId`) REFERENCES `waste_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `waste_case_lines` ADD CONSTRAINT `waste_case_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `waste_case_events` ADD CONSTRAINT `waste_case_events_wasteId_fkey` FOREIGN KEY (`wasteId`) REFERENCES `waste_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `waste_case_events` ADD CONSTRAINT `waste_case_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements`
 ADD COLUMN `wasteId` VARCHAR(191) NULL,
 ADD INDEX `stock_movements_wasteId_idx` (`wasteId`),
 MODIFY `kind` ENUM('RECEIPT','RECEIPT_REVERSAL','OPENING_BALANCE','COUNT_ADJUSTMENT','WASTE','WASTE_REVERSAL') NOT NULL;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_wasteId_fkey` FOREIGN KEY (`wasteId`) REFERENCES `waste_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
