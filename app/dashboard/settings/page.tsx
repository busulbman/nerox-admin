'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Upload, Trash2, Link as LinkIcon, Wifi, HelpCircle, Rocket, CreditCard, Clock, MessageCircle, CheckCircle, AlertTriangle, Globe, MapPin, Star, Phone, Share2, Palette, LayoutDashboard, UtensilsCrossed, Armchair, Bell, Settings as SettingsIcon, Search } from 'lucide-react'
import InstagramIcon from '@/components/icons/InstagramIcon'
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
import { buildThemePalette, withAlpha } from '@/lib/ui-theme'
import type { RestaurantGeneralSettings } from '@/lib/types'

const PREVIEW_NAV_ITEMS = [
  { label: 'Genel Bakış', Icon: LayoutDashboard, active: true },
  { label: 'Menü Yönetimi', Icon: UtensilsCrossed, active: false },
  { label: 'Masalar', Icon: Armchair, active: false },
  { label: 'Çağrılar', Icon: Bell, active: false },
  { label: 'Ayarlar', Icon: SettingsIcon, active: false },
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

    const trimmedPanelColor = (form.panelPrimaryColor ?? '').trim()
    const trimmedSlug = generatedSlug

    if (trimmedPanelColor && !isValidRestaurantThemeColor(trimmedPanelColor)) {
      setMessage({ tone: 'error', text: 'Panel rengi geçerli bir hex renk olmalı. Örnek: #7c3aed' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      // menuPrimaryColor ve menuThemeMode Menü Yönetimi sayfasından yönetilir;
      // eski primaryColor alanı geriye dönük uyumluluk için burada değiştirilmez.
      await setDoc(
        doc(db, 'restaurants', restaurantId, 'settings', 'general'),
        {
          businessName: businessNameValue,
          slug: trimmedSlug,
          logoUrl: form.logoUrl.trim(),
          panelPrimaryColor: trimmedPanelColor || DEFAULT_PRIMARY_COLOR,
          wifiEnabled: form.wifiEnabled ?? false,
          wifiName: form.wifiName?.trim() ?? '',
          wifiPassword: form.wifiPassword ?? '',
          instagramUrl: form.instagramUrl?.trim() ?? '',
          whatsappNumber: form.whatsappNumber?.trim() ?? '',
          phoneNumber: form.phoneNumber?.trim() ?? '',
          googleMapsUrl: form.googleMapsUrl?.trim() ?? '',
          googleReviewUrl: form.googleReviewUrl?.trim() ?? '',
          websiteUrl: form.websiteUrl?.trim() ?? '',
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

  const previewColor = (form.panelPrimaryColor ?? '').trim() || DEFAULT_PRIMARY_COLOR
  const previewTextColor = getContrastColor(previewColor)
  const previewBusinessName = businessNameValue
  const previewLogoUrl = form.logoUrl.trim() || DEFAULT_BRAND_LOGO_PATH
  const previewPalette = buildThemePalette(previewColor, 'light')
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
          İşletme bilgileri ve panel tema rengi buradan yönetilir. QR menü görünümü Menü Yönetimi sayfasındadır.
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
                Panel Tema Rengi
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={(form.panelPrimaryColor ?? '').trim() || DEFAULT_PRIMARY_COLOR}
                  onChange={(event) => setForm((current) => ({ ...current, panelPrimaryColor: event.target.value }))}
                  className="h-11 w-14 rounded-lg border border-gray-200 bg-white p-1 cursor-pointer"
                />
                <input
                  className={inputCls}
                  value={form.panelPrimaryColor ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, panelPrimaryColor: event.target.value }))}
                  placeholder={DEFAULT_PRIMARY_COLOR}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Yönetim paneli, garson paneli, sidebar ve butonlarda kullanılır. QR menünün rengini etkilemez.
              </p>
              <div className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: withAlpha(previewColor, 0.08), color: 'var(--text)', border: `1px solid ${withAlpha(previewColor, 0.18)}` }}>
                <Palette size={14} className="mt-0.5 shrink-0" style={{ color: previewColor }} />
                <span>
                  QR menünün rengi ve açık/koyu görünüm modu artık{' '}
                  <Link href="/dashboard/menu" className="font-semibold underline underline-offset-2" style={{ color: previewColor }}>
                    Menü Yönetimi
                  </Link>{' '}
                  sayfasındaki &quot;QR Menü Görünümü&quot; bölümünden ayarlanır.
                </span>
              </div>
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

            <div className="pt-4 border-t border-[var(--border-soft)]">
              <div className="flex items-center gap-3 mb-1">
                <Share2 size={20} className="text-gray-500" />
                <h3 className="font-semibold text-[var(--text)]">İletişim ve Sosyal Medya</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Yalnızca doldurduğunuz alanlar QR menüde &quot;İşletme Bilgileri&quot; kartında gösterilir.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5"><InstagramIcon size={14} /> Instagram Linki</span>
                  </label>
                  <input
                    className={inputCls}
                    value={form.instagramUrl ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, instagramUrl: event.target.value }))}
                    placeholder="https://instagram.com/isletmeniz"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5"><MessageCircle size={14} /> WhatsApp Numarası</span>
                  </label>
                  <input
                    className={inputCls}
                    value={form.whatsappNumber ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                    placeholder="0542 123 45 67"
                    inputMode="tel"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5"><Phone size={14} /> Telefon Numarası</span>
                  </label>
                  <input
                    className={inputCls}
                    value={form.phoneNumber ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                    placeholder="0212 123 45 67"
                    inputMode="tel"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> Google Maps Linki</span>
                  </label>
                  <input
                    className={inputCls}
                    value={form.googleMapsUrl ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, googleMapsUrl: event.target.value }))}
                    placeholder="https://maps.app.goo.gl/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5"><Star size={14} /> Google Yorum / Puan Verme Linki</span>
                  </label>
                  <input
                    className={inputCls}
                    value={form.googleReviewUrl ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, googleReviewUrl: event.target.value }))}
                    placeholder="https://g.page/r/.../review"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Doldurulursa QR menüde &quot;Google&apos;da Puan Ver&quot; butonu gösterilir.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5"><Globe size={14} /> Website Linki (opsiyonel)</span>
                  </label>
                  <input
                    className={inputCls}
                    value={form.websiteUrl ?? ''}
                    onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))}
                    placeholder="https://isletmeniz.com"
                  />
                </div>
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
              Panel Görünümü
            </span>
          </div>

          {/* Panel mockup — sidebar, header ve butonlarıyla mini yönetim paneli */}
          <div className="overflow-hidden rounded-2xl border shadow-[0_18px_44px_rgba(15,23,42,0.14)]" style={{ borderColor: previewPalette.borderSoft }}>
            {/* Tarayıcı üst çubuğu */}
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ background: previewPalette.surface, borderColor: previewPalette.borderSoft }}>
              <span className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-1 text-[10px]" style={{ background: previewPalette.surfaceMuted, color: previewPalette.muted }}>
                <Search size={10} />
                <span className="truncate">nerox.app/dashboard</span>
              </span>
            </div>

            <div className="flex min-h-[300px]" style={{ background: previewPalette.pageBg }}>
              {/* Sidebar */}
              <div className="flex w-[132px] shrink-0 flex-col p-2.5" style={{ background: previewColor }}>
                <div className="flex items-center gap-1.5 px-1 pb-2.5" style={{ borderBottom: `1px solid ${withAlpha('#ffffff', previewTextColor === '#ffffff' ? 0.18 : 0.4)}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewLogoUrl}
                    alt={previewBusinessName}
                    className="h-6 w-6 shrink-0 rounded-lg bg-white object-cover"
                  />
                  <span className="truncate text-[10px] font-bold" style={{ color: previewTextColor }}>
                    {previewBusinessName}
                  </span>
                </div>
                <div className="mt-2.5 space-y-1">
                  {PREVIEW_NAV_ITEMS.map(({ label, Icon, active }) => (
                    <span
                      key={label}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold"
                      style={active
                        ? { background: previewTextColor === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.14)', color: previewTextColor }
                        : { color: previewTextColor, opacity: 0.72 }}
                    >
                      <Icon size={11} />
                      <span className="truncate">{label}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-auto rounded-lg px-2 py-1.5 text-[9px] font-medium" style={{ color: previewTextColor, opacity: 0.65 }}>
                  Yönetim Paneli
                </div>
              </div>

              {/* İçerik alanı */}
              <div className="min-w-0 flex-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold" style={{ color: previewPalette.text }}>Genel Bakış</p>
                    <p className="truncate text-[9px]" style={{ color: previewPalette.muted }}>{previewBusinessName} • Bugün</p>
                  </div>
                  <span className="shrink-0 rounded-lg px-2.5 py-1.5 text-[9px] font-bold shadow-sm" style={{ background: previewColor, color: previewTextColor }}>
                    + Yeni Masa
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Açık Masa', value: '6' },
                    { label: 'Bekleyen Çağrı', value: '2' },
                    { label: 'Bugünkü Sipariş', value: '31' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border p-2 shadow-sm" style={{ background: previewPalette.surface, borderColor: previewPalette.borderSoft }}>
                      <p className="text-[8px]" style={{ color: previewPalette.muted }}>{stat.label}</p>
                      <p className="mt-0.5 text-[13px] font-bold" style={{ color: previewColor }}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-2 rounded-xl border p-2.5 shadow-sm" style={{ background: previewPalette.surface, borderColor: previewPalette.borderSoft }}>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold" style={{ color: previewPalette.text }}>Son Çağrılar</p>
                    <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: previewPalette.primarySoft, color: previewPalette.primarySoftForeground }}>
                      2 bekliyor
                    </span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {[
                      { table: 'Masa 3', type: 'Sipariş', tone: 'primary' as const },
                      { table: 'Masa 7', type: 'Hesap', tone: 'muted' as const },
                    ].map((call) => (
                      <div key={call.table} className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: previewPalette.surfaceMuted }}>
                        <span className="flex items-center gap-1.5 text-[9px] font-semibold" style={{ color: previewPalette.text }}>
                          <Bell size={9} style={{ color: previewColor }} />
                          {call.table}
                        </span>
                        <span className="text-[8px] font-semibold" style={{ color: call.tone === 'primary' ? previewColor : previewPalette.muted }}>
                          {call.type}
                        </span>
                      </div>
                    ))}
                  </div>
                  <span className="mt-2 flex items-center justify-center rounded-lg border px-2 py-1.5 text-[9px] font-semibold" style={{ borderColor: withAlpha(previewColor, 0.35), color: previewColor }}>
                    Tümünü Gör
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-gray-400">
            Panel rengi değişiklikleri önizlemeye anında, kaydettikten sonra yönetim ve garson paneline yansır.
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
