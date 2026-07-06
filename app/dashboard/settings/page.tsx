'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Upload, Trash2, Link as LinkIcon, Wifi, HelpCircle, Rocket, CreditCard, Clock, MessageCircle, CheckCircle, AlertTriangle, Globe, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { useOnboarding } from '@/components/dashboard/OnboardingProvider'
import { useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { db } from '@/lib/firebase'
import {
  DEFAULT_BRAND_LOGO_PATH,
  DEFAULT_BUSINESS_NAME,
  DEFAULT_PRIMARY_COLOR,
  EMPTY_RESTAURANT_GENERAL_SETTINGS,
  generateSlug,
  getContrastColor,
  isValidRestaurantThemeColor,
} from '@/lib/restaurant-settings'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { buildThemePalette } from '@/lib/ui-theme'
import type { RestaurantGeneralSettings } from '@/lib/types'

const PREVIEW_CATEGORIES = ['Kahveler', 'Tatlılar', 'Ana Yemek']
const PREVIEW_PRODUCTS = [
  { emoji: '☕', name: 'Latte', desc: 'Taze süt köpüğü ve espresso', price: 85 },
  { emoji: '🍰', name: 'Cheesecake', desc: 'Ev yapımı frambuaz soslu', price: 120 },
]

const IMGBB_API_KEY = process.env.NEXT_PUBLIC_IMGBB_API_KEY || ''

function calculateRemainingTrialDays(trialEndsAt: number | null | undefined): number {
  if (!trialEndsAt) return 7
  const now = typeof window !== 'undefined' ? Date.now() : 0
  return Math.max(0, Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)))
}

