import type { NextRequest } from 'next/server'
import type { UserProfile, RestaurantStatus } from '@/lib/types'
import { DEFAULT_PRIMARY_COLOR, generateSlug, normalizeRestaurantDocument } from '@/lib/restaurant-settings'
import { getAdminDb, getFieldValue, getTimestamp } from '@/lib/firebase-admin'
import { verifyIdToken } from '@/lib/firebase-auth-rest'

type FirebaseTimestampLike = {
  toMillis?: () => number
}

export type SuperAdminRestaurantSummary = {
  id: string
  name: string
  slug: string
  status: RestaurantStatus
  subscriptionExpiresAt: number | null
  productCount: number
  tableCount: number
  waiterCount: number
  menuLink: string
}

export class SuperAdminApiError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SuperAdminApiError'
    this.status = status
  }
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization')?.trim() || ''
  if (!authorization.startsWith('Bearer ')) {
    throw new SuperAdminApiError('Oturum doğrulanamadı.', 401)
  }

  const token = authorization.slice('Bearer '.length).trim()
  if (!token) {
    throw new SuperAdminApiError('Oturum doğrulanamadı.', 401)
  }

  return token
}

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (
    value
    && typeof value === 'object'
    && typeof (value as FirebaseTimestampLike).toMillis === 'function'
  ) {
    return (value as FirebaseTimestampLike).toMillis?.() ?? null
  }

  return null
}

export function parseRequiredString(value: unknown, fieldLabel: string) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  if (!normalizedValue) {
    throw new SuperAdminApiError(`${fieldLabel} gerekli.`)
  }

  return normalizedValue
}

export function parseOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseAdminEmail(value: unknown) {
  const email = parseRequiredString(value, 'Admin e-posta').toLowerCase()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailPattern.test(email)) {
    throw new SuperAdminApiError('Geçerli bir admin e-posta adresi girin.')
  }

  return email
}

export function parseAdminPassword(value: unknown) {
  const password = parseRequiredString(value, 'Admin şifre')

  if (password.length < 6) {
    throw new SuperAdminApiError('Admin şifre en az 6 karakter olmalı.')
  }

  return password
}

export async function parseSubscriptionDate(value: unknown) {
  const input = parseRequiredString(value, 'Abonelik bitiş tarihi')
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    throw new SuperAdminApiError('Abonelik bitiş tarihi geçersiz.')
  }

  const [, yearPart, monthPart, dayPart] = match
  const year = Number.parseInt(yearPart, 10)
  const month = Number.parseInt(monthPart, 10)
  const day = Number.parseInt(dayPart, 10)
  const expiresAt = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))

  if (Number.isNaN(expiresAt.getTime())) {
    throw new SuperAdminApiError('Abonelik bitiş tarihi geçersiz.')
  }

  const Timestamp = await getTimestamp()
  return Timestamp.fromDate(expiresAt)
}

export async function requireSuperAdmin(request: NextRequest) {
  console.log('[requireSuperAdmin] Starting authentication via REST API...')

  const token = getBearerToken(request)
  console.log('[requireSuperAdmin] Token extracted, length:', token.length)

  let verifiedUser
  try {
    verifiedUser = await verifyIdToken(token)
    console.log('[requireSuperAdmin] Token verified via REST, uid:', verifiedUser.uid)
  } catch (error) {
    console.error('[requireSuperAdmin] verifyIdToken failed:', error)
    throw new SuperAdminApiError('Token doğrulanamadı. Lütfen tekrar giriş yapın.', 401)
  }

  let adminDb
  try {
    adminDb = await getAdminDb()
    console.log('[requireSuperAdmin] getAdminDb success')
  } catch (error) {
    console.error('[requireSuperAdmin] getAdminDb failed:', error)
    throw error
  }

  let profileSnap
  try {
    profileSnap = await adminDb.collection('users').doc(verifiedUser.uid).get()
    console.log('[requireSuperAdmin] User doc fetched, exists:', profileSnap.exists)
  } catch (error) {
    console.error('[requireSuperAdmin] Firestore read failed:', error)
    throw error
  }

  if (!profileSnap.exists) {
    console.error('[requireSuperAdmin] User document not found for uid:', verifiedUser.uid)
    throw new SuperAdminApiError(`Super admin kullanıcı kaydı bulunamadı (uid: ${verifiedUser.uid})`, 403)
  }

  const profile = {
    uid: profileSnap.id,
    ...profileSnap.data(),
  } as UserProfile

  console.log('[requireSuperAdmin] User role:', profile.role)

  if (profile.role !== 'super_admin') {
    console.error('[requireSuperAdmin] User is not super_admin, role:', profile.role)
    throw new SuperAdminApiError(`Bu kullanıcı super_admin değil (rol: ${profile.role})`, 403)
  }

  console.log('[requireSuperAdmin] Authentication successful')
  return {
    uid: verifiedUser.uid,
    email: verifiedUser.email ?? profile.email,
    profile,
  }
}

