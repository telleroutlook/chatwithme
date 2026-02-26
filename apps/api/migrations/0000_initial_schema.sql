-- Migration: Initial Schema
-- Created: 2024-01-01

-- Users table
CREATE TABLE IF NOT EXISTS `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL UNIQUE,
  `username` text NOT NULL UNIQUE,
  `password` text NOT NULL,
  `avatar` text DEFAULT '',
  `email_verified_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- Conversations table
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `title` text NOT NULL DEFAULT '',
  `starred` integer DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Messages table
CREATE TABLE IF NOT EXISTS `messages` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `conversation_id` text NOT NULL,
  `role` text NOT NULL,
  `message` text NOT NULL,
  `files` text,
  `generated_image_urls` text,
  `search_results` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token` text NOT NULL UNIQUE,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS `conversations_user_id_idx` ON `conversations`(`user_id`);
CREATE INDEX IF NOT EXISTS `conversations_updated_at_idx` ON `conversations`(`updated_at`);
CREATE INDEX IF NOT EXISTS `messages_conversation_id_idx` ON `messages`(`conversation_id`);
CREATE INDEX IF NOT EXISTS `messages_created_at_idx` ON `messages`(`created_at`);
CREATE INDEX IF NOT EXISTS `refresh_tokens_user_id_idx` ON `refresh_tokens`(`user_id`);
CREATE INDEX IF NOT EXISTS `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);
