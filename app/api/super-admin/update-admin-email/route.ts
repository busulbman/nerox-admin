import { NextResponse, type NextRequest } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { requireSuperAdmin, SuperAdminApiError } from '@/lib/super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const restaurantId = typeof body.restaurantId === 'string' ? body.restaurantId.trim() : ''
    const newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : ''
    const adminUid = typeof body.adminUid === 'string' ? body.adminUid.trim() : ''

    if (!restaurantId || !newEmail || !adminUid) {
      return NextResponse.json(
        { error: 'Restoran ID, admin UID ve yeni e-posta gerekli.' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { error: 'Geçerli bir e-posta adresi girin.' },
        { status: 400 }
      )
    }

    const db = await getAdminDb()

    const userDoc = await db.collection('users').doc(adminUid).get()
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'Admin kullanıcısı bulunamadı.' },
        { status: 404 }
      )
    }

    const currentEmail = userDoc.data()?.email || ''

    await db.collection('users').doc(adminUid).update({
      pendingEmailChange: newEmail,
      pendingEmailChangeRequestedAt: Date.now(),
      pendingEmailChangeRequestedBy: 'super_admin',
    })

    await db.collection('restaurants').doc(restaurantId).update({
      pendingAdminEmailChange: newEmail,
      pendingAdminEmailChangeRequestedAt: Date.now(),
    })

    return NextResponse.json({
      success: true,
      message: 'E-posta değişiklik talebi kaydedildi.',
      note: 'Firebase Auth e-postası Admin SDK olmadan değiştirilemez. Firestore\'da pendingEmailChange olarak kaydedildi. Kullanıcı yeni e-postasıyla giriş yapabilmesi için Firebase Console\'dan manuel güncelleme yapılmalı veya kullanıcının kendisi e-postasını değiştirmeli.',
      currentEmail,
      pendingEmail: newEmail,
    })
  } catch (error) {
    console.error('[update-admin-email] Error:', error)

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
