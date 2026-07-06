export interface UserProfile {
  uid: string
  email: string
  role: 'admin' | 'waiter' | 'super_admin'
  name: string
  photoUrl?: string | null
  phone?: string
  restaurantId?: string
  active: boolean
  avgRating?: number
  averageRating?: number | null
  totalCalls?: number
  completedCalls?: number
  totalRatings?: number
  isOnline?: boolean
  lastSeen?: number
  updatedAt?: number | null
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

export type RestaurantStatus = 'active' | 'passive' | 'deleted'
export type RestaurantPlan = 'starter' | 'pro' | 'premium'
export type BillingPeriod = 'trial' | 'monthly' | 'six_months' | 'yearly' | 'lifetime'
export type PaymentStatus = 'trial' | 'paid' | 'unpaid' | 'expired'

export const PLAN_PRICES: Record<RestaurantPlan, number> = {
  starter: 1990,
  pro: 3990,
  premium: 5990,
}

export const PLAN_LABELS: Record<RestaurantPlan, string> = {
  starter: 'Starter Paket',
  pro: 'Pro Paket',
  premium: 'Premium Paket',
}

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  trial: '7 Gün Deneme',
  monthly: 'Aylık',
  six_months: '6 Aylık',
  yearly: '12 Aylık',
  lifetime: 'Ömür Boyu',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  trial: 'Deneme',
  paid: 'Ödendi',
  unpaid: 'Ödenmedi',
  expired: 'Süresi Doldu',
}

export interface RestaurantFeatures {
  qrMenu: boolean
  waiterCall: boolean
  manualOrders: boolean
  loyalty: boolean
  multiLanguage: boolean
  analytics: boolean
  kitchen: boolean
}

export const FEATURE_LABELS: Record<keyof RestaurantFeatures, string> = {
  qrMenu: 'QR Menü',
  waiterCall: 'Garson Çağırma',
  manualOrders: 'Garson Manuel Sipariş',
  loyalty: 'Kampanya ve Sadakat',
  multiLanguage: 'Çoklu Dil Desteği',
  analytics: 'Gelişmiş Raporlar',
  kitchen: 'Mutfak Ekranı',
}

export const DEFAULT_FEATURES: Record<RestaurantPlan, RestaurantFeatures> = {
  starter: {
    qrMenu: true,
    waiterCall: true,
    manualOrders: false,
    loyalty: false,
    multiLanguage: false,
    analytics: false,
    kitchen: false,
  },
  pro: {
    qrMenu: true,
    waiterCall: true,
    manualOrders: true,
    loyalty: true,
    multiLanguage: true,
    analytics: true,
    kitchen: false,
  },
  premium: {
    qrMenu: true,
    waiterCall: true,
    manualOrders: true,
    loyalty: true,
    multiLanguage: true,
    analytics: true,
    kitchen: true,
  },
}

export function getDefaultFeatures(plan: RestaurantPlan): RestaurantFeatures {
  return { ...DEFAULT_FEATURES[plan] }
}

export interface Restaurant {
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor?: string
  status?: RestaurantStatus
  plan?: RestaurantPlan
  billingPeriod?: BillingPeriod
  paymentStatus?: PaymentStatus
  trialStartedAt?: number | null
  trialEndsAt?: number | null
  subscriptionStartedAt?: number | null
  subscriptionExpiresAt?: number | null
  lifetimeAccess?: boolean
  lastPaymentAmount?: number | null
  lastPaymentDate?: number | null
  notes?: string
  deletedAt?: number | null
  deletedBy?: string | null
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
  features?: RestaurantFeatures
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
  waiterPhotoUrl?: string | null
  waiterAverageRating?: number | null
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
  kitchenStatus?: KitchenStatus
  preparingAt?: number
  readyAt?: number
  deliveredAt?: number
  kitchenUpdatedById?: string
  kitchenUpdatedByName?: string
}

export type KitchenStatus = 'pending' | 'preparing' | 'ready' | 'delivered'

export const KITCHEN_STATUS_LABELS: Record<KitchenStatus, string> = {
  pending: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  delivered: 'Teslim Edildi',
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
