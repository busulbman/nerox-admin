import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { normalizeTable, normalizeWaiterCall, isOpenWaiterCallStatus } from '@/lib/firestore-models'
import { db } from '@/lib/firebase'
import { processLoyaltyForCall, type ProcessLoyaltyResult } from '@/lib/loyalty-engine'
import { logFirestoreWrite } from '@/lib/firestore-debug'
import type { TableStatus, WaiterCall } from '@/lib/types'

type SyncableTableStatus = Extract<TableStatus, 'aktif' | 'çağrı var' | 'hesap istendi'>
type CompleteCallActor = {
  uid: string
  name: string
  role: 'admin' | 'waiter'
}
type CompleteCallOptions = {
  // Payment closing is authoritative: any staff member may finish the call
  // even if another waiter accepted it.
  bypassWaiterOwnership?: boolean
  extraCallUpdates?: Record<string, unknown>
}

export function getTableStatusFromOpenCalls(calls: WaiterCall[]): SyncableTableStatus {
  const pending = calls.filter((call) => call.durum === 'bekliyor')
  if (pending.some((call) => call.tip === 'hesap')) return 'hesap istendi'
  if (pending.length > 0) return 'çağrı var'
  return 'aktif'
}

export async function completeRestaurantCall(
  restaurantId: string,
  call: WaiterCall,
  actor?: CompleteCallActor,
  options?: CompleteCallOptions
) {
  const callRef = doc(db, 'restaurants', restaurantId, 'calls', call.id)
  const liveCallSnap = await getDoc(callRef)

  if (!liveCallSnap.exists()) {
    throw new Error('Çağrı bulunamadı.')
  }

  const liveCall = normalizeWaiterCall(liveCallSnap.id, liveCallSnap.data() as Record<string, unknown>)

  if (liveCall.durum === 'tamamlandı') {
    return
  }

  if (actor?.role === 'waiter' && !options?.bypassWaiterOwnership) {
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
    ...(options?.extraCallUpdates ?? {}),
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
      completedCalls: increment(1),
    })
  }

  // Hesap kapatıldığında aynı oturumdaki ödenmemiş siparişler de "ödendi"
  // sayılır; kampanya motoru yalnızca bu noktada tetiklenir.
  const unpaidSessionOrders: WaiterCall[] = []

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

    const sessionCalls = sessionCallsSnap.docs.map((snap) =>
      normalizeWaiterCall(snap.id, snap.data() as Record<string, unknown>)
    )

    if (liveCall.tip === 'hesap') {
      unpaidSessionOrders.push(
        ...sessionCalls.filter(
          (sessionCall) =>
            sessionCall.tip === 'sipariş' &&
            sessionCall.sessionId === liveCall.sessionId &&
            sessionCall.paymentStatus !== 'paid'
        )
      )
    }

    if (tableSnap.exists()) {
      const table = normalizeTable(tableSnap.id, tableSnap.data() as Record<string, unknown>)
      const remainingOpenCalls = sessionCalls.filter(
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

  // Failures here must not break the completion flow.
  if (unpaidSessionOrders.length > 0 && actor) {
    for (const orderCall of unpaidSessionOrders) {
      try {
        await markOrderPaid(restaurantId, orderCall, actor)
      } catch (error) {
        console.error('Order payment close error:', error)
      }
    }
  }
}

/**
 * "Hesap Ödendi / Hesabı Kapat": siparişin ödemesini kapatır. Sipariş henüz
 * tamamlanmadıysa tamamlar, teslim edilmediyse teslim edildi olarak işaretler
 * ve kampanya motorunu YALNIZCA bu aşamada tetikler. `loyaltyProcessed`
 * bayrağı sayesinde aynı sipariş iki kez ödül üretemez.
 */
export async function markOrderPaid(
  restaurantId: string,
  call: WaiterCall,
  actor: CompleteCallActor
): Promise<ProcessLoyaltyResult> {
  const noResult: ProcessLoyaltyResult = { processed: false, earnedRewards: [] }
  const callRef = doc(db, 'restaurants', restaurantId, 'calls', call.id)
  const liveCallSnap = await getDoc(callRef)

  if (!liveCallSnap.exists()) {
    throw new Error('Sipariş bulunamadı.')
  }

  const liveCall = normalizeWaiterCall(liveCallSnap.id, liveCallSnap.data() as Record<string, unknown>)

  if (liveCall.tip !== 'sipariş') {
    throw new Error('Yalnızca siparişlerin hesabı kapatılabilir.')
  }

  if (liveCall.paymentStatus === 'paid') {
    return noResult
  }

  const paymentUpdates: Record<string, unknown> = {
    paymentStatus: 'paid',
    paidAt: serverTimestamp(),
    paidById: actor.uid,
    paidByName: actor.name,
    paidByRole: actor.role,
  }

  if (liveCall.kitchenStatus && liveCall.kitchenStatus !== 'delivered') {
    paymentUpdates.kitchenStatus = 'delivered'
    paymentUpdates.deliveredAt = serverTimestamp()
    paymentUpdates.kitchenUpdatedById = actor.uid
    paymentUpdates.kitchenUpdatedByName = actor.name
  }

  logFirestoreWrite('call-sync/mark order paid', { restaurantId, callId: liveCall.id })

  if (liveCall.durum !== 'tamamlandı') {
    await completeRestaurantCall(restaurantId, liveCall, actor, {
      bypassWaiterOwnership: true,
      extraCallUpdates: paymentUpdates,
    })
  } else {
    await updateDoc(callRef, paymentUpdates)
  }

  try {
    return await processLoyaltyForCall({
      restaurantId,
      callId: liveCall.id,
      actorId: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
    })
  } catch (error) {
    console.error('Loyalty processing error:', error)
    return noResult
  }
}
