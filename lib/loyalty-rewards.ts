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
import type { CartItem, LoyaltyCampaign, LoyaltyReward } from '@/lib/types'

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
  const customerRef = doc(db, 'restaurants', restaurantId, 'customers', customerId)

  // Read the reward status and flip it to 'used' inside a single transaction so
  // two concurrent redeems of the same reward can never both succeed.
  await runTransaction(db, async (transaction) => {
    const rewardSnap = await transaction.get(rewardRef)
    if (!rewardSnap.exists()) {
      throw new Error('Hediye bulunamadı.')
    }

    const reward = rewardSnap.data() as Omit<LoyaltyReward, 'id'>
    if (reward.status !== 'available') {
      throw new Error('Bu hediye zaten kullanılmış.')
    }

    const customerSnap = await transaction.get(customerRef)
    const customerName =
      (customerSnap.exists() ? (customerSnap.data().name as string) : '') || 'Müşteri'

    transaction.update(rewardRef, {
      status: 'used',
      usedAt: serverTimestamp(),
      usedById: actor.uid,
      usedByName: actor.name,
    })

    const transactionRef = doc(collection(db, 'restaurants', restaurantId, 'loyaltyTransactions'))
    transaction.set(transactionRef, {
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
  })
}
