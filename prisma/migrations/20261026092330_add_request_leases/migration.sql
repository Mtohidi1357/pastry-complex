-- CreateTable
CREATE TABLE `request_edit_lease` (
    `dailyRequestId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `request_edit_lease_token_key`(`token`),
    INDEX `request_edit_lease_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`dailyRequestId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `request_edit_lease` ADD CONSTRAINT `request_edit_lease_dailyRequestId_fkey` FOREIGN KEY (`dailyRequestId`) REFERENCES `daily_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
