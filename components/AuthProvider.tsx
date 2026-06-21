'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { browserLocalPersistence, onAuthStateChanged, setPersistence, User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { resolveRestaurantBySlugOrId } from '@/lib/restaurant-resolver'
import { DEFAULT_RESTAURANT_SLUG } from '@/lib/restaurant-settings'
import type { UserProfile } from '@/lib/types'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null  // null = yükleniyor veya profil yok
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true })
const restaurantIdResolutionCache = new Map<string, string>()

async function resolveCanonicalRestaurantId(sourceRestaurantId: string): Promise<string> {
  const cached = restaurantIdResolutionCache.get(sourceRestaurantId)
  if (cached) return cached

  if (sourceRestaurantId.trim().toLowerCase() === 'varina') {
    const legacyResolved = await resolveRestaurantBySlugOrId(DEFAULT_RESTAURANT_SLUG).catch(() => null)
    const legacyRestaurantId = legacyResolved?.id || DEFAULT_RESTAURANT_SLUG

    restaurantIdResolutionCache.set(sourceRestaurantId, legacyRestaurantId)
    restaurantIdResolutionCache.set(legacyRestaurantId, legacyRestaurantId)

    if (legacyResolved?.slug) {
      restaurantIdResolutionCache.set(legacyResolved.slug, legacyRestaurantId)
    }

    return legacyRestaurantId
  }

  const resolved = await resolveRestaurantBySlugOrId(sourceRestaurantId).catch(() => null)
  const canonicalRestaurantId = resolved?.id || sourceRestaurantId

  restaurantIdResolutionCache.set(sourceRestaurantId, canonicalRestaurantId)
  restaurantIdResolutionCache.set(canonicalRestaurantId, canonicalRestaurantId)

  if (resolved?.slug) {
    restaurantIdResolutionCache.set(resolved.slug, canonicalRestaurantId)
  }

  return canonicalRestaurantId
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const profileResolutionVersionRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    void setPersistence(auth, browserLocalPersistence).catch(() => {})
  }, [])

  useEffect(() => {
    let profileUnsub: (() => void) | null = null

    const authUnsub = onAuthStateChanged(auth, (u) => {
      setUser(u)

      // Önceki profil dinleyicisini temizle
      if (profileUnsub) { profileUnsub(); profileUnsub = null }

      if (u) {
        // users/{uid} koleksiyonundan rol ve profil bilgisini çek
        profileUnsub = onSnapshot(
          doc(db, 'users', u.uid),
          (snap) => {
            const nextProfile = snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null
            const resolutionVersion = profileResolutionVersionRef.current + 1
            profileResolutionVersionRef.current = resolutionVersion

            if (!nextProfile?.restaurantId) {
              setProfile(nextProfile)
              setLoading(false)
              return
            }

            void (async () => {
              const canonicalRestaurantId = await resolveCanonicalRestaurantId(nextProfile.restaurantId)
              if (profileResolutionVersionRef.current !== resolutionVersion) return

              const normalizedProfile =
                canonicalRestaurantId === nextProfile.restaurantId
                  ? nextProfile
                  : { ...nextProfile, restaurantId: canonicalRestaurantId }

              setProfile(normalizedProfile)
              if (typeof window !== 'undefined') {
                window.localStorage.setItem('nerox:last-restaurant-id', normalizedProfile.restaurantId)
              }
              setLoading(false)
            })()
          },
          () => {
            // Firestore erişim hatası: profil yok sayılır
            setProfile(null)
            setLoading(false)
          }
        )
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      authUnsub()
      if (profileUnsub) profileUnsub()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
