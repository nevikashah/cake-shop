import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CakeOrder {
  orderId: string
  customerName: string
  flavor: string
  size: '6-inch' | '8-inch' | '10-inch'
  decorations?: string[]
  timestamp: string
}

interface OrderResponse {
  success: boolean
  message: string
  orderId: string
  estimatedTime: string
  order: {
    customer: string
    item: string
    decorations: string[]
  }
}

interface OrderStatus {
  orderId: string
  status: string
  message: string
  estimatedWaitTime?: string
}

interface OrderStats {
  title: string
  stats: {
    popularFlavors: Array<{ flavor: string; percentage: number }>
    averageProcessingTime: string
    dailyOrders: number
    popularSize: string
    topDecorations: string[]
  }
}

const FLAVORS = [
  'Vanilla', 'Chocolate', 'Red Velvet', 'Carrot', 
  'Lemon', 'Funfetti', 'Strawberry', 'German Chocolate'
]

const DECORATIONS = [
  'Buttercream Frosting', 'Cream Cheese Frosting', 'Chocolate Ganache', 'Fresh Berries', 
  'Edible Flowers', 'Sprinkles', 'Chocolate Shavings', 'Caramel Drizzle'
]

export default function CakeShopApp() {
  const [activeTab, setActiveTab] = useState<'order' | 'status' | 'stats'>('order')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Order form state
  const [customerName, setCustomerName] = useState('')
  const [selectedFlavor, setSelectedFlavor] = useState('')
  const [selectedSize, setSelectedSize] = useState<'6-inch' | '8-inch' | '10-inch'>('8-inch')
  const [selectedDecorations, setSelectedDecorations] = useState<string[]>([])
  const [lastOrder, setLastOrder] = useState<OrderResponse | null>(null)
  
  // Status check state
  const [statusOrderId, setStatusOrderId] = useState('')
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null)
  
  // Stats state
  const [stats, setStats] = useState<OrderStats | null>(null)

  const handleDecorationToggle = (decoration: string) => {
    setSelectedDecorations(prev => 
      prev.includes(decoration) 
        ? prev.filter(d => d !== decoration)
        : [...prev, decoration]
    )
  }

  const handlePlaceOrder = async () => {
    if (!customerName || !selectedFlavor) {
      setError('Please fill in your name and select a flavor!')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          flavor: selectedFlavor,
          size: selectedSize,
          decorations: selectedDecorations
        })
      })

      const data: OrderResponse = await response.json()
      
      if (data.success) {
        setLastOrder(data)
        // Clear form
        setCustomerName('')
        setSelectedFlavor('')
        setSelectedDecorations([])
        setSelectedSize('8-inch')
      } else {
        setError('Failed to place order: ' + data.message)
      }
    } catch (error) {
      setError('Error placing order: ' + String(error))
    } finally {
      setLoading(false)
    }
  }

  const handleCheckStatus = async () => {
    if (!statusOrderId) {
      setError('Please enter an order ID!')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/status/${statusOrderId}`)
      if (response.ok) {
        const data: OrderStatus = await response.json()
        setOrderStatus(data)
      } else {
        const errorData = await response.json() as { error: string }
        setError('Error: ' + errorData.error)
      }
    } catch (error) {
      setError('Error checking status: ' + String(error))
    } finally {
      setLoading(false)
    }
  }

  const handleLoadStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/orders/stats')
      const data: OrderStats = await response.json()
      setStats(data)
    } catch (error) {
      setError('Error loading stats: ' + String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'stats') {
      handleLoadStats()
    }
  }, [activeTab])

  return (
    <div className="min-h-screen bg-background p-4 font-base">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <Card className="bg-main text-main-foreground">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl">🍰 Neobrutalism Cake Shop</CardTitle>
            <CardDescription className="text-main-foreground/80 text-lg">
              Demo powered by Cloudflare Workers + Hono + Queues
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Navigation */}
        <div className="flex gap-2 justify-center">
          {(['order', 'status', 'stats'] as const).map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'neutral'}
              onClick={() => setActiveTab(tab)}
              className="capitalize"
            >
              {tab === 'order' && '📝 Order'}
              {tab === 'status' && '📊 Status'}
              {tab === 'stats' && '📈 Stats'}
            </Button>
          ))}
        </div>

        {/* Order Tab */}
        {activeTab === 'order' && (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Place Your Order 🎂</CardTitle>
                <CardDescription>
                  Choose your favorite cake combination
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-name">Your Name</Label>
                  <Input
                    id="customer-name"
                    placeholder="Enter your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Choose Flavor</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {FLAVORS.map((flavor) => (
                      <Button
                        key={flavor}
                        variant={selectedFlavor === flavor ? 'default' : 'neutral'}
                        size="sm"
                        onClick={() => setSelectedFlavor(flavor)}
                        className="text-xs justify-start"
                      >
                        {flavor}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Size</Label>
                  <div className="flex gap-2">
                    {(['6-inch', '8-inch', '10-inch'] as const).map((size) => (
                      <Button
                        key={size}
                        variant={selectedSize === size ? 'default' : 'neutral'}
                        size="sm"
                        onClick={() => setSelectedSize(size)}
                        className="flex-1"
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Decorations (Optional)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DECORATIONS.map((decoration) => (
                      <Button
                        key={decoration}
                        variant={selectedDecorations.includes(decoration) ? 'default' : 'neutral'}
                        size="sm"
                        onClick={() => handleDecorationToggle(decoration)}
                        className="text-xs justify-start"
                      >
                        {selectedDecorations.includes(decoration) ? '✓ ' : ''}{decoration}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handlePlaceOrder} 
                  disabled={loading || !customerName || !selectedFlavor}
                  className="w-full"
                  size="lg"
                >
                  {loading ? 'Placing Order...' : '🍰 Place Order'}
                </Button>
              </CardFooter>
            </Card>

            {/* Order Success */}
            {lastOrder && (
              <Card className="bg-secondary text-secondary-foreground">
                <CardHeader>
                  <CardTitle>Order Placed Successfully! 🎉</CardTitle>
                  <CardDescription className="text-secondary-foreground/80">
                    {lastOrder.message}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div><strong>Order ID:</strong> <code className="bg-background text-foreground px-2 py-1 rounded text-sm">{lastOrder.orderId}</code></div>
                  <div><strong>Customer:</strong> {lastOrder.order.customer}</div>
                  <div><strong>Item:</strong> {lastOrder.order.item}</div>
                  {lastOrder.order.decorations.length > 0 && (
                    <div><strong>Decorations:</strong> {lastOrder.order.decorations.join(', ')}</div>
                  )}
                  <div><strong>Estimated Time:</strong> {lastOrder.estimatedTime}</div>
                </CardContent>
                <CardFooter>
                  <Button 
                    variant="neutral"
                    onClick={() => {
                      setStatusOrderId(lastOrder.orderId)
                      setActiveTab('status')
                    }}
                    className="w-full"
                  >
                    📊 Check Status
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        )}

        {/* Status Tab */}
        {activeTab === 'status' && (
          <Card>
            <CardHeader>
              <CardTitle>Check Order Status 📊</CardTitle>
              <CardDescription>
                Enter your order ID to see the current status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter your order ID"
                  value={statusOrderId}
                  onChange={(e) => setStatusOrderId((e.target as HTMLInputElement).value)}
                  className="flex-1"
                />
                <Button 
                  onClick={handleCheckStatus}
                  disabled={loading || !statusOrderId}
                >
                  {loading ? 'Checking...' : 'Check Status'}
                </Button>
              </div>

              {orderStatus && (
                <Card className="bg-secondary text-secondary-foreground">
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div><strong>Order ID:</strong> {orderStatus.orderId}</div>
                      <div><strong>Status:</strong> <span className="capitalize font-bold">{orderStatus.status}</span></div>
                      <div><strong>Message:</strong> {orderStatus.message}</div>
                      {orderStatus.estimatedWaitTime && (
                        <div><strong>Estimated Wait:</strong> {orderStatus.estimatedWaitTime}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>📈 Shop Statistics</CardTitle>
                <CardDescription>
                  Real-time insights into our cake shop
                </CardDescription>
              </CardHeader>
            </Card>

            {stats && (
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>🏆 Popular Flavors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.stats.popularFlavors.map((flavor) => (
                        <div key={flavor.flavor} className="flex justify-between items-center">
                          <span>{flavor.flavor}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-secondary rounded">
                              <div 
                                className="h-full bg-main rounded"
                                style={{ width: `${flavor.percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold">{flavor.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>📊 Quick Stats</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between">
                      <span>Daily Orders:</span>
                      <span className="font-bold">{stats.stats.dailyOrders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Processing:</span>
                      <span className="font-bold">{stats.stats.averageProcessingTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Popular Size:</span>
                      <span className="font-bold">{stats.stats.popularSize}</span>
                    </div>
                    <div>
                      <div className="font-bold mb-2">Top Decorations:</div>
                      <div className="flex flex-wrap gap-1">
                        {stats.stats.topDecorations.map((decoration) => (
                          <span key={decoration} className="px-2 py-1 bg-main text-main-foreground rounded text-xs">
                            {decoration}
                          </span>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Button 
              onClick={handleLoadStats}
              disabled={loading}
              variant="neutral"
              className="w-full"
            >
              {loading ? 'Loading...' : '🔄 Refresh Stats'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
} 