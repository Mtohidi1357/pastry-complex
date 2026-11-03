-- Old manual receipts retain NULL sourceRequestId and their original balances.
ALTER TABLE `stock_receipts` ADD COLUMN `sourceRequestId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `stock_receipts_sourceRequestId_key` ON `stock_receipts` (`sourceRequestId`);
ALTER TABLE `stock_receipts` ADD CONSTRAINT `stock_receipts_sourceRequestId_fkey` FOREIGN KEY (`sourceRequestId`) REFERENCES `daily_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
