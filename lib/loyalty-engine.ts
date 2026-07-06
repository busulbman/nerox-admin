import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logFirestoreWrite } from '@/lib/firestore-debug'
import { normalizeWaiterCall } from '@/lib/firestore-models'
import type { LoyaltyCampaign, LoyaltyProgress } from '@/lib/types'

export type LoyaltyActor = {
  actorId: string
  actorName: string
  actorRole: 'admin' | 'waiter'
}

export type ProcessLoyaltyResult = {
  processed: boolean
  earnedRewards: {
    campaignId: string
    campaignName: string
    rewardProductName: string
    rewardQuantity: number
    rewardCount: number
  }[]
}

/**
 * Runs after an order call is completed. Accumulates campaign progress for the
 * registered customer, creates rewards when the threshold is crossed and logs
 * loyalty transactions. Idempotent per call via `loyaltyProcessed` on the call
 * document (checked inside a Firestore transaction to survive races).
 */
export async function processLoyaltyForCall({
  restaurantId,
  callId,
  actorId,
  actorName,
  actorRole,
}: {
  restaurantId: string
  callId: string
} & LoyaltyActor): Promise<ProcessLoyaltyResult> {
  const noResult: ProcessLoyaltyResult = { processed: false, earnedRewards: [] }
  if (!restaurantId || !callId) return noResult

  // Active campaigns rarely change; reading them outside the transaction is safe.
  const campaignsSnap = await getDocs(
    query(collection(db, 'restaurants', restaurantId, 'loyaltyCampaigns'), where('active', '==', true))
  )
  if (campaignsSnap.empty) return noResult

  const campaigns = campaignsSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() })) as LoyaltyCampaign[]

  const callRef = doc(db, 'restaurants', restaurantId, 'calls', callId)

  logFirestoreWrite('loyalty/process call', { restaurantId, callId })

  return runTransaction(db, async (transaction) => {
    const callSnap = await transaction.get(callRef)
    if (!callSnap.exists()) return noResult

    const call = normalizeWaiterCall(callSnap.id, callSnap.data() as Record<string, unknown>)

    if (call.loyaltyProcessed) return noResult
    if (call.tip !== 'sipariş' || call.durum !== 'tamamlandı') return noResult

    const customerId = call.customerId?.trim()
    if (!customerId) return noResult

    const customerName = call.customerName?.trim() || 'Müşteri'
    const customerPhone = call.customerPhone?.trim() || ''
    const items = call.items ?? []
    if (items.length === 0) return noResult

    // Tally purchased quantity per product
    const quantityByProduct = new Map<string, number>()
    for (const item of items) {
      if (!item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0) continue
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity)
    }

    const relevantCampaigns = campaigns.filter(
      (campaign) =>
        campaign.requiredQuantity > 0 && (quantityByProduct.get(campaign.targetProductId) ?? 0) > 0
    )

    // Transaction rule: all reads must happen before writes.
    const progressSnaps = await Promise.all(
      relevantCampaigns.map((campaign) =>
        transaction.get(
          doc(db, 'restaurants', restaurantId, 'customers', customerId, 'loyaltyProgress', campaign.id)
        )
      )
    )

    const earnedRewards: ProcessLoyaltyResult['earnedRewards'] = []
    const rewardIds: string[] = []

    relevantCampaigns.forEach((campaign, index) => {
      const purchasedQuantity = quantityByProduct.get(campaign.targetProductId) ?? 0
      const progressSnap = progressSnaps[index]
      const existingQuantity =
        progressSnap.exists() && typeof progressSnap.data().currentQuantity === 'number'
          ? Math.max(0, progressSnap.data().currentQuantity as number)
          : 0
      const existingEarned =
        progressSnap.exists() && typeof progressSnap.data().totalEarnedRewards === 'number'
          ? Math.max(0, progressSnap.data().totalEarnedRewards as number)
          : 0

      const accumulated = existingQuantity + purchasedQuantity
      const newlyEarnedCount = Math.floor(accumulated / campaign.requiredQuantity)
      const remainingQuantity = newlyEarnedCount > 0 ? accumulated % campaign.requiredQuantity : accumulated

      // Progress document (denormalized so admin panels can query it directly)
      transaction.set(
        doc(db, 'restaurants', restaurantId, 'customers', customerId, 'loyaltyProgress', campaign.id),
        {
          restaurantId,
          customerId,
          customerName,
          customerPhone,
          campaignId: campaign.id,
          campaignName: campaign.name,
          targetProductId: campaign.targetProductId,
          targetProductName: campaign.targetProductName,
          requiredQuantity: campaign.requiredQuantity,
          rewardProductId: campaign.rewardProductId,
          rewardProductName: campaign.rewardProductName,
          rewardQuantity: campaign.rewardQuantity,
          currentQuantity: remainingQuantity,
          totalEarnedRewards: existingEarned + newlyEarnedCount,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      // Progress transaction log
      const progressTxRef = doc(collection(db, 'restaurants', restaurantId, 'loyaltyTransactions'))
      transaction.set(progressTxRef, {
        customerId,
        customerName,
        customerPhone,
        campaignId: campaign.id,
        campaignName: campaign.name,
        callId,
        action: 'progress',
        quantity: purchasedQuantity,
        targetProductId: campaign.targetProductId,
        targetProductName: campaign.targetProductName,
        rewardProductId: campaign.rewardProductId,
        rewardProductName: campaign.rewardProductName,
        rewardQuantity: campaign.rewardQuantity,
        createdAt: serverTimestamp(),
        createdByRole: actorRole,
        createdById: actorId,
        createdByName: actorName,
      })

      // Rewards — one document per earned reward cycle
      for (let earnedIndex = 0; earnedIndex < newlyEarnedCount; earnedIndex += 1) {
        const rewardRef = doc(collection(db, 'restaurants', restaurantId, 'customers', customerId, 'rewards'))
        rewardIds.push(rewardRef.id)
        transaction.set(rewardRef, {
          campaignId: campaign.id,
          campaignName: campaign.name,
          rewardProductId: campaign.rewardProductId,
          rewardProductName: campaign.rewardProductName,
          rewardQuantity: campaign.rewardQuantity,
          status: 'available',
          earnedFromCallId: callId,
          earnedAt: serverTimestamp(),
        })

        const earnTxRef = doc(collection(db, 'restaurants', restaurantId, 'loyaltyTransactions'))
        transaction.set(earnTxRef, {
          customerId,
          customerName,
          customerPhone,
          campaignId: campaign.id,
          campaignName: campaign.name,
          callId,
          action: 'earn',
          quantity: campaign.requiredQuantity,
          targetProductId: campaign.targetProductId,
          targetProductName: campaign.targetProductName,
          rewardProductId: campaign.rewardProductId,
          rewardProductName: campaign.rewardProductName,
          rewardQuantity: campaign.rewardQuantity,
          createdAt: serverTimestamp(),
          createdByRole: actorRole,
          createdById: actorId,
          createdByName: actorName,
        })
      }

      if (newlyEarnedCount > 0) {
        earnedRewards.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          rewardProductName: campaign.rewardProductName,
          rewardQuantity: campaign.rewardQuantity,
          rewardCount: newlyEarnedCount,
        })
      }
    })

    // Mark the call as processed even when no campaign matched, so the same
    // call is never re-evaluated.
    transaction.update(callRef, {
      loyaltyProcessed: true,
      loyaltyProcessedAt: serverTimestamp(),
      loyaltyRewardIds: rewardIds,
    })

    return { processed: true, earnedRewards }
  })
}

