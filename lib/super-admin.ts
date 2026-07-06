import type { NextRequest } from 'next/server'
import type { RestaurantPlan, UserProfile, RestaurantStatus, BillingPeriod, PaymentStatus, RestaurantFeatures } from '@/lib/types'
import { DEFAULT_FEATURES } from '@/lib/types'
import {
  DEFAULT_PRIMARY_COLOR,
  generateSlug,
  getRestaurantRemainingDays,
  normalizeRestaurantDocument,
} from '@/lib/restaurant-settings'
import { SUBSCRIPTION_EXTENSION_PRESETS, type SubscriptionExtensionPreset } from '@/lib/subscription-extension'
import { getAdminDb, getFieldValue, getTimestamp } from '@/lib/firebase-admin'
import { verifyIdToken } from '@/lib/firebase-auth-rest'

type FirebaseTimestampLike = {
  toMillis?: () => number
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

export type SuperAdminRestaurantSummary = {
  id: string
  name: string
  slug: string
  ownerName: string
  email: string
  phone: string
  businessType: string
  city: string
  district: string
  plan: RestaurantPlan
  billingPeriod: BillingPeriod
  paymentStatus: PaymentStatus
  status: RestaurantStatus
  trialStartedAt: number | null
  trialEndsAt: number | null
  subscriptionStartedAt: number | null
  subscriptionExpiresAt: number | null
  lifetimeAccess: boolean
  remainingDays: number | null
  isExpired: boolean
  lastPaymentAmount: number | null
  lastPaymentDate: number | null
  notes: string
  deletedAt: number | null
  deletedBy: string | null
  productCount: number
  tableCount: number
  waiterCount: number
  menuLink: string
  adminUid: string | null
  pendingEmailChange: string | null
  features: RestaurantFeatures
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

export function parseSubscriptionExtension(value: unknown): SubscriptionExtensionPreset {
  if (SUBSCRIPTION_EXTENSION_PRESETS.includes(value as SubscriptionExtensionPreset)) {
    return value as SubscriptionExtensionPreset
  }

  throw new SuperAdminApiError('Geçerli bir süre uzatma tipi gönderin.')
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

function normalizeFeatures(raw: unknown, plan: RestaurantPlan): RestaurantFeatures {
  const defaults = DEFAULT_FEATURES[plan]
  if (!raw || typeof raw !== 'object') {
    return { ...defaults }
  }
  const obj = raw as Record<string, unknown>
  return {
    qrMenu: typeof obj.qrMenu === 'boolean' ? obj.qrMenu : defaults.qrMenu,
    waiterCall: typeof obj.waiterCall === 'boolean' ? obj.waiterCall : defaults.waiterCall,
    manualOrders: typeof obj.manualOrders === 'boolean' ? obj.manualOrders : defaults.manualOrders,
    loyalty: typeof obj.loyalty === 'boolean' ? obj.loyalty : defaults.loyalty,
    multiLanguage: typeof obj.multiLanguage === 'boolean' ? obj.multiLanguage : defaults.multiLanguage,
    analytics: typeof obj.analytics === 'boolean' ? obj.analytics : defaults.analytics,
    kitchen: typeof obj.kitchen === 'boolean' ? obj.kitchen : defaults.kitchen,
  }
}

export async function listRestaurantsSummary(): Promise<SuperAdminRestaurantSummary[]> {
  const adminDb = await getAdminDb()
  const restaurantsSnap = await adminDb.collection('restaurants').get()

  const summaries = await Promise.all(
    restaurantsSnap.docs.map(async (restaurantDoc) => {
      const restaurant = normalizeRestaurantDocument(restaurantDoc.data(), restaurantDoc.id)
      const menuSlug = restaurant.slug || restaurantDoc.id

      const [productCountSnap, tableCountSnap, waiterCountSnap, adminUserSnap] = await Promise.all([
        adminDb.collection('restaurants').doc(restaurantDoc.id).collection('products').count().get(),
        adminDb.collection('restaurants').doc(restaurantDoc.id).collection('tables').count().get(),
        adminDb.collection('users')
          .where('restaurantId', '==', restaurantDoc.id)
          .where('role', '==', 'waiter')
          .count()
          .get(),
        adminDb.collection('users')
          .where('restaurantId', '==', restaurantDoc.id)
          .where('role', '==', 'admin')
          .limit(1)
          .get(),
      ])

      const adminProfile = !adminUserSnap.empty
        ? ({ uid: adminUserSnap.docs[0].id, ...adminUserSnap.docs[0].data() } as UserProfile)
        : null

      const rawData = restaurantDoc.data() as Record<string, unknown>
      const lifetimeAccess = rawData.lifetimeAccess === true
      const remainingDays = lifetimeAccess ? null : getRestaurantRemainingDays(restaurant)
      const isExpired = !lifetimeAccess && remainingDays === 0 && typeof restaurant.subscriptionExpiresAt === 'number'

      const adminData = adminProfile as unknown as Record<string, unknown> | null
      const pendingEmailChange = adminData && typeof adminData.pendingEmailChange === 'string'
        ? adminData.pendingEmailChange
        : null

      const plan = (['starter', 'pro', 'premium'].includes(rawData.plan as string) ? rawData.plan : 'starter') as RestaurantPlan
      const billingPeriod = (['trial', 'monthly', 'six_months', 'yearly', 'lifetime'].includes(rawData.billingPeriod as string) ? rawData.billingPeriod : 'trial') as BillingPeriod
      const paymentStatus = (['trial', 'paid', 'unpaid', 'expired'].includes(rawData.paymentStatus as string) ? rawData.paymentStatus : 'trial') as PaymentStatus
      const status = (['active', 'passive', 'deleted'].includes(rawData.status as string) ? rawData.status : 'active') as RestaurantStatus

      return {
        id: restaurantDoc.id,
        name: restaurant.name || menuSlug,
        slug: menuSlug,
        ownerName: restaurant.ownerName || adminProfile?.name || '',
        email: restaurant.ownerEmail || restaurant.adminEmail || adminProfile?.email || '',
        phone: restaurant.phone || adminProfile?.phone || '',
        businessType: restaurant.businessType || '',
        city: restaurant.city || '',
        district: restaurant.district || '',
        plan,
        billingPeriod,
        paymentStatus,
        status,
        trialStartedAt: toMillis(rawData.trialStartedAt),
        trialEndsAt: toMillis(restaurant.trialEndsAt),
        subscriptionStartedAt: toMillis(rawData.subscriptionStartedAt),
        subscriptionExpiresAt: toMillis(restaurant.subscriptionExpiresAt),
        lifetimeAccess,
        remainingDays,
        isExpired,
        lastPaymentAmount: typeof rawData.lastPaymentAmount === 'number' ? rawData.lastPaymentAmount : null,
        lastPaymentDate: toMillis(rawData.lastPaymentDate),
        notes: typeof rawData.notes === 'string' ? rawData.notes : '',
        deletedAt: toMillis(rawData.deletedAt),
        deletedBy: typeof rawData.deletedBy === 'string' ? rawData.deletedBy : null,
        productCount: Number(productCountSnap.data().count ?? 0),
        tableCount: Number(tableCountSnap.data().count ?? 0),
        waiterCount: Number(waiterCountSnap.data().count ?? 0),
        menuLink: `/menu/${menuSlug}/1`,
        adminUid: adminProfile?.uid || null,
        pendingEmailChange,
        features: normalizeFeatures(rawData.features, plan),
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

function addSubscriptionExtension(baseMs: number, preset: SubscriptionExtensionPreset) {
  if (preset === '7d') {
    return baseMs + 7 * DAY_IN_MS
  }

  const nextDate = new Date(baseMs)

  if (preset === '1m') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1)
    return nextDate.getTime()
  }

  if (preset === '3m') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 3)
    return nextDate.getTime()
  }

  nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1)
  return nextDate.getTime()
}

export async function extendRestaurantSubscription(restaurantId: string, preset: SubscriptionExtensionPreset) {
  const adminDb = await getAdminDb()
  const FieldValue = await getFieldValue()
  const Timestamp = await getTimestamp()
  const normalizedRestaurantId = parseRequiredString(restaurantId, 'İşletme')
  const restaurantRef = adminDb.collection('restaurants').doc(normalizedRestaurantId)
  const restaurantSnap = await restaurantRef.get()

  if (!restaurantSnap.exists) {
    throw new SuperAdminApiError('İşletme bulunamadı.', 404)
  }

  const restaurant = normalizeRestaurantDocument(restaurantSnap.data(), restaurantSnap.id)
  const now = Date.now()
  const subscriptionBase = Math.max(now, restaurant.subscriptionExpiresAt ?? 0)
  const nextSubscriptionExpiresAt = addSubscriptionExtension(subscriptionBase, preset)
  const updates: Record<string, unknown> = {
    subscriptionExpiresAt: Timestamp.fromMillis(nextSubscriptionExpiresAt),
    status: 'active' as const,
    updatedAt: FieldValue.serverTimestamp(),
  }

  const rawData = restaurantSnap.data() as Record<string, unknown>
  const isTrial = rawData.billingPeriod === 'trial' || rawData.paymentStatus === 'trial'

  if (preset === '7d' && isTrial) {
    const trialBase = Math.max(now, restaurant.trialEndsAt ?? restaurant.subscriptionExpiresAt ?? 0)
    const nextTrialEndsAt = addSubscriptionExtension(trialBase, preset)
    updates.trialEndsAt = Timestamp.fromMillis(nextTrialEndsAt)
    updates.subscriptionExpiresAt = Timestamp.fromMillis(Math.max(nextSubscriptionExpiresAt, nextTrialEndsAt))
  } else if (preset !== '7d') {
    updates.paymentStatus = 'paid'
    updates.billingPeriod = preset === '1m' ? 'monthly' : preset === '3m' ? 'six_months' : 'yearly'
  }

  await restaurantRef.set(updates, { merge: true })

  return {
    restaurantId: normalizedRestaurantId,
    status: 'active' as const,
    subscriptionExpiresAt: toMillis(updates.subscriptionExpiresAt),
    trialEndsAt: toMillis(updates.trialEndsAt),
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
      ownerUid: adminUid,
      ownerName: adminName,
      ownerEmail: adminEmail,
      logoUrl: '',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      plan: 'paid' as const,
      status: 'active' as const,
      onboardingCompleted: false,
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
      id: '1',
      number: 1,
      status: 'boş' as const,
      active: true,
      sessionId: null,
      openedAt: null,
      lastPaymentCompletedAt: null,
      lastPaymentWaiterName: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  }
}

export type SubscriptionAction =
  | 'set_trial'
  | 'end_trial'
  | 'set_monthly'
  | 'set_six_months'
  | 'set_yearly'
  | 'set_lifetime'
  | 'set_plan'
  | 'set_expiry'
  | 'soft_delete'

export async function updateRestaurantSubscription(
  restaurantId: string,
  action: SubscriptionAction,
  options?: {
    plan?: RestaurantPlan
    expiryDate?: string
    deletedBy?: string
  }
) {
  const adminDb = await getAdminDb()
  const FieldValue = await getFieldValue()
  const Timestamp = await getTimestamp()
  const normalizedId = parseRequiredString(restaurantId, 'İşletme')
  const restaurantRef = adminDb.collection('restaurants').doc(normalizedId)
  const restaurantSnap = await restaurantRef.get()

  if (!restaurantSnap.exists) {
    throw new SuperAdminApiError('İşletme bulunamadı.', 404)
  }

  const now = Date.now()
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  switch (action) {
    case 'set_trial': {
      const trialEnd = now + 7 * DAY_IN_MS
      updates.billingPeriod = 'trial'
      updates.paymentStatus = 'trial'
      updates.trialStartedAt = Timestamp.fromMillis(now)
      updates.trialEndsAt = Timestamp.fromMillis(trialEnd)
      updates.subscriptionExpiresAt = Timestamp.fromMillis(trialEnd)
      updates.lifetimeAccess = false
      updates.status = 'active'
      break
    }

    case 'end_trial': {
      updates.paymentStatus = 'unpaid'
      updates.status = 'passive'
      break
    }

    case 'set_monthly': {
      const monthEnd = new Date(now)
      monthEnd.setMonth(monthEnd.getMonth() + 1)
      updates.billingPeriod = 'monthly'
      updates.paymentStatus = 'paid'
      updates.subscriptionStartedAt = Timestamp.fromMillis(now)
      updates.subscriptionExpiresAt = Timestamp.fromMillis(monthEnd.getTime())
      updates.lifetimeAccess = false
      updates.status = 'active'
      break
    }

    case 'set_six_months': {
      const sixMonthEnd = new Date(now)
      sixMonthEnd.setMonth(sixMonthEnd.getMonth() + 6)
      updates.billingPeriod = 'six_months'
      updates.paymentStatus = 'paid'
      updates.subscriptionStartedAt = Timestamp.fromMillis(now)
      updates.subscriptionExpiresAt = Timestamp.fromMillis(sixMonthEnd.getTime())
      updates.lifetimeAccess = false
      updates.status = 'active'
      break
    }

    case 'set_yearly': {
      const yearEnd = new Date(now)
      yearEnd.setFullYear(yearEnd.getFullYear() + 1)
      updates.billingPeriod = 'yearly'
      updates.paymentStatus = 'paid'
      updates.subscriptionStartedAt = Timestamp.fromMillis(now)
      updates.subscriptionExpiresAt = Timestamp.fromMillis(yearEnd.getTime())
      updates.lifetimeAccess = false
      updates.status = 'active'
      break
    }

    case 'set_lifetime': {
      updates.billingPeriod = 'lifetime'
      updates.paymentStatus = 'paid'
      updates.lifetimeAccess = true
      updates.subscriptionExpiresAt = null
      updates.status = 'active'
      break
    }

    case 'set_plan': {
      if (options?.plan && ['starter', 'pro', 'premium'].includes(options.plan)) {
        updates.plan = options.plan
      } else {
        throw new SuperAdminApiError('Geçerli bir plan seçin.')
      }
      break
    }

    case 'set_expiry': {
      if (!options?.expiryDate) {
        throw new SuperAdminApiError('Bitiş tarihi gerekli.')
      }
      const parsed = parseExpiryDate(options.expiryDate)
      updates.subscriptionExpiresAt = parsed
      updates.lifetimeAccess = false
      break
    }

    case 'soft_delete': {
      updates.status = 'deleted'
      updates.deletedAt = Timestamp.fromMillis(now)
      updates.deletedBy = options?.deletedBy || null
      break
    }
  }

  await restaurantRef.set(updates, { merge: true })

  return {
    restaurantId: normalizedId,
    action,
    updates: Object.keys(updates),
  }
}

function parseExpiryDate(dateStr: string): FirebaseFirestore.Timestamp {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new SuperAdminApiError('Geçersiz tarih formatı. YYYY-MM-DD kullanın.')
  }

  const [, y, m, d] = match
  const date = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 23, 59, 59, 999))

  if (isNaN(date.getTime())) {
    throw new SuperAdminApiError('Geçersiz tarih.')
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Timestamp } = require('firebase-admin/firestore')
  return Timestamp.fromDate(date)
}

