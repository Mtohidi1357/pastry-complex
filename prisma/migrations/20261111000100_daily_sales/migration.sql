-- Additive migration. Back up the database before applying. No seed or data deletion.
CREATE TABLE `sales_days` (
 `id` VARCHAR(191) NOT NULL, `branchId` VARCHAR(191) NOT NULL, `businessDate` DATETIME(3) NOT NULL,
 `activeReportId` VARCHAR(191) NULL,
 UNIQUE INDEX `sales_days_activeReportId_key` (`activeReportId`),
 UNIQUE INDEX `sales_days_branchId_businessDate_key` (`branchId`,`businessDate`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `sales_reports` (
 `id` VARCHAR(191) NOT NULL, `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
 `clientRequestId` VARCHAR(191) NOT NULL, `createHash` CHAR(64) NOT NULL,
 `dayId` VARCHAR(191) NOT NULL, `branchId` VARCHAR(191) NOT NULL, `businessDate` DATETIME(3) NOT NULL,
 `status` ENUM('DRAFT','SUBMITTED','POSTED','REVERSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 `version` INTEGER NOT NULL DEFAULT 1, `note` TEXT NOT NULL,
 `createdById` VARCHAR(191) NOT NULL, `postedById` VARCHAR(191) NULL, `reversedById` VARCHAR(191) NULL,
 `postedAt` DATETIME(3) NULL, `reversedAt` DATETIME(3) NULL, `reversalReason` TEXT NULL,
 `correctsReportId` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 UNIQUE INDEX `sales_reports_trackingNumber_key` (`trackingNumber`), UNIQUE INDEX `sales_reports_clientRequestId_key` (`clientRequestId`),
 INDEX `sales_reports_branchId_status_businessDate_idx` (`branchId`,`status`,`businessDate`),
 INDEX `sales_reports_dayId_idx` (`dayId`), INDEX `sales_reports_createdById_idx` (`createdById`),
 INDEX `sales_reports_postedById_idx` (`postedById`), INDEX `sales_reports_reversedById_idx` (`reversedById`), INDEX `sales_reports_correctsReportId_idx` (`correctsReportId`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `sales_report_lines` (
 `id` VARCHAR(191) NOT NULL, `reportId` VARCHAR(191) NOT NULL, `productId` VARCHAR(191) NOT NULL, `quantity` DECIMAL(18,3) NOT NULL,
 UNIQUE INDEX `sales_report_lines_reportId_productId_key` (`reportId`,`productId`), INDEX `sales_report_lines_productId_idx` (`productId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `sales_report_events` (
 `id` VARCHAR(191) NOT NULL, `reportId` VARCHAR(191) NOT NULL, `actorId` VARCHAR(191) NOT NULL,
 `action` VARCHAR(191) NOT NULL, `version` INTEGER NOT NULL, `clientRequestId` VARCHAR(191) NULL,
 `payloadHash` CHAR(64) NULL, `note` TEXT NOT NULL, `payload` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `sales_report_events_clientRequestId_key` (`clientRequestId`), INDEX `sales_report_events_reportId_createdAt_idx` (`reportId`,`createdAt`), INDEX `sales_report_events_actorId_idx` (`actorId`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `stock_movements`
 ADD COLUMN `salesReportId` VARCHAR(191) NULL,
 MODIFY `kind` ENUM('RECEIPT','RECEIPT_REVERSAL','OPENING_BALANCE','COUNT_ADJUSTMENT','WASTE','WASTE_REVERSAL','PRODUCTION','PRODUCTION_REVERSAL','DISPATCH','DELIVERY_RECEIVING','DISPATCH_RETURN','RETURN_DISPATCH','RETURN_RECEIVING','RETURN_RESTORE','SALE','SALE_REVERSAL') NOT NULL,
 ADD INDEX `stock_movements_salesReportId_idx` (`salesReportId`);
ALTER TABLE `sales_days` ADD CONSTRAINT `sales_days_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales_reports`
 ADD CONSTRAINT `sales_reports_dayId_fkey` FOREIGN KEY (`dayId`) REFERENCES `sales_days` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT `sales_reports_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT `sales_reports_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT `sales_reports_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
 ADD CONSTRAINT `sales_reports_reversedById_fkey` FOREIGN KEY (`reversedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
 ADD CONSTRAINT `sales_reports_correctsReportId_fkey` FOREIGN KEY (`correctsReportId`) REFERENCES `sales_reports` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `sales_days` ADD CONSTRAINT `sales_days_activeReportId_fkey` FOREIGN KEY (`activeReportId`) REFERENCES `sales_reports` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `sales_report_lines`
 ADD CONSTRAINT `sales_report_lines_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `sales_reports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 ADD CONSTRAINT `sales_report_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales_report_events`
 ADD CONSTRAINT `sales_report_events_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `sales_reports` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT `sales_report_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_salesReportId_fkey` FOREIGN KEY (`salesReportId`) REFERENCES `sales_reports` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
