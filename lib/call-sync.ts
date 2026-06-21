import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { normalizeTable, normalizeWaiterCall, isOpenWaiterCallStatus } from '@/lib/firestore-models'
import { db } from '@/lib/firebase'
import type { TableStatus, WaiterCall } from '@/lib/types'

type SyncableTableStatus = Extract<TableStatus, 'aktif' | 'çağrı var' | 'hesap istendi'>
type CompleteCallActor = {
  uid: string
  name: string
  role: 'admin' | 'waiter'
}

export function getTableStatusFromOpenCalls(calls: WaiterCall[]): SyncableTableStatus {
  const pending = calls.filter((call) => call.durum === 'bekliyor')
  if (pending.some((call) => call.tip === 'hesap')) return 'hesap istendi'
  if (pending.length > 0) return 'çağrı var'
  return 'aktif'
}

export async function completeRestaurantCall(restaurantId: string, call: WaiterCall, actor?: CompleteCallActor) {
  const callRef = doc(db, 'restaurants', restaurantId, 'calls', call.id)
  const liveCallSnap = await getDoc(callRef)

  if (!liveCallSnap.exists()) {
    throw new Error('Çağrı bulunamadı.')
  }

  const liveCall = normalizeWaiterCall(liveCallSnap.id, liveCallSnap.data() as Record<string, unknown>)

  if (liveCall.durum === 'tamamlandı') {
    return
  }

  if (actor?.role === 'waiter') {
    if (liveCall.durum !== 'kabul edildi') {
      throw new Error('Bu çağrı tamamlanacak durumda değil.')
    }

    if (liveCall.waiterId !== actor.uid) {
      throw new Error('Bu çağrıyı yalnızca kabul eden garson tamamlayabilir.')
    }
  }

  const batch = writeBatch(db)
  const completionTimestamp = serverTimestamp()

  const completedByName = actor?.name ?? liveCall.waiterName ?? 'İşletme'
  const completedByRole = actor?.role ?? (liveCall.waiterId ? 'waiter' : 'admin')

  const callUpdate: Record<string, unknown> = {
    durum: 'tamamlandı',
    status: 'completed',
    completedAt: completionTimestamp,
    resolvedAt: completionTimestamp,
    completedById: actor?.uid ?? liveCall.waiterId ?? null,
    completedByName,
    completedByRole,
  }

  if (!liveCall.waiterId && actor) {
    callUpdate.waiterId = actor.uid
    callUpdate.waiterName = actor.name || 'İşletme'
  }

  batch.update(callRef, callUpdate)

  const creditedWaiterId = actor?.role === 'waiter' ? actor.uid : liveCall.waiterId

  if (creditedWaiterId) {
    batch.update(doc(db, 'users', creditedWaiterId), {
      totalCalls: increment(1),
    })
  }

  if (liveCall.tableId && liveCall.sessionId) {
    const tableRef = doc(db, 'restaurants', restaurantId, 'tables', liveCall.tableId)
    const [tableSnap, sessionCallsSnap] = await Promise.all([
      getDoc(tableRef),
      getDocs(
        query(
          collection(db, 'restaurants', restaurantId, 'calls'),
          where('sessionId', '==', liveCall.sessionId)
        )
      ),
    ])

    if (tableSnap.exists()) {
      const table = normalizeTable(tableSnap.id, tableSnap.data() as Record<string, unknown>)
      const remainingOpenCalls = sessionCallsSnap.docs
        .map((snap) => normalizeWaiterCall(snap.id, snap.data() as Record<string, unknown>))
        .filter(
          (sessionCall) =>
            sessionCall.id !== liveCall.id &&
            sessionCall.tableId === liveCall.tableId &&
            sessionCall.sessionId === liveCall.sessionId &&
            isOpenWaiterCallStatus(sessionCall.durum)
        )

      const shouldSyncTable =
        table.sessionId === liveCall.sessionId &&
        table.status !== 'boş' &&
        table.status !== 'temizlik' &&
        table.status !== 'kapalı'

      if (shouldSyncTable) {
        batch.update(tableRef, {
          status: getTableStatusFromOpenCalls(remainingOpenCalls),
          ...(liveCall.tip === 'hesap'
            ? {
                lastPaymentCompletedAt: completionTimestamp,
                lastPaymentWaiterName: completedByName,
              }
            : {}),
          updatedAt: serverTimestamp(),
        })
      }
    }
  }

  await batch.commit()
}