export default function SettingsPage() {
  const { user, profile } = useAuth()
  const restaurantId = profile?.restaurantId || ''
  const { resetOnboarding } = useOnboarding()
  const { restaurant } = useRestaurantSettingsContext()

  const { settings, loading: settingsLoading } = useRestaurantSettings(restaurantId)

  const isTrial = restaurant?.billingPeriod === 'trial' || restaurant?.paymentStatus === 'trial'
  const trialEndsAt = restaurant?.trialEndsAt
  const remainingDays = calculateRemainingTrialDays(trialEndsAt)
  const isTrialExpired = isTrial && remainingDays <= 0

  const [form, setForm] = useState<RestaurantGeneralSettings>(EMPTY_RESTAURANT_GENERAL_SETTINGS)
  const [generatedSlugResult, setGeneratedSlugResult] = useState<{
    restaurantId: string
    businessName: string
    value: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const initializedRestaurantId = useRef<string | null>(null)

  useEffect(() => {
    if (!restaurantId) {
      initializedRestaurantId.current = null
      return
    }

    if (!settingsLoading && initializedRestaurantId.current !== restaurantId) {
      setForm({ ...settings })
      initializedRestaurantId.current = restaurantId
    }
  }, [restaurantId, settings, settingsLoading])

  const businessNameValue = form.businessName.trim() || settings.businessName.trim() || DEFAULT_BUSINESS_NAME
  const localSlugFallback = useMemo(() => generateSlug(businessNameValue) || 'isletme', [businessNameValue])
  const generatedSlug =
    generatedSlugResult?.restaurantId === restaurantId
    && generatedSlugResult.businessName === businessNameValue
      ? generatedSlugResult.value
      : localSlugFallback

  useEffect(() => {
    if (!restaurantId || !user) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const token = await user.getIdToken()
          const response = await fetch('/api/restaurants/slug', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
            body: JSON.stringify({
              businessName: businessNameValue,
              currentRestaurantId: restaurantId,
            }),
          })

          const payload = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(typeof payload.error === 'string' ? payload.error : 'Slug oluşturulamadı.')
          }

          if (!cancelled && typeof payload.slug === 'string' && payload.slug.trim()) {
            setGeneratedSlugResult({
              restaurantId,
              businessName: businessNameValue,
              value: payload.slug.trim().toLowerCase(),
            })
          }
        } catch (error) {
          if (!cancelled) {
            console.error('Restaurant slug resolve error:', error)
          }
        }
      })()
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [businessNameValue, restaurantId, user])

  async function uploadToImgBB(file: File): Promise<string | null> {
    if (!IMGBB_API_KEY) {
      setMessage({ tone: 'error', text: 'ImgBB API anahtarı ayarlanmamış.' })
      return null
    }

    const formData = new FormData()
    formData.append('image', file)

    try {
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('ImgBB yükleme başarısız.')
      }

      const data = await response.json()
      return data.data?.url || null
    } catch (error) {
      console.error('ImgBB upload error:', error)
      return null
    }
  }

  async function persistLogoUrl(nextLogoUrl: string): Promise<boolean> {
    if (!restaurantId) return false
    try {
      await Promise.all([
        setDoc(
          doc(db, 'restaurants', restaurantId, 'settings', 'general'),
          { logoUrl: nextLogoUrl, updatedAt: serverTimestamp() },
          { merge: true }
        ),
        setDoc(doc(db, 'restaurants', restaurantId), { logoUrl: nextLogoUrl }, { merge: true }),
      ])
      return true
    } catch (error) {
      console.error('Logo save error:', error)
      return false
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage({ tone: 'error', text: 'Lütfen bir görsel dosyası seçin.' })
      return
    }

    if (file.size > 32 * 1024 * 1024) {
      setMessage({ tone: 'error', text: 'Dosya boyutu 32MB\'dan küçük olmalı.' })
      return
    }

    setUploading(true)
    setMessage(null)

    const url = await uploadToImgBB(file)

    if (url) {
      setForm((current) => ({ ...current, logoUrl: url }))
      const persisted = await persistLogoUrl(url)
      setMessage(
        persisted
          ? { tone: 'success', text: 'Logo yüklendi ve kaydedildi.' }
          : { tone: 'error', text: 'Logo yüklendi ancak kaydedilemedi. Lütfen Kaydet butonuna basın.' }
      )
    } else {
      setMessage({ tone: 'error', text: 'Logo yüklenemedi. Lütfen tekrar deneyin.' })
    }

    setUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleLogoDelete() {
    setForm((current) => ({ ...current, logoUrl: '' }))
    setMessage(null)
    const persisted = await persistLogoUrl('')
    setMessage(
      persisted
        ? { tone: 'success', text: 'Logo silindi.' }
        : { tone: 'error', text: 'Logo silinemedi. Lütfen tekrar deneyin.' }
    )
  }

  async function handleSave() {
    if (!restaurantId) {
      setMessage({ tone: 'error', text: 'İşletme hesabı bulunamadı.' })
      return
    }

    const trimmedPrimary = form.primaryColor.trim()
    const trimmedSlug = generatedSlug

    if (trimmedPrimary && !isValidRestaurantThemeColor(trimmedPrimary)) {
      setMessage({ tone: 'error', text: 'Ana renk geçerli bir hex renk olmalı. Örnek: #7c3aed' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      await setDoc(
        doc(db, 'restaurants', restaurantId, 'settings', 'general'),
        {
          businessName: businessNameValue,
          slug: trimmedSlug,
          logoUrl: form.logoUrl.trim(),
          primaryColor: trimmedPrimary || DEFAULT_PRIMARY_COLOR,
          wifiEnabled: form.wifiEnabled ?? false,
          wifiName: form.wifiName?.trim() ?? '',
          wifiPassword: form.wifiPassword ?? '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      await setDoc(
        doc(db, 'restaurants', restaurantId),
        {
          name: businessNameValue,
          slug: trimmedSlug,
          logoUrl: form.logoUrl.trim(),
          primaryColor: trimmedPrimary || DEFAULT_PRIMARY_COLOR,
        },
        { merge: true }
      )

      setMessage({ tone: 'success', text: 'Ayarlar kaydedildi.' })
    } catch (error) {
      console.error('Settings save error:', error)
      setMessage({ tone: 'error', text: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.' })
    } finally {
      setSaving(false)
    }
  }

  const previewColor = form.primaryColor || DEFAULT_PRIMARY_COLOR
  const previewTextColor = getContrastColor(previewColor)
  const previewBusinessName = businessNameValue
  const previewLogoUrl = form.logoUrl.trim() || DEFAULT_BRAND_LOGO_PATH
  const previewPalette = buildThemePalette(previewColor)
  const previewCartTotal = PREVIEW_PRODUCTS.reduce((sum, product) => sum + product.price, 0)
  const menuLink = `/menu/${generatedSlug}/1`

  const inputCls = 'theme-input rounded-lg text-sm'

  if (settingsLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-100 rounded w-64" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-bold text-2xl text-[var(--text)]">
          Genel Ayarlar
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          İşletme bilgileri ve tema rengi buradan yönetilir.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)] gap-6 items-start">
        <div className="theme-card rounded-2xl p-6">
          <h2 className="mb-1 text-lg font-semibold text-[var(--text)]">
            İşletme Bilgileri
          </h2>
          <p className="text-gray-400 text-sm mb-5">
            Bu bilgiler admin paneli, garson paneli ve QR menüde kullanılır.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                İşletme Adı
              </label>
              <input
                className={inputCls}
                value={form.businessName}
                onChange={(event) => setForm((current) => ({ ...current, businessName: event.target.value }))}
                placeholder="Örnek: Local Cafe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                Menü Linkiniz
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-white px-3 py-3">
                <LinkIcon size={14} className="text-gray-400 shrink-0" />
                <code className="text-xs text-gray-600 flex-1 truncate">{menuLink}</code>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                İşletme adına göre otomatik oluşturulur. Aynı slug varsa sonuna sıra numarası eklenir.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                Logo
              </label>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              {!IMGBB_API_KEY && (
                <div className="mb-2 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Logo yükleme kapalı: <code>NEXT_PUBLIC_IMGBB_API_KEY</code> ortam değişkeni tanımlı değil.
                    ImgBB API anahtarınızı ekleyip uygulamayı yeniden başlatın.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !IMGBB_API_KEY}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                  style={{ color: 'var(--text)', borderColor: 'var(--border-soft)' }}
                >
                  <Upload size={16} />
                  {uploading ? 'Yükleniyor...' : form.logoUrl ? 'Logoyu Değiştir' : 'Logo Yükle'}
                </button>
                {form.logoUrl && (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.logoUrl}
                      alt="Logo önizleme"
                      className="h-12 w-12 rounded-xl object-cover border"
                      style={{ borderColor: 'var(--border-soft)' }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleLogoDelete()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Logoyu Sil
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                PNG veya JPG önerilir. Yüklenen logo anında kaydedilir ve QR menüde görünür.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                Tema Rengi
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primaryColor || DEFAULT_PRIMARY_COLOR}
                  onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))}
                  className="h-11 w-14 rounded-lg border border-gray-200 bg-white p-1 cursor-pointer"
                />
                <input
                  className={inputCls}
                  value={form.primaryColor}
                  onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))}
                  placeholder={DEFAULT_PRIMARY_COLOR}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Sidebar, butonlar, QR menü ve tüm vurgu alanları için kullanılır.
              </p>
            </div>

            <div className="pt-4 border-t border-[var(--border-soft)]">
              <div className="flex items-center gap-3 mb-4">
                <Wifi size={20} className="text-gray-500" />
                <h3 className="font-semibold text-[var(--text)]">Wi-Fi Ayarları</h3>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.wifiEnabled ?? false}
                    onChange={(event) => setForm((current) => ({ ...current, wifiEnabled: event.target.checked }))}
                    className="h-5 w-5 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <span className="text-sm text-[var(--text)]">Wi-Fi bilgilerini menüde göster</span>
                </label>

                {form.wifiEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                        Wi-Fi Adı (SSID)
                      </label>
                      <input
                        className={inputCls}
                        value={form.wifiName ?? ''}
                        onChange={(event) => setForm((current) => ({ ...current, wifiName: event.target.value }))}
                        placeholder="Örnek: LocalCafe_WiFi"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                        Wi-Fi Şifresi
                      </label>
                      <input
                        className={inputCls}
                        value={form.wifiPassword ?? ''}
                        onChange={(event) => setForm((current) => ({ ...current, wifiPassword: event.target.value }))}
                        placeholder="Wi-Fi şifrenizi girin"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {message && (
            <div
              className="mt-5 rounded-xl px-4 py-3 text-sm"
              style={
                message.tone === 'success'
                  ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }
                  : { background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }
              }
            >
              {message.text}
            </div>
          )}

          <div className="flex justify-end mt-5">
            <button
              onClick={() => void handleSave()}
              disabled={saving || uploading}
              className="font-semibold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
              style={{ background: previewColor, color: previewTextColor }}
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>

        <div className="theme-card rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Canlı Önizleme</p>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: previewPalette.surfaceMuted, color: previewPalette.text }}>
              QR Menü Görünümü
            </span>
          </div>

          {/* Phone mockup */}
          <div className="mx-auto w-full max-w-[320px]">
            <div className="overflow-hidden rounded-[2.4rem] border-[10px] border-[#1c1c1e] bg-[#1c1c1e] shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
              <div className="relative overflow-hidden rounded-[1.75rem]" style={{ background: previewPalette.surfaceMuted }}>
                <div className="absolute left-1/2 top-1.5 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-[#1c1c1e]" />

                <div className="px-3 pb-4 pt-8">
                  {/* Menü header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewLogoUrl}
                        alt={previewBusinessName}
                        className="h-9 w-9 shrink-0 rounded-xl border border-black/5 bg-white object-cover shadow-sm"
                      />
                      <p className="truncate text-[13px] font-semibold" style={{ color: previewPalette.text }}>
                        {previewBusinessName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="flex h-7 items-center gap-1 rounded-full bg-white px-2 shadow-sm" style={{ color: previewPalette.text }}>
                        <Globe size={11} />
                        <span className="text-[9px] font-semibold">TR</span>
                      </span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm" style={{ color: previewPalette.text }}>
                        <ShoppingBag size={12} />
                      </span>
                    </div>
                  </div>

                  {/* Karşılama kartı */}
                  <div className="mt-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm">
                    <p className="text-[10px]" style={{ color: previewPalette.muted }}>Masa 1 • Hoş geldiniz</p>
                    <p className="mt-0.5 text-[11px] font-semibold" style={{ color: previewPalette.text }}>
                      Günün favorilerini keşfedin
                    </p>
                  </div>

                  {/* Wi-Fi kartı */}
                  {form.wifiEnabled && (
                    <div className="mt-2 flex items-center gap-2 rounded-2xl border bg-white px-3 py-2.5 shadow-sm" style={{ borderColor: previewPalette.borderSoft }}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: previewPalette.surfaceMuted }}>
                        <Wifi size={13} style={{ color: previewColor }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px]" style={{ color: previewPalette.muted }}>Wi-Fi Bilgileri</p>
                        <p className="truncate text-[11px] font-semibold" style={{ color: previewPalette.text }}>
                          {form.wifiName?.trim() || 'Isletme_WiFi'}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full px-2 py-1 text-[9px] font-medium" style={{ background: previewPalette.surfaceMuted, color: previewPalette.text }}>
                        Kopyala
                      </span>
                    </div>
                  )}

                  {/* Kategori butonları */}
                  <div className="mt-3 flex gap-1.5 overflow-hidden">
                    {PREVIEW_CATEGORIES.map((category, index) => (
                      <span
                        key={category}
                        className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-semibold"
                        style={index === 0
                          ? { background: previewColor, color: previewTextColor, borderColor: previewColor }
                          : { background: '#fff', color: previewPalette.muted, borderColor: previewPalette.borderSoft }}
                      >
                        {category}
                      </span>
                    ))}
                  </div>

                  {/* Ürün kartları */}
                  <div className="mt-3 space-y-2">
                    {PREVIEW_PRODUCTS.map((product) => (
                      <div key={product.name} className="flex items-center gap-2.5 rounded-2xl border bg-white p-2 shadow-sm" style={{ borderColor: previewPalette.borderSoft }}>
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: 'linear-gradient(160deg, #f7f2e8 0%, #ece3d3 100%)' }}>
                          {product.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-bold" style={{ color: previewPalette.text }}>{product.name}</p>
                          <p className="truncate text-[9px]" style={{ color: previewPalette.muted }}>{product.desc}</p>
                          <p className="mt-0.5 text-[11px] font-bold" style={{ color: previewColor }}>₺{product.price}</p>
                        </div>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow" style={{ background: previewColor, color: previewTextColor }}>
                          +
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Alt aksiyon butonları */}
                  <div className="mt-3 flex gap-1.5">
                    <span
                      className="flex flex-1 items-center justify-between rounded-xl px-3 py-2.5 text-[10px] font-bold"
                      style={{ background: previewColor, color: previewTextColor, boxShadow: `0 8px 18px ${previewColor}40` }}
                    >
                      <span className="flex items-center gap-1">
                        <ShoppingBag size={11} />
                        Sipariş Ver ({PREVIEW_PRODUCTS.length})
                      </span>
                      <span>₺{previewCartTotal}</span>
                    </span>
                    <span className="flex shrink-0 items-center justify-center rounded-xl border bg-white px-2.5" style={{ borderColor: previewPalette.borderSoft, color: previewPalette.text }} title="Garson Çağır">
                      <UtensilsCrossed size={13} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            Renk, logo ve Wi-Fi değişiklikleri önizlemeye anında yansır.
          </p>
        </div>

        {/* Subscription Info Card */}
        <div className="theme-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CreditCard size={20} className="text-gray-500" />
            <h3 className="font-semibold text-[var(--text)]">Üyelik Bilgileri</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-[var(--border-soft)]">
              <span className="text-sm text-gray-500">Paket</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {isTrial ? 'Trial (7 Gün)' : 'Aktif Üyelik'}
              </span>
            </div>

            {isTrial && (
              <div className="flex items-center justify-between py-2 border-b border-[var(--border-soft)]">
                <span className="text-sm text-gray-500">Kalan Süre</span>
                <div className="flex items-center gap-2">
                  <Clock size={14} style={{ color: isTrialExpired ? '#ef4444' : 'var(--primary)' }} />
                  <span
                    className="text-sm font-semibold"
                    style={{ color: isTrialExpired ? '#ef4444' : 'var(--text)' }}
                  >
                    {isTrialExpired ? 'Süre Doldu' : `${remainingDays} Gün`}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-b border-[var(--border-soft)]">
              <span className="text-sm text-gray-500">Durum</span>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} style={{ color: isTrialExpired ? '#ef4444' : '#22c55e' }} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: isTrialExpired ? '#ef4444' : '#22c55e' }}
                >
                  {isTrialExpired ? 'Pasif' : 'Aktif'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">Destek</span>
              <a
                href="tel:+905421320706"
                className="text-sm font-semibold hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                +90 542 132 07 06
              </a>
            </div>
          </div>

          {isTrialExpired && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-sm font-semibold text-[#dc2626] mb-2">Deneme süreniz sona erdi.</p>
              <a
                href="https://wa.me/905421320706"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: '#25d366' }}
              >
                <MessageCircle size={16} />
                WhatsApp ile İletişime Geç
              </a>
            </div>
          )}
        </div>

        {/* System Help Card */}
        <div className="theme-card rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <HelpCircle size={20} className="text-gray-500" />
            <h3 className="font-semibold text-[var(--text)]">Sistem Yardımı</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Sistemi yeniden tanımak isterseniz rehberi tekrar başlatabilirsiniz.
          </p>
          <button
            onClick={resetOnboarding}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all hover:opacity-90"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Rocket size={16} />
            Sistem Turunu Yeniden Başlat
          </button>
        </div>
      </div>
    </div>
  )
}
