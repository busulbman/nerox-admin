'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { browserLocalPersistence, onAuthStateChanged, setPersistence, User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import type { UserProfile } from '@/lib/types'

interface AuthContextType {
  user: User | null
  profile: UserProfile | null  // null = yükleniyor veya profil yok
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    void setPersistence(auth, browserLocalPersistence).catch(() => {})
  }, [])

  useEffect(() => {
    let profileUnsub: (() => void) | null = null

    const authUnsub = onAuthStateChanged(auth, (u) => {
      setLoading(true)
      setUser(u)
      setProfile(null)

      // Önceki profil dinleyicisini temizle
      if (profileUnsub) { profileUnsub(); profileUnsub = null }

      if (u) {
        // users/{uid} koleksiyonundan rol ve profil bilgisini çek
        profileUnsub = onSnapshot(
          doc(db, 'users', u.uid),
          (snap) => {
            const nextProfile = snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null
            setProfile(nextProfile)
            setLoading(false)
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
