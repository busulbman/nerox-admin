'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Upload, Trash2, Link as LinkIcon } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { db, RESTAURANT_ID } from '@/lib/firebase'
import {
  DEFAULT_BRAND_LOGO_PATH,
  DEFAULT_BUSINESS_NAME,
  DEFAULT_PRIMARY_COLOR,
  EMPTY_RESTAURANT_GENERAL_SETTINGS,
  generateSlug,
  getContrastColor,
  isValidRestaurantThemeColor,
  isValidSlug,
} from '@/lib/restaurant-settings'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import type { RestaurantGeneralSettings } from '@/lib/types'

const IMGBB_API_KEY = process.env.NEXT_PUBLIC_IMGBB_API_KEY || ''

export default function SettingsPage() {
  const { profile } = useAuth()
  const restaurantId = profile?.restaurantId || RESTAURANT_ID

  const { settings, loading: settingsLoading } = useRestaurantSettings(restaurantId)

  const [form, setForm] = useState<RestaurantGeneralSettings>(EMPTY_RESTAURANT_GENERAL_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const formInitialized = useRef(false)

  useEffect(() => {
    if (!settingsLoading && !formInitialized.current) {
      setForm({ ...settings })
      formInitialized.current = true
    }
  }, [settings, settingsLoading])

  const suggestedSlug = useMemo(() => {
    if (!form.businessName || form.slug) return ''
    return generateSlug(form.businessName)
  }, [form.businessName, form.slug])

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

  function handleSlugChange(value: string) {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '')
    setForm((current) => ({ ...current, slug: normalized }))
  }

  function applySuggestedSlug() {
    if (suggestedSlug) {
      setForm((current) => ({ ...current, slug: suggestedSlug }))
    }
  }

  async function handleSave() {
    const trimmedPrimary = form.primaryColor.trim()
    const trimmedSlug = form.slug.trim().toLowerCase()

    if (trimmedPrimary && !isValidRestaurantThemeColor(trimmedPrimary)) {
      setMessage({ tone: 'error', text: 'Ana renk geçerli bir hex renk olmalı. Örnek: #3d2b1f' })
      return
    }

    if (trimmedSlug && !isValidSlug(trimmedSlug)) {
      setMessage({ tone: 'error', text: 'Slug sadece küçük harf ve rakam içermeli (2-30 karakter).' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      await setDoc(
        doc(db, 'restaurants', restaurantId, 'settings', 'general'),
        {
          businessName: form.businessName.trim(),
          slug: trimmedSlug,
          logoUrl: form.logoUrl.trim(),
          primaryColor: trimmedPrimary || DEFAULT_PRIMARY_COLOR,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      if (trimmedSlug) {
        await setDoc(
          doc(db, 'restaurants', restaurantId),
          {
            name: form.businessName.trim(),
            slug: trimmedSlug,
          },
          { merge: true }
        )
      }

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
  const previewBusinessName = form.businessName.trim() || DEFAULT_BUSINESS_NAME
  const previewLogoUrl = form.logoUrl.trim() || DEFAULT_BRAND_LOGO_PATH
  const menuLink = form.slug ? `/menu/${form.slug}/1` : `/menu/${restaurantId}/1`

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#3d2b1f] focus:ring-1 focus:ring-[#3d2b1f]'

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
        <h1 className="font-bold text-2xl" style={{ color: '#3d2b1f' }}>
          Genel Ayarlar
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          İşletme bilgileri ve tema rengi buradan yönetilir.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)] gap-6 items-start">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
          <h2 className="font-semibold text-lg mb-1" style={{ color: '#3d2b1f' }}>
            İşletme Bilgileri
          </h2>
          <p className="text-gray-400 text-sm mb-5">
            Bu bilgiler admin paneli, garson paneli ve QR menüde kullanılır.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#3d2b1f' }}>
                İşletme Adı
              </label>
              <input
                className={inputCls}
                value={form.businessName}
                onChange={(event) => setForm((current) => ({ ...current, businessName: event.target.value }))}
                placeholder="Örnek: Mrs.Simone"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#3d2b1f' }}>
                Kısa Link (Slug)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">/menu/</span>
                  <input
                    className={`${inputCls} pl-14`}
                    value={form.slug}
                    onChange={(event) => handleSlugChange(event.target.value)}
                    placeholder="mrssimone"
                  />
                </div>
                {suggestedSlug && !form.slug && (
                  <button
                    type="button"
                    onClick={applySuggestedSlug}
                    className="px-3 py-2.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 whitespace-nowrap"
                    style={{ color: '#3d2b1f' }}
                  >
                    {suggestedSlug}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                QR menü linkiniz: <span className="font-mono">{menuLink}</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#3d2b1f' }}>
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
                  style={{ color: '#3d2b1f' }}
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
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#3d2b1f' }}>
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

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-3">Canlı Önizleme</p>

          <div className="rounded-[20px] overflow-hidden border border-gray-100">
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
                    {previewBusinessName} Admin
                  </p>
                  <p className="text-sm" style={{ color: `${previewTextColor}80` }}>Yönetim Paneli</p>
                </div>
              </div>
            </div>

            <div className="p-5 bg-[#faf7f4]">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-3">QR Menü Linki</p>
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
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
      </div>
    </div>
  )
}
