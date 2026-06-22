import { NextResponse, type NextRequest } from 'next/server'
import { normalizeRestaurantDocument } from '@/lib/restaurant-settings'
import { getAdminDb } from '@/lib/firebase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const slugOrId = request.nextUrl.searchParams.get('slugOrId')?.trim().toLowerCase() || ''

  if (!slugOrId) {
    return NextResponse.json({ error: 'slugOrId gerekli.' }, { status: 400 })
  }

  const adminDb = getAdminDb()
  const directSnap = await adminDb.collection('restaurants').doc(slugOrId).get()

  if (directSnap.exists) {
    const restaurant = normalizeRestaurantDocument(directSnap.data(), directSnap.id)
    return NextResponse.json({
      restaurant: {
        id: directSnap.id,
        slug: restaurant.slug || directSnap.id,
        name: restaurant.name || null,
        status: restaurant.status === 'passive' ? 'passive' : 'active',
        subscriptionExpiresAt: restaurant.subscriptionExpiresAt ?? null,
      },
    })
  }

  const slugSnap = await adminDb.collection('restaurants').where('slug', '==', slugOrId).limit(1).get()
  if (slugSnap.empty) {
    return NextResponse.json({ error: 'Restaurant bulunamadı.' }, { status: 404 })
  }

  const restaurantDoc = slugSnap.docs[0]
  const restaurant = normalizeRestaurantDocument(restaurantDoc.data(), restaurantDoc.id)

  return NextResponse.json({
    restaurant: {
      id: restaurantDoc.id,
      slug: restaurant.slug || restaurantDoc.id,
      name: restaurant.name || null,
      status: restaurant.status === 'passive' ? 'passive' : 'active',
      subscriptionExpiresAt: restaurant.subscriptionExpiresAt ?? null,
    },
  })
}