export async function getUniqueRestaurantSlug(businessName: string, currentRestaurantId?: string | null) {
  const adminDb = await getAdminDb()
  const baseSlug = generateSlug(businessName) || 'isletme'
  let candidate = baseSlug
  let index = 2

  while (true) {
    const [docSnap, slugSnap] = await Promise.all([
      adminDb.collection('restaurants').doc(candidate).get(),
      adminDb.collection('restaurants').where('slug', '==', candidate).get(),
    ])

    const docIdTaken = docSnap.exists && docSnap.id !== currentRestaurantId
    const slugTaken = slugSnap.docs.some((doc) => doc.id !== currentRestaurantId)

    if (!docIdTaken && !slugTaken) {
      return candidate
    }

    candidate = `${baseSlug}-${index}`
    index += 1
  }
}

export async function listRestaurantsSummary(): Promise<SuperAdminRestaurantSummary[]> {
  const adminDb = await getAdminDb()
  const restaurantsSnap = await adminDb.collection('restaurants').get()

  const summaries = await Promise.all(
    restaurantsSnap.docs.map(async (restaurantDoc) => {
      const restaurant = normalizeRestaurantDocument(restaurantDoc.data(), restaurantDoc.id)
      const menuSlug = restaurant.slug || restaurantDoc.id

      const [productCountSnap, tableCountSnap, waiterCountSnap] = await Promise.all([
        adminDb.collection('restaurants').doc(restaurantDoc.id).collection('products').count().get(),
        adminDb.collection('restaurants').doc(restaurantDoc.id).collection('tables').count().get(),
        adminDb.collection('users')
          .where('restaurantId', '==', restaurantDoc.id)
          .where('role', '==', 'waiter')
          .count()
          .get(),
      ])

      return {
        id: restaurantDoc.id,
        name: restaurant.name || menuSlug,
        slug: menuSlug,
        status: restaurant.status === 'passive' ? 'passive' : 'active',
        subscriptionExpiresAt: toMillis(restaurant.subscriptionExpiresAt),
        productCount: Number(productCountSnap.data().count ?? 0),
        tableCount: Number(tableCountSnap.data().count ?? 0),
        waiterCount: Number(waiterCountSnap.data().count ?? 0),
        menuLink: `/menu/${menuSlug}/1`,
      } satisfies SuperAdminRestaurantSummary
    }),
  )

  return summaries.sort((left, right) => left.name.localeCompare(right.name, 'tr'))
}

export async function updateRestaurantStatus(restaurantId: string, status: RestaurantStatus) {
  const adminDb = await getAdminDb()
  const FieldValue = await getFieldValue()
  const normalizedRestaurantId = parseRequiredString(restaurantId, 'İşletme')
  const nextStatus = status === 'passive' ? 'passive' : 'active'
  const restaurantRef = adminDb.collection('restaurants').doc(normalizedRestaurantId)
  const restaurantSnap = await restaurantRef.get()

  if (!restaurantSnap.exists) {
    throw new SuperAdminApiError('İşletme bulunamadı.', 404)
  }

  await restaurantRef.set(
    {
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return {
    restaurantId: normalizedRestaurantId,
    status: nextStatus,
  }
}

export function mapFirebaseAdminError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''

  switch (code) {
    case 'auth/email-already-exists':
      return new SuperAdminApiError('Bu admin e-posta adresi zaten kayıtlı.')
    case 'auth/invalid-email':
      return new SuperAdminApiError('Geçerli bir admin e-posta adresi girin.')
    case 'auth/invalid-password':
      return new SuperAdminApiError('Admin şifre Firebase kurallarına uymuyor.')
    case 'auth/phone-number-already-exists':
      return new SuperAdminApiError('Bu telefon numarası başka bir kullanıcıda kayıtlı.')
    default:
      return error
  }
}

export async function buildRestaurantSeedData(input: {
  restaurantId: string
  restaurantName: string
  adminUid: string
  adminName: string
  adminEmail: string
  phone: string
  subscriptionExpiresAt: FirebaseFirestore.Timestamp
}) {
  const { restaurantId, restaurantName, adminUid, adminName, adminEmail, phone, subscriptionExpiresAt } = input
  const FieldValue = await getFieldValue()

  return {
    user: {
      uid: adminUid,
      email: adminEmail,
      role: 'admin' as const,
      name: adminName,
      restaurantId,
      active: true,
      phone,
    },
    restaurant: {
      name: restaurantName,
      slug: restaurantId,
      logoUrl: '',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      status: 'active' as const,
      subscriptionExpiresAt,
      phone,
      adminEmail,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    generalSettings: {
      businessName: restaurantName,
      slug: restaurantId,
      logoUrl: '',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      updatedAt: FieldValue.serverTimestamp(),
    },
    firstTable: {
      number: 1,
      status: 'boş' as const,
      sessionId: null,
      openedAt: null,
      lastPaymentCompletedAt: null,
      lastPaymentWaiterName: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  }
}
