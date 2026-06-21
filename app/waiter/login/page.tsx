'use client'

import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { resolveRestaurantBusinessName, resolveRestaurantLogoUrl } from '@/lib/restaurant-settings'

export default function WaiterLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastRestaurantId] = useState<string | null>(() => (
    typeof window === 'undefined' ? null : window.localStorage.getItem('nerox:last-restaurant-id')
  ))
  const { user, profile, loading } = useAuth()
  const { settings } = useRestaurantSettings(lastRestaurantId)
  const router = useRouter()
  const businessName = resolveRestaurantBusinessName(settings)
  const logoUrl = resolveRestaurantLogoUrl(settings)

  useEffect(() => {
    if (loading || !user) return
    if (profile?.role === 'admin') {
      router.replace('/dashboard')
    } else if (profile?.role === 'waiter') {
      if (profile.active === false) return
      router.replace('/waiter')
    }
  }, [user, profile, loading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      setError('E-posta veya şifre hatalı.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#faf7f4' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={businessName} className="h-20 w-20 rounded-3xl object-cover mx-auto mb-4" />
          <h1 className="font-bold text-2xl" style={{ color: '#3d2b1f' }}>
            {businessName} Garson Paneli
          </h1>
          <p className="text-gray-400 text-sm mt-1">Garson Girişi</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: '#3d2b1f' }}
              >
                E-posta
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]"
                placeholder="garson@isletme.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: '#3d2b1f' }}
              >
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full font-bold py-3.5 rounded-xl disabled:opacity-50 text-base active:scale-95 transition-transform"
              style={{ background: '#d4a017', color: '#3d2b1f' }}
            >
              {submitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
        </div>

        <p className="text-center mt-4">
          <a href="/login" className="text-xs text-gray-400 hover:text-gray-600">
            ← Admin girişi
          </a>
        </p>
      </div>
    </div>
  )
}
