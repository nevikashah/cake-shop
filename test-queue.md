### Ice Cream Shop Queue Testing

# Place a new ice cream order (produces to queue)
POST http://localhost:8787/order
Content-Type: application/json

{
  "customerName": "Alice Smith",
  "flavor": "Chocolate",
  "size": "medium",
  "toppings": ["sprinkles", "cherry"]
}

### 

# Place another order
POST http://localhost:8787/order
Content-Type: application/json

{
  "customerName": "Bob Johnson", 
  "flavor": "Vanilla",
  "size": "large",
  "toppings": ["nuts", "hot fudge"]
}

###

# Check order status (replace {orderId} with actual order ID from response)
GET http://localhost:8787/status/12345678-1234-1234-1234-123456789abc

###

# Get order statistics
GET http://localhost:8787/orders/stats

###

# Test the main endpoint
GET http://localhost:8787/ 