import { NextResponse, type NextRequest } from 'next/server'
import type { UserProfile } from '@/lib/types'
import { getAdminDb, getFieldValue } from '@/lib/firebase-admin'
import { verifyIdToken } from '@/lib/firebase-auth-rest'
import {
  DEFAULT_PRIMARY_COLOR,
  isValidRestaurantThemeColor,
  normalizeRestaurantDocument,
} from '@/lib/restaurant-settings'
import { getUniqueRestaurantSlug, parseRequiredString, SuperAdminApiError } from '@/lib/super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type OnboardingPayload = {
  businessName?: unknown
  phone?: unknown
  city?: unknown
  district?: unknown
  logoUrl?: unknown
  primaryColor?: unknown
  tablesCount?: unknown
  categoryName?: unknown
  productName?: unknown
  productDescription?: unknown
  productPrice?: unknown
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

function parseOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseTablesCount(value: unknown) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN

  if (!Number.isFinite(numericValue) || numericValue < 1 || numericValue > 200) {
    throw new SuperAdminApiError('Masa sayısı 1 ile 200 arasında olmalı.')
  }

  return Math.floor(numericValue)
}

function parsePrimaryColor(value: unknown) {
  const parsed = parseOptionalString(value) || DEFAULT_PRIMARY_COLOR

  if (!isValidRestaurantThemeColor(parsed)) {
    throw new SuperAdminApiError('Tema rengi geçerli bir hex renk olmalı. Örnek: #7c3aed')
  }

  return parsed
}

function parseProductPrice(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.')
    if (!normalized) {
      throw new SuperAdminApiError('İlk ürün fiyatı gerekli.')
    }
    const parsed = Number.parseFloat(normalized)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }

  throw new SuperAdminApiError('İlk ürün fiyatı geçerli bir sayı olmalı.')
}

async function requireRestaurantAdmin(request: NextRequest) {
  const token = getBearerToken(request)
  const verifiedUser = await verifyIdToken(token)
  const adminDb = await getAdminDb()
  const profileSnap = await adminDb.collection('users').doc(verifiedUser.uid).get()

  if (!profileSnap.exists) {
    throw new SuperAdminApiError('Kullanıcı profili bulunamadı.', 403)
  }

  const profile = { uid: profileSnap.id, ...profileSnap.data() } as UserProfile

  if (profile.role !== 'admin') {
    throw new SuperAdminApiError('Bu işlem yalnızca işletme admin hesabı için kullanılabilir.', 403)
  }

  const restaurantId = profile.restaurantId?.trim()
  if (!restaurantId) {
    throw new SuperAdminApiError('İşletme hesabı bulunamadı.', 403)
  }

  return {
    adminDb,
    profile,
    restaurantId,
  }
}

