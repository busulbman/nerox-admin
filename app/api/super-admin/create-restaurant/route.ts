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
    if (isDev) console.error('[create-restaurant] Auth REST error:', error.code, error.message)
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
    if (isDev) console.error('[create-restaurant] Firebase Admin error:', normalizedError.code, normalizedError.message)
    return NextResponse.json(
      {
        error: 'İşletme oluşturma altyapısı şu anda kullanılamıyor.',
        code: isDev ? normalizedError.code : undefined,
        details: isDev ? normalizedError.details : undefined,
      },
      { status: 500 }
    )
  }

  const errorMessage = normalizedError instanceof Error ? normalizedError.message : 'Unknown error'
  if (isDev) console.error('[create-restaurant] Unexpected error:', errorMessage)

  return NextResponse.json(
    {
      error: 'İşletme oluşturulurken beklenmeyen bir hata oluştu.',
      message: isDev ? errorMessage : undefined,
    },
    { status: 500 }
  )
}

export async function POST(request: NextRequest) {
  // Fresh ID token of the Auth user we create; used to roll it back via REST if
  // the Firestore seed write fails.
  let rollbackIdToken: string | null = null

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

    // Create the real Firebase Auth user via REST (no firebase-admin/auth import).
    const userRecord = await createUser(adminEmail, adminPassword, adminName)
    rollbackIdToken = userRecord.idToken

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

    // Seed succeeded — no rollback needed.
    rollbackIdToken = null

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
    // Roll back the orphaned Auth user so its email is freed for a retry.
    if (rollbackIdToken) {
      const deleted = await deleteUser(rollbackIdToken)
      if (!deleted) {
        console.error('[create-restaurant] Auth rollback failed; the created auth user may need manual cleanup.')
      }
    }

    return toErrorResponse(error)
  }
}
