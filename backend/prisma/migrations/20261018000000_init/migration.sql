-- CreateTable
CREATE TABLE `senders` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `smtpHost` VARCHAR(191) NOT NULL,
    `smtpPort` INTEGER NOT NULL,
    `user` VARCHAR(191) NOT NULL,
    `pass` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `senders_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emails` (
    `id` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `status` ENUM('scheduled', 'sent', 'failed') NOT NULL DEFAULT 'scheduled',
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `emails_status_idx`(`status`),
    INDEX `emails_scheduledAt_idx`(`scheduledAt`),
    INDEX `emails_senderId_idx`(`senderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `emails` ADD CONSTRAINT `emails_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `senders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
