'use client'

import { createContext, useContext, useMemo } from 'react'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  getThemeTextColor,
} from '@/lib/restaurant-settings'
import type { RestaurantGeneralSettings } from '@/lib/types'

interface RestaurantSettingsContextValue {
  settings: RestaurantGeneralSettings
  loading: boolean
  error: string
  primaryColor: string
  secondaryColor: string
  primaryTextColor: string
  secondaryTextColor: string
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
    const secondaryColor = settings.secondaryColor || DEFAULT_SECONDARY_COLOR

    return {
      settings,
      loading,
      error,
      primaryColor,
      secondaryColor,
      primaryTextColor: getThemeTextColor(primaryColor),
      secondaryTextColor: getThemeTextColor(secondaryColor),
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
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      primaryTextColor: getThemeTextColor(DEFAULT_PRIMARY_COLOR),
      secondaryTextColor: getThemeTextColor(DEFAULT_SECONDARY_COLOR),
    }
  }

  return context
}
