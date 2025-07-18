/**
 * OrderCounter Durable Object
 * 
 * Tracks the total number of completed ice cream orders in real-time.
 * Provides WebSocket connections for live updates to connected clients.
 * Persists counter state using Durable Object storage.
 */

import { DurableObject } from "cloudflare:workers";

interface Env {
  ORDER_COUNTER: DurableObjectNamespace;
}

export class OrderCounter extends DurableObject {
  private sessions: Set<WebSocket>;
  private currentCount: number = 0;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sessions = new Set();
    
    // Initialize counter from storage on startup
    this.initializeCounter();
    
    // Set up WebSocket auto-response for keepalive
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async initializeCounter(): Promise<void> {
    // Load the current count from persistent storage
    const storedCount = await this.ctx.storage.get<number>("completedOrders");
    this.currentCount = storedCount || 0;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade requests
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader?.toLowerCase().includes("websocket")) {
      return this.handleWebSocketUpgrade(request);
    }

    // Handle API requests
    switch (url.pathname) {
      case "/increment":
        return this.handleIncrement();
      case "/count":
        return this.handleGetCount();
      case "/reset":
        return this.handleReset();
      default:
        return new Response("OrderCounter Durable Object", { status: 200 });
    }
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the WebSocket connection
    this.ctx.acceptWebSocket(server);
    this.sessions.add(server);

    // Send current count immediately upon connection
    server.send(JSON.stringify({
      type: "count_update",
      count: this.currentCount,
      timestamp: new Date().toISOString()
    }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleIncrement(): Promise<Response> {
    // Increment the counter
    this.currentCount++;
    
    // Persist to storage
    await this.ctx.storage.put("completedOrders", this.currentCount);
    
    // Broadcast to all connected WebSocket clients
    this.broadcast({
      type: "count_update",
      count: this.currentCount,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      count: this.currentCount,
      message: "Order counter incremented"
    });
  }

  private async handleGetCount(): Promise<Response> {
    return Response.json({
      count: this.currentCount,
      timestamp: new Date().toISOString()
    });
  }

  private async handleReset(): Promise<Response> {
    // Reset counter to 0
    this.currentCount = 0;
    
    // Persist to storage
    await this.ctx.storage.put("completedOrders", this.currentCount);
    
    // Broadcast to all connected WebSocket clients
    this.broadcast({
      type: "count_update",
      count: this.currentCount,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      count: this.currentCount,
      message: "Order counter reset to 0"
    });
  }

  // WebSocket message handler
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case "get_count":
          // Send current count to requesting client
          ws.send(JSON.stringify({
            type: "count_update",
            count: this.currentCount,
            timestamp: new Date().toISOString()
          }));
          break;
        
        case "ping":
          // Respond to client ping with pong
          ws.send(JSON.stringify({ type: "pong" }));
          break;
          
        default:
          console.log("Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  }

  // WebSocket close handler
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Remove from sessions set
    this.sessions.delete(ws);
    console.log(`WebSocket closed: Code ${code}, Reason: ${reason}, Clean: ${wasClean}`);
  }

  // WebSocket error handler
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error:", error);
    this.sessions.delete(ws);
  }

  // Broadcast message to all connected WebSocket clients
  private broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    
    // Get all active WebSocket connections
    this.ctx.getWebSockets().forEach((ws) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(messageStr);
        }
      } catch (error) {
        console.error("Error broadcasting to WebSocket client:", error);
        this.sessions.delete(ws);
      }
    });
  }

  // RPC method to increment counter (can be called from other Workers)
  async incrementOrderCount(): Promise<number> {
    this.currentCount++;
    await this.ctx.storage.put("completedOrders", this.currentCount);
    
    // Broadcast to WebSocket clients
    this.broadcast({
      type: "count_update",
      count: this.currentCount,
      timestamp: new Date().toISOString()
    });
    
    return this.currentCount;
  }

  // RPC method to get current count
  async getCurrentCount(): Promise<number> {
    return this.currentCount;
  }
} 