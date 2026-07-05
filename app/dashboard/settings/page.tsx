'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Upload, Trash2, Link as LinkIcon, Wifi, HelpCircle, Rocket, CreditCard, Clock, MessageCircle, CheckCircle } from 'lucide-react'
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
import type { RestaurantGeneralSettings } from '@/lib/types'

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

  const isTrial = restaurant?.plan === 'trial'
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
      setMessage({ tone: 'success', text: 'Logo başarıyla yüklendi.' })
    } else {
      setMessage({ tone: 'error', text: 'Logo yüklenemedi. Lütfen tekrar deneyin.' })
    }

    setUploading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  style={{ color: 'var(--text)', borderColor: 'var(--border-soft)' }}
                >
                  <Upload size={16} />
                  {uploading ? 'Yükleniyor...' : 'Dosya Seç'}
                </button>
                {form.logoUrl && (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.logoUrl}
                      alt="Logo önizleme"
                      className="h-10 w-10 rounded-lg object-cover border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, logoUrl: '' }))}
                      className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <input
                className={inputCls}
                value={form.logoUrl}
                onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))}
                placeholder="veya manuel URL girin: https://..."
              />
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
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-3">Canlı Önizleme</p>

          <div className="overflow-hidden rounded-[20px] border border-[var(--border-soft)]">
            <div className="p-5" style={{ background: previewColor }}>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewLogoUrl}
                  alt={previewBusinessName}
                  className="h-12 w-12 rounded-xl object-cover"
                  style={{ border: `1px solid ${previewTextColor}20` }}
                />
                <div>
                  <p className="font-bold text-lg" style={{ color: previewTextColor }}>
                    {previewBusinessName} Yönetim Paneli
                  </p>
                  <p className="text-sm" style={{ color: `${previewTextColor}80` }}>Yönetim Paneli</p>
                </div>
              </div>
            </div>

            <div className="p-5" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-3">QR Menü Linki</p>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2">
                <LinkIcon size={14} className="text-gray-400" />
                <code className="text-xs text-gray-600 flex-1 truncate">{menuLink}</code>
              </div>

              <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-3 mt-5">Butonlar</p>
              <div className="flex gap-3 flex-wrap">
                <button
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold"
                  style={{ background: previewColor, color: previewTextColor }}
                >
                  Ana Buton
                </button>
                <button
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold border-2"
                  style={{ borderColor: previewColor, color: previewColor, background: 'white' }}
                >
                  Outline Buton
                </button>
              </div>
            </div>
          </div>
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
