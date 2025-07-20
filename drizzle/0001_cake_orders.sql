-- Migration: Create orders table for cake shop
-- This creates the main orders table for the cake shop

CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`flavor` text NOT NULL,
	`size` text NOT NULL,
	`toppings` text,
	`status` text DEFAULT 'pending',
	`total_price` real,
	`estimated_time` text,
	`order_notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`queued_at` text,
	`processed_at` text
);

-- Create index for status queries
CREATE INDEX `orders_status_idx` ON `orders` (`status`);

-- Create index for date queries
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);

-- Create index for customer queries
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_name`);

-- Add constraints for size enum
-- Size must be one of: '6-inch', '8-inch', '10-inch'

-- Add constraints for status enum  
-- Status must be one of: 'pending', 'preparing', 'ready', 'completed', 'cancelled' 