export async function updateRestaurantFeatures(
  restaurantId: string,
  features: Partial<RestaurantFeatures>,
  plan?: RestaurantPlan
) {
  const adminDb = await getAdminDb()
  const FieldValue = await getFieldValue()
  const normalizedId = parseRequiredString(restaurantId, 'İşletme')
  const restaurantRef = adminDb.collection('restaurants').doc(normalizedId)
  const restaurantSnap = await restaurantRef.get()

  if (!restaurantSnap.exists) {
    throw new SuperAdminApiError('İşletme bulunamadı.', 404)
  }

  const rawData = restaurantSnap.data() as Record<string, unknown>
  const currentPlan = (['starter', 'pro', 'premium'].includes(rawData.plan as string) ? rawData.plan : 'starter') as RestaurantPlan
  const targetPlan = plan || currentPlan
  const defaults = DEFAULT_FEATURES[targetPlan]

  const newFeatures: RestaurantFeatures = {
    qrMenu: typeof features.qrMenu === 'boolean' ? features.qrMenu : defaults.qrMenu,
    waiterCall: typeof features.waiterCall === 'boolean' ? features.waiterCall : defaults.waiterCall,
    manualOrders: typeof features.manualOrders === 'boolean' ? features.manualOrders : defaults.manualOrders,
    loyalty: typeof features.loyalty === 'boolean' ? features.loyalty : defaults.loyalty,
    multiLanguage: typeof features.multiLanguage === 'boolean' ? features.multiLanguage : defaults.multiLanguage,
    analytics: typeof features.analytics === 'boolean' ? features.analytics : defaults.analytics,
    kitchen: typeof features.kitchen === 'boolean' ? features.kitchen : defaults.kitchen,
  }

  const updates: Record<string, unknown> = {
    features: newFeatures,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (plan && plan !== currentPlan) {
    updates.plan = plan
  }

  await restaurantRef.set(updates, { merge: true })

  return {
    restaurantId: normalizedId,
    plan: targetPlan,
    features: newFeatures,
  }
}
