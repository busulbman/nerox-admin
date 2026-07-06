'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import BrandAuthShell from '@/components/BrandAuthShell'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user, profile, loading } = useAuth()
  const { restaurant, loading: restaurantLoading } = useRestaurantSettings(
    profile?.role === 'admin' ? profile.restaurantId : null,
  )
  const router = useRouter()

  useEffect(() => {
    if (loading || !user) return
    if (profile?.role === 'admin' && restaurantLoading) return

    if (profile?.role === 'super_admin') {
      router.replace('/super-admin')
    } else if (profile?.role === 'waiter') {
      router.replace('/waiter')
    } else if (restaurant?.onboardingCompleted === false) {
      router.replace('/onboarding')
    } else {
      router.replace('/dashboard')
    }
  }, [loading, profile, restaurant?.onboardingCompleted, restaurantLoading, router, user])

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

  if (loading || (user && profile?.role === 'admin' && restaurantLoading)) return null

  return (
    <BrandAuthShell
      eyebrow="Güvenli yönetim erişimi"
      title="Yönetim Paneline Giriş"
      description="QR menü, masa, ürün ve sipariş yönetiminize güvenli şekilde erişin."
      alternateHref="/waiter/login"
      alternateLabel="Garson girişi"
      alternateText="Garson hesabıyla devam edecekseniz"
    >
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#d8c3ff]">
          <LockKeyhole className="h-3.5 w-3.5" />
          Nerox Studio
        </div>
        <p className="mt-4 text-sm leading-6 text-white/60">
          İşletme hesabınızla giriş yapın. Super admin kullanıcıları otomatik olarak kendi paneline yönlendirilir.
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
            placeholder="admin@isletme.com"
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

        <p className="text-center text-sm text-white/60">
          Hesabınız yok mu?{' '}
          <a
            href="https://wa.me/905421320706?text=Merhaba%2C%20Nerox%20Restaurant%20i%C3%A7in%207%20g%C3%BCn%20%C3%BCcretsiz%20deneme%20hesab%C4%B1%20olu%C5%9Fturmak%20istiyorum."
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#d8c3ff] transition hover:text-white"
          >
            İşletme hesabı oluşturun
          </a>
        </p>

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
