CREATE TABLE `order_stats` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`total_orders` integer DEFAULT 0,
	`total_revenue` real DEFAULT 0,
	`avg_processing_time` real,
	`popular_flavor` text,
	`popular_size` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
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
