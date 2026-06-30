import { NextResponse, type NextRequest } from 'next/server'
import { FirebaseAdminError, getAdminDb } from '@/lib/firebase-admin'
import { createUser, deleteUser, AuthRestError } from '@/lib/firebase-auth-rest'
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
  if (error instanceof AuthRestError) {
    console.error('[create-restaurant] Auth REST error:', error.code, error.message)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 400 }
    )
  }

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
    await requireSuperAdmin(request)
    const adminDb = await getAdminDb()
    const body = await request.json()

    const restaurantName = parseRequiredString(body.restaurantName, 'İşletme adı')
    const adminName = parseRequiredString(body.adminName, 'Admin adı')
    const adminEmail = parseAdminEmail(body.adminEmail)
    const adminPassword = parseAdminPassword(body.adminPassword)
    const phone = parseOptionalString(body.phone)
    const subscriptionExpiresAt = await parseSubscriptionDate(body.subscriptionExpiresAt)

    const restaurantId = await getUniqueRestaurantSlug(restaurantName)

    // Create user via REST API
    const userRecord = await createUser(adminEmail, adminPassword, adminName)
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
      // Note: REST API deleteUser is limited, just log the UID for manual cleanup
      await deleteUser(adminUid)
    }

    return toErrorResponse(error)
  }
}