export async function POST(request: NextRequest) {
  try {
    const { adminDb, profile, restaurantId } = await requireRestaurantAdmin(request)
    const FieldValue = await getFieldValue()
    const body = (await request.json()) as OnboardingPayload

    const businessName = parseRequiredString(body.businessName, 'İşletme adı')
    const phone = parseRequiredString(body.phone, 'Telefon')
    const city = parseRequiredString(body.city, 'Şehir')
    const district = parseRequiredString(body.district, 'İlçe')
    const logoUrl = parseOptionalString(body.logoUrl)
    const primaryColor = parsePrimaryColor(body.primaryColor)
    const tablesCount = parseTablesCount(body.tablesCount)
    const categoryName = parseOptionalString(body.categoryName)
    const productName = parseOptionalString(body.productName)
    const productDescription = parseOptionalString(body.productDescription)
    const productPriceInput = parseOptionalString(body.productPrice)
    const hasProductFields = Boolean(productName || productDescription || productPriceInput)

    if (!categoryName && hasProductFields) {
      throw new SuperAdminApiError('İlk ürün eklemek için önce kategori adı girin.')
    }

    if (hasProductFields && !productName) {
      throw new SuperAdminApiError('İlk ürün adı gerekli.')
    }

    const productPrice = productName ? parseProductPrice(body.productPrice) : null
    const restaurantRef = adminDb.collection('restaurants').doc(restaurantId)
    const restaurantSnap = await restaurantRef.get()

    if (!restaurantSnap.exists) {
      throw new SuperAdminApiError('İşletme kaydı bulunamadı.', 404)
    }

    const restaurant = normalizeRestaurantDocument(restaurantSnap.data(), restaurantSnap.id)
    const slug = await getUniqueRestaurantSlug(businessName, restaurantId)

    const [tablesSnap, categoriesSnap] = await Promise.all([
      restaurantRef.collection('tables').get(),
      categoryName ? restaurantRef.collection('categories').get() : Promise.resolve(null),
    ])

    const existingTableNumbers = new Set<number>()
    for (const tableDoc of tablesSnap.docs) {
      const rawNumber = tableDoc.data().number
      if (typeof rawNumber === 'number' && Number.isFinite(rawNumber)) {
        existingTableNumbers.add(rawNumber)
        continue
      }

      const parsedNumber = Number.parseInt(tableDoc.id, 10)
      if (Number.isFinite(parsedNumber)) {
        existingTableNumbers.add(parsedNumber)
      }
    }

    const batch = adminDb.batch()
    batch.set(
      adminDb.collection('users').doc(profile.uid),
      {
        phone,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    batch.set(
      restaurantRef,
      {
        name: businessName,
        slug,
        phone,
        city,
        district,
        logoUrl,
        primaryColor,
        onboardingCompleted: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    batch.set(
      restaurantRef.collection('settings').doc('general'),
      {
        businessName,
        slug,
        logoUrl,
        primaryColor,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    let createdTableCount = 0
    for (let tableNumber = 1; tableNumber <= tablesCount; tableNumber += 1) {
      if (existingTableNumbers.has(tableNumber)) continue

      createdTableCount += 1
      batch.set(restaurantRef.collection('tables').doc(String(tableNumber)), {
        id: String(tableNumber),
        number: tableNumber,
        status: 'boş',
        active: true,
        sessionId: null,
        openedAt: null,
        sessionStartedAt: null,
        sessionExpiresAt: null,
        closedAt: null,
        lastPaymentCompletedAt: null,
        lastPaymentWaiterName: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    let createdCategoryId: string | null = null
    let createdCategoryName: string | null = null

    if (categoryName && categoriesSnap) {
      const normalizedCategoryName = categoryName.toLocaleLowerCase('tr')
      const existingCategory = categoriesSnap.docs.find((categoryDoc) => {
        const existingName = typeof categoryDoc.data().name === 'string' ? categoryDoc.data().name.trim() : ''
        return existingName.toLocaleLowerCase('tr') === normalizedCategoryName
      })

      if (existingCategory) {
        createdCategoryId = existingCategory.id
        createdCategoryName = typeof existingCategory.data().name === 'string' ? existingCategory.data().name.trim() : categoryName
      } else {
        const nextOrder = categoriesSnap.docs.reduce((maxOrder, categoryDoc) => {
          const currentOrder = typeof categoryDoc.data().order === 'number' ? categoryDoc.data().order : 0
          return Math.max(maxOrder, currentOrder)
        }, 0) + 1
        const categoryRef = restaurantRef.collection('categories').doc()

        createdCategoryId = categoryRef.id
        createdCategoryName = categoryName
        batch.set(categoryRef, {
          name: categoryName,
          order: nextOrder,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    let createdProductId: string | null = null
    if (createdCategoryId && productName && productPrice !== null) {
      const productRef = restaurantRef.collection('products').doc()
      createdProductId = productRef.id
      batch.set(productRef, {
        name: productName,
        description: productDescription,
        price: productPrice,
        categoryId: createdCategoryId,
        available: true,
        image: '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    await batch.commit()

    return NextResponse.json({
      restaurantId,
      slug,
      onboardingCompleted: true,
      createdTableCount,
      categoryCreated: createdCategoryName,
      productCreated: createdProductId,
      previousBusinessName: restaurant.name || null,
    })
  } catch (error) {
    if (error instanceof SuperAdminApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Onboarding tamamlanamadı.' },
      { status: 500 },
    )
  }
}
