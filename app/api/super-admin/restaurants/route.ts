import { NextResponse, type NextRequest } from 'next/server'
import { FirebaseAdminError } from '@/lib/firebase-admin'
import {
  SuperAdminApiError,
  listRestaurantsSummary,
  mapFirebaseAdminError,
  requireSuperAdmin,
  updateRestaurantStatus,
} from '@/lib/super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isDev = process.env.NODE_ENV === 'development'

function toErrorResponse(error: unknown) {
  const normalizedError = mapFirebaseAdminError(error)

  if (normalizedError instanceof SuperAdminApiError) {
    return NextResponse.json({ error: normalizedError.message }, { status: normalizedError.status })
  }

  if (normalizedError instanceof FirebaseAdminError) {
    console.error('[restaurants] Firebase Admin error:', normalizedError.code, normalizedError.message)
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
  console.error('[restaurants] Unexpected error:', errorMessage)

  return NextResponse.json(
    {
      error: 'İşlem sırasında beklenmeyen bir hata oluştu.',
      message: isDev ? errorMessage : undefined,
    },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const restaurants = await listRestaurantsSummary()

    return NextResponse.json({ restaurants })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const body = await request.json()
    const restaurantId = typeof body.restaurantId === 'string' ? body.restaurantId : ''
    const status = body.status === 'passive' ? 'passive' : 'active'

    const result = await updateRestaurantStatus(restaurantId, status)
    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}
