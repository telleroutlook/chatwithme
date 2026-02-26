-- Migration: Add Image Analyses
-- Created: 2025-02-26
-- Description: Add image_analyses column to messages table for storing image analysis results

-- Add image_analyses column to messages table
ALTER TABLE `messages` ADD COLUMN `image_analyses` text;
