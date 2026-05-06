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

export function getTableStatusFromOpenCalls(calls: WaiterCall[]): SyncableTableStatus {
  if (calls.some((call) => call.tip === 'hesap')) return 'hesap istendi'
  if (calls.length > 0) return 'çağrı var'
  return 'aktif'
}

export async function completeRestaurantCall(restaurantId: string, call: WaiterCall) {
  const callRef = doc(db, 'restaurants', restaurantId, 'calls', call.id)
  const liveCallSnap = await getDoc(callRef)

  if (!liveCallSnap.exists()) {
    throw new Error('Çağrı bulunamadı.')
  }

  const liveCall = normalizeWaiterCall(liveCallSnap.id, liveCallSnap.data() as Record<string, unknown>)

  if (liveCall.durum === 'tamamlandı') {
    return
  }

  const batch = writeBatch(db)
  const completionTimestamp = serverTimestamp()

  batch.update(callRef, {
    durum: 'tamamlandı',
    completedAt: completionTimestamp,
    resolvedAt: completionTimestamp,
  })

  if (liveCall.waiterId) {
    batch.update(doc(db, 'users', liveCall.waiterId), {
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
                lastPaymentWaiterName: liveCall.waiterName ?? null,
              }
            : {}),
          updatedAt: serverTimestamp(),
        })
      }
    }
  }

  await batch.commit()
}
