'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  CalendarPlus2,
  Loader2,
  LogOut,
  Mail,
  MapPinned,
  Phone,
  Power,
  RefreshCw,
  Shield,
  SquareMenu,
  TableProperties,
  Users,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { auth } from '@/lib/firebase'
import { generateSlug, getUniqueRestaurantSlug } from '@/lib/restaurant-settings'
import { SUBSCRIPTION_EXTENSION_LABELS, type SubscriptionExtensionPreset } from '@/lib/subscription-extension'
import type { RestaurantPlan, RestaurantStatus } from '@/lib/types'
import { buildThemeStyleVars } from '@/lib/ui-theme'

const SUPER_ADMIN_THEME_COLOR = '#5c3d2e'

type SuperAdminRestaurant = {
  id: string
  name: string
  slug: string
  ownerName: string
  email: string
  phone: string
  businessType: string
  city: string
  district: string
  plan: RestaurantPlan
  status: RestaurantStatus
  trialEndsAt: number | null
  remainingDays: number | null
  subscriptionExpiresAt: number | null
  isExpired: boolean
  productCount: number
  tableCount: number
  waiterCount: number
  menuLink: string
}

type CreateRestaurantForm = {
  restaurantName: string
  adminName: string
  adminEmail: string
  adminPassword: string
  phone: string
  subscriptionExpiresAt: string
}

type FeedbackState = {
  tone: 'success' | 'error'
  text: string
} | null

const themeVars = buildThemeStyleVars(SUPER_ADMIN_THEME_COLOR)

function getDefaultSubscriptionDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
}

const EMPTY_FORM: CreateRestaurantForm = {
  restaurantName: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  phone: '',
  subscriptionExpiresAt: getDefaultSubscriptionDate(),
}

function formatSubscriptionDate(value: number | null) {
  if (!value) return 'Belirtilmedi'

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value)
}

function formatRemainingDays(value: number | null) {
  if (value === null) return 'Belirtilmedi'
  if (value <= 0) return 'Süresi doldu'
  if (value === 1) return '1 gün'
  return `${value} gün`
}

