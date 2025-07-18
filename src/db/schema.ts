import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  customerName: text('customer_name').notNull(),
  flavor: text('flavor').notNull(),
  size: text('size', { enum: ['small', 'medium', 'large'] }).notNull(),
  toppings: text('toppings'), // JSON string of array
  status: text('status', { enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled'] }).default('pending'),
  totalPrice: real('total_price'), // Price in dollars
  estimatedTime: text('estimated_time'), // Estimated completion time
  orderNotes: text('order_notes'), // Special instructions
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
  completedAt: text('completed_at'), // When order was completed
  queuedAt: text('queued_at'), // When order was sent to queue
  processedAt: text('processed_at'), // When queue processing started
});

export const orderStats = sqliteTable('order_stats', {
  id: integer('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD format
  totalOrders: integer('total_orders').default(0),
  totalRevenue: real('total_revenue').default(0),
  avgProcessingTime: real('avg_processing_time'), // In seconds
  popularFlavor: text('popular_flavor'),
  popularSize: text('popular_size'),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderStats = typeof orderStats.$inferSelect;
export type NewOrderStats = typeof orderStats.$inferInsert; 