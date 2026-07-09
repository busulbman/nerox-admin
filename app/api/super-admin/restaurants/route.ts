import { NextResponse, type NextRequest } from 'next/server'
import { FirebaseAdminError } from '@/lib/firebase-admin'
import {
  extendRestaurantSubscription,
  parseSubscriptionExtension,
  SuperAdminApiError,
  listRestaurantsSummary,
  mapFirebaseAdminError,
  requireSuperAdmin,
  updateRestaurantStatus,
  updateRestaurantSubscription,
  updateRestaurantFeatures,
  type SubscriptionAction,
} from '@/lib/super-admin'
import type { RestaurantPlan, RestaurantFeatures } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isDev = process.env.NODE_ENV === 'development'

function toErrorResponse(error: unknown, context: string) {
  if (isDev) console.error(`[super-admin/restaurants] ${context} failed:`, error)

  const normalizedError = mapFirebaseAdminError(error)

  if (normalizedError instanceof SuperAdminApiError) {
    return NextResponse.json(
      { error: normalizedError.message },
      { status: normalizedError.status }
    )
  }

  if (normalizedError instanceof FirebaseAdminError) {
    return NextResponse.json(
      {
        error: 'İşlem altyapısı şu anda kullanılamıyor.',
        code: isDev ? normalizedError.code : undefined,
        details: isDev ? normalizedError.details : undefined,
      },
      { status: 500 }
    )
  }

  const errorMessage = normalizedError instanceof Error ? normalizedError.message : String(normalizedError)
  const errorStack = normalizedError instanceof Error ? normalizedError.stack : undefined

  return NextResponse.json(
    {
      error: 'İşlem sırasında beklenmeyen bir hata oluştu.',
      message: isDev ? errorMessage : undefined,
      stack: isDev ? errorStack : undefined,
    },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header eksik' },
        { status: 401 }
      )
    }

    await requireSuperAdmin(request)
    const restaurants = await listRestaurantsSummary()

    return NextResponse.json({ restaurants })
  } catch (error) {
    return toErrorResponse(error, 'GET')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header eksik', code: 'NO_AUTH_HEADER' },
        { status: 401 }
      )
    }

    const adminUser = await requireSuperAdmin(request)
    const body = await request.json()
    const action = typeof body.action === 'string' ? body.action : ''
    const restaurantId = typeof body.restaurantId === 'string' ? body.restaurantId : ''

    let result

    switch (action) {
      case 'extend-subscription':
        result = await extendRestaurantSubscription(restaurantId, parseSubscriptionExtension(body.preset))
        break

      case 'set-status':
        result = await updateRestaurantStatus(restaurantId, body.status === 'passive' ? 'passive' : 'active')
        break

      case 'subscription': {
        const subAction = body.subAction as SubscriptionAction
        const validActions: SubscriptionAction[] = [
          'set_trial', 'end_trial', 'set_monthly', 'set_six_months',
          'set_yearly', 'set_lifetime', 'set_plan', 'set_expiry', 'soft_delete'
        ]

        if (!validActions.includes(subAction)) {
          return NextResponse.json(
            { error: 'Geçersiz işlem tipi.', code: 'INVALID_ACTION' },
            { status: 400 }
          )
        }

        result = await updateRestaurantSubscription(restaurantId, subAction, {
          plan: body.plan as RestaurantPlan | undefined,
          expiryDate: body.expiryDate as string | undefined,
          deletedBy: adminUser.uid,
        })
        break
      }

      case 'update-features': {
        const features = body.features as Partial<RestaurantFeatures> | undefined
        const plan = body.plan as RestaurantPlan | undefined
        result = await updateRestaurantFeatures(restaurantId, features || {}, plan)
        break
      }

      default:
        return NextResponse.json(
          { error: 'Bilinmeyen işlem.', code: 'UNKNOWN_ACTION' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error, 'PATCH')
  }
}