function buildLocationLabel(restaurant: Pick<SuperAdminRestaurant, 'city' | 'district'>) {
  const parts = [restaurant.city.trim(), restaurant.district.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : 'Belirtilmedi'
}

function buildRiskState(restaurant: Pick<SuperAdminRestaurant, 'status' | 'isExpired'>) {
  if (restaurant.isExpired) return 'expired'
  if (restaurant.status === 'passive') return 'passive'
  return 'healthy'
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Building2
}) {
  return (
    <div className="rounded-[1.5rem] border bg-white p-5 shadow-[0_12px_30px_rgba(61,43,31,0.04)]" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]" style={{ color: 'var(--text)' }}>
            {value}
          </p>
        </div>
        <div className="rounded-2xl p-3" style={{ background: 'var(--surface-muted)', color: 'var(--primary-soft-foreground)' }}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export default function SuperAdminPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  const [restaurants, setRestaurants] = useState<SuperAdminRestaurant[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [form, setForm] = useState<CreateRestaurantForm>({ ...EMPTY_FORM })

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }

    if (profile?.role !== 'super_admin') {
      router.replace(profile?.role === 'waiter' ? '/waiter' : '/dashboard')
    }
  }, [loading, profile?.role, router, user])

  const authorizedFetch = useCallback(async (input: string, init?: RequestInit) => {
    if (!user) {
      throw new Error('Oturum bulunamadı.')
    }

    const token = await user.getIdToken()
    const response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'İşlem başarısız oldu.')
    }

    return payload
  }, [user])

  const loadRestaurants = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true

    if (!silent) {
      setListLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const payload = await authorizedFetch('/api/super-admin/restaurants')
      setRestaurants(Array.isArray(payload.restaurants) ? payload.restaurants as SuperAdminRestaurant[] : [])
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'İşletme listesi yüklenemedi.',
      })
    } finally {
      setListLoading(false)
      setRefreshing(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    if (!user || profile?.role !== 'super_admin') return

    const timer = window.setTimeout(() => {
      void loadRestaurants()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [loadRestaurants, profile?.role, user])

  const slugPreview = useMemo(() => {
    const baseName = form.restaurantName.trim()
    if (!baseName) return ''

    return getUniqueRestaurantSlug(baseName, restaurants)
  }, [form.restaurantName, restaurants])

  const totalRestaurants = restaurants.length
  const activeRestaurants = restaurants.filter((restaurant) => restaurant.status === 'active').length
  const passiveRestaurants = restaurants.filter((restaurant) => restaurant.status === 'passive').length
  const expiredRestaurants = restaurants.filter((restaurant) => restaurant.isExpired).length

  async function handleCreateRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setFeedback(null)

    try {
      const payload = await authorizedFetch('/api/super-admin/create-restaurant', {
        method: 'POST',
        body: JSON.stringify(form),
      })

      setFeedback({
        tone: 'success',
        text: `İşletme oluşturuldu: ${payload.menuLink}`,
      })
      setForm({ ...EMPTY_FORM, subscriptionExpiresAt: getDefaultSubscriptionDate() })
      await loadRestaurants({ silent: true })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'İşletme oluşturulamadı.',
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleStatus(restaurant: SuperAdminRestaurant) {
    const nextStatus: RestaurantStatus = restaurant.status === 'active' ? 'passive' : 'active'
    setPendingAction(`status:${restaurant.id}`)
    setFeedback(null)

    try {
      await authorizedFetch('/api/super-admin/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set-status',
          restaurantId: restaurant.id,
          status: nextStatus,
        }),
      })

      setFeedback({
        tone: 'success',
        text: `${restaurant.name} durumu ${nextStatus} olarak güncellendi.`,
      })
      await loadRestaurants({ silent: true })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'İşletme durumu güncellenemedi.',
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleExtendSubscription(restaurant: SuperAdminRestaurant, preset: SubscriptionExtensionPreset) {
    setPendingAction(`extend:${restaurant.id}:${preset}`)
    setFeedback(null)

    try {
      await authorizedFetch('/api/super-admin/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'extend-subscription',
          restaurantId: restaurant.id,
          preset,
        }),
      })

      setFeedback({
        tone: 'success',
        text: `${restaurant.name} için süre ${SUBSCRIPTION_EXTENSION_LABELS[preset]} uzatıldı.`,
      })
      await loadRestaurants({ silent: true })
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Süre uzatılamadı.',
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleLogout() {
    await signOut(auth).catch(() => {})
    router.replace('/login')
  }

  if (loading || (!user && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ ...themeVars, background: 'var(--page-bg)' }}>
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor...
        </div>
      </div>
    )
  }

  if (!user || profile?.role !== 'super_admin') {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ ...themeVars, background: 'var(--page-bg)' }}>
        <div className="rounded-3xl bg-white px-6 py-8 text-center shadow-[0_18px_40px_rgba(61,43,31,0.06)]" style={{ border: '1px solid var(--border-soft)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Yetki kontrol ediliyor...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-6 md:px-8 md:py-8" style={{ ...themeVars, background: 'var(--page-bg)' }}>
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[2rem] p-6 shadow-[0_18px_50px_rgba(61,43,31,0.06)] md:p-8" style={{ border: '1px solid var(--border-soft)', background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-muted) 100%)' }}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ border: '1px solid var(--border-soft)', color: 'var(--primary-soft-foreground)' }}>
                <Shield className="h-4 w-4" />
                Super Admin
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl" style={{ color: 'var(--text)' }}>
                İşletme yönetimi tek panelde
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 sm:text-base" style={{ color: 'var(--text-secondary)' }}>
                Yeni işletme açılışı, abonelik durumu ve operasyon metrikleri bu ekrandan yönetilir.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void loadRestaurants({ silent: true })}
                disabled={refreshing}
                className="theme-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Yenile
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="theme-button-primary inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition"
              >
                <LogOut className="h-4 w-4" />
                Çıkış
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Toplam İşletme" value={String(totalRestaurants)} icon={Building2} />
            <StatCard label="Aktif" value={String(activeRestaurants)} icon={Power} />
            <StatCard label="Pasif" value={String(passiveRestaurants)} icon={Shield} />
            <StatCard label="Süresi Dolan" value={String(expiredRestaurants)} icon={CalendarClock} />
          </div>
        </section>

        {feedback && (
          <div
            className="mt-6 rounded-[1.5rem] border px-5 py-4 text-sm shadow-[0_12px_30px_rgba(61,43,31,0.04)]"
            style={
              feedback.tone === 'success'
                ? { background: 'var(--success-soft)', borderColor: 'var(--success)', color: 'var(--success)' }
                : { background: 'var(--error-soft)', borderColor: 'var(--error)', color: 'var(--error)' }
            }
          >
            {feedback.text}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="rounded-[1.75rem] bg-white p-6 shadow-[0_12px_30px_rgba(61,43,31,0.04)]" style={{ border: '1px solid var(--border-soft)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
                  Yeni işletme oluştur
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  Auth kullanıcısı ve ilk Firestore kayıtları otomatik açılır.
                </p>
              </div>
              <div className="rounded-2xl p-3" style={{ background: 'var(--surface-muted)', color: 'var(--primary-soft-foreground)' }}>
                <Building2 className="h-5 w-5" />
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleCreateRestaurant}>
              <Field
                label="İşletme adı"
                value={form.restaurantName}
                onChange={(value) => setForm((current) => ({ ...current, restaurantName: value }))}
                placeholder="Local People Coffee"
                required
              />

              <div className="rounded-2xl border border-dashed px-4 py-3" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-muted)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>Slug önizleme</p>
                <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {slugPreview || generateSlug(form.restaurantName) || 'isletme'}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Slug otomatik oluşturulur ve benzersiz değilse sonuna sıra numarası eklenir.
                </p>
              </div>

              <Field
                label="Admin adı"
                value={form.adminName}
                onChange={(value) => setForm((current) => ({ ...current, adminName: value }))}
                placeholder="Ayşe Yılmaz"
                required
              />

              <Field
                label="Admin e-posta"
                type="email"
                value={form.adminEmail}
                onChange={(value) => setForm((current) => ({ ...current, adminEmail: value }))}
                placeholder="admin@isletme.com"
                required
              />

              <Field
                label="Admin şifre"
                type="password"
                value={form.adminPassword}
                onChange={(value) => setForm((current) => ({ ...current, adminPassword: value }))}
                placeholder="En az 6 karakter"
                required
              />

              <Field
                label="Telefon"
                value={form.phone}
                onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
                placeholder="Opsiyonel"
              />

              <Field
                label="Abonelik bitiş tarihi"
                type="date"
                value={form.subscriptionExpiresAt}
                onChange={(value) => setForm((current) => ({ ...current, subscriptionExpiresAt: value }))}
                required
              />

              <button
                type="submit"
                disabled={creating}
                className="theme-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                İşletmeyi Oluştur
              </button>
            </form>
          </section>

          <section className="rounded-[1.75rem] bg-white p-6 shadow-[0_12px_30px_rgba(61,43,31,0.04)]" style={{ border: '1px solid var(--border-soft)' }}>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
                  İşletme listesi
                </h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                  Restoranlar, abonelik durumu ve operasyon yoğunluğu burada görünür.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--muted)' }}>
                {restaurants.length} kayıt
              </p>
            </div>

            {listLoading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--muted)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  İşletmeler yükleniyor...
                </div>
              </div>
            ) : restaurants.length === 0 ? (
              <div className="mt-6 rounded-[1.5rem] border border-dashed px-6 py-16 text-center" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-muted)' }}>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Henüz işletme bulunmuyor.</p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {restaurants.map((restaurant) => {
                  const riskState = buildRiskState(restaurant)
                  const statusBusy = pendingAction === `status:${restaurant.id}`

                  return (
                    <article
                      key={restaurant.id}
                      className="rounded-[1.5rem] p-5 shadow-[0_12px_30px_rgba(61,43,31,0.04)]"
                      style={
                        riskState === 'expired'
                          ? { border: '1px solid rgba(239,68,68,0.24)', background: 'linear-gradient(180deg, rgba(254,242,242,1) 0%, rgba(255,255,255,1) 100%)' }
                          : riskState === 'passive'
                            ? { border: '1px solid rgba(245,158,11,0.24)', background: 'linear-gradient(180deg, rgba(255,251,235,1) 0%, rgba(255,255,255,1) 100%)' }
                            : { border: '1px solid var(--border-soft)', background: 'white' }
                      }
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="rounded-2xl p-3" style={{ background: 'var(--surface-muted)', color: 'var(--primary-soft-foreground)' }}>
                            <Building2 className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                                {restaurant.name}
                              </h3>
                              <PlanPill plan={restaurant.plan} />
                              <StatusPill status={restaurant.status} />
                              {restaurant.isExpired && <AlertPill text="Süresi doldu" tone="error" />}
                            </div>

                            <p className="mt-1 break-all text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                              Slug: {restaurant.slug}
                            </p>
                            <p className="mt-1 break-all text-xs" style={{ color: 'var(--muted)' }}>
                              ID: {restaurant.id}
                            </p>
                          </div>
                        </div>

                        <a
                          href={restaurant.menuLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center justify-center gap-2 self-start rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 sm:w-auto"
                          style={{ borderColor: 'var(--border-soft)', color: 'var(--text)' }}
                        >
                          Menüyü Aç
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                      </div>

                      {(restaurant.isExpired || restaurant.status === 'passive') && (
                        <div
                          className="mt-4 rounded-2xl px-4 py-3 text-sm"
                          style={
                            restaurant.isExpired
                              ? { background: 'var(--error-soft)', color: 'var(--error)' }
                              : { background: 'var(--warning-soft)', color: 'var(--warning)' }
                          }
                        >
                          {restaurant.isExpired
                            ? 'Bu işletmenin abonelik süresi dolmuş. Admin panelinde uyarı görünür ve QR menü geçici olarak kullanılamaz.'
                            : 'Bu işletme pasif durumda. Admin panelinde uyarı görünür ve QR menü geçici olarak kullanılamaz.'}
                        </div>
                      )}

                      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <InfoItem label="Yetkili adı" value={restaurant.ownerName || 'Belirtilmedi'} />
                        <InfoItem label="E-posta" value={restaurant.email || 'Belirtilmedi'} icon={Mail} />
                        <InfoItem label="Telefon" value={restaurant.phone || 'Belirtilmedi'} icon={Phone} />
                        <InfoItem label="İşletme türü" value={restaurant.businessType || 'Belirtilmedi'} />
                        <InfoItem label="Şehir / İlçe" value={buildLocationLabel(restaurant)} icon={MapPinned} />
                        <InfoItem label="Trial bitiş tarihi" value={formatSubscriptionDate(restaurant.trialEndsAt)} />
                        <InfoItem label="Kalan gün" value={formatRemainingDays(restaurant.remainingDays)} />
                        <InfoItem label="Subscription bitiş tarihi" value={formatSubscriptionDate(restaurant.subscriptionExpiresAt)} />
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <CountPill icon={SquareMenu} value={restaurant.productCount} label="Ürün" />
                        <CountPill icon={TableProperties} value={restaurant.tableCount} label="Masa" />
                        <CountPill icon={Users} value={restaurant.waiterCount} label="Garson" />
                      </div>

                      <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(restaurant)}
                          disabled={statusBusy || pendingAction?.startsWith(`extend:${restaurant.id}:`) === true}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                          style={
                            restaurant.status === 'active'
                              ? { background: 'var(--error-soft)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.24)' }
                              : { background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.24)' }
                          }
                        >
                          {statusBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                          {restaurant.status === 'active' ? 'Aktif/Pasif yap' : 'Aktif/Pasif yap'}
                        </button>

                        <div className="grid gap-2 sm:grid-cols-2 xl:flex">
                          {Object.entries(SUBSCRIPTION_EXTENSION_LABELS).map(([preset, label]) => {
                            const typedPreset = preset as SubscriptionExtensionPreset
                            const busy = pendingAction === `extend:${restaurant.id}:${typedPreset}`

                            return (
                              <button
                                key={typedPreset}
                                type="button"
                                onClick={() => void handleExtendSubscription(restaurant, typedPreset)}
                                disabled={busy || statusBusy || pendingAction?.startsWith(`extend:${restaurant.id}:`) === true}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-muted)', color: 'var(--text)' }}
                              >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus2 className="h-4 w-4" />}
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: InputHTMLAttributes<HTMLInputElement>['type']
  required?: boolean
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="theme-input rounded-xl"
        required={required}
      />
    </div>
  )
}

function PlanPill({ plan }: { plan: RestaurantPlan }) {
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold lowercase"
      style={
        plan === 'trial'
          ? { background: 'var(--primary-soft)', color: 'var(--primary-soft-foreground)' }
          : { background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }
      }
    >
      {plan}
    </span>
  )
}

function StatusPill({ status }: { status: RestaurantStatus }) {
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold lowercase"
      style={
        status === 'active'
          ? { background: 'var(--success-soft)', color: 'var(--success)' }
          : { background: 'var(--warning-soft)', color: 'var(--warning)' }
      }
    >
      {status}
    </span>
  )
}

function AlertPill({
  text,
  tone,
}: {
  text: string
  tone: 'error' | 'warning'
}) {
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
      style={
        tone === 'error'
          ? { background: 'var(--error-soft)', color: 'var(--error)' }
          : { background: 'var(--warning-soft)', color: 'var(--warning)' }
      }
    >
      {text}
    </span>
  )
}

function InfoItem({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: typeof Mail
}) {
  return (
    <div className="rounded-[1.15rem] px-4 py-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-soft)' }}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="rounded-xl p-2" style={{ background: 'white', color: 'var(--primary-soft-foreground)' }}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>
            {label}
          </p>
          <p className="mt-1 text-sm font-medium break-words" style={{ color: 'var(--text)' }}>
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function CountPill({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof SquareMenu
  value: number
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>
      <Icon className="h-3.5 w-3.5" />
      {label}: {value}
    </span>
  )
}
