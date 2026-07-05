import type { WaiterCall } from '@/lib/types'

export type DateRange = 'today' | 'week' | 'month' | 'year' | 'custom'

export type AnalyticsData = {
  totalRevenue: number
  orderCount: number
  itemsSold: number
  averageCartValue: number
  completedOrders: number
  pendingOrders: number
  topProducts: Array<{ name: string; quantity: number; revenue: number }>
  topTables: Array<{ tableNumber: number; orderCount: number; revenue: number }>
  categoryBreakdown: Array<{ category: string; quantity: number; revenue: number }>
}

export type DateRangeConfig = {
  start: Date
  end: Date
}

export function getDateRangeConfig(range: DateRange, customStart?: Date, customEnd?: Date): DateRangeConfig {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (range) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      }
    case 'week': {
      const dayOfWeek = today.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(today)
      monday.setDate(today.getDate() + mondayOffset)
      return {
        start: monday,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      }
    }
    case 'month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      }
    case 'year':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      }
    case 'custom':
      return {
        start: customStart ?? today,
        end: customEnd ?? new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
      }
  }
}

export function calculateAnalytics(calls: WaiterCall[], dateRange: DateRangeConfig): AnalyticsData {
  const { start, end } = dateRange
  const startTs = start.getTime()
  const endTs = end.getTime()

  // Filter order calls within date range
  const orderCalls = calls.filter((call) => {
    if (call.tip !== 'sipariş') return false
    const callTime = call.createdAt
    return callTime >= startTs && callTime <= endTs
  })

  // Basic metrics
  let totalRevenue = 0
  let itemsSold = 0
  let completedOrders = 0
  let pendingOrders = 0

  // Product tracking
  const productMap = new Map<string, { quantity: number; revenue: number }>()

  // Table tracking
  const tableMap = new Map<number, { orderCount: number; revenue: number }>()

  // Category tracking (using product name prefix as fallback)
  const categoryMap = new Map<string, { quantity: number; revenue: number }>()

  for (const call of orderCalls) {
    const callTotal = typeof call.totalPrice === 'number' ? call.totalPrice : 0
    totalRevenue += callTotal

    // Count order status
    if (call.durum === 'tamamlandı' || call.status === 'completed') {
      completedOrders++
    } else if (call.durum === 'bekliyor' || call.durum === 'kabul edildi') {
      pendingOrders++
    }

    // Table tracking
    const tableNum = call.tableNumber ?? 0
    if (tableNum > 0) {
      const existing = tableMap.get(tableNum) ?? { orderCount: 0, revenue: 0 }
      tableMap.set(tableNum, {
        orderCount: existing.orderCount + 1,
        revenue: existing.revenue + callTotal,
      })
    }

    // Process items
    const items = call.items ?? []
    for (const item of items) {
      const qty = typeof item.quantity === 'number' ? item.quantity : 1
      const price = typeof item.price === 'number' ? item.price : 0
      const itemRevenue = qty * price

      itemsSold += qty

      // Product tracking
      const productName = item.name ?? 'Bilinmeyen'
      const existingProduct = productMap.get(productName) ?? { quantity: 0, revenue: 0 }
      productMap.set(productName, {
        quantity: existingProduct.quantity + qty,
        revenue: existingProduct.revenue + itemRevenue,
      })

      // Category tracking - use categoryId if available, otherwise use first word of product name
      const categoryKey = (item as { categoryId?: string }).categoryId ?? productName.split(' ')[0] ?? 'Diğer'
      const existingCategory = categoryMap.get(categoryKey) ?? { quantity: 0, revenue: 0 }
      categoryMap.set(categoryKey, {
        quantity: existingCategory.quantity + qty,
        revenue: existingCategory.revenue + itemRevenue,
      })
    }
  }

  // Convert maps to sorted arrays
  const topProducts = [...productMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  const topTables = [...tableMap.entries()]
    .map(([tableNumber, data]) => ({ tableNumber, ...data }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5)

  const categoryBreakdown = [...categoryMap.entries()]
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const orderCount = orderCalls.length
  const averageCartValue = orderCount > 0 ? totalRevenue / orderCount : 0

  return {
    totalRevenue,
    orderCount,
    itemsSold,
    averageCartValue,
    completedOrders,
    pendingOrders,
    topProducts,
    topTables,
    categoryBreakdown,
  }
}

export function formatCurrency(amount: number): string {
  return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatNumber(num: number): string {
  return num.toLocaleString('tr-TR')
}

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'Bugün',
  week: 'Bu Hafta',
  month: 'Bu Ay',
  year: 'Bu Yıl',
  custom: 'Özel',
}

export type HourlyDataPoint = {
  hour: string
  count: number
  revenue: number
}

export function buildHourlyOrderData(calls: WaiterCall[], dateRange: DateRangeConfig): HourlyDataPoint[] {
  const { start, end } = dateRange
  const startTs = start.getTime()
  const endTs = end.getTime()

  const orderCalls = calls.filter((call) => {
    if (call.tip !== 'sipariş') return false
    const callTime = call.createdAt
    return callTime >= startTs && callTime <= endTs
  })

  const hourlyMap = new Map<number, { count: number; revenue: number }>()

  for (const call of orderCalls) {
    const date = new Date(call.createdAt)
    const hour = date.getHours()
    const existing = hourlyMap.get(hour) ?? { count: 0, revenue: 0 }
    const callTotal = typeof call.totalPrice === 'number' ? call.totalPrice : 0
    hourlyMap.set(hour, {
      count: existing.count + 1,
      revenue: existing.revenue + callTotal,
    })
  }

  return Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    count: hourlyMap.get(i)?.count ?? 0,
    revenue: hourlyMap.get(i)?.revenue ?? 0,
  })).filter((h) => {
    const hourNum = parseInt(h.hour)
    return hourNum >= 8 && hourNum <= 23
  })
}
