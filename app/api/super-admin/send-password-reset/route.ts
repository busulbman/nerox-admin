import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin, SuperAdminApiError } from '@/lib/super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const isDev = process.env.NODE_ENV === 'development'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header eksik' },
        { status: 401 }
      )
    }

    await requireSuperAdmin(request)

    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email) {
      return NextResponse.json(
        { error: 'E-posta adresi gerekli.' },
        { status: 400 }
      )
    }

    if (!FIREBASE_API_KEY) {
      throw new SuperAdminApiError('Firebase API key yapılandırılmamış.', 500)
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorCode = errorData?.error?.message || 'UNKNOWN_ERROR'

      if (errorCode === 'EMAIL_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.' },
          { status: 404 }
        )
      }

      if (isDev) console.error('[send-password-reset] Firebase error:', errorCode)
      return NextResponse.json(
        { error: 'Şifre sıfırlama maili gönderilemedi.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Şifre sıfırlama bağlantısı gönderildi.',
    })
  } catch (error) {
    if (isDev) console.error('[send-password-reset] Error:', error)

    if (error instanceof SuperAdminApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }

    return NextResponse.json(
      { error: 'Beklenmeyen bir hata oluştu.' },
      { status: 500 }
    )
  }
}
