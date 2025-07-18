/**
 * Ice Cream Shop Worker with Queue Processing using Hono
 * 
 * This worker handles ice cream orders using Cloudflare Queues for async processing.
 * Built with Hono framework for clean routing and middleware.
 * 
 * - POST /order - Place a new ice cream order (produces to queue)
 * - GET /status/:orderId - Check order status  
 * - GET /orders/stats - View order statistics
 * - Queue consumer processes orders asynchronously
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Env {
	ICE_CREAM_QUEUE: Queue;
}

interface IceCreamOrder {
	orderId: string;
	customerName: string;
	flavor: string;
	size: 'small' | 'medium' | 'large';
	toppings?: string[];
	timestamp: string;
}

// Initialize Hono app with environment bindings
const app = new Hono<{ Bindings: Env }>()

// Add CORS middleware for all routes
app.use('*', cors({
	origin: '*',
	allowMethods: ['GET', 'POST', 'OPTIONS'],
	allowHeaders: ['Content-Type'],
}))

// Root endpoint - API documentation
app.get('/', (c) => {
	return c.text(`🍦 Ice Cream Shop API

Available endpoints:
- POST /order - Place new ice cream order
- GET /status/{orderId} - Check order status
- GET /orders/stats - View order statistics

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

		// Create order with generated ID
		const order: IceCreamOrder = {
			orderId: crypto.randomUUID(),
			customerName: orderData.customerName,
			flavor: orderData.flavor,
			size: orderData.size,
			toppings: orderData.toppings || [],
			timestamp: new Date().toISOString(),
		}

		// Send order to queue for processing
		await c.env.ICE_CREAM_QUEUE.send(order)

		return c.json({
			success: true,
			message: 'Order placed successfully! 🍦',
			orderId: order.orderId,
			estimatedTime: '5-10 minutes',
			order: {
				customer: order.customerName,
				item: `${order.size} ${order.flavor} ice cream`,
				toppings: order.toppings
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
app.get('/status/:orderId', (c) => {
	const orderId = c.req.param('orderId')
	
	// Validate orderId format (basic UUID check)
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	if (!uuidRegex.test(orderId)) {
		return c.json({
			error: 'Invalid order ID format'
		}, 400)
	}
	
	// In a real application, you'd check order status from a database
	// For this example, we'll return a mock status
	const statuses = ['preparing', 'ready', 'completed']
	const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
	
	const statusMessages = {
		preparing: 'Your delicious ice cream is being prepared! 👨‍🍳',
		ready: 'Your ice cream is ready for pickup! 🎉',
		completed: 'Order completed - hope you enjoyed it! 😋'
	}
	
	return c.json({
		orderId,
		status: randomStatus,
		message: statusMessages[randomStatus as keyof typeof statusMessages],
		estimatedWaitTime: randomStatus === 'preparing' ? '3-7 minutes' : null
	})
})

// Get order statistics
app.get('/orders/stats', (c) => {
	return c.json({
		title: 'Ice Cream Shop Statistics 📊',
		note: 'In a real application, this would show actual metrics from your database',
		stats: {
			popularFlavors: [
				{ flavor: 'Vanilla', percentage: 35 },
				{ flavor: 'Chocolate', percentage: 28 },
				{ flavor: 'Strawberry', percentage: 22 },
				{ flavor: 'Mint Chocolate Chip', percentage: 15 }
			],
			averageProcessingTime: '7 minutes',
			dailyOrders: Math.floor(Math.random() * 100) + 50,
			popularSize: 'medium',
			topToppings: ['sprinkles', 'hot fudge', 'cherry', 'nuts']
		}
	})
})

// Health check endpoint
app.get('/health', (c) => {
	return c.json({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		service: 'Ice Cream Shop API'
	})
})

// Handle 404 for unknown routes
app.notFound((c) => {
	return c.json({
		error: 'Endpoint not found 🤔',
		message: 'Check the root endpoint / for available routes'
	}, 404)
})

// Export the app with queue consumer
export default {
	fetch: app.fetch,
	
	// Queue consumer - processes ice cream orders asynchronously
	async queue(batch: MessageBatch, env: Env): Promise<void> {
		console.log(`🍦 Processing batch of ${batch.messages.length} ice cream orders`)
		
		for (const message of batch.messages) {
			try {
				const order = message.body as IceCreamOrder
				await processIceCreamOrder(order)
				console.log(`✅ Successfully processed order ${order.orderId}`)
			} catch (error) {
				const order = message.body as IceCreamOrder
				console.error(`❌ Failed to process order ${order.orderId}:`, error)
				// Let the message retry based on queue configuration
				throw error
			}
		}
	},
} satisfies ExportedHandler<Env>

async function processIceCreamOrder(order: IceCreamOrder): Promise<void> {
	// Simulate ice cream preparation process
	console.log(`👨‍🍳 Starting preparation for order ${order.orderId}`)
	console.log(`Customer: ${order.customerName}`)
	console.log(`Order: ${order.size} ${order.flavor} ice cream`)
	
	if (order.toppings && order.toppings.length > 0) {
		console.log(`Toppings: ${order.toppings.join(', ')}`)
	}

	// In a real application, you would:
	// 1. Update order status in database (KV/D1)
	// 2. Send notifications to customer (email/SMS)
	// 3. Update inventory levels
	// 4. Generate analytics data (Analytics Engine)
	// 5. Send to fulfillment system
	// 6. Update real-time dashboard (WebSockets/Durable Objects)

	// Simulate processing time variance (1-3 seconds)
	const processingTime = Math.random() * 2000 + 1000
	await new Promise(resolve => setTimeout(resolve, processingTime))
	
	console.log(`🎉 Completed order ${order.orderId} in ${processingTime.toFixed(0)}ms`)
}
