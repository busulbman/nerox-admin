'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { LifeBuoy, MessageCircle, Globe, Send, Trash2, TriangleAlert, X } from 'lucide-react'
import InstagramIcon from '@/components/icons/InstagramIcon'
import { useAuth } from '@/components/AuthProvider'
import { useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { resolveRestaurantBusinessName } from '@/lib/restaurant-settings'

const WHATSAPP_NUMBER = '905421320706'
const WHATSAPP_DISPLAY = '+90 542 132 07 06'
const INSTAGRAM_HANDLE = '@nurali.builder'
const INSTAGRAM_URL = 'https://instagram.com/nurali.builder'
const WEBSITE_LABEL = 'nuralibuilder.com'
const WEBSITE_URL = 'https://nuralibuilder.com'

function waLink(text: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

function openExternal(url: string) {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export default function SupportPage() {
  const { profile, user } = useAuth()
  const { settings, restaurant } = useRestaurantSettingsContext()

  const businessName = resolveRestaurantBusinessName(settings)
  const accountEmail = profile?.email || user?.email || ''
  const accountPhone = settings?.phoneNumber || restaurant?.phone || profile?.phone || ''

  const [feedback, setFeedback] = useState({ name: '', phone: '', subject: '', message: '' })
  const [deleteModal, setDeleteModal] = useState(false)

  function handleFeedbackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text =
      'Merhaba, Nerox Restaurant paneliyle ilgili geri bildirimim var:\n' +
      `Ad: ${feedback.name.trim()}\n` +
      `Telefon: ${feedback.phone.trim()}\n` +
      `Konu: ${feedback.subject.trim()}\n` +
      `Mesaj: ${feedback.message.trim()}`
    openExternal(waLink(text))
  }

  function handleAccountDeletion() {
    const text =
      'Merhaba, Nerox Restaurant hesabımın silinmesini talep ediyorum.\n' +
      `İşletme: ${businessName}\n` +
      `E-posta: ${accountEmail}\n` +
      `Telefon: ${accountPhone}`
    setDeleteModal(false)
    openExternal(waLink(text))
  }

  const inputCls =
    'w-full rounded-xl border px-3.5 py-3 text-sm outline-none transition-colors focus:border-[var(--primary)]'
  const inputStyle = {
    background: 'var(--surface)',
    borderColor: 'var(--border-soft)',
    color: 'var(--text)',
  } as const

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <LifeBuoy className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>İletişim &amp; Destek</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Sorularınız, teknik destek ve geri bildirimleriniz için bize ulaşabilirsiniz.
          </p>
        </div>
      </div>

      {/* Contact channels */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={() => openExternal(waLink('Merhaba, Nerox Restaurant paneliyle ilgili yardıma ihtiyacım var.'))}
          className="flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition-colors hover:opacity-90"
          style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: '#22c55e' }}>
            <MessageCircle size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>WhatsApp</span>
            <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{WHATSAPP_DISPLAY}</span>
          </span>
        </button>

        <button
          onClick={() => openExternal(INSTAGRAM_URL)}
          className="flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition-colors hover:opacity-90"
          style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: '#e1306c' }}>
            <InstagramIcon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>Instagram</span>
            <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{INSTAGRAM_HANDLE}</span>
          </span>
        </button>

        <button
          onClick={() => openExternal(WEBSITE_URL)}
          className="flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition-colors hover:opacity-90"
          style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: 'var(--primary)' }}>
            <Globe size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>Web Sitesi</span>
            <span className="block truncate text-xs" style={{ color: 'var(--muted)' }}>{WEBSITE_LABEL}</span>
          </span>
        </button>
      </div>

      {/* Quick action buttons */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          onClick={() => openExternal(waLink('Merhaba, Nerox Restaurant paneliyle ilgili yardıma ihtiyacım var.'))}
          className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors"
          style={{ background: '#22c55e' }}
        >
          WhatsApp ile Yaz
        </button>
        <button
          onClick={() => openExternal(INSTAGRAM_URL)}
          className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors"
          style={{ background: '#e1306c' }}
        >
          Instagram&apos;a Git
        </button>
        <button
          onClick={() => openExternal(WEBSITE_URL)}
          className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          Web Sitesini Aç
        </button>
      </div>

      {/* Feedback form */}
      <div className="mt-6 rounded-2xl border p-5 shadow-sm sm:p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Geri Bildirim Gönder</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Formu doldurun, mesajınız WhatsApp üzerinden hazır şekilde açılsın.
        </p>

        <form className="mt-4 space-y-4" onSubmit={handleFeedbackSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text)' }}>Ad Soyad</label>
              <input
                className={inputCls}
                style={inputStyle}
                value={feedback.name}
                onChange={(e) => setFeedback((f) => ({ ...f, name: e.target.value }))}
                placeholder="Adınız Soyadınız"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text)' }}>Telefon</label>
              <input
                className={inputCls}
                style={inputStyle}
                value={feedback.phone}
                onChange={(e) => setFeedback((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0555 555 55 55"
                inputMode="tel"
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text)' }}>Konu</label>
            <input
              className={inputCls}
              style={inputStyle}
              value={feedback.subject}
              onChange={(e) => setFeedback((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Örnek: Menü ayarları hakkında"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--text)' }}>Mesaj</label>
            <textarea
              className={`${inputCls} min-h-28 resize-y`}
              style={inputStyle}
              value={feedback.message}
              onChange={(e) => setFeedback((f) => ({ ...f, message: e.target.value }))}
              placeholder="Geri bildiriminizi yazın..."
              required
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors sm:w-auto"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <Send size={16} />
            WhatsApp&apos;tan Gönder
          </button>
        </form>
      </div>

      {/* Account deletion */}
      <div
        className="mt-6 rounded-2xl border p-5 shadow-sm sm:p-6"
        style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
            <Trash2 size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Hesap Silme</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Hesabınızın silinmesini talep edebilirsiniz. Talebiniz WhatsApp üzerinden ekibimize iletilir; otomatik silme yapılmaz.
            </p>
          </div>
        </div>
        <button
          onClick={() => setDeleteModal(true)}
          className="mt-4 w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-colors sm:w-auto"
          style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#dc2626', background: 'rgba(239,68,68,0.06)' }}
        >
          Hesap silme talebi oluştur
        </button>
      </div>

      {/* Legal links */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/terms" className="hover:underline">Kullanım Şartları</Link>
        <span aria-hidden>•</span>
        <Link href="/privacy" className="hover:underline">Gizlilik Politikası</Link>
        <span aria-hidden>•</span>
        <Link href="/kvkk" className="hover:underline">Aydınlatma Metni</Link>
      </div>

      {/* Delete confirm modal */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteModal(false)
          }}
        >
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" style={{ background: 'var(--surface)' }}>
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                <TriangleAlert className="h-7 w-7" />
              </div>
            </div>
            <h2 className="text-center text-lg font-bold" style={{ color: 'var(--text)' }}>Emin misiniz?</h2>
            <p className="mt-2 text-center text-sm" style={{ color: 'var(--muted)' }}>
              Hesap silme talebiniz WhatsApp üzerinden bize iletilecek.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                onClick={() => setDeleteModal(false)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
                style={{ borderColor: 'var(--border-soft)', color: 'var(--text)', background: 'var(--surface-muted)' }}
              >
                <X size={16} />
                Vazgeç
              </button>
              <button
                onClick={handleAccountDeletion}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white"
                style={{ background: '#ef4444' }}
              >
                Talebi Gönder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
