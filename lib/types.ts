export interface UserProfile {
  uid: string
  email: string
  role: 'admin' | 'waiter' | 'super_admin'
  name: string
  phone?: string
  restaurantId?: string
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
  image?: string
}

export interface LoyaltyCampaign {
  id: string
  name: string
  active: boolean
  targetProductId: string
  targetProductName: string
  requiredQuantity: number
  rewardProductId: string
  rewardProductName: string
  rewardQuantity: number
  description: string
  createdAt: number | null
  updatedAt: number | null
}

export interface RestaurantCustomer {
  id: string
  name: string
  phone: string
  email?: string
  loyaltyEnabled: boolean
  points: number
  totalOrders: number
  totalSpent: number
  createdAt: number | null
  updatedAt: number | null
}

export type LoyaltyRewardStatus = 'available' | 'used' | 'expired'

export interface LoyaltyReward {
  id: string
  campaignId: string
  campaignName: string
  rewardProductId: string
  rewardProductName: string
  rewardQuantity: number
  status: LoyaltyRewardStatus
  earnedFromCallId: string
  earnedAt: number | null
  usedAt?: number | null
  usedById?: string
  usedByName?: string
}

export type LoyaltyTransactionAction = 'earn' | 'redeem'

export interface LoyaltyTransaction {
  id: string
  customerId: string
  customerName: string
  campaignId: string
  campaignName: string
  callId: string
  action: LoyaltyTransactionAction
  targetProductId: string
  targetProductName: string
  targetQuantity: number
  rewardProductId: string
  rewardProductName: string
  rewardQuantity: number
  createdAt: number | null
  createdByRole: 'admin' | 'waiter' | 'system'
  createdById?: string
  createdByName?: string
}

export interface MenuThemeSettings {
  displayName: string
  logoUrl: string
  primaryColor: string
  updatedAt?: number | null
}

export interface RestaurantGeneralSettings {
  businessName: string
  slug: string
  logoUrl: string
  primaryColor: string
  wifiEnabled?: boolean
  wifiName?: string
  wifiPassword?: string
  updatedAt?: number | null
}

export interface SharedCartItem {
  id: string
  sessionId: string
  customerId: string
  customerName: string
  productId: string
  productName: string
  productDescription?: string
  productImage?: string
  price: number
  quantity: number
  createdAt: number
  updatedAt: number
}

export type RestaurantStatus = 'active' | 'passive'
export type RestaurantPlan = 'trial' | 'paid'

export interface Restaurant {
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor?: string
  status?: RestaurantStatus
  plan?: RestaurantPlan
  trialStartedAt?: number | null
  trialEndsAt?: number | null
  subscriptionExpiresAt?: number | null
  createdAt?: number | null
  updatedAt?: number | null
  phone?: string
  ownerUid?: string
  ownerName?: string
  ownerEmail?: string
  businessType?: string
  city?: string
  district?: string
  onboardingCompleted?: boolean
  adminEmail?: string
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

export interface LoyaltyPreview {
  campaignId: string
  campaignName: string
  rewardProductName: string
  rewardQuantity: number
  eligible: boolean
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
  completedById?: string
  completedByName?: string
  completedByRole?: 'admin' | 'waiter'
  customerName?: string
  customerId?: string
  customerPhone?: string
  loyaltyPreview?: LoyaltyPreview
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
  active?: boolean
  sessionId: string | null
  openedAt: number | null
  lastPaymentCompletedAt?: number | null
  lastPaymentWaiterName?: string | null
  createdAt: number | null
  updatedAt: number | null
}
