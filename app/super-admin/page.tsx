'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  CalendarPlus2,
  CheckCircle2,
  Crown,
  DollarSign,
  Filter,
  Infinity,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MapPinned,
  MessageCircle,
  Phone,
  Power,
  RefreshCw,
  Search,
  Settings,
  Shield,
  SquareMenu,
  TableProperties,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { auth } from '@/lib/firebase'
import { generateSlug, getUniqueRestaurantSlug } from '@/lib/restaurant-settings'
import type { RestaurantPlan, RestaurantStatus, BillingPeriod, PaymentStatus, RestaurantFeatures } from '@/lib/types'
import { PLAN_PRICES, PLAN_LABELS, BILLING_PERIOD_LABELS, PAYMENT_STATUS_LABELS, FEATURE_LABELS, DEFAULT_FEATURES } from '@/lib/types'
import LoadingScreen from '@/components/LoadingScreen'

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
  billingPeriod: BillingPeriod
  paymentStatus: PaymentStatus
  status: RestaurantStatus
  trialStartedAt: number | null
  trialEndsAt: number | null
  subscriptionStartedAt: number | null
  subscriptionExpiresAt: number | null
  lifetimeAccess: boolean
  remainingDays: number | null
  isExpired: boolean
  lastPaymentAmount: number | null
  lastPaymentDate: number | null
  notes: string
  deletedAt: number | null
  deletedBy: string | null
  productCount: number
  tableCount: number
  waiterCount: number
  menuLink: string
  adminUid: string | null
  pendingEmailChange: string | null
  features: RestaurantFeatures
}

type CreateRestaurantForm = {
  restaurantName: string
  adminName: string
  adminEmail: string
  adminPassword: string
  phone: string
  plan: RestaurantPlan
  subscriptionExpiresAt: string
}

type FeedbackState = { tone: 'success' | 'error'; text: string } | null

type ModalState = {
  type: 'email-change' | 'password-reset' | 'set-expiry' | 'delete-confirm' | 'features' | null
  restaurant: SuperAdminRestaurant | null
}

type FilterType = 'all' | 'active' | 'passive' | 'trial' | 'expired' | 'lifetime' | 'deleted' | 'starter' | 'pro' | 'premium'

const WHATSAPP_NUMBER = '905421320706'

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
  plan: 'starter',
  subscriptionExpiresAt: getDefaultSubscriptionDate(),
}

function formatDate(value: number | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(value)
}

function formatRemainingDays(value: number | null, lifetimeAccess: boolean) {
  if (lifetimeAccess) return 'Ömür Boyu'
  if (value === null) return '-'
  if (value <= 0) return 'Süresi doldu'
  if (value === 1) return '1 gün'
  return `${value} gün`
}

function formatCurrency(value: number) {
  return value.toLocaleString('tr-TR') + ' TL'
}

