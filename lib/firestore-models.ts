import { calculateCartTotal, groupCartItemsByCustomer, normalizeCartItem } from '@/lib/order-utils'
import type {
  CartItem,
  CustomerGroup,
  LoyaltyCampaign,
  LoyaltyPreview,
  Rating,
  RatingStatus,
  RestaurantCustomer,
  Table,
  TableStatus,
  WaiterCall,
} from '@/lib/types'

type FirestoreTimestampLike = {
  toMillis: () => number
}

function isCallTip(value: unknown): value is WaiterCall['tip'] {
  return value === 'sipariş' || value === 'hesap' || value === 'yardım'
}

function isCallStatus(value: unknown): value is WaiterCall['durum'] {
  return value === 'bekliyor' || value === 'kabul edildi' || value === 'tamamlandı'
}

function isCallLifecycleStatus(value: unknown): value is NonNullable<WaiterCall['status']> {
  return value === 'open' || value === 'accepted' || value === 'completed'
}

function isKitchenStatus(value: unknown): value is NonNullable<WaiterCall['kitchenStatus']> {
  return value === 'pending' || value === 'preparing' || value === 'ready' || value === 'delivered'
}

export function isOpenWaiterCallStatus(value: unknown): value is Extract<WaiterCall['durum'], 'bekliyor' | 'kabul edildi'> {
  return value === 'bekliyor' || value === 'kabul edildi'
}

function isRatingStatus(value: unknown): value is RatingStatus {
  return value === 'approved' || value === 'suspicious'
}

function normalizeLoyaltyPreview(value: unknown): LoyaltyPreview | undefined {
  if (!value || typeof value !== 'object') return undefined
  const data = value as Record<string, unknown>
  if (
    typeof data.campaignId !== 'string' ||
    typeof data.campaignName !== 'string' ||
    typeof data.rewardProductName !== 'string' ||
    typeof data.rewardQuantity !== 'number'
  ) {
    return undefined
  }
  return {
    campaignId: data.campaignId,
    campaignName: data.campaignName,
    rewardProductName: data.rewardProductName,
    rewardQuantity: data.rewardQuantity,
    eligible: data.eligible === true,
  }
}

export function isTableStatus(value: unknown): value is TableStatus {
  return (
    value === 'boş' ||
    value === 'aktif' ||
    value === 'çağrı var' ||
    value === 'hesap istendi' ||
    value === 'temizlik' ||
    value === 'kapalı'
  )
}

export function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as FirestoreTimestampLike).toMillis === 'function'
  ) {
    return (value as FirestoreTimestampLike).toMillis()
  }
  return null
}

function normalizeGroupedByCustomer(value: unknown): Record<string, CustomerGroup> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const groups = Object.entries(value).flatMap(([customerName, groupValue]) => {
    if (!groupValue || typeof groupValue !== 'object' || Array.isArray(groupValue)) return []

    const rawItems: unknown[] = 'items' in groupValue && Array.isArray(groupValue.items) ? groupValue.items : []
    const items = rawItems
      .map((item) => normalizeCartItem(item))
      .filter((item): item is CartItem => item !== null)

    if (items.length === 0) return []

    return [[customerName, { items, total: calculateCartTotal(items) }] as const]
  })

  return groups.length > 0 ? Object.fromEntries(groups) : undefined
}

