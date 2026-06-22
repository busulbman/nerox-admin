import { NextResponse, type NextRequest } from 'next/server'
import {
  SuperAdminApiError,
  listRestaurantsSummary,
  mapFirebaseAdminError,
  requireSuperAdmin,
  updateRestaurantStatus,
} from '@/lib/super-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toErrorResponse(error: unknown) {
  const normalizedError = mapFirebaseAdminError(error)

  if (normalizedError instanceof SuperAdminApiError) {
    return NextResponse.json({ error: normalizedError.message }, { status: normalizedError.status })
  }

  console.error('Super admin restaurants API error:', normalizedError)
  return NextResponse.json({ error: 'İşlem sırasında beklenmeyen bir hata oluştu.' }, { status: 500 })
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
