import { NextResponse, type NextRequest } from 'next/server'
import type { UserProfile } from '@/lib/types'
import { getAdminDb } from '@/lib/firebase-admin'
import { verifyIdToken } from '@/lib/firebase-auth-rest'
import { getUniqueRestaurantSlug, parseRequiredString } from '@/lib/super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization')?.trim() || ''
  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Oturum doğrulanamadı.')
  }

  const token = authorization.slice('Bearer '.length).trim()
  if (!token) {
    throw new Error('Oturum doğrulanamadı.')
  }

  return token
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request)
    const verifiedUser = await verifyIdToken(token)
    const adminDb = await getAdminDb()
    const profileSnap = await adminDb.collection('users').doc(verifiedUser.uid).get()

    if (!profileSnap.exists) {
      return NextResponse.json({ error: 'Kullanıcı profili bulunamadı.' }, { status: 403 })
    }

    const profile = { uid: profileSnap.id, ...profileSnap.data() } as UserProfile
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 })
    }

    const body = await request.json()
    const businessName = parseRequiredString(body.businessName, 'İşletme adı')
    const currentRestaurantId = typeof body.currentRestaurantId === 'string' ? body.currentRestaurantId.trim() : ''

    if (profile.role === 'admin' && currentRestaurantId && currentRestaurantId !== profile.restaurantId) {
      return NextResponse.json({ error: 'Başka işletmenin slug bilgisi hesaplanamaz.' }, { status: 403 })
    }

    const slug = await getUniqueRestaurantSlug(
      businessName,
      currentRestaurantId || (profile.role === 'admin' ? profile.restaurantId ?? null : null),
    )

    return NextResponse.json({ slug })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Slug hesaplanamadı.' },
      { status: 400 },
    )
  }
}
