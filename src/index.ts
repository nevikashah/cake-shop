/**
 * Ice Cream Shop Worker with Queue Processing and D1 Database Persistence
 *
 * This worker handles ice cream orders using:
 * - Cloudflare Queues for async processing
 * - D1 Database with Drizzle ORM for persistence
 * - Hono framework for clean routing and middleware
 * - OpenTelemetry tracing with Honeycomb integration
 *
 * - POST /order - Place a new ice cream order (saves to DB, produces to queue)
 * - GET /status/:orderId - Check order status (reads from DB)
 * - GET /orders/stats - View order statistics (reads from DB)
 * - Queue consumer processes orders asynchronously and updates DB
 *
 * Setup OpenTelemetry with Honeycomb:
 * 1. Get your API key from https://ui.honeycomb.io/account
 * 2. Set it as a secret: wrangler secret put HONEYCOMB_API_KEY
 * 3. Deploy: wrangler deploy
 * 4. View traces at https://ui.honeycomb.io/{your-team}/datasets/ice-cream-shop
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, count, avg, sql } from 'drizzle-orm'
import { orders, orderStats, type Order, type NewOrder } from './db/schema'
import { OrderCounter } from './order-counter'
import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'

interface Env {
	ICE_CREAM_QUEUE: Queue
	DB: D1Database
	ORDER_COUNTER: DurableObjectNamespace
	HONEYCOMB_API_KEY: string
}

interface IceCreamOrder {
	orderId: string
	customerName: string
	flavor: string
	size: 'small' | 'medium' | 'large'
	toppings?: string[]
	timestamp: string
}

// Initialize Hono app with environment bindings
const app = new Hono<{ Bindings: Env }>()

// Add CORS middleware for all routes
app.use('*', cors({
	origin: '*',
	allowMethods: ['GET', 'POST', 'OPTIONS'],
	allowHeaders: ['Content-Type'],
}))

// Helper function to calculate price
function calculatePrice(size: string, toppings: string[] = []): number {
	const basePrices = { small: 3.99, medium: 5.99, large: 7.99 }
	const basePrice = basePrices[size as keyof typeof basePrices] || 5.99
	const toppingsPrice = toppings.length * 0.75 // $0.75 per topping
	return Math.round((basePrice + toppingsPrice) * 100) / 100
}

// Helper function to estimate completion time
function estimateTime(size: string, toppings: string[] = []): string {
	const baseMinutes = { small: 3, medium: 5, large: 7 }
	const base = baseMinutes[size as keyof typeof baseMinutes] || 5
	const extra = Math.floor(toppings.length / 2) // Extra minute per 2 toppings
	const total = base + extra
	return `${total}-${total + 2} minutes`
}

// Root endpoint - API documentation
app.get('/', (c) => {
	return c.text(`🍦 Ice Cream Shop API with D1 Database

Available endpoints:
- POST /order - Place new ice cream order
- GET /status/{orderId} - Check order status
- GET /orders/stats - View order statistics
- GET /orders/recent - View recent orders

Example order:
{
  "customerName": "Alice",
  "flavor": "Chocolate",
  "size": "medium",
  "toppings": ["sprinkles", "cherry"]
}`)
})

// Place a new ice cream order
app.post('/order', async (c) => {
	try {
		const db = drizzle(c.env.DB)
		const orderData = await c.req.json() as Partial<IceCreamOrder>

		// Validate required fields
		if (!orderData.customerName || !orderData.flavor || !orderData.size) {
			return c.json({
				error: 'Missing required fields: customerName, flavor, size'
			}, 400)
		}

		// Validate size
		if (!['small', 'medium', 'large'].includes(orderData.size)) {
			return c.json({
				error: 'Invalid size. Must be: small, medium, or large'
			}, 400)
		}

		const orderId = crypto.randomUUID()
		const toppings = orderData.toppings || []
		const totalPrice = calculatePrice(orderData.size, toppings)
		const estimatedTime = estimateTime(orderData.size, toppings)
		const now = new Date().toISOString()

		// Create order object for database
		const newOrder: NewOrder = {
			id: orderId,
			customerName: orderData.customerName,
			flavor: orderData.flavor,
			size: orderData.size as 'small' | 'medium' | 'large',
			toppings: JSON.stringify(toppings),
			status: 'pending',
			totalPrice,
			estimatedTime,
			createdAt: now,
			updatedAt: now,
			queuedAt: now
		}

		// Save order to database
		await db.insert(orders).values(newOrder)

		// Increment the queued orders counter
		try {
			const counterId = c.env.ORDER_COUNTER.idFromName('global-counter')
			const counter = c.env.ORDER_COUNTER.get(counterId)
			await counter.fetch(new Request('http://localhost/increment-queued', { method: 'POST' }))
			console.log(`📊 Incremented queued orders counter`)
		} catch (error) {
			console.error('Failed to update queued counter:', error)
			// Don't fail the order if counter update fails
		}

		// Send order to queue for processing
		const queueOrder: IceCreamOrder = {
			orderId,
			customerName: orderData.customerName,
			flavor: orderData.flavor,
			size: orderData.size,
			toppings,
			timestamp: now
		}
		await c.env.ICE_CREAM_QUEUE.send(queueOrder)

		return c.json({
			success: true,
			message: 'Order placed successfully! 🍦',
			orderId,
			estimatedTime,
			totalPrice,
			order: {
				customer: orderData.customerName,
				item: `${orderData.size} ${orderData.flavor} ice cream`,
				toppings: toppings
			}
		})

	} catch (error) {
		console.error('Order processing error:', error)
		return c.json({
			error: 'Failed to process order'
		}, 500)
	}
})

// Check order status
app.get('/status/:orderId', async (c) => {
	try {
		const db = drizzle(c.env.DB)
		const orderId = c.req.param('orderId')

		// Validate orderId format (basic UUID check)
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		if (!uuidRegex.test(orderId)) {
			return c.json({
				error: 'Invalid order ID format'
			}, 400)
		}

		// Get order from database
		const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)

		if (!order) {
			return c.json({
				error: 'Order not found'
			}, 404)
		}

		const statusMessages = {
			pending: 'Your order has been received and is waiting to be prepared! 📝',
			preparing: 'Your delicious ice cream is being prepared! 👨‍🍳',
			ready: 'Your ice cream is ready for pickup! 🎉',
			completed: 'Order completed - hope you enjoyed it! 😋',
			cancelled: 'Order was cancelled 😕'
		}

		return c.json({
			orderId: order.id,
			customerName: order.customerName,
			status: order.status,
			message: statusMessages[order.status as keyof typeof statusMessages] || 'Order status unknown',
			estimatedTime: order.status === 'pending' || order.status === 'preparing' ? order.estimatedTime : null,
			totalPrice: order.totalPrice,
			item: `${order.size} ${order.flavor} ice cream`,
			toppings: order.toppings ? JSON.parse(order.toppings) : [],
			createdAt: order.createdAt,
			updatedAt: order.updatedAt,
			completedAt: order.completedAt
		})

	} catch (error) {
		console.error('Status check error:', error)
		return c.json({
			error: 'Failed to check order status'
		}, 500)
	}
})

// Get order statistics
app.get('/orders/stats', async (c) => {
	try {
		const db = drizzle(c.env.DB)
		
		// Get today's date
		const today = new Date().toISOString().split('T')[0]

		// Get basic counts
		const [totalOrdersResult] = await db
			.select({ count: count() })
			.from(orders)

		const [todayOrdersResult] = await db
			.select({ count: count() })
			.from(orders)
			.where(sql`date(${orders.createdAt}) = ${today}`)

		// Get popular flavors
		const popularFlavors = await db
			.select({
				flavor: orders.flavor,
				count: count()
			})
			.from(orders)
			.groupBy(orders.flavor)
			.orderBy(desc(count()))
			.limit(5)

		// Get popular sizes
		const [popularSizeResult] = await db
			.select({
				size: orders.size,
				count: count()
			})
			.from(orders)
			.groupBy(orders.size)
			.orderBy(desc(count()))
			.limit(1)

		// Calculate average processing time for completed orders
		const [avgTimeResult] = await db
			.select({
				avgSeconds: sql<number>`AVG(
					CASE 
						WHEN ${orders.processedAt} IS NOT NULL AND ${orders.completedAt} IS NOT NULL
						THEN (julianday(${orders.completedAt}) - julianday(${orders.processedAt})) * 86400
						ELSE NULL
					END
				)`
			})
			.from(orders)
			.where(sql`${orders.status} = 'completed' AND ${orders.processedAt} IS NOT NULL AND ${orders.completedAt} IS NOT NULL`)

		// Get top toppings
		const allOrders = await db.select({ toppings: orders.toppings }).from(orders)
		const toppingsCount: Record<string, number> = {}
		
		allOrders.forEach(order => {
			if (order.toppings) {
				try {
					const toppings = JSON.parse(order.toppings) as string[]
					toppings.forEach(topping => {
						toppingsCount[topping] = (toppingsCount[topping] || 0) + 1
					})
				} catch (e) {
					// Ignore invalid JSON
				}
			}
		})

		const topToppings = Object.entries(toppingsCount)
			.sort(([,a], [,b]) => b - a)
			.slice(0, 5)
			.map(([topping]) => topping)

		// Format popular flavors with percentages
		const totalOrders = totalOrdersResult.count || 0
		const formattedFlavors = popularFlavors.map(flavor => ({
			flavor: flavor.flavor,
			percentage: totalOrders > 0 ? Math.round((flavor.count / totalOrders) * 100) : 0
		}))

		const avgProcessingMinutes = avgTimeResult.avgSeconds ? Math.round(avgTimeResult.avgSeconds / 60) : null

		return c.json({
			title: 'Ice Cream Shop Statistics 📊',
			stats: {
				totalOrders,
				dailyOrders: todayOrdersResult.count || 0,
				popularFlavors: formattedFlavors,
				averageProcessingTime: avgProcessingMinutes ? `${avgProcessingMinutes} minutes` : 'No data',
				popularSize: popularSizeResult?.size || 'medium',
				topToppings: topToppings.length > 0 ? topToppings : ['sprinkles', 'hot fudge', 'cherry']
			}
		})

	} catch (error) {
		console.error('Stats error:', error)
		return c.json({
			error: 'Failed to load statistics'
		}, 500)
	}
})

// Get recent orders
app.get('/orders/recent', async (c) => {
	try {
		const db = drizzle(c.env.DB)
		
		const recentOrders = await db
			.select()
			.from(orders)
			.orderBy(desc(orders.createdAt))
			.limit(10)

		const formattedOrders = recentOrders.map(order => ({
			...order,
			toppings: order.toppings ? JSON.parse(order.toppings) : []
		}))

		return c.json({
			orders: formattedOrders
		})

	} catch (error) {
		console.error('Recent orders error:', error)
		return c.json({
			error: 'Failed to load recent orders'
		}, 500)
	}
})

// Counter WebSocket endpoint for real-time updates
app.get('/counter/ws', async (c) => {
	const upgradeHeader = c.req.header('Upgrade')
	if (upgradeHeader?.toLowerCase().includes('websocket')) {
		// Get the global counter Durable Object
		const id = c.env.ORDER_COUNTER.idFromName('global-counter')
		const counter = c.env.ORDER_COUNTER.get(id)
		
		// Forward the WebSocket upgrade request to the Durable Object
		return counter.fetch(c.req.raw)
	}
	
	return c.json({
		error: 'WebSocket upgrade required'
	}, 400)
})

// Counter API endpoints
app.get('/counter', async (c) => {
	try {
		const id = c.env.ORDER_COUNTER.idFromName('global-counter')
		const counter = c.env.ORDER_COUNTER.get(id)
		const response = await counter.fetch(new Request('http://localhost/count'))
		return response
	} catch (error) {
		console.error('Counter error:', error)
		return c.json({ error: 'Failed to get counter' }, 500)
	}
})

app.post('/counter/reset', async (c) => {
	try {
		const id = c.env.ORDER_COUNTER.idFromName('global-counter')
		const counter = c.env.ORDER_COUNTER.get(id)
		const response = await counter.fetch(new Request('http://localhost/reset', { method: 'POST' }))
		return response
	} catch (error) {
		console.error('Counter reset error:', error)
		return c.json({ error: 'Failed to reset counter' }, 500)
	}
})

// Health check endpoint
app.get('/health', (c) => {
	return c.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		service: 'Ice Cream Shop API',
		database: 'D1 connected',
		queue: 'Queue connected',
		counter: 'OrderCounter Durable Object connected'
	})
})

// Handle 404 for unknown routes
app.notFound((c) => {
	return c.json({
		error: 'Endpoint not found 🤔',
		message: 'Check the root endpoint / for available routes'
	}, 404)
})

// OpenTelemetry configuration for Honeycomb
const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: {
			name: 'ice-cream-shop',
			version: '1.0.0',
			namespace: 'production'
		},
		sampling: {
			headSampler: {
				ratio: 1.0, // Sample all requests for demo purposes
			}
		}
	}
}

// Export the app with queue consumer
const handler = {
	fetch: app.fetch,

	// Queue consumer - processes ice cream orders asynchronously
	async queue(batch: MessageBatch, env: Env): Promise<void> {
		const db = drizzle(env.DB)
		console.log(`🍦 Processing batch of ${batch.messages.length} ice cream orders`)

		for (const message of batch.messages) {
			try {
				const order = message.body as IceCreamOrder
				await processIceCreamOrder(order, db, env)
				console.log(`✅ Successfully processed order ${order.orderId}`)
			} catch (error) {
				const order = message.body as IceCreamOrder
				console.error(`❌ Failed to process order ${order.orderId}:`, error)
				
				// Update order status to cancelled in database
				try {
					await db
						.update(orders)
						.set({ 
							status: 'cancelled', 
							updatedAt: new Date().toISOString() 
						})
						.where(eq(orders.id, order.orderId))
				} catch (dbError) {
					console.error(`Failed to update order status for ${order.orderId}:`, dbError)
				}
				
				// Let the message retry based on queue configuration
				throw error
			}
		}
	},
} satisfies ExportedHandler<Env>

// Wrap the handler with OpenTelemetry instrumentation
export default instrument(handler, config)

// Export the OrderCounter Durable Object
export { OrderCounter }

async function processIceCreamOrder(order: IceCreamOrder, db: any, env: Env): Promise<void> {
	const now = new Date().toISOString()
	
	// Update order status to preparing and set processedAt timestamp
	await db
		.update(orders)
		.set({ 
			status: 'preparing', 
			processedAt: now,
			updatedAt: now 
		})
		.where(eq(orders.id, order.orderId))

	console.log(`👨‍🍳 Starting preparation for order ${order.orderId}`)
	console.log(`Customer: ${order.customerName}`)
	console.log(`Order: ${order.size} ${order.flavor} ice cream`)

	if (order.toppings && order.toppings.length > 0) {
		console.log(`Toppings: ${order.toppings.join(', ')}`)
	}
	await fetch ("https://paypal.echoback.dev/v2/checkout/orders")
	// Simulate processing time variance (2-5 seconds for demo)
	const processingTime = Math.random() * 3000 + 2000
	await new Promise(resolve => setTimeout(resolve, processingTime))

	// Update order to completed status
	const completedAt = new Date().toISOString()
	await db
		.update(orders)
		.set({ 
			status: 'completed',
			completedAt,
			updatedAt: completedAt
		})
		.where(eq(orders.id, order.orderId))

	console.log(`🎉 Completed order ${order.orderId} in ${processingTime.toFixed(0)}ms`)

	// Increment the global completed orders counter in real-time
	try {
		const counterId = env.ORDER_COUNTER.idFromName('global-counter')
		const counter = env.ORDER_COUNTER.get(counterId)
		await counter.fetch(new Request('http://localhost/increment-completed', { method: 'POST' }))
		console.log(`📊 Updated global completed orders counter`)
	} catch (error) {
		console.error('Failed to update completed orders counter:', error)
		// Don't fail the order processing if counter update fails
	}

	// In a real application, you would also:
	// 1. Send notifications to customer (email/SMS)
	// 2. Update inventory levels
	// 3. Generate analytics data
	// 4. Send to fulfillment system
	// 5. Update real-time dashboard (WebSockets/Durable Objects)
}
