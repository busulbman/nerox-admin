'use client'

import { createContext, useContext, useMemo } from 'react'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { DEFAULT_PRIMARY_COLOR, getContrastColor } from '@/lib/restaurant-settings'
import type { RestaurantGeneralSettings } from '@/lib/types'

interface RestaurantSettingsContextValue {
  settings: RestaurantGeneralSettings | null
  loading: boolean
  error: string
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
  const { settings, loading, error } = useRestaurantSettings(restaurantId)

  const value = useMemo(() => {
    const primaryColor = settings.primaryColor || DEFAULT_PRIMARY_COLOR

    return {
      settings,
      loading,
      error,
      primaryColor,
      textColor: getContrastColor(primaryColor),
    }
  }, [settings, loading, error])

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
      loading: false,
      error: '',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      textColor: getContrastColor(DEFAULT_PRIMARY_COLOR),
    }
  }

  return context
}
