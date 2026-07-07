import { getAdminAuth, getAdminDb, getFieldValue, getTimestamp } from '@/lib/firebase-admin'
import { DEFAULT_PRIMARY_COLOR } from '@/lib/restaurant-settings'
import {
  TRIAL_DURATION_DAYS,
  type SelfServiceBusinessType,
} from '@/lib/self-service-registration-config'
import { getUniqueRestaurantSlug } from '@/lib/super-admin'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export type SelfServiceRegistrationInput = {
  businessName: string
  ownerName: string
  email: string
  password: string
  phone: string
  businessType: SelfServiceBusinessType
  city: string
  district: string
}

export async function registerRestaurantAccount(input: SelfServiceRegistrationInput) {
  const adminAuth = await getAdminAuth()
  const adminDb = await getAdminDb()
  const FieldValue = await getFieldValue()
  const Timestamp = await getTimestamp()

  const slug = await getUniqueRestaurantSlug(input.businessName)
  const now = Date.now()
  const trialEndsAt = now + TRIAL_DURATION_DAYS * DAY_IN_MS
  const trialStartedAtTimestamp = Timestamp.fromMillis(now)
  const trialEndsAtTimestamp = Timestamp.fromMillis(trialEndsAt)

  let uid: string | null = null

  try {
    const userRecord = await adminAuth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.ownerName,
    })

    uid = userRecord.uid

    const restaurantRef = adminDb.collection('restaurants').doc(slug)
    const batch = adminDb.batch()

    batch.set(adminDb.collection('users').doc(uid), {
      uid,
      role: 'admin',
      restaurantId: slug,
      active: true,
      name: input.ownerName,
      email: input.email,
      phone: input.phone,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    batch.set(restaurantRef, {
      name: input.businessName,
      slug,
      ownerUid: uid,
      ownerName: input.ownerName,
      ownerEmail: input.email,
      phone: input.phone,
      businessType: input.businessType,
      city: input.city,
      district: input.district,
      status: 'active',
      plan: 'trial',
      trialStartedAt: trialStartedAtTimestamp,
      trialEndsAt: trialEndsAtTimestamp,
      subscriptionExpiresAt: trialEndsAtTimestamp,
      onboardingCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    batch.set(restaurantRef.collection('settings').doc('general'), {
      businessName: input.businessName,
      slug,
      logoUrl: '',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      wifiEnabled: false,
      wifiName: '',
      wifiPassword: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    batch.set(restaurantRef.collection('tables').doc('1'), {
      id: '1',
      number: 1,
      status: 'boş',
      active: true,
      sessionId: null,
      openedAt: null,
      sessionStartedAt: null,
      sessionExpiresAt: null,
      closedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    return {
      uid,
      slug,
      trialStartedAt: now,
      trialEndsAt,
    }
  } catch (error) {
    if (uid) {
      await adminAuth.deleteUser(uid).catch((deleteError) => {
        console.error('[self-service-registration] auth rollback failed:', deleteError)
      })
    }

    throw error
  }
}
