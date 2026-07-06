import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getRestaurantAccessBlockMessage, normalizeRestaurantDocument } from '@/lib/restaurant-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toMillis(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get('restaurantId')?.trim() ?? ''
    const customerId = searchParams.get('customerId')?.trim() ?? ''

    if (!restaurantId || !customerId) {
      return NextResponse.json({ error: 'restaurantId ve customerId gerekli.' }, { status: 400 })
    }

    const adminDb = await getAdminDb()
    const restaurantRef = adminDb.collection('restaurants').doc(restaurantId)
    const restaurantSnap = await restaurantRef.get()

    if (!restaurantSnap.exists) {
      return NextResponse.json({ error: 'İşletme bulunamadı.' }, { status: 404 })
    }

    const restaurant = normalizeRestaurantDocument(restaurantSnap.data(), restaurantSnap.id)
    const accessBlockMessage = getRestaurantAccessBlockMessage(restaurant)
    if (accessBlockMessage) {
      return NextResponse.json({ error: accessBlockMessage }, { status: 403 })
    }

    const customerRef = restaurantRef.collection('customers').doc(customerId)
    const [customerSnap, progressSnap, rewardsSnap] = await Promise.all([
      customerRef.get(),
      customerRef.collection('loyaltyProgress').get(),
      customerRef.collection('rewards').where('status', '==', 'available').get(),
    ])

    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'Müşteri bulunamadı.' }, { status: 404 })
    }

    const customerData = customerSnap.data() ?? {}

    const progress = progressSnap.docs.map((snap) => {
      const data = snap.data()
      return {
        campaignId: typeof data.campaignId === 'string' ? data.campaignId : snap.id,
        campaignName: typeof data.campaignName === 'string' ? data.campaignName : '',
        targetProductId: typeof data.targetProductId === 'string' ? data.targetProductId : '',
        targetProductName: typeof data.targetProductName === 'string' ? data.targetProductName : '',
        requiredQuantity: typeof data.requiredQuantity === 'number' ? data.requiredQuantity : 0,
        rewardProductName: typeof data.rewardProductName === 'string' ? data.rewardProductName : '',
        rewardQuantity: typeof data.rewardQuantity === 'number' ? data.rewardQuantity : 0,
        currentQuantity: typeof data.currentQuantity === 'number' ? data.currentQuantity : 0,
        totalEarnedRewards: typeof data.totalEarnedRewards === 'number' ? data.totalEarnedRewards : 0,
        updatedAt: toMillis(data.updatedAt),
      }
    })

    const rewards = rewardsSnap.docs.map((snap) => {
      const data = snap.data()
      return {
        id: snap.id,
        campaignId: typeof data.campaignId === 'string' ? data.campaignId : '',
        campaignName: typeof data.campaignName === 'string' ? data.campaignName : '',
        rewardProductName: typeof data.rewardProductName === 'string' ? data.rewardProductName : '',
        rewardQuantity: typeof data.rewardQuantity === 'number' ? data.rewardQuantity : 0,
        earnedAt: toMillis(data.earnedAt),
      }
    })

    return NextResponse.json({
      customer: {
        id: customerSnap.id,
        name: typeof customerData.name === 'string' ? customerData.name : '',
        phone: typeof customerData.phone === 'string' ? customerData.phone : '',
      },
      progress,
      rewards,
    })
  } catch (error) {
    console.error('[public loyalty status] unexpected error:', error)
    return NextResponse.json({ error: 'Kampanya durumu şu anda yüklenemiyor.' }, { status: 500 })
  }
}
