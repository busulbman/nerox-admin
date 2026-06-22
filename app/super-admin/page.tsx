'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  Loader2,
  LogOut,
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
import type { RestaurantStatus } from '@/lib/types'

type SuperAdminRestaurant = {
  id: string
  name: string
  slug: string
  status: RestaurantStatus
  subscriptionExpiresAt: number | null
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

const BROWN = '#3d2b1f'

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

function isExpired(value: number | null) {
  return typeof value === 'number' && value < Date.now()
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
    <div className="rounded-[1.5rem] border border-[#eadfd5] bg-white p-5 shadow-[0_12px_30px_rgba(61,43,31,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7a62]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]" style={{ color: BROWN }}>
            {value}
          </p>
        </div>
        <div className="rounded-2xl bg-[#f6eee7] p-3 text-[#7b5b46]">
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
  const [statusTarget, setStatusTarget] = useState<string | null>(null)
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
  const expiredRestaurants = restaurants.filter((restaurant) => isExpired(restaurant.subscriptionExpiresAt)).length

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
    setStatusTarget(restaurant.id)
    setFeedback(null)

    try {
      await authorizedFetch('/api/super-admin/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({
          restaurantId: restaurant.id,
          status: nextStatus,
        }),
      })

      setRestaurants((current) => current.map((entry) => (
        entry.id === restaurant.id
          ? { ...entry, status: nextStatus }
          : entry
      )))
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'İşletme durumu güncellenemedi.',
      })
    } finally {
      setStatusTarget(null)
    }
  }

  async function handleLogout() {
    await signOut(auth).catch(() => {})
    router.replace('/login')
  }

  if (loading || (!user && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea]">
        <div className="flex items-center gap-3 text-sm text-[#7b5b46]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor...
        </div>
      </div>
    )
  }

  if (!user || profile?.role !== 'super_admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea]">
        <div className="rounded-3xl border border-[#eadfd5] bg-white px-6 py-8 text-center shadow-[0_18px_40px_rgba(61,43,31,0.06)]">
          <p className="text-sm text-[#7b5b46]">Yetki kontrol ediliyor...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#f6f1ea] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[2rem] border border-[#eadfd5] bg-[linear-gradient(180deg,#fffdf9_0%,#f7efe6_100%)] p-6 shadow-[0_18px_50px_rgba(61,43,31,0.06)] md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#e7d7c8] bg-white/90 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#8b6b54]">
                <Shield className="h-4 w-4" />
                Super Admin
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl" style={{ color: BROWN }}>
                İşletme yönetimi tek panelde
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6d5748] sm:text-base">
                Yeni işletme açılışı, abonelik durumu ve operasyon metrikleri bu ekrandan yönetilir.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void loadRestaurants({ silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#d8c4af] bg-white px-4 py-2.5 text-sm font-semibold text-[#5f4636] transition hover:bg-[#fcfaf7] disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Yenile
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#2f1f15] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#20150f]"
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
                ? { borderColor: '#b7dfc4', background: '#f0fbf3', color: '#166534' }
                : { borderColor: '#f4c7c3', background: '#fff4f3', color: '#b42318' }
            }
          >
            {feedback.text}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="rounded-[1.75rem] border border-[#eadfd5] bg-white p-6 shadow-[0_12px_30px_rgba(61,43,31,0.04)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: BROWN }}>
                  Yeni işletme oluştur
                </h2>
                <p className="mt-1 text-sm text-[#7b5b46]">
                  Auth kullanıcısı ve ilk Firestore kayıtları otomatik açılır.
                </p>
              </div>
              <div className="rounded-2xl bg-[#f6eee7] p-3 text-[#7b5b46]">
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

              <div className="rounded-2xl border border-dashed border-[#dbc8b8] bg-[#fbf7f3] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d6d57]">Slug önizleme</p>
                <p className="mt-2 text-sm font-semibold" style={{ color: BROWN }}>
                  {slugPreview || generateSlug(form.restaurantName) || 'isletme'}
                </p>
                <p className="mt-1 text-xs text-[#8b7768]">
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: BROWN }}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                İşletmeyi Oluştur
              </button>
            </form>
          </section>

          <section className="rounded-[1.75rem] border border-[#eadfd5] bg-white p-6 shadow-[0_12px_30px_rgba(61,43,31,0.04)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold" style={{ color: BROWN }}>
                  İşletme listesi
                </h2>
                <p className="mt-1 text-sm text-[#7b5b46]">
                  Restoranlar, abonelik durumu ve operasyon yoğunluğu burada görünür.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#97755e]">
                {restaurants.length} kayıt
              </p>
            </div>

            {listLoading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <div className="flex items-center gap-3 text-sm text-[#7b5b46]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  İşletmeler yükleniyor...
                </div>
              </div>
            ) : restaurants.length === 0 ? (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-[#e3d4c8] bg-[#fbf8f4] px-6 py-16 text-center">
                <p className="text-sm text-[#7b5b46]">Henüz işletme bulunmuyor.</p>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-[#eee4db]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#faf6f1] text-[#7b5b46]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">İşletme</th>
                        <th className="px-4 py-3 font-semibold">Durum</th>
                        <th className="px-4 py-3 font-semibold">Bitiş</th>
                        <th className="px-4 py-3 font-semibold">Ürün</th>
                        <th className="px-4 py-3 font-semibold">Masa</th>
                        <th className="px-4 py-3 font-semibold">Garson</th>
                        <th className="px-4 py-3 font-semibold">Menü</th>
                        <th className="px-4 py-3 font-semibold">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restaurants.map((restaurant) => {
                        const expired = isExpired(restaurant.subscriptionExpiresAt)
                        const statusBusy = statusTarget === restaurant.id

                        return (
                          <tr key={restaurant.id} className="border-t border-[#f1e9e1] align-top">
                            <td className="px-4 py-4">
                              <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-[#f6eee7] p-2.5 text-[#7b5b46]">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="font-semibold" style={{ color: BROWN }}>
                                    {restaurant.name}
                                  </p>
                                  <p className="mt-1 text-xs text-[#8b7768]">Slug: {restaurant.slug}</p>
                                  <p className="mt-1 text-xs text-[#8b7768]">ID: {restaurant.id}</p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex flex-col gap-2">
                                <span
                                  className="inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold"
                                  style={
                                    restaurant.status === 'active'
                                      ? { background: '#e8f7ee', color: '#166534' }
                                      : { background: '#f3f4f6', color: '#475467' }
                                  }
                                >
                                  {restaurant.status === 'active' ? 'Aktif' : 'Pasif'}
                                </span>
                                {expired && (
                                  <span className="inline-flex w-fit rounded-full bg-[#fff4e5] px-2.5 py-1 text-xs font-semibold text-[#b54708]">
                                    Süresi doldu
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-4 text-[#5f4636]">
                              {formatSubscriptionDate(restaurant.subscriptionExpiresAt)}
                            </td>

                            <td className="px-4 py-4">
                              <CountPill icon={SquareMenu} value={restaurant.productCount} />
                            </td>

                            <td className="px-4 py-4">
                              <CountPill icon={TableProperties} value={restaurant.tableCount} />
                            </td>

                            <td className="px-4 py-4">
                              <CountPill icon={Users} value={restaurant.waiterCount} />
                            </td>

                            <td className="px-4 py-4">
                              <a
                                href={restaurant.menuLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 font-semibold text-[#7b5b46] underline decoration-[#d4a017]/50 underline-offset-4"
                              >
                                Menüyü aç
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </a>
                            </td>

                            <td className="px-4 py-4">
                              <button
                                type="button"
                                onClick={() => void handleToggleStatus(restaurant)}
                                disabled={statusBusy}
                                className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition disabled:opacity-60"
                                style={
                                  restaurant.status === 'active'
                                    ? { borderColor: '#efc7c1', background: '#fff3f2', color: '#b42318' }
                                    : { borderColor: '#d3dfd8', background: '#f3faf6', color: '#166534' }
                                }
                              >
                                {statusBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                {restaurant.status === 'active' ? 'Pasife Al' : 'Aktifleştir'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
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
      <label className="mb-1.5 block text-sm font-medium" style={{ color: BROWN }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#e7ddd4] bg-white px-4 py-3 text-sm text-[#2d1f16] outline-none transition focus:border-[#c9a26c] focus:ring-2 focus:ring-[#e7c58d]/45"
        required={required}
      />
    </div>
  )
}

function CountPill({
  icon: Icon,
  value,
}: {
  icon: typeof SquareMenu
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#f8f2eb] px-3 py-1.5 text-xs font-semibold text-[#6b5242]">
      <Icon className="h-3.5 w-3.5" />
      {value}
    </span>
  )
}