export async function getCustomerLoyaltyProgress(
  restaurantId: string,
  customerId: string
): Promise<LoyaltyProgress[]> {
  const progressSnap = await getDocs(
    collection(db, 'restaurants', restaurantId, 'customers', customerId, 'loyaltyProgress')
  )

  return progressSnap.docs.map((snap) => {
    const data = snap.data()
    return {
      id: snap.id,
      restaurantId: typeof data.restaurantId === 'string' ? data.restaurantId : restaurantId,
      customerId: typeof data.customerId === 'string' ? data.customerId : customerId,
      customerName: typeof data.customerName === 'string' ? data.customerName : '',
      customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : '',
      campaignId: typeof data.campaignId === 'string' ? data.campaignId : snap.id,
      campaignName: typeof data.campaignName === 'string' ? data.campaignName : '',
      targetProductId: typeof data.targetProductId === 'string' ? data.targetProductId : '',
      targetProductName: typeof data.targetProductName === 'string' ? data.targetProductName : '',
      requiredQuantity: typeof data.requiredQuantity === 'number' ? data.requiredQuantity : 0,
      rewardProductId: typeof data.rewardProductId === 'string' ? data.rewardProductId : '',
      rewardProductName: typeof data.rewardProductName === 'string' ? data.rewardProductName : '',
      rewardQuantity: typeof data.rewardQuantity === 'number' ? data.rewardQuantity : 0,
      currentQuantity: typeof data.currentQuantity === 'number' ? data.currentQuantity : 0,
      totalEarnedRewards: typeof data.totalEarnedRewards === 'number' ? data.totalEarnedRewards : 0,
      updatedAt: data.updatedAt?.toMillis?.() ?? null,
    }
  })
}
