'use client'

import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  EMPTY_RESTAURANT_GENERAL_SETTINGS,
  mergeRestaurantGeneralSettings,
  normalizeRestaurantDocument,
} from '@/lib/restaurant-settings'
import type { Restaurant, RestaurantGeneralSettings } from '@/lib/types'

export function useRestaurantSettings(restaurantId: string | null | undefined) {
  const [settings, setSettings] = useState<RestaurantGeneralSettings>(EMPTY_RESTAURANT_GENERAL_SETTINGS)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loadedRestaurantId, setLoadedRestaurantId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!restaurantId) {
      setSettings(EMPTY_RESTAURANT_GENERAL_SETTINGS)
      setRestaurant(null)
      setLoadedRestaurantId(null)
      setError('')
      return
    }

    let active = true
    let restaurantReady = false
    let settingsReady = false
    let rawRestaurant: unknown = null
    let rawSettings: unknown = null

    setLoadedRestaurantId(null)
    setSettings(EMPTY_RESTAURANT_GENERAL_SETTINGS)
    setRestaurant(null)
    setError('')

    const syncSettings = () => {
      if (!active) return
      setSettings(mergeRestaurantGeneralSettings(rawSettings, rawRestaurant))
    }

    const markReady = () => {
      if (!active) return
      if (restaurantReady && settingsReady) {
        setLoadedRestaurantId(restaurantId)
      }
    }

    const restaurantRef = doc(db, 'restaurants', restaurantId)
    const settingsRef = doc(db, 'restaurants', restaurantId, 'settings', 'general')

    const unsubscribeRestaurant = onSnapshot(
      restaurantRef,
      (snapshot) => {
        rawRestaurant = snapshot.exists() ? snapshot.data() : null
        setRestaurant(snapshot.exists() ? normalizeRestaurantDocument(snapshot.data(), snapshot.id) : null)
        restaurantReady = true
        setError('')
        syncSettings()
        markReady()
      },
      (snapshotError) => {
        console.error('İşletme bilgileri yüklenemedi:', snapshotError)
        rawRestaurant = null
        setRestaurant(null)
        restaurantReady = true
        syncSettings()
        setError('İşletme ayarları yüklenemedi.')
        markReady()
      },
    )

    const unsubscribeSettings = onSnapshot(
      settingsRef,
      (snapshot) => {
        rawSettings = snapshot.exists() ? snapshot.data() : null
        settingsReady = true
        setError('')
        syncSettings()
        markReady()
      },
      (snapshotError) => {
        console.error('Genel ayarlar yüklenemedi:', snapshotError)
        rawSettings = null
        settingsReady = true
        syncSettings()
        setError('İşletme ayarları yüklenemedi.')
        markReady()
      },
    )

    return () => {
      active = false
      unsubscribeRestaurant()
      unsubscribeSettings()
    }
  }, [restaurantId])

  const result = useMemo(() => {
    if (!restaurantId) {
      return { settings: EMPTY_RESTAURANT_GENERAL_SETTINGS, restaurant: null, loading: false, error: '' }
    }
    const isCurrentRestaurantLoaded = loadedRestaurantId === restaurantId
    return {
      settings: isCurrentRestaurantLoaded ? settings : EMPTY_RESTAURANT_GENERAL_SETTINGS,
      restaurant: isCurrentRestaurantLoaded ? restaurant : null,
      loading: !isCurrentRestaurantLoaded,
      error: isCurrentRestaurantLoaded ? error : '',
    }
  }, [restaurantId, settings, restaurant, loadedRestaurantId, error])

  return result
}
