import { useMemo } from 'react'
import type { Restaurant, RestaurantFeatures } from '@/lib/types'
import { DEFAULT_FEATURES } from '@/lib/types'

export function useFeatures(restaurant: Restaurant | null): RestaurantFeatures {
  return useMemo(() => {
    if (!restaurant) {
      return { ...DEFAULT_FEATURES.starter }
    }

    const plan = restaurant.plan || 'starter'
    const defaults = DEFAULT_FEATURES[plan]

    if (!restaurant.features) {
      return { ...defaults }
    }

    return {
      qrMenu: typeof restaurant.features.qrMenu === 'boolean' ? restaurant.features.qrMenu : defaults.qrMenu,
      waiterCall: typeof restaurant.features.waiterCall === 'boolean' ? restaurant.features.waiterCall : defaults.waiterCall,
      manualOrders: typeof restaurant.features.manualOrders === 'boolean' ? restaurant.features.manualOrders : defaults.manualOrders,
      loyalty: typeof restaurant.features.loyalty === 'boolean' ? restaurant.features.loyalty : defaults.loyalty,
      multiLanguage: typeof restaurant.features.multiLanguage === 'boolean' ? restaurant.features.multiLanguage : defaults.multiLanguage,
      analytics: typeof restaurant.features.analytics === 'boolean' ? restaurant.features.analytics : defaults.analytics,
      kitchen: typeof restaurant.features.kitchen === 'boolean' ? restaurant.features.kitchen : defaults.kitchen,
    }
  }, [restaurant])
}

export function hasFeature(restaurant: Restaurant | null, feature: keyof RestaurantFeatures): boolean {
  if (!restaurant) return false

  const plan = restaurant.plan || 'starter'
  const defaults = DEFAULT_FEATURES[plan]

  if (!restaurant.features) {
    return defaults[feature]
  }

  return typeof restaurant.features[feature] === 'boolean'
    ? restaurant.features[feature]
    : defaults[feature]
}
