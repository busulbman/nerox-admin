import { NextResponse } from 'next/server'
import { getAdminDb, getFieldValue } from '@/lib/firebase-admin'
import { normalizeRestaurantCustomer } from '@/lib/firestore-models'
import { getRestaurantAccessBlockMessage, normalizeRestaurantDocument } from '@/lib/restaurant-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

class PublicLoyaltyApiError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PublicLoyaltyApiError'
    this.status = status
  }
}

function parseRequiredString(value: unknown, fieldLabel: string) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    throw new PublicLoyaltyApiError(`${fieldLabel} gerekli.`)
  }

  return normalizedValue
}

function parseOptionalEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!email) return ''

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(email)) {
    throw new PublicLoyaltyApiError('Geçerli bir e-posta adresi girin.')
  }

  return email
}

function normalizePhoneForId(phone: string) {
  const normalized = phone.replace(/\D+/g, '')

  if (normalized.length < 7) {
    throw new PublicLoyaltyApiError('Geçerli bir telefon numarası girin.')
  }

  return normalized
}

function toErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 })
  }

  if (error instanceof PublicLoyaltyApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error('[public loyalty customers] unexpected error:', message)

  return NextResponse.json(
    { error: 'Kampanya kaydı şu anda tamamlanamıyor.' },
    { status: 500 },
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const restaurantId = parseRequiredString(body.restaurantId, 'İşletme')
    const name = parseRequiredString(body.name, 'İsim')
    const phone = parseRequiredString(body.phone, 'Telefon')
    const email = parseOptionalEmail(body.email)
    const normalizedPhone = normalizePhoneForId(phone)

    const adminDb = await getAdminDb()
    const FieldValue = await getFieldValue()

    const restaurantRef = adminDb.collection('restaurants').doc(restaurantId)
    const restaurantSnap = await restaurantRef.get()

    if (!restaurantSnap.exists) {
      throw new PublicLoyaltyApiError('İşletme bulunamadı.', 404)
    }

    const restaurant = normalizeRestaurantDocument(restaurantSnap.data(), restaurantSnap.id)
    const accessBlockMessage = getRestaurantAccessBlockMessage(restaurant)

    if (accessBlockMessage) {
      throw new PublicLoyaltyApiError(accessBlockMessage, 403)
    }

    const customerRef = restaurantRef.collection('customers').doc(normalizedPhone)
    const existingCustomerSnap = await customerRef.get()

    if (existingCustomerSnap.exists) {
      const existingCustomer = normalizeRestaurantCustomer(
        existingCustomerSnap.id,
        existingCustomerSnap.data() as Record<string, unknown>,
      )

      return NextResponse.json({
        created: false,
        customerId: existingCustomer.id,
        customerName: existingCustomer.name || name,
        customerPhone: existingCustomer.phone || phone,
      })
    }

    await customerRef.set({
      name,
      phone,
      ...(email ? { email } : {}),
      loyaltyEnabled: true,
      points: 0,
      totalOrders: 0,
      totalSpent: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json(
      {
        created: true,
        customerId: customerRef.id,
        customerName: name,
        customerPhone: phone,
      },
      { status: 201 },
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
