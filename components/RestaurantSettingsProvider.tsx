'use client'

import { createContext, useContext, useMemo } from 'react'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { DEFAULT_PRIMARY_COLOR, getContrastColor, resolvePanelPrimaryColor } from '@/lib/restaurant-settings'
import type { Restaurant, RestaurantGeneralSettings } from '@/lib/types'

interface RestaurantSettingsContextValue {
  settings: RestaurantGeneralSettings | null
  restaurant: Restaurant | null
  loading: boolean
  error: string
  /** Panel (yönetim/garson) tema rengi; QR menü rengi settings.menuPrimaryColor üzerinden okunur. */
  primaryColor: string
  textColor: string
}

const RestaurantSettingsContext = createContext<RestaurantSettingsContextValue | null>(null)

export function RestaurantSettingsProvider({
  restaurantId,
  children,
}: {
  restaurantId: string | null | undefined
  children: React.ReactNode
}) {
  const { settings, restaurant, loading, error } = useRestaurantSettings(restaurantId)

  const value = useMemo(() => {
    const primaryColor = resolvePanelPrimaryColor(settings)

    return {
      settings,
      restaurant,
      loading,
      error,
      primaryColor,
      textColor: getContrastColor(primaryColor),
    }
  }, [settings, restaurant, loading, error])

  return (
    <RestaurantSettingsContext.Provider value={value}>
      {children}
    </RestaurantSettingsContext.Provider>
  )
}

export function useRestaurantSettingsContext() {
  const context = useContext(RestaurantSettingsContext)

  if (!context) {
    return {
      settings: null,
      restaurant: null,
      loading: false,
      error: '',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      textColor: getContrastColor(DEFAULT_PRIMARY_COLOR),
    }
  }

  return context
}