function StatCard({ label, value, icon: Icon, color = 'purple' }: {
  label: string
  value: string
  icon: typeof Building2
  color?: 'purple' | 'green' | 'yellow' | 'red' | 'blue'
}) {
  const colors = {
    purple: 'from-[#7c3aed]/20 to-transparent border-[#7c3aed]/30',
    green: 'from-emerald-500/20 to-transparent border-emerald-500/30',
    yellow: 'from-amber-500/20 to-transparent border-amber-500/30',
    red: 'from-red-500/20 to-transparent border-red-500/30',
    blue: 'from-blue-500/20 to-transparent border-blue-500/30',
  }

  return (
    <div className={`rounded-2xl border bg-gradient-to-b p-4 backdrop-blur-xl ${colors[color]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white/70">
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
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [modal, setModal] = useState<ModalState>({ type: null, restaurant: null })
  const [newEmail, setNewEmail] = useState('')
  const [newExpiryDate, setNewExpiryDate] = useState('')
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [editingPlan, setEditingPlan] = useState<RestaurantPlan>('starter')
  const [editingFeatures, setEditingFeatures] = useState<RestaurantFeatures>({ ...DEFAULT_FEATURES.starter })

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role !== 'super_admin') {
      router.replace(profile?.role === 'waiter' ? '/waiter' : '/dashboard')
    }
  }, [loading, profile?.role, router, user])

  const authorizedFetch = useCallback(async (input: string, init?: RequestInit) => {
    if (!user) throw new Error('Oturum bulunamadı.')
    const token = await user.getIdToken()
    const response = await fetch(input, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'İşlem başarısız.')
    return payload
  }, [user])

  const loadRestaurants = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true)
    else setRefreshing(true)
    try {
      const payload = await authorizedFetch('/api/super-admin/restaurants')
      setRestaurants(Array.isArray(payload.restaurants) ? payload.restaurants : [])
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Liste yüklenemedi.' })
    } finally {
      setListLoading(false)
      setRefreshing(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    if (!user || profile?.role !== 'super_admin') return
    const timer = setTimeout(() => void loadRestaurants(), 0)
    return () => clearTimeout(timer)
  }, [loadRestaurants, profile?.role, user])

  const slugPreview = useMemo(() => {
    const baseName = form.restaurantName.trim()
    return baseName ? getUniqueRestaurantSlug(baseName, restaurants) : ''
  }, [form.restaurantName, restaurants])

  const filteredRestaurants = useMemo(() => {
    let list = restaurants

    if (filter !== 'all') {
      list = list.filter((r) => {
        switch (filter) {
          case 'active': return r.status === 'active' && !r.isExpired
          case 'passive': return r.status === 'passive'
          case 'trial': return r.billingPeriod === 'trial' || r.paymentStatus === 'trial'
          case 'expired': return r.isExpired
          case 'lifetime': return r.lifetimeAccess
          case 'deleted': return r.status === 'deleted'
          case 'starter': return r.plan === 'starter'
          case 'pro': return r.plan === 'pro'
          case 'premium': return r.plan === 'premium'
          default: return true
        }
      })
    } else {
      list = list.filter((r) => r.status !== 'deleted')
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q) ||
        r.phone.includes(q)
      )
    }

    return list
  }, [restaurants, filter, searchQuery])

  const stats = useMemo(() => {
    const notDeleted = restaurants.filter((r) => r.status !== 'deleted')
    const active = notDeleted.filter((r) => r.status === 'active' && !r.isExpired)
    const trial = notDeleted.filter((r) => r.billingPeriod === 'trial' || r.paymentStatus === 'trial')
    const expired = notDeleted.filter((r) => r.isExpired)
    const lifetime = notDeleted.filter((r) => r.lifetimeAccess)

    const monthlyRevenue = active
      .filter((r) => r.paymentStatus === 'paid' && !r.lifetimeAccess)
      .reduce((sum, r) => sum + (PLAN_PRICES[r.plan] || 0), 0)

    return {
      total: notDeleted.length,
      active: active.length,
      trial: trial.length,
      expired: expired.length,
      lifetime: lifetime.length,
      monthlyRevenue,
    }
  }, [restaurants])

  async function handleCreateRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.adminEmail.trim() || !form.adminPassword.trim() || !form.phone.trim()) {
      setFeedback({ tone: 'error', text: 'E-posta, şifre ve telefon zorunludur.' })
      return
    }
    if (form.adminPassword.length < 6) {
      setFeedback({ tone: 'error', text: 'Şifre en az 6 karakter olmalı.' })
      return
    }

    setCreating(true)
    setFeedback(null)

    try {
      const payload = await authorizedFetch('/api/super-admin/create-restaurant', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setFeedback({ tone: 'success', text: `İşletme oluşturuldu: ${payload.menuLink}` })
      setForm({ ...EMPTY_FORM, subscriptionExpiresAt: getDefaultSubscriptionDate() })
      await loadRestaurants(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'İşletme oluşturulamadı.' })
    } finally {
      setCreating(false)
    }
  }

  async function handleSubscriptionAction(restaurantId: string, subAction: string, options?: Record<string, unknown>) {
    setPendingAction(`${subAction}:${restaurantId}`)
    setFeedback(null)

    try {
      await authorizedFetch('/api/super-admin/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'subscription', restaurantId, subAction, ...options }),
      })
      setFeedback({ tone: 'success', text: 'İşlem tamamlandı.' })
      await loadRestaurants(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'İşlem başarısız.' })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleSetStatus(restaurant: SuperAdminRestaurant) {
    const nextStatus = restaurant.status === 'active' ? 'passive' : 'active'
    setPendingAction(`status:${restaurant.id}`)
    setFeedback(null)

    try {
      await authorizedFetch('/api/super-admin/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set-status', restaurantId: restaurant.id, status: nextStatus }),
      })
      setFeedback({ tone: 'success', text: `${restaurant.name} ${nextStatus === 'active' ? 'aktif' : 'pasif'} yapıldı.` })
      await loadRestaurants(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Durum güncellenemedi.' })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleSendPasswordReset() {
    if (!modal.restaurant) return
    setModalLoading(true)
    try {
      await authorizedFetch('/api/super-admin/send-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email: modal.restaurant.email }),
      })
      setFeedback({ tone: 'success', text: `Şifre sıfırlama maili gönderildi: ${modal.restaurant.email}` })
      setModal({ type: null, restaurant: null })
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Mail gönderilemedi.' })
    } finally {
      setModalLoading(false)
    }
  }

  async function handleUpdateEmail() {
    if (!modal.restaurant?.adminUid || !newEmail.trim()) return
    setModalLoading(true)
    try {
      await authorizedFetch('/api/super-admin/update-admin-email', {
        method: 'POST',
        body: JSON.stringify({ restaurantId: modal.restaurant.id, adminUid: modal.restaurant.adminUid, newEmail: newEmail.trim() }),
      })
      setFeedback({ tone: 'success', text: 'E-posta değişiklik talebi kaydedildi.' })
      setModal({ type: null, restaurant: null })
      setNewEmail('')
      await loadRestaurants(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'E-posta güncellenemedi.' })
    } finally {
      setModalLoading(false)
    }
  }

  async function handleSetExpiry() {
    if (!modal.restaurant || !newExpiryDate) return
    setModalLoading(true)
    try {
      await handleSubscriptionAction(modal.restaurant.id, 'set_expiry', { expiryDate: newExpiryDate })
      setModal({ type: null, restaurant: null })
      setNewExpiryDate('')
    } finally {
      setModalLoading(false)
    }
  }

  async function handleSoftDelete() {
    if (!modal.restaurant || deleteConfirmName !== modal.restaurant.name) {
      setFeedback({ tone: 'error', text: 'İşletme adını doğru yazın.' })
      return
    }
    setModalLoading(true)
    try {
      await handleSubscriptionAction(modal.restaurant.id, 'soft_delete')
      setModal({ type: null, restaurant: null })
      setDeleteConfirmName('')
    } finally {
      setModalLoading(false)
    }
  }

  function openFeaturesModal(restaurant: SuperAdminRestaurant) {
    setEditingPlan(restaurant.plan)
    setEditingFeatures({ ...restaurant.features })
    setModal({ type: 'features', restaurant })
  }

  function handlePlanChange(newPlan: RestaurantPlan) {
    setEditingPlan(newPlan)
    setEditingFeatures({ ...DEFAULT_FEATURES[newPlan] })
  }

  async function handleUpdateFeatures() {
    if (!modal.restaurant) return
    setModalLoading(true)
    try {
      await authorizedFetch('/api/super-admin/restaurants', {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'update-features',
          restaurantId: modal.restaurant.id,
          plan: editingPlan,
          features: editingFeatures,
        }),
      })
      setFeedback({ tone: 'success', text: 'Paket ve özellikler güncellendi.' })
      setModal({ type: null, restaurant: null })
      await loadRestaurants(true)
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Özellikler güncellenemedi.' })
    } finally {
      setModalLoading(false)
    }
  }

  function openWhatsApp(phone: string | null) {
    const num = phone?.replace(/\D/g, '') || WHATSAPP_NUMBER
    window.open(`https://wa.me/${num}`, '_blank')
  }

  async function handleLogout() {
    await signOut(auth).catch(() => {})
    router.replace('/login')
  }

  if (loading || (!user && !profile)) return <LoadingScreen variant="admin" message="Super Admin yükleniyor..." />

  if (!user || profile?.role !== 'super_admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05010d]">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center backdrop-blur-xl">
          <p className="text-sm text-white/60">Yetki kontrol ediliyor...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#05010d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-[-18rem] h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(135,87,255,0.28),_transparent_58%)]" />
        <div className="absolute right-[-8rem] top-24 h-80 w-80 rounded-full bg-[#5f1ae5]/20 blur-3xl" />
        <div className="absolute left-[-6rem] top-[34rem] h-72 w-72 rounded-full bg-[#a855f7]/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/30 bg-[#11061f]/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#d8c3ff]">
              <Shield className="h-3.5 w-3.5" />
              Super Admin
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">İşletme Yönetimi</h1>
            <p className="mt-1 text-sm text-white/60">Abonelik, plan ve durum yönetimi</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void loadRestaurants(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Yenile
            </button>
            <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold transition hover:bg-[#6d28d9]">
              <LogOut className="h-4 w-4" /> Çıkış
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Toplam" value={String(stats.total)} icon={Building2} />
          <StatCard label="Aktif" value={String(stats.active)} icon={Power} color="green" />
          <StatCard label="Trial" value={String(stats.trial)} icon={CalendarClock} color="yellow" />
          <StatCard label="Süresi Dolan" value={String(stats.expired)} icon={CalendarClock} color="red" />
          <StatCard label="Ömür Boyu" value={String(stats.lifetime)} icon={Infinity} color="blue" />
          <StatCard label="Aylık Gelir" value={formatCurrency(stats.monthlyRevenue)} icon={DollarSign} color="green" />
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${feedback.tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
            {feedback.text}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          {/* Create Form */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Yeni İşletme</h2>
                <p className="mt-1 text-xs text-white/50">Hesap ve kayıtlar otomatik oluşturulur.</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7c3aed]/20 text-[#d8c3ff]">
                <Building2 className="h-5 w-5" />
              </div>
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleCreateRestaurant}>
              <Field label="İşletme adı" value={form.restaurantName} onChange={(v) => setForm((f) => ({ ...f, restaurantName: v }))} placeholder="Cafe Studio" required />
              <div className="rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Slug</p>
                <p className="text-sm font-medium">{slugPreview || generateSlug(form.restaurantName) || 'isletme'}</p>
              </div>
              <Field label="Admin adı" value={form.adminName} onChange={(v) => setForm((f) => ({ ...f, adminName: v }))} placeholder="Ayşe Yılmaz" required />
              <Field label="Admin e-posta" type="email" value={form.adminEmail} onChange={(v) => setForm((f) => ({ ...f, adminEmail: v }))} placeholder="admin@cafe.com" required />
              <Field label="Şifre (min 6)" type="password" value={form.adminPassword} onChange={(v) => setForm((f) => ({ ...f, adminPassword: v }))} placeholder="••••••" required />
              <Field label="Telefon" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="0555 555 55 55" required />
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Plan</label>
                <select value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as RestaurantPlan }))} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none">
                  <option value="starter">Starter - 1.990 TL/ay</option>
                  <option value="pro">Pro - 3.990 TL/ay</option>
                  <option value="premium">Premium - 5.990 TL/ay</option>
                </select>
              </div>
              <Field label="Bitiş tarihi" type="date" value={form.subscriptionExpiresAt} onChange={(v) => setForm((f) => ({ ...f, subscriptionExpiresAt: v }))} required />
              <button type="submit" disabled={creating} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-3 text-sm font-semibold transition hover:bg-[#6d28d9] disabled:opacity-50">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Oluştur
              </button>
            </form>
          </section>

          {/* Restaurant List */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">İşletmeler <span className="text-white/50">({filteredRestaurants.length})</span></h2>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Ara..." className="w-48 rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-white/40 outline-none focus:border-[#7c3aed]/50" />
                </div>
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <select value={filter} onChange={(e) => setFilter(e.target.value as FilterType)} className="appearance-none rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-white outline-none">
                    <option value="all">Tümü</option>
                    <option value="active">Aktif</option>
                    <option value="passive">Pasif</option>
                    <option value="trial">Trial</option>
                    <option value="expired">Süresi Dolan</option>
                    <option value="lifetime">Ömür Boyu</option>
                    <option value="deleted">Silinenler</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
              </div>
            </div>

            {listLoading ? (
              <div className="flex min-h-[200px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-white/50" />
              </div>
            ) : filteredRestaurants.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center">
                <p className="text-sm text-white/50">{searchQuery || filter !== 'all' ? 'Sonuç bulunamadı.' : 'Henüz işletme yok.'}</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {filteredRestaurants.map((r) => (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    pendingAction={pendingAction}
                    onSubscriptionAction={(action, opts) => void handleSubscriptionAction(r.id, action, opts)}
                    onSetStatus={() => void handleSetStatus(r)}
                    onEmailChange={() => { setModal({ type: 'email-change', restaurant: r }); setNewEmail('') }}
                    onPasswordReset={() => setModal({ type: 'password-reset', restaurant: r })}
                    onSetExpiry={() => { setModal({ type: 'set-expiry', restaurant: r }); setNewExpiryDate(r.subscriptionExpiresAt ? new Date(r.subscriptionExpiresAt).toISOString().slice(0, 10) : '') }}
                    onDelete={() => { setModal({ type: 'delete-confirm', restaurant: r }); setDeleteConfirmName('') }}
                    onWhatsApp={() => openWhatsApp(r.phone)}
                    onFeatures={() => openFeaturesModal(r)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modals */}
      {modal.type && modal.restaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0618] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {modal.type === 'email-change' && 'E-posta Değiştir'}
                {modal.type === 'password-reset' && 'Şifre Sıfırlama'}
                {modal.type === 'set-expiry' && 'Bitiş Tarihi Değiştir'}
                {modal.type === 'delete-confirm' && 'İşletmeyi Sil'}
                {modal.type === 'features' && 'Paket ve Özellikler'}
              </h3>
              <button onClick={() => setModal({ type: null, restaurant: null })} className="rounded-lg p-1.5 hover:bg-white/10">
                <X className="h-5 w-5 text-white/60" />
              </button>
            </div>
            <p className="mt-1 text-sm text-white/60">{modal.restaurant.name}</p>

            {modal.type === 'password-reset' && (
              <div className="mt-5">
                <p className="text-sm text-white/70"><span className="font-medium text-white">{modal.restaurant.email}</span> adresine mail gönderilecek.</p>
                <div className="mt-5 flex gap-3">
                  <button onClick={() => setModal({ type: null, restaurant: null })} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">İptal</button>
                  <button onClick={() => void handleSendPasswordReset()} disabled={modalLoading} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold hover:bg-[#6d28d9] disabled:opacity-50">
                    {modalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Gönder
                  </button>
                </div>
              </div>
            )}

            {modal.type === 'email-change' && (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-xs text-white/50">Mevcut: {modal.restaurant.email || '-'}</p>
                  {modal.restaurant.pendingEmailChange && <p className="text-xs text-amber-400">Bekleyen: {modal.restaurant.pendingEmailChange}</p>}
                </div>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Yeni e-posta" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none" />
                <p className="text-xs text-amber-300">Not: Firebase Auth e-postası console&apos;dan değiştirilmeli.</p>
                <div className="flex gap-3">
                  <button onClick={() => setModal({ type: null, restaurant: null })} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">İptal</button>
                  <button onClick={() => void handleUpdateEmail()} disabled={modalLoading || !modal.restaurant.adminUid} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold hover:bg-[#6d28d9] disabled:opacity-50">
                    {modalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Kaydet
                  </button>
                </div>
              </div>
            )}

            {modal.type === 'set-expiry' && (
              <div className="mt-5 space-y-4">
                <input type="date" value={newExpiryDate} onChange={(e) => setNewExpiryDate(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none" />
                <div className="flex gap-3">
                  <button onClick={() => setModal({ type: null, restaurant: null })} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">İptal</button>
                  <button onClick={() => void handleSetExpiry()} disabled={modalLoading || !newExpiryDate} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold hover:bg-[#6d28d9] disabled:opacity-50">
                    {modalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus2 className="h-4 w-4" />} Kaydet
                  </button>
                </div>
              </div>
            )}

            {modal.type === 'delete-confirm' && (
              <div className="mt-5 space-y-4">
                <p className="text-sm text-red-300">Bu işlem geri alınamaz. İşletme soft delete yapılacak.</p>
                <p className="text-sm text-white/70">Onaylamak için işletme adını yazın: <span className="font-semibold text-white">{modal.restaurant.name}</span></p>
                <input type="text" value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} placeholder="İşletme adı" className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none" />
                <div className="flex gap-3">
                  <button onClick={() => setModal({ type: null, restaurant: null })} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">İptal</button>
                  <button onClick={() => void handleSoftDelete()} disabled={modalLoading || deleteConfirmName !== modal.restaurant.name} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                    {modalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Sil
                  </button>
                </div>
              </div>
            )}

            {modal.type === 'features' && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-white/60">Paket</label>
                  <div className="flex gap-2">
                    {(['starter', 'pro', 'premium'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => handlePlanChange(p)}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          editingPlan === p
                            ? 'bg-[#7c3aed] text-white'
                            : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        {PLAN_LABELS[p].replace(' Paket', '')}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-white/60">Özellikler</label>
                  <div className="space-y-2">
                    {(Object.keys(FEATURE_LABELS) as (keyof RestaurantFeatures)[]).map((key) => (
                      <label key={key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                        <span className="text-sm text-white/80">{FEATURE_LABELS[key]}</span>
                        <button
                          type="button"
                          onClick={() => setEditingFeatures((f) => ({ ...f, [key]: !f[key] }))}
                          className={`relative h-6 w-11 rounded-full transition ${editingFeatures[key] ? 'bg-[#7c3aed]' : 'bg-white/20'}`}
                        >
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${editingFeatures[key] ? 'left-6' : 'left-1'}`} />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setModal({ type: null, restaurant: null })} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">İptal</button>
                  <button onClick={() => void handleUpdateFeatures()} disabled={modalLoading} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold hover:bg-[#6d28d9] disabled:opacity-50">
                    {modalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Kaydet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-white/60">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[#7c3aed]/50" />
    </div>
  )
}

function RestaurantCard({ restaurant: r, pendingAction, onSubscriptionAction, onSetStatus, onEmailChange, onPasswordReset, onSetExpiry, onDelete, onWhatsApp, onFeatures }: {
  restaurant: SuperAdminRestaurant
  pendingAction: string | null
  onSubscriptionAction: (action: string, opts?: Record<string, unknown>) => void
  onSetStatus: () => void
  onEmailChange: () => void
  onPasswordReset: () => void
  onSetExpiry: () => void
  onDelete: () => void
  onWhatsApp: () => void
  onFeatures: () => void
}) {
  const isBusy = pendingAction?.includes(r.id) || false
  const isDeleted = r.status === 'deleted'

  const cardBg = isDeleted
    ? 'border-gray-500/30 bg-gray-500/5 opacity-60'
    : r.isExpired
      ? 'border-red-500/30 bg-red-500/5'
      : r.status === 'passive'
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'border-white/10 bg-white/5'

  return (
    <article className={`rounded-2xl border p-4 backdrop-blur-xl ${cardBg}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#7c3aed]/20 text-[#d8c3ff]">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{r.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.plan === 'premium' ? 'bg-[#7c3aed]/30 text-[#d8c3ff]' : r.plan === 'pro' ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-white/70'}`}>
                {PLAN_LABELS[r.plan]}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : r.status === 'deleted' ? 'bg-gray-500/20 text-gray-400' : 'bg-amber-500/20 text-amber-300'}`}>
                {r.status === 'deleted' ? 'Silindi' : r.status}
              </span>
              {r.lifetimeAccess && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                  <Infinity className="h-3 w-3" /> Ömür Boyu
                </span>
              )}
              {r.isExpired && !r.lifetimeAccess && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">Süresi Doldu</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-white/50">Slug: {r.slug}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={r.menuLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium hover:bg-white/10">
            Menü <ArrowUpRight className="h-3 w-3" />
          </a>
          <button onClick={onWhatsApp} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium hover:bg-emerald-700">
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="Yetkili" value={r.ownerName || '-'} />
        <InfoItem label="E-posta" value={r.email || '-'} icon={Mail} />
        <InfoItem label="Telefon" value={r.phone || '-'} icon={Phone} />
        <InfoItem label="Abonelik" value={BILLING_PERIOD_LABELS[r.billingPeriod]} />
        <InfoItem label="Ödeme" value={PAYMENT_STATUS_LABELS[r.paymentStatus]} />
        <InfoItem label="Bitiş" value={formatDate(r.subscriptionExpiresAt)} />
        <InfoItem label="Kalan" value={formatRemainingDays(r.remainingDays, r.lifetimeAccess)} />
        <InfoItem label="Konum" value={[r.city, r.district].filter(Boolean).join(' / ') || '-'} icon={MapPinned} />
      </div>

      {/* Counts */}
      <div className="mt-3 flex flex-wrap gap-2">
        <CountPill icon={SquareMenu} value={r.productCount} label="Ürün" />
        <CountPill icon={TableProperties} value={r.tableCount} label="Masa" />
        <CountPill icon={Users} value={r.waiterCount} label="Garson" />
      </div>

      {/* Actions */}
      {!isDeleted && (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Status */}
          <ActionBtn onClick={onSetStatus} disabled={isBusy} icon={Power} label={r.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'} color={r.status === 'active' ? 'red' : 'green'} loading={pendingAction === `status:${r.id}`} />

          {/* Plans */}
          <ActionBtn onClick={() => onSubscriptionAction('set_plan', { plan: 'starter' })} disabled={isBusy || r.plan === 'starter'} label="Starter" loading={pendingAction === `set_plan:${r.id}`} />
          <ActionBtn onClick={() => onSubscriptionAction('set_plan', { plan: 'pro' })} disabled={isBusy || r.plan === 'pro'} label="Pro" loading={pendingAction === `set_plan:${r.id}`} />
          <ActionBtn onClick={() => onSubscriptionAction('set_plan', { plan: 'premium' })} disabled={isBusy || r.plan === 'premium'} icon={Crown} label="Premium" loading={pendingAction === `set_plan:${r.id}`} />

          {/* Billing periods */}
          <ActionBtn onClick={() => onSubscriptionAction('set_trial')} disabled={isBusy} label="Trial" loading={pendingAction === `set_trial:${r.id}`} />
          <ActionBtn onClick={() => onSubscriptionAction('set_monthly')} disabled={isBusy} label="Aylık" loading={pendingAction === `set_monthly:${r.id}`} />
          <ActionBtn onClick={() => onSubscriptionAction('set_six_months')} disabled={isBusy} label="6 Ay" loading={pendingAction === `set_six_months:${r.id}`} />
          <ActionBtn onClick={() => onSubscriptionAction('set_yearly')} disabled={isBusy} label="12 Ay" loading={pendingAction === `set_yearly:${r.id}`} />
          <ActionBtn onClick={() => onSubscriptionAction('set_lifetime')} disabled={isBusy} icon={Infinity} label="Ömür Boyu" color="blue" loading={pendingAction === `set_lifetime:${r.id}`} />

          {/* Other */}
          <ActionBtn onClick={onFeatures} disabled={isBusy} icon={Settings} label="Özellikler" color="blue" />
          <ActionBtn onClick={onSetExpiry} disabled={isBusy} icon={CalendarPlus2} label="Tarih" />
          <ActionBtn onClick={onEmailChange} disabled={isBusy} icon={Mail} label="E-posta" />
          <ActionBtn onClick={onPasswordReset} disabled={isBusy} icon={KeyRound} label="Şifre" />
          <ActionBtn onClick={onDelete} disabled={isBusy} icon={Trash2} label="Sil" color="red" />
        </div>
      )}
    </article>
  )
}

function ActionBtn({ onClick, disabled, icon: Icon, label, color = 'default', loading = false }: {
  onClick: () => void; disabled?: boolean; icon?: typeof Power; label: string; color?: 'default' | 'red' | 'green' | 'blue'; loading?: boolean
}) {
  const colors = {
    default: 'border-white/10 bg-white/5 hover:bg-white/10',
    red: 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20',
  }
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${colors[color]}`}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  )
}

function InfoItem({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Mail }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
      {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d8c3ff]" />}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
        <p className="mt-0.5 truncate font-medium text-white/80">{value}</p>
      </div>
    </div>
  )
}

function CountPill({ icon: Icon, value, label }: { icon: typeof SquareMenu; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/60">
      <Icon className="h-3.5 w-3.5" /> {label}: {value}
    </span>
  )
}
