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
  private completedCount: number = 0;
  private queuedCount: number = 0;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sessions = new Set();
    
    // Initialize counters from storage on startup
    this.initializeCounters();
    
    // Set up WebSocket auto-response for keepalive
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async initializeCounters(): Promise<void> {
    // Load the current counts from persistent storage
    const [storedCompleted, storedQueued] = await Promise.all([
      this.ctx.storage.get<number>("completedOrders"),
      this.ctx.storage.get<number>("queuedOrders")
    ]);
    
    this.completedCount = storedCompleted || 0;
    this.queuedCount = storedQueued || 0;
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
      case "/increment-completed":
        return this.handleIncrementCompleted();
      case "/increment-queued":
        return this.handleIncrementQueued();
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

    // Send current counts immediately upon connection
    server.send(JSON.stringify({
      type: "count_update",
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      timestamp: new Date().toISOString()
    }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleIncrementCompleted(): Promise<Response> {
    // Increment the completed counter
    this.completedCount++;
    
    // Persist to storage
    await this.ctx.storage.put("completedOrders", this.completedCount);
    
    // Broadcast to all connected WebSocket clients
    this.broadcast({
      type: "count_update",
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      message: "Completed order counter incremented"
    });
  }

  private async handleIncrementQueued(): Promise<Response> {
    // Increment the queued counter
    this.queuedCount++;
    
    // Persist to storage
    await this.ctx.storage.put("queuedOrders", this.queuedCount);
    
    // Broadcast to all connected WebSocket clients
    this.broadcast({
      type: "count_update",
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      message: "Queued order counter incremented"
    });
  }

  private async handleGetCount(): Promise<Response> {
    return Response.json({
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      timestamp: new Date().toISOString()
    });
  }

  private async handleReset(): Promise<Response> {
    // Reset both counters to 0
    this.completedCount = 0;
    this.queuedCount = 0;
    
    // Persist to storage
    await Promise.all([
      this.ctx.storage.put("completedOrders", this.completedCount),
      this.ctx.storage.put("queuedOrders", this.queuedCount)
    ]);
    
    // Broadcast to all connected WebSocket clients
    this.broadcast({
      type: "count_update",
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      message: "Both counters reset to 0"
    });
  }

  // WebSocket message handler
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case "get_count":
          // Send current counts to requesting client
          ws.send(JSON.stringify({
            type: "count_update",
            completedCount: this.completedCount,
            queuedCount: this.queuedCount,
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

  // RPC method to increment completed counter (can be called from other Workers)
  async incrementCompletedCount(): Promise<{ completedCount: number; queuedCount: number }> {
    this.completedCount++;
    await this.ctx.storage.put("completedOrders", this.completedCount);
    
    // Broadcast to WebSocket clients
    this.broadcast({
      type: "count_update",
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      timestamp: new Date().toISOString()
    });
    
    return { completedCount: this.completedCount, queuedCount: this.queuedCount };
  }

  // RPC method to increment queued counter (can be called from other Workers)
  async incrementQueuedCount(): Promise<{ completedCount: number; queuedCount: number }> {
    this.queuedCount++;
    await this.ctx.storage.put("queuedOrders", this.queuedCount);
    
    // Broadcast to WebSocket clients
    this.broadcast({
      type: "count_update",
      completedCount: this.completedCount,
      queuedCount: this.queuedCount,
      timestamp: new Date().toISOString()
    });
    
    return { completedCount: this.completedCount, queuedCount: this.queuedCount };
  }

  // RPC method to get current counts
  async getCurrentCounts(): Promise<{ completedCount: number; queuedCount: number }> {
    return { completedCount: this.completedCount, queuedCount: this.queuedCount };
  }
} 