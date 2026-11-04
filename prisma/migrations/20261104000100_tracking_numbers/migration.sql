-- MySQL/MariaDB allocate these numbers, including for inserts outside the app.
-- Adding AUTO_INCREMENT assigns numbers to existing rows; UUID primary keys stay unchanged.
ALTER TABLE `users` ADD COLUMN `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
  ADD UNIQUE INDEX `users_trackingNumber_key` (`trackingNumber`);
ALTER TABLE `daily_requests` ADD COLUMN `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
  ADD UNIQUE INDEX `daily_requests_trackingNumber_key` (`trackingNumber`);
ALTER TABLE `stock_receipts` ADD COLUMN `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
  ADD UNIQUE INDEX `stock_receipts_trackingNumber_key` (`trackingNumber`);
ALTER TABLE `stock_counts` ADD COLUMN `trackingNumber` INTEGER NOT NULL AUTO_INCREMENT,
  ADD UNIQUE INDEX `stock_counts_trackingNumber_key` (`trackingNumber`);
