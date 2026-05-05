export interface UserProfile {
  uid: string
  email: string
  role: 'admin' | 'waiter'
  name: string
  restaurantId: string
  active: boolean
  avgRating?: number
  totalCalls?: number
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

export interface WaiterCall {
  id: string
  tableId: string
  tableNumber: number
  sessionId: string
  restaurantId: string
  tip: 'sipariş' | 'hesap' | 'yardım'
  durum: 'bekliyor' | 'kabul edildi' | 'tamamlandı'
  waiterId?: string
  waiterName?: string
  note?: string
  createdAt: number
  acceptedAt?: number
  resolvedAt?: number
}

export interface Table {
  id: string
  number: number
  status: 'boş' | 'aktif' | 'çağrı var' | 'hesap istendi' | 'temizlik'
  sessionId: string | null
  openedAt: number | null
}
