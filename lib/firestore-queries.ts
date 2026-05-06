import { collection, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const OPEN_CALL_STATUSES = ['bekliyor', 'kabul edildi'] as const
const DEFAULT_CALL_LIMIT = 50
const DEFAULT_RATING_LIMIT = 50
const DEFAULT_TABLE_LIMIT = 100

export function getRestaurantOpenCallsQuery(restaurantId: string, max = DEFAULT_CALL_LIMIT) {
  return query(
    collection(db, 'restaurants', restaurantId, 'calls'),
    where('durum', 'in', [...OPEN_CALL_STATUSES]),
    orderBy('createdAt', 'desc'),
    limit(max)
  )
}

export function getRestaurantRecentCompletedCallsQuery(restaurantId: string, max = DEFAULT_CALL_LIMIT) {
  return query(
    collection(db, 'restaurants', restaurantId, 'calls'),
    where('durum', '==', 'tamamlandı'),
    orderBy('completedAt', 'desc'),
    limit(max)
  )
}

export function getRestaurantRecentRatingsQuery(restaurantId: string, max = DEFAULT_RATING_LIMIT) {
  return query(
    collection(db, 'restaurants', restaurantId, 'ratings'),
    orderBy('createdAt', 'desc'),
    limit(max)
  )
}

export function getWaiterRecentRatingsQuery(restaurantId: string, waiterId: string, max = DEFAULT_RATING_LIMIT) {
  return query(
    collection(db, 'restaurants', restaurantId, 'ratings'),
    where('waiterId', '==', waiterId),
    orderBy('createdAt', 'desc'),
    limit(max)
  )
}

export function getRestaurantTablesQuery(restaurantId: string, max = DEFAULT_TABLE_LIMIT) {
  return query(
    collection(db, 'restaurants', restaurantId, 'tables'),
    orderBy('number', 'asc'),
    limit(max)
  )
}

export function getRestaurantWaiterUsersQuery(restaurantId: string) {
  return query(
    collection(db, 'users'),
    where('restaurantId', '==', restaurantId),
    where('role', '==', 'waiter'),
    limit(50)
  )
}

export function getSessionOpenCallsQuery(restaurantId: string, sessionId: string, max = DEFAULT_CALL_LIMIT) {
  return query(
    collection(db, 'restaurants', restaurantId, 'calls'),
    where('sessionId', '==', sessionId),
    where('durum', 'in', [...OPEN_CALL_STATUSES]),
    orderBy('createdAt', 'desc'),
    limit(max)
  )
}

export function getSessionPaymentCallsQuery(restaurantId: string, sessionId: string, max = 5) {
  return query(
    collection(db, 'restaurants', restaurantId, 'calls'),
    where('sessionId', '==', sessionId),
    where('tip', '==', 'hesap'),
    orderBy('createdAt', 'desc'),
    limit(max)
  )
}
