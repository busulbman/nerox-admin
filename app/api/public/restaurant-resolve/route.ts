import { NextResponse, type NextRequest } from 'next/server'
import { normalizeRestaurantDocument } from '@/lib/restaurant-settings'
import { getAdminDb } from '@/lib/firebase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isDev = process.env.NODE_ENV === 'development'

function checkEnvVars() {
  const missing: string[] = []
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()) missing.push('FIREBASE_ADMIN_PROJECT_ID')
  if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL')
  if (!process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim()) missing.push('FIREBASE_ADMIN_PRIVATE_KEY')
  return missing
}

export async function GET(request: NextRequest) {
  const slugOrId = request.nextUrl.searchParams.get('slugOrId')?.trim().toLowerCase() || ''

  if (!slugOrId) {
    return NextResponse.json({ error: 'slugOrId gerekli.' }, { status: 400 })
  }

  try {
    const missingEnv = checkEnvVars()
    if (missingEnv.length > 0) {
      console.error('[restaurant-resolve] Missing env vars:', missingEnv.join(', '))
      return NextResponse.json(
        { error: 'Server configuration error', details: isDev ? `Missing: ${missingEnv.join(', ')}` : undefined },
        { status: 500 }
      )
    }

    const adminDb = await getAdminDb()

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
  } catch (error) {
    console.error('[restaurant-resolve] Failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Restaurant resolve failed', details: isDev ? message : undefined },
      { status: 500 }
    )
  }
}
