'use client'

import { useState, useEffect } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading || !user) return
    if (profile?.role === 'waiter') {
      router.replace('/waiter')
    } else {
      router.replace('/dashboard')
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f4' }}>
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm border border-gray-100">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">☕</div>
          <h1 className="font-bold text-2xl" style={{ color: '#3d2b1f' }}>Nerox Admin</h1>
          <p className="text-gray-400 text-sm mt-1">Varina Chocolate</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#3d2b1f' }}>E-posta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]"
              placeholder="admin@varina.com"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#3d2b1f' }}>Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full font-semibold py-2.5 rounded-lg disabled:opacity-50 text-sm"
            style={{ background: '#d4a017', color: '#3d2b1f' }}
          >
            {submitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
        <p className="text-center mt-5">
          <a href="/waiter/login" className="text-xs text-gray-400 hover:text-gray-600">
            Garson girişi →
          </a>
        </p>
      </div>
    </div>
  )
}
