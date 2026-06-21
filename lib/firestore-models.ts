import { calculateCartTotal, groupCartItemsByCustomer, normalizeCartItem } from '@/lib/order-utils'
import type { CartItem, CustomerGroup, Rating, RatingStatus, Table, TableStatus, WaiterCall } from '@/lib/types'

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

export function isOpenWaiterCallStatus(value: unknown): value is Extract<WaiterCall['durum'], 'bekliyor' | 'kabul edildi'> {
  return value === 'bekliyor' || value === 'kabul edildi'
}

function isRatingStatus(value: unknown): value is RatingStatus {
  return value === 'approved' || value === 'suspicious'
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
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : null,
    openedAt: toMillis(data.openedAt),
    lastPaymentCompletedAt: toMillis(data.lastPaymentCompletedAt),
    lastPaymentWaiterName: typeof data.lastPaymentWaiterName === 'string' ? data.lastPaymentWaiterName : null,
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
    customerName: typeof data.customerName === 'string' ? data.customerName : undefined,
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
