import { NextResponse, type NextRequest } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import {
  SuperAdminApiError,
  buildRestaurantSeedData,
  getUniqueRestaurantSlug,
  mapFirebaseAdminError,
  parseAdminEmail,
  parseAdminPassword,
  parseOptionalString,
  parseRequiredString,
  parseSubscriptionDate,
  requireSuperAdmin,
} from '@/lib/super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toErrorResponse(error: unknown) {
  const normalizedError = mapFirebaseAdminError(error)

  if (normalizedError instanceof SuperAdminApiError) {
    return NextResponse.json({ error: normalizedError.message }, { status: normalizedError.status })
  }

  console.error('Super admin create restaurant API error:', normalizedError)
  return NextResponse.json({ error: 'İşletme oluşturulurken beklenmeyen bir hata oluştu.' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  let adminUid: string | null = null

  try {
    const adminAuth = getAdminAuth()
    const adminDb = getAdminDb()
    await requireSuperAdmin(request)
    const body = await request.json()

    const restaurantName = parseRequiredString(body.restaurantName, 'İşletme adı')
    const adminName = parseRequiredString(body.adminName, 'Admin adı')
    const adminEmail = parseAdminEmail(body.adminEmail)
    const adminPassword = parseAdminPassword(body.adminPassword)
    const phone = parseOptionalString(body.phone)
    const subscriptionExpiresAt = parseSubscriptionDate(body.subscriptionExpiresAt)

    const restaurantId = await getUniqueRestaurantSlug(restaurantName)
    const userRecord = await adminAuth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: adminName,
    })

    adminUid = userRecord.uid

    const seedData = buildRestaurantSeedData({
      restaurantId,
      restaurantName,
      adminUid: userRecord.uid,
      adminName,
      adminEmail,
      phone,
      subscriptionExpiresAt,
    })

    const batch = adminDb.batch()
    const restaurantRef = adminDb.collection('restaurants').doc(restaurantId)

    batch.set(adminDb.collection('users').doc(userRecord.uid), seedData.user)
    batch.set(restaurantRef, seedData.restaurant, { merge: true })
    batch.set(restaurantRef.collection('settings').doc('general'), seedData.generalSettings, { merge: true })
    batch.set(restaurantRef.collection('tables').doc('1'), seedData.firstTable, { merge: true })

    await batch.commit()

    return NextResponse.json(
      {
        restaurantId,
        slug: restaurantId,
        adminUid: userRecord.uid,
        menuLink: `/menu/${restaurantId}/1`,
      },
      { status: 201 },
    )
  } catch (error) {
    if (adminUid) {
      await getAdminAuth().deleteUser(adminUid).catch((cleanupError) => {
        console.error('Super admin create restaurant rollback error:', cleanupError)
      })
    }

    return toErrorResponse(error)
  }
}
