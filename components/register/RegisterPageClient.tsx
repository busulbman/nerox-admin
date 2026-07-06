'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import {
  AlertCircle,
  Building2,
  LoaderCircle,
  Mail,
  MapPinned,
  MessageCircle,
  Phone,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import BrandAuthShell from '@/components/BrandAuthShell'
import { auth } from '@/lib/firebase'
import {
  SELF_SERVICE_BUSINESS_TYPES,
  TRIAL_DURATION_DAYS,
  type SelfServiceBusinessType,
} from '@/lib/self-service-registration-config'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'

const WHATSAPP_LINK =
  'https://wa.me/905421320706?text=Merhaba%2C%20Nerox%20Restaurant%20i%C3%A7in%207%20g%C3%BCn%20%C3%BCcretsiz%20deneme%20hesab%C4%B1%20olu%C5%9Fturmak%20istiyorum.'

type RegisterFormState = {
  businessName: string
  ownerName: string
  email: string
  password: string
  phone: string
  businessType: SelfServiceBusinessType
  city: string
  district: string
}

const INITIAL_FORM: RegisterFormState = {
  businessName: '',
  ownerName: '',
  email: '',
  password: '',
  phone: '',
  businessType: SELF_SERVICE_BUSINESS_TYPES[0],
  city: '',
  district: '',
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function signInAfterRegistration(email: string, password: string) {
  let lastError: unknown = null

  for (const delay of [0, 300, 700, 1200]) {
    if (delay > 0) {
      await wait(delay)
    }

    try {
      await signInWithEmailAndPassword(auth, email, password)
      return
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('Auto sign-in failed')
}

export default function RegisterPageClient() {
  const [form, setForm] = useState<RegisterFormState>(INITIAL_FORM)
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError('')

    const payload = {
      businessName: form.businessName.trim(),
      ownerName: form.ownerName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      phone: form.phone.trim(),
      businessType: form.businessType,
      city: form.city.trim(),
      district: form.district.trim(),
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const responseBody = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setError(responseBody?.error || 'Hesap oluşturulamadı.')
        return
      }

      try {
        await signInAfterRegistration(payload.email, payload.password)
        router.replace('/onboarding')
      } catch {
        setError('Hesabınız oluşturuldu ancak otomatik giriş tamamlanamadı. Lütfen giriş sayfasından devam edin.')
      }
    } catch {
      setError('Kayıt isteği gönderilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || (user && profile?.role === 'admin' && restaurantLoading)) return null

  const showRegistrationForm = process.env.NODE_ENV === 'development'

  if (!showRegistrationForm) {
    return (
      <BrandAuthShell
        eyebrow="Hesap oluşturma talebi"
        title="Hesap oluşturma talebi"
        description="7 günlük ücretsiz deneme hesabınızı oluşturmak için WhatsApp üzerinden bize ulaşabilirsiniz."
        alternateHref="/login"
        alternateLabel="Yönetim paneli girişi"
        alternateText="Zaten hesabınız varsa"
      >
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#25D366]/16 text-[#25D366]">
            <MessageCircle className="h-8 w-8" />
          </div>
          <p className="mb-6 text-sm leading-6 text-white/60">
            7 günlük ücretsiz deneme hesabınızı oluşturmak için WhatsApp üzerinden bize ulaşabilirsiniz.
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noreferrer"
            className="theme-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp ile Hesap Talebi Gönder
          </a>
        </div>
      </BrandAuthShell>
    )
  }

  return (
    <BrandAuthShell
      eyebrow="7 günlük ücretsiz deneme"
      title="İşletme hesabınızı oluşturun"
      description="Nerox Studio hesabınızı açın, ücretsiz denemenizi otomatik başlatın ve yönetim paneline hemen geçin."
      alternateHref="/login"
      alternateLabel="Yönetim paneli girişi"
      alternateText="Zaten hesabınız varsa"
    >
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#d8c3ff]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Self-service kayıt
        </div>
        <p className="mt-4 text-sm leading-6 text-white/60">
          İlk kayıtta admin hesabınız, işletme ayarlarınız ve ilk masanız otomatik hazırlanır. Deneme süreniz{' '}
          {TRIAL_DURATION_DAYS} gün boyunca aktif kalır.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
            <Building2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-white">İşletme tenant&apos;ı</p>
          <p className="mt-1 text-xs leading-5 text-white/58">Slug ve temel işletme kaydı otomatik açılır.</p>
        </div>
        <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
            <Store className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Hazır başlangıç</p>
          <p className="mt-1 text-xs leading-5 text-white/58">Genel ayarlar ve ilk masa sizin için eklenir.</p>
        </div>
        <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-white">Anında deneme</p>
          <p className="mt-1 text-xs leading-5 text-white/58">Hesabınız açılır açılmaz ücretsiz deneme başlar.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-white/82">İşletme adı</label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={form.businessName}
                onChange={(event) => setForm((current) => ({ ...current, businessName: event.target.value }))}
                className="theme-input pl-11"
                placeholder="Local People Coffee"
                required
                autoComplete="organization"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/82">Yetkili adı</label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={form.ownerName}
                onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
                className="theme-input pl-11"
                placeholder="Mehmet Yılmaz"
                required
                autoComplete="name"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/82">Telefon</label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                className="theme-input pl-11"
                placeholder="0555 555 55 55"
                required
                autoComplete="tel"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/82">E-posta</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="theme-input pl-11"
                placeholder="admin@isletme.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/82">Şifre</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              className="theme-input"
              placeholder="En az 6 karakter"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/82">İşletme türü</label>
            <select
              value={form.businessType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  businessType: event.target.value as SelfServiceBusinessType,
                }))
              }
              className="theme-input"
              required
            >
              {SELF_SERVICE_BUSINESS_TYPES.map((businessType) => (
                <option key={businessType} value={businessType}>
                  {businessType}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/82">Şehir</label>
            <div className="relative">
              <MapPinned className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={form.city}
                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                className="theme-input pl-11"
                placeholder="İstanbul"
                required
                autoComplete="address-level1"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-white/82">İlçe</label>
            <div className="relative">
              <MapPinned className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                value={form.district}
                onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))}
                className="theme-input pl-11"
                placeholder="Kadıköy"
                required
                autoComplete="address-level2"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-200" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="theme-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
        >
          {submitting ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Hesap oluşturuluyor...
            </>
          ) : (
            'Hesap Oluştur'
          )}
        </button>

        <p className="text-center text-xs leading-5 text-white/48">
          Kaydı tamamlayarak{' '}
          <Link href="/terms" className="text-white/68 underline decoration-white/15 underline-offset-2 transition hover:text-white">
            Kullanım Şartları
          </Link>{' '}
          ve{' '}
          <Link href="/privacy" className="text-white/68 underline decoration-white/15 underline-offset-2 transition hover:text-white">
            Gizlilik Politikası&apos;nı
          </Link>{' '}
          kabul etmiş olursunuz.
        </p>
      </form>
    </BrandAuthShell>
  )
}
