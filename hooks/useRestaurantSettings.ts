'use client'

import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  EMPTY_RESTAURANT_GENERAL_SETTINGS,
  normalizeRestaurantGeneralSettings,
} from '@/lib/restaurant-settings'
import type { RestaurantGeneralSettings } from '@/lib/types'

export function useRestaurantSettings(restaurantId: string | null | undefined) {
  const [settings, setSettings] = useState<RestaurantGeneralSettings>(EMPTY_RESTAURANT_GENERAL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!restaurantId) {
      return
    }

    const settingsRef = doc(db, 'restaurants', restaurantId, 'settings', 'general')

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        setSettings(snapshot.exists() ? normalizeRestaurantGeneralSettings(snapshot.data()) : { ...EMPTY_RESTAURANT_GENERAL_SETTINGS })
        setLoading(false)
        setError('')
      },
      (snapshotError) => {
        console.error('Genel ayarlar yüklenemedi:', snapshotError)
        setSettings({ ...EMPTY_RESTAURANT_GENERAL_SETTINGS })
        setLoading(false)
        setError('Genel ayarlar yüklenemedi.')
      }
    )

    return () => unsubscribe()
  }, [restaurantId])

  const result = useMemo(() => {
    if (!restaurantId) {
      return { settings: EMPTY_RESTAURANT_GENERAL_SETTINGS, loading: false, error: '' }
    }
    return { settings, loading, error }
  }, [restaurantId, settings, loading, error])

  return result
}
