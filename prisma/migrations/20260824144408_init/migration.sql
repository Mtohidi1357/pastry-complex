-- CreateTable
CREATE TABLE `branches` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('SALES', 'BAKERY') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `branches_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `branchId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_branchId_idx`(`branchId`),
    INDEX `users_roleId_idx`(`roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_categories` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `displayName` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `product_categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `unit` ENUM('PCS', 'KG', 'GR', 'LITER', 'BOX') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `productionOrder` INTEGER NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `products_code_key`(`code`),
    UNIQUE INDEX `products_barcode_key`(`barcode`),
    INDEX `products_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_requests` (
    `id` VARCHAR(191) NOT NULL,
    `businessDate` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'INVENTORY_SUBMITTED', 'MANAGER_SUBMITTED', 'WORKSHOP_PROCESSING', 'COMPLETED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `branchId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `reportedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `assignedToId` VARCHAR(191) NULL,
    `lastActionAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,

    INDEX `daily_requests_branchId_businessDate_idx`(`branchId`, `businessDate`),
    INDEX `daily_requests_status_idx`(`status`),
    INDEX `daily_requests_businessDate_idx`(`businessDate`),
    INDEX `daily_requests_assignedToId_fkey`(`assignedToId`),
    INDEX `daily_requests_createdById_fkey`(`createdById`),
    INDEX `daily_requests_deletedById_fkey`(`deletedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_request_lines` (
    `id` VARCHAR(191) NOT NULL,
    `dailyRequestId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `previousBalance` INTEGER NOT NULL,
    `currentBalance` INTEGER NOT NULL,
    `reportTime` DATETIME(3) NULL,
    `requestedQty` INTEGER NULL,
    `producedQty` INTEGER NULL,
    `receivedQty` INTEGER NULL,
    `managerNote` VARCHAR(191) NULL,
    `workshopNote` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `daily_request_lines_productId_idx`(`productId`),
    UNIQUE INDEX `daily_request_lines_dailyRequestId_productId_key`(`dailyRequestId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_history` (
    `id` VARCHAR(191) NOT NULL,
    `dailyRequestId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('DRAFT', 'INVENTORY_SUBMITTED', 'MANAGER_SUBMITTED', 'WORKSHOP_PROCESSING', 'COMPLETED', 'CLOSED', 'CANCELLED') NULL,
    `toStatus` ENUM('DRAFT', 'INVENTORY_SUBMITTED', 'MANAGER_SUBMITTED', 'WORKSHOP_PROCESSING', 'COMPLETED', 'CLOSED', 'CANCELLED') NOT NULL,
    `note` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_history_dailyRequestId_idx`(`dailyRequestId`),
    INDEX `workflow_history_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_requests` ADD CONSTRAINT `daily_requests_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_requests` ADD CONSTRAINT `daily_requests_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_requests` ADD CONSTRAINT `daily_requests_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_requests` ADD CONSTRAINT `daily_requests_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_request_lines` ADD CONSTRAINT `daily_request_lines_dailyRequestId_fkey` FOREIGN KEY (`dailyRequestId`) REFERENCES `daily_requests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_request_lines` ADD CONSTRAINT `daily_request_lines_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_history` ADD CONSTRAINT `workflow_history_dailyRequestId_fkey` FOREIGN KEY (`dailyRequestId`) REFERENCES `daily_requests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_history` ADD CONSTRAINT `workflow_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