export function normalizeTable(id: string, data: Record<string, unknown>): Table {
  const parsedNumber =
    typeof data.number === 'number' && Number.isFinite(data.number)
      ? data.number
      : Number.parseInt(id, 10)

  return {
    id,
    number: Number.isFinite(parsedNumber) ? parsedNumber : 0,
    status: isTableStatus(data.status) ? data.status : 'boş',
    active: data.active !== false,
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : null,
    openedAt: toMillis(data.openedAt),
    lastPaymentCompletedAt: toMillis(data.lastPaymentCompletedAt),
    lastPaymentWaiterName: typeof data.lastPaymentWaiterName === 'string' ? data.lastPaymentWaiterName : null,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

export function normalizeLoyaltyCampaign(id: string, data: Record<string, unknown>): LoyaltyCampaign {
  return {
    id,
    name: typeof data.name === 'string' ? data.name.trim() : '',
    active: data.active === true,
    targetProductId: typeof data.targetProductId === 'string' ? data.targetProductId : '',
    targetProductName: typeof data.targetProductName === 'string' ? data.targetProductName.trim() : '',
    requiredQuantity:
      typeof data.requiredQuantity === 'number' && Number.isFinite(data.requiredQuantity) && data.requiredQuantity > 0
        ? Math.floor(data.requiredQuantity)
        : 1,
    rewardProductId: typeof data.rewardProductId === 'string' ? data.rewardProductId : '',
    rewardProductName: typeof data.rewardProductName === 'string' ? data.rewardProductName.trim() : '',
    rewardQuantity:
      typeof data.rewardQuantity === 'number' && Number.isFinite(data.rewardQuantity) && data.rewardQuantity > 0
        ? Math.floor(data.rewardQuantity)
        : 1,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

export function normalizeRestaurantCustomer(id: string, data: Record<string, unknown>): RestaurantCustomer {
  return {
    id,
    name: typeof data.name === 'string' ? data.name.trim() : '',
    phone: typeof data.phone === 'string' ? data.phone.trim() : '',
    email: typeof data.email === 'string' ? data.email.trim() : '',
    loyaltyEnabled: data.loyaltyEnabled === true,
    points:
      typeof data.points === 'number' && Number.isFinite(data.points) && data.points >= 0
        ? data.points
        : 0,
    totalOrders:
      typeof data.totalOrders === 'number' && Number.isFinite(data.totalOrders) && data.totalOrders >= 0
        ? data.totalOrders
        : 0,
    totalSpent:
      typeof data.totalSpent === 'number' && Number.isFinite(data.totalSpent) && data.totalSpent >= 0
        ? data.totalSpent
        : 0,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

export function normalizeWaiterCall(id: string, data: Record<string, unknown>): WaiterCall {
  const tableId = typeof data.tableId === 'string' ? data.tableId : ''
  const tableNumber =
    typeof data.tableNumber === 'number' && Number.isFinite(data.tableNumber)
      ? data.tableNumber
      : Number.parseInt(tableId, 10)

  const completedAt = toMillis(data.completedAt) ?? toMillis(data.resolvedAt) ?? undefined
  const items =
    Array.isArray(data.items)
      ? data.items
        .map((item) => normalizeCartItem(item))
        .filter((item): item is CartItem => item !== null)
      : []
  const groupedByCustomer = normalizeGroupedByCustomer(data.groupedByCustomer) ??
    (items.length > 0 ? groupCartItemsByCustomer(items) : undefined)
  const lifecycleStatus = isCallLifecycleStatus(data.status)
    ? data.status
    : isCallStatus(data.durum)
      ? data.durum === 'bekliyor'
        ? 'open'
        : data.durum === 'kabul edildi'
          ? 'accepted'
          : 'completed'
      : undefined

  const completedByRole = data.completedByRole === 'admin' || data.completedByRole === 'waiter'
    ? data.completedByRole
    : undefined

  return {
    id,
    tableId,
    tableNumber: Number.isFinite(tableNumber) ? tableNumber : 0,
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
    restaurantId: typeof data.restaurantId === 'string' ? data.restaurantId : '',
    tip: isCallTip(data.tip) ? data.tip : 'yardım',
    durum: isCallStatus(data.durum)
      ? data.durum
      : lifecycleStatus === 'accepted'
        ? 'kabul edildi'
        : lifecycleStatus === 'completed'
          ? 'tamamlandı'
          : 'bekliyor',
    status: lifecycleStatus,
    waiterId: typeof data.waiterId === 'string' ? data.waiterId : undefined,
    waiterName: typeof data.waiterName === 'string' ? data.waiterName : undefined,
    waiterPhotoUrl:
      typeof data.waiterPhotoUrl === 'string'
        ? data.waiterPhotoUrl
        : data.waiterPhotoUrl === null
          ? null
          : undefined,
    waiterAverageRating:
      typeof data.waiterAverageRating === 'number' && Number.isFinite(data.waiterAverageRating)
        ? data.waiterAverageRating
        : data.waiterAverageRating === null
          ? null
          : undefined,
    completedById: typeof data.completedById === 'string' ? data.completedById : undefined,
    completedByName: typeof data.completedByName === 'string' ? data.completedByName : undefined,
    completedByRole,
    customerName: typeof data.customerName === 'string' ? data.customerName : undefined,
    customerId: typeof data.customerId === 'string' ? data.customerId : undefined,
    customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : undefined,
    loyaltyPreview: normalizeLoyaltyPreview(data.loyaltyPreview),
    note: typeof data.note === 'string' ? data.note : undefined,
    createdAt: toMillis(data.createdAt) ?? 0,
    acceptedAt: toMillis(data.acceptedAt) ?? undefined,
    completedAt,
    resolvedAt: completedAt,
    items: items.length > 0 ? items : undefined,
    totalPrice:
      typeof data.totalPrice === 'number' && Number.isFinite(data.totalPrice)
        ? data.totalPrice
        : items.length > 0
          ? calculateCartTotal(items)
          : undefined,
    groupedByCustomer,
    kitchenStatus: isKitchenStatus(data.kitchenStatus) ? data.kitchenStatus : undefined,
    sentToKitchenAt: toMillis(data.sentToKitchenAt) ?? undefined,
    preparingAt: toMillis(data.preparingAt) ?? undefined,
    readyAt: toMillis(data.readyAt) ?? undefined,
    deliveredAt: toMillis(data.deliveredAt) ?? undefined,
    kitchenUpdatedById: typeof data.kitchenUpdatedById === 'string' ? data.kitchenUpdatedById : undefined,
    kitchenUpdatedByName: typeof data.kitchenUpdatedByName === 'string' ? data.kitchenUpdatedByName : undefined,
  }
}

export function normalizeRating(id: string, data: Record<string, unknown>): Rating {
  const tableId = typeof data.tableId === 'string' ? data.tableId : ''
  const tableNumber =
    typeof data.tableNumber === 'number' && Number.isFinite(data.tableNumber)
      ? data.tableNumber
      : Number.parseInt(tableId, 10)

  return {
    id,
    restaurantId: typeof data.restaurantId === 'string' ? data.restaurantId : '',
    tableId,
    tableNumber: Number.isFinite(tableNumber) ? tableNumber : 0,
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
    callId: typeof data.callId === 'string' ? data.callId : null,
    waiterId: typeof data.waiterId === 'string' ? data.waiterId : null,
    waiterName: typeof data.waiterName === 'string' ? data.waiterName : null,
    serviceRating: typeof data.serviceRating === 'number' ? data.serviceRating : 0,
    waiterRating: typeof data.waiterRating === 'number' ? data.waiterRating : 0,
    comment: typeof data.comment === 'string' ? data.comment : '',
    status: isRatingStatus(data.status) ? data.status : 'approved',
    createdAt: toMillis(data.createdAt) ?? 0,
  }
}

export function getCallTableLabel(call: Pick<WaiterCall, 'tableId' | 'tableNumber'>): string {
  return call.tableNumber > 0 ? String(call.tableNumber) : call.tableId
}

export function getCallCompletedAt(call: Pick<WaiterCall, 'createdAt' | 'completedAt' | 'resolvedAt'>): number {
  return call.completedAt ?? call.resolvedAt ?? call.createdAt
}
