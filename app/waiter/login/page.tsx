'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { BellRing } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import BrandAuthShell from '@/components/BrandAuthShell'

export default function WaiterLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading || !user) return
    if (profile?.role === 'super_admin') {
      router.replace('/super-admin')
    } else if (profile?.role === 'admin') {
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
    <BrandAuthShell
      eyebrow="Gerçek zamanlı servis akışı"
      title="Garson Paneline Giriş"
      description="Masa çağrılarını ve siparişleri gerçek zamanlı takip edin."
      alternateHref="/login"
      alternateLabel="Yönetim paneli girişi"
      alternateText="Yönetim hesabıyla devam edecekseniz"
    >
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#d8c3ff]">
          <BellRing className="h-3.5 w-3.5" />
          Garson erişimi
        </div>
        <p className="mt-4 text-sm leading-6 text-white/60">
          Sadece yetkili garson hesapları devam eder. Pasif hesaplar panel içinde yönlendirilmez.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white/82">E-posta</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="theme-input"
            placeholder="garson@isletme.com"
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-white/82">Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="theme-input"
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="theme-button-primary w-full rounded-2xl px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
        >
          {submitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>

        <p className="text-center text-xs leading-5 text-white/48">
          Giriş yaparak{' '}
          <Link href="/terms" className="text-white/68 underline decoration-white/15 underline-offset-2 transition hover:text-white">
            Kullanım Şartları
          </Link>{' '}
          ve{' '}
          <Link href="/privacy" className="text-white/68 underline decoration-white/15 underline-offset-2 transition hover:text-white">
            Gizlilik Politikası’nı
          </Link>{' '}
          kabul etmiş olursunuz.
        </p>
      </form>
    </BrandAuthShell>
  )
}
