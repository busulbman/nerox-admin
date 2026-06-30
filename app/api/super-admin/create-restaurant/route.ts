import { NextResponse, type NextRequest } from 'next/server'
import { FirebaseAdminError, getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
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

const isDev = process.env.NODE_ENV === 'development'

function toErrorResponse(error: unknown) {
  const normalizedError = mapFirebaseAdminError(error)

  if (normalizedError instanceof SuperAdminApiError) {
    return NextResponse.json({ error: normalizedError.message }, { status: normalizedError.status })
  }

  if (normalizedError instanceof FirebaseAdminError) {
    console.error('[create-restaurant] Firebase Admin error:', normalizedError.code, normalizedError.message)
    return NextResponse.json(
      {
        error: normalizedError.message,
        code: normalizedError.code,
        details: isDev ? normalizedError.details : undefined,
      },
      { status: 500 }
    )
  }

  const errorMessage = normalizedError instanceof Error ? normalizedError.message : 'Unknown error'
  const errorStack = normalizedError instanceof Error ? normalizedError.stack : undefined
  console.error('[create-restaurant] Unexpected error:', errorMessage)
  if (errorStack) console.error('[create-restaurant] Stack:', errorStack)

  return NextResponse.json(
    {
      error: 'İşletme oluşturulurken beklenmeyen bir hata oluştu.',
      message: isDev ? errorMessage : undefined,
    },
    { status: 500 }
  )
}

export async function POST(request: NextRequest) {
  let adminUid: string | null = null

  try {
    const adminAuth = await getAdminAuth()
    const adminDb = await getAdminDb()
    await requireSuperAdmin(request)
    const body = await request.json()

    const restaurantName = parseRequiredString(body.restaurantName, 'İşletme adı')
    const adminName = parseRequiredString(body.adminName, 'Admin adı')
    const adminEmail = parseAdminEmail(body.adminEmail)
    const adminPassword = parseAdminPassword(body.adminPassword)
    const phone = parseOptionalString(body.phone)
    const subscriptionExpiresAt = await parseSubscriptionDate(body.subscriptionExpiresAt)

    const restaurantId = await getUniqueRestaurantSlug(restaurantName)
    const userRecord = await adminAuth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: adminName,
    })

    adminUid = userRecord.uid

    const seedData = await buildRestaurantSeedData({
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
      const authForCleanup = await getAdminAuth()
      await authForCleanup.deleteUser(adminUid).catch((cleanupError) => {
        console.error('Super admin create restaurant rollback error:', cleanupError)
      })
    }

    return toErrorResponse(error)
  }
}
