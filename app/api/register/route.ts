import { NextResponse } from 'next/server'
import { FirebaseAdminError } from '@/lib/firebase-admin'
import {
  SELF_SERVICE_BUSINESS_TYPES,
  type SelfServiceBusinessType,
} from '@/lib/self-service-registration-config'
import { registerRestaurantAccount } from '@/lib/self-service-registration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isDev = process.env.NODE_ENV === 'development'

class RegisterApiError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RegisterApiError'
    this.status = status
  }
}

function parseRequiredString(value: unknown, fieldLabel: string) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    throw new RegisterApiError(`${fieldLabel} gerekli.`)
  }

  return normalizedValue
}

function parseEmail(value: unknown) {
  const email = parseRequiredString(value, 'E-posta').toLowerCase()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailPattern.test(email)) {
    throw new RegisterApiError('Geçerli bir e-posta adresi girin.')
  }

  return email
}

function parsePassword(value: unknown) {
  const password = parseRequiredString(value, 'Şifre')

  if (password.length < 6) {
    throw new RegisterApiError('Şifre en az 6 karakter olmalı.')
  }

  return password
}

function parseBusinessType(value: unknown): SelfServiceBusinessType {
  const businessType = parseRequiredString(value, 'İşletme türü')

  if (!SELF_SERVICE_BUSINESS_TYPES.includes(businessType as SelfServiceBusinessType)) {
    throw new RegisterApiError('Geçerli bir işletme türü seçin.')
  }

  return businessType as SelfServiceBusinessType
}

function mapRegistrationError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''

  switch (code) {
    case 'auth/email-already-exists':
      return new RegisterApiError('Bu e-posta adresi zaten kayıtlı.')
    case 'auth/invalid-email':
      return new RegisterApiError('Geçerli bir e-posta adresi girin.')
    case 'auth/invalid-password':
      return new RegisterApiError('Şifre en az 6 karakter olmalı.')
    default:
      return error
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 })
  }

  const mappedError = mapRegistrationError(error)

  if (mappedError instanceof RegisterApiError) {
    return NextResponse.json({ error: mappedError.message }, { status: mappedError.status })
  }

  if (mappedError instanceof FirebaseAdminError) {
    console.error('[register] Firebase Admin error:', mappedError.code, mappedError.message)
    return NextResponse.json(
      {
        error: 'Kayıt altyapısı şu anda kullanılamıyor.',
        code: mappedError.code,
        details: isDev ? mappedError.details : undefined,
      },
      { status: 500 },
    )
  }

  const errorMessage = mappedError instanceof Error ? mappedError.message : 'Unknown error'
  console.error('[register] Unexpected error:', errorMessage)

  return NextResponse.json(
    {
      error: 'Hesap oluşturulurken beklenmeyen bir hata oluştu.',
      message: isDev ? errorMessage : undefined,
    },
    { status: 500 },
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const result = await registerRestaurantAccount({
      businessName: parseRequiredString(body.businessName, 'İşletme adı'),
      ownerName: parseRequiredString(body.ownerName, 'Yetkili adı'),
      email: parseEmail(body.email),
      password: parsePassword(body.password),
      phone: parseRequiredString(body.phone, 'Telefon'),
      businessType: parseBusinessType(body.businessType),
      city: parseRequiredString(body.city, 'Şehir'),
      district: parseRequiredString(body.district, 'İlçe'),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
