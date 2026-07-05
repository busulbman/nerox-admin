import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { CartItem, LoyaltyCampaign, LoyaltyReward, WaiterCall } from '@/lib/types'

export type RewardEarnResult = {
  campaignId: string
  campaignName: string
  rewardProductId: string
  rewardProductName: string
  rewardQuantity: number
  targetProductId: string
  targetProductName: string
  targetQuantityUsed: number
}

export type PendingRewardInfo = {
  campaignId: string
  campaignName: string
  rewardProductName: string
  rewardQuantity: number
  targetProductName: string
  currentQuantity: number
  requiredQuantity: number
}

export function calculatePendingRewards(
  items: CartItem[],
  campaigns: LoyaltyCampaign[]
): PendingRewardInfo[] {
  const activeCampaigns = campaigns.filter((c) => c.active)
  if (activeCampaigns.length === 0 || items.length === 0) return []

  const results: PendingRewardInfo[] = []

  for (const campaign of activeCampaigns) {
    const targetItems = items.filter((item) => item.productId === campaign.targetProductId)
    const totalQuantity = targetItems.reduce((sum, item) => sum + item.quantity, 0)

    if (totalQuantity >= campaign.requiredQuantity) {
      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        rewardProductName: campaign.rewardProductName,
        rewardQuantity: campaign.rewardQuantity,
        targetProductName: campaign.targetProductName,
        currentQuantity: totalQuantity,
        requiredQuantity: campaign.requiredQuantity,
      })
    }
  }

  return results
}

export function calculateCampaignProgress(
  items: CartItem[],
  campaign: LoyaltyCampaign
): { current: number; required: number } {
  const targetItems = items.filter((item) => item.productId === campaign.targetProductId)
  const totalQuantity = targetItems.reduce((sum, item) => sum + item.quantity, 0)
  return { current: totalQuantity, required: campaign.requiredQuantity }
}

export async function processRewardsOnOrderComplete(
  restaurantId: string,
  call: WaiterCall,
  actor?: { uid: string; name: string; role: 'admin' | 'waiter' }
): Promise<RewardEarnResult[]> {
  if (call.tip !== 'sipariş') return []

  const items = call.items ?? []
  if (items.length === 0) return []

  const customerId = (call as { customerId?: string }).customerId
  const customerName = (call as { customerName?: string }).customerName
  if (!customerId || !customerName) return []

  const campaignsSnap = await getDocs(
    query(
      collection(db, 'restaurants', restaurantId, 'loyaltyCampaigns'),
      where('active', '==', true)
    )
  )

  if (campaignsSnap.empty) return []

  const campaigns = campaignsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as LoyaltyCampaign[]

  const results: RewardEarnResult[] = []

  for (const campaign of campaigns) {
    const targetItems = items.filter((item) => item.productId === campaign.targetProductId)
    const totalQuantity = targetItems.reduce((sum, item) => sum + item.quantity, 0)

    if (totalQuantity < campaign.requiredQuantity) continue

    const existingRewardsSnap = await getDocs(
      query(
        collection(db, 'restaurants', restaurantId, 'customers', customerId, 'rewards'),
        where('earnedFromCallId', '==', call.id),
        where('campaignId', '==', campaign.id)
      )
    )

    if (!existingRewardsSnap.empty) continue

    const batch = writeBatch(db)

    const rewardRef = doc(collection(db, 'restaurants', restaurantId, 'customers', customerId, 'rewards'))
    batch.set(rewardRef, {
      campaignId: campaign.id,
      campaignName: campaign.name,
      rewardProductId: campaign.rewardProductId,
      rewardProductName: campaign.rewardProductName,
      rewardQuantity: campaign.rewardQuantity,
      status: 'available',
      earnedFromCallId: call.id,
      earnedAt: serverTimestamp(),
    })

    const transactionRef = doc(collection(db, 'restaurants', restaurantId, 'loyaltyTransactions'))
    batch.set(transactionRef, {
      customerId,
      customerName,
      campaignId: campaign.id,
      campaignName: campaign.name,
      callId: call.id,
      action: 'earn',
      targetProductId: campaign.targetProductId,
      targetProductName: campaign.targetProductName,
      targetQuantity: totalQuantity,
      rewardProductId: campaign.rewardProductId,
      rewardProductName: campaign.rewardProductName,
      rewardQuantity: campaign.rewardQuantity,
      createdAt: serverTimestamp(),
      createdByRole: actor?.role ?? 'system',
      createdById: actor?.uid ?? null,
      createdByName: actor?.name ?? 'Sistem',
    })

    await batch.commit()

    results.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      rewardProductId: campaign.rewardProductId,
      rewardProductName: campaign.rewardProductName,
      rewardQuantity: campaign.rewardQuantity,
      targetProductId: campaign.targetProductId,
      targetProductName: campaign.targetProductName,
      targetQuantityUsed: totalQuantity,
    })
  }

  return results
}

export async function getCustomerAvailableRewards(
  restaurantId: string,
  customerId: string
): Promise<LoyaltyReward[]> {
  const rewardsSnap = await getDocs(
    query(
      collection(db, 'restaurants', restaurantId, 'customers', customerId, 'rewards'),
      where('status', '==', 'available')
    )
  )

  return rewardsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    earnedAt: doc.data().earnedAt?.toMillis?.() ?? null,
    usedAt: doc.data().usedAt?.toMillis?.() ?? null,
  })) as LoyaltyReward[]
}

export async function redeemReward(
  restaurantId: string,
  customerId: string,
  rewardId: string,
  actor: { uid: string; name: string; role: 'admin' | 'waiter' }
): Promise<void> {
  const rewardRef = doc(db, 'restaurants', restaurantId, 'customers', customerId, 'rewards', rewardId)
  const rewardSnap = await getDocs(
    query(
      collection(db, 'restaurants', restaurantId, 'customers', customerId, 'rewards'),
      where('__name__', '==', rewardId)
    )
  )

  if (rewardSnap.empty) {
    throw new Error('Hediye bulunamadı.')
  }

  const reward = rewardSnap.docs[0].data() as Omit<LoyaltyReward, 'id'>
  if (reward.status !== 'available') {
    throw new Error('Bu hediye zaten kullanılmış.')
  }

  const customerSnap = await getDocs(
    query(collection(db, 'restaurants', restaurantId, 'customers'), where('__name__', '==', customerId))
  )

  const customerName = customerSnap.empty ? 'Müşteri' : (customerSnap.docs[0].data().name as string) || 'Müşteri'

  const batch = writeBatch(db)

  batch.update(rewardRef, {
    status: 'used',
    usedAt: serverTimestamp(),
    usedById: actor.uid,
    usedByName: actor.name,
  })

  const transactionRef = doc(collection(db, 'restaurants', restaurantId, 'loyaltyTransactions'))
  batch.set(transactionRef, {
    customerId,
    customerName,
    campaignId: reward.campaignId,
    campaignName: reward.campaignName,
    callId: reward.earnedFromCallId,
    action: 'redeem',
    targetProductId: '',
    targetProductName: '',
    targetQuantity: 0,
    rewardProductId: reward.rewardProductId,
    rewardProductName: reward.rewardProductName,
    rewardQuantity: reward.rewardQuantity,
    createdAt: serverTimestamp(),
    createdByRole: actor.role,
    createdById: actor.uid,
    createdByName: actor.name,
  })

  await batch.commit()
}
