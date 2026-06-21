export interface UserProfile {
  uid: string
  email: string
  role: 'admin' | 'waiter'
  name: string
  restaurantId: string
  active: boolean
  avgRating?: number
  totalCalls?: number
  totalRatings?: number
  isOnline?: boolean
  lastSeen?: number
}

export interface Category {
  id: string
  name: string
  order: number
}

export interface Product {
  id: string
  name: string
  description: string
  price: number
  categoryId: string
  available: boolean
}

export interface CartItem {
  productId: string
  name: string
  price: number
  quantity: number
  customerName: string
}

export interface CustomerGroup {
  total: number
  items: CartItem[]
}

export interface WaiterCall {
  id: string
  tableId: string
  tableNumber: number
  sessionId: string
  restaurantId: string
  tip: 'sipariş' | 'hesap' | 'yardım'
  durum: 'bekliyor' | 'kabul edildi' | 'tamamlandı'
  status?: 'open' | 'accepted' | 'completed'
  waiterId?: string
  waiterName?: string
  customerName?: string
  note?: string
  createdAt: number
  acceptedAt?: number
  completedAt?: number
  resolvedAt?: number
  items?: CartItem[]
  totalPrice?: number
  groupedByCustomer?: Record<string, CustomerGroup>
}

export type RatingStatus = 'approved' | 'suspicious'

export interface Rating {
  id: string
  restaurantId: string
  tableId: string
  tableNumber: number
  sessionId: string
  callId: string | null
  waiterId: string | null
  waiterName: string | null
  serviceRating: number
  waiterRating: number
  comment: string
  status: RatingStatus
  createdAt: number
}

export type TableStatus = 'boş' | 'aktif' | 'çağrı var' | 'hesap istendi' | 'temizlik' | 'kapalı'

export interface Table {
  id: string
  number: number
  status: TableStatus
  sessionId: string | null
  openedAt: number | null
  lastPaymentCompletedAt?: number | null
  lastPaymentWaiterName?: string | null
  createdAt: number | null
  updatedAt: number | null
}
