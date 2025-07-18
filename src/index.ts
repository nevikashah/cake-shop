/**
 * Ice Cream Shop Worker with Queue Processing
 * 
 * This worker handles ice cream orders using Cloudflare Queues for async processing.
 * 
 * - `/order` - Place a new ice cream order (produces to queue)
 * - `/status/:orderId` - Check order status  
 * - Queue consumer processes orders asynchronously
 */

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

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		
		// Set CORS headers for all requests
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		switch (url.pathname) {
			case '/order':
				return handleOrderRequest(request, env, corsHeaders);
			
			case '/orders/stats':
				return handleOrderStats(corsHeaders);
			
			default:
				if (url.pathname.startsWith('/status/')) {
					const orderId = url.pathname.split('/')[2];
					return handleOrderStatus(orderId, corsHeaders);
				}
				return new Response('Ice Cream Shop API\n\nAvailable endpoints:\n- POST /order - Place new order\n- GET /status/{orderId} - Check order status\n- GET /orders/stats - View order statistics', { 
					headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
				});
		}
	},

	// Queue consumer - processes ice cream orders asynchronously
	async queue(batch: MessageBatch, env: Env): Promise<void> {
		console.log(`Processing batch of ${batch.messages.length} ice cream orders`);
		
		for (const message of batch.messages) {
			try {
				const order = message.body as IceCreamOrder;
				await processIceCreamOrder(order);
				console.log(`Successfully processed order ${order.orderId}`);
			} catch (error) {
				const order = message.body as IceCreamOrder;
				console.error(`Failed to process order ${order.orderId}:`, error);
				// Let the message retry based on queue configuration
				throw error;
			}
		}
	},
} satisfies ExportedHandler<Env>;

async function handleOrderRequest(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { 
			status: 405, 
			headers: corsHeaders 
		});
	}

	try {
		const orderData = await request.json() as Partial<IceCreamOrder>;
		
		// Validate required fields
		if (!orderData.customerName || !orderData.flavor || !orderData.size) {
			return new Response(JSON.stringify({
				error: 'Missing required fields: customerName, flavor, size'
			}), { 
				status: 400, 
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Create order with generated ID
		const order: IceCreamOrder = {
			orderId: crypto.randomUUID(),
			customerName: orderData.customerName,
			flavor: orderData.flavor,
			size: orderData.size,
			toppings: orderData.toppings || [],
			timestamp: new Date().toISOString(),
		};

		// Send order to queue for processing
		await env.ICE_CREAM_QUEUE.send(order);

		return new Response(JSON.stringify({
			message: 'Order placed successfully!',
			orderId: order.orderId,
			estimatedTime: '5-10 minutes'
		}), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});

	} catch (error) {
		console.error('Order processing error:', error);
		return new Response(JSON.stringify({
			error: 'Failed to process order'
		}), { 
			status: 500, 
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
}

async function handleOrderStatus(orderId: string, corsHeaders: Record<string, string>): Promise<Response> {
	// In a real application, you'd check order status from a database
	// For this example, we'll return a mock status
	const statuses = ['preparing', 'ready', 'completed'];
	const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
	
	return new Response(JSON.stringify({
		orderId,
		status: randomStatus,
		message: randomStatus === 'ready' ? 'Your ice cream is ready for pickup!' : 
				randomStatus === 'completed' ? 'Order completed' : 'Your ice cream is being prepared'
	}), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

async function handleOrderStats(corsHeaders: Record<string, string>): Promise<Response> {
	return new Response(JSON.stringify({
		message: 'Order statistics',
		note: 'In a real application, this would show actual order metrics from your database',
		popularFlavors: ['Vanilla', 'Chocolate', 'Strawberry'],
		averageProcessingTime: '7 minutes'
	}), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

async function processIceCreamOrder(order: IceCreamOrder): Promise<void> {
	// Simulate ice cream preparation process
	console.log(`Starting preparation for order ${order.orderId}`);
	console.log(`Customer: ${order.customerName}`);
	console.log(`Order: ${order.size} ${order.flavor} ice cream`);
	
	if (order.toppings && order.toppings.length > 0) {
		console.log(`Toppings: ${order.toppings.join(', ')}`);
	}

	// In a real application, you would:
	// 1. Update order status in database
	// 2. Send notifications to customer
	// 3. Update inventory
	// 4. Generate analytics data
	// 5. Send to fulfillment system

	// Simulate processing time variance
	const processingTime = Math.random() * 2000 + 1000; // 1-3 seconds
	await new Promise(resolve => setTimeout(resolve, processingTime));
	
	console.log(`Completed order ${order.orderId} in ${processingTime.toFixed(0)}ms`);
}
