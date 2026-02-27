-- Add language column to users table
ALTER TABLE `users` ADD COLUMN `language` text NOT NULL DEFAULT 'en';
