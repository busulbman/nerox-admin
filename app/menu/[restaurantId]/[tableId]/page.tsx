'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Category, Product } from '@/lib/types'

type CallTip = 'sipariş' | 'hesap' | 'yardım'

const TIP_OPTIONS: { tip: CallTip; icon: string; label: string; desc: string }[] = [
  { tip: 'sipariş', icon: '📋', label: 'Sipariş', desc: 'Sipariş vermek istiyorum' },
  { tip: 'hesap',   icon: '💳', label: 'Hesap',   desc: 'Hesabı getirin lütfen' },
  { tip: 'yardım',  icon: '🙋', label: 'Yardım',  desc: 'Yardıma ihtiyacım var' },
]

export default function MenuPage() {
  const params = useParams<{ restaurantId: string; tableId: string }>()
  const { restaurantId, tableId } = params

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const [callModal, setCallModal] = useState(false)
  const [selectedTip, setSelectedTip] = useState<CallTip | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    async function load() {
      const [catSnap, prodSnap] = await Promise.all([
        getDocs(query(collection(db, 'restaurants', restaurantId, 'categories'), orderBy('order', 'asc'))),
        getDocs(collection(db, 'restaurants', restaurantId, 'products')),
      ])
      const cats = catSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
      const prods = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
      setCategories(cats)
      setProducts(prods)
      setActiveCat(cats[0]?.id ?? null)
      setLoading(false)
    }
    load()
  }, [restaurantId])

  async function sendCall() {
    if (!selectedTip) return
    setSending(true)
    try {
      await addDoc(collection(db, 'restaurants', restaurantId, 'calls'), {
        tableId,
        restaurantId,
        tip: selectedTip,
        durum: 'bekliyor',
        note: note.trim(),
        createdAt: Date.now(),
        resolvedAt: null,
      })
      setSent(true)
      setTimeout(() => {
        setSent(false)
        setCallModal(false)
        setSelectedTip(null)
        setNote('')
      }, 2500)
    } finally {
      setSending(false)
    }
  }

  const visibleProducts = products
    .filter((p) => p.categoryId === activeCat && p.available)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fefaf3' }}>
        <div className="text-center" style={{ color: '#3d2b1f' }}>
          <div className="text-4xl mb-3 animate-pulse">☕</div>
          <p style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: '1.1rem' }}>Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#fefaf3', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 shadow-sm" style={{ background: '#3d2b1f' }}>
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair, serif)', color: '#d4a017', fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>
              Varina Chocolate
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '2px' }}>
              Masa {tableId}
            </p>
          </div>
          <div style={{ background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: '999px', padding: '4px 12px' }}>
            <span style={{ color: '#d4a017', fontSize: '0.75rem', fontWeight: 600 }}>#{tableId}</span>
          </div>
        </div>

        {/* Category tabs */}
        {categories.length > 0 && (
          <div className="overflow-x-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex px-4 py-2 gap-2 w-max">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={
                    activeCat === cat.id
                      ? { background: '#d4a017', color: '#3d2b1f' }
                      : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }
                  }
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Products */}
      <div className="max-w-lg mx-auto px-5 pt-5">
        {visibleProducts.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#9ca3af' }}>
            <p>Bu kategoride ürün bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleProducts.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl overflow-hidden"
                style={{ background: '#fff', border: '1px solid rgba(61,43,31,0.08)', boxShadow: '0 1px 8px rgba(61,43,31,0.05)' }}
              >
                <div className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3
                      style={{ fontFamily: 'var(--font-playfair, serif)', color: '#3d2b1f', fontWeight: 600, fontSize: '1rem', lineHeight: 1.3 }}
                    >
                      {p.name}
                    </h3>
                    {p.description && (
                      <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '4px', lineHeight: 1.5 }}>
                        {p.description}
                      </p>
                    )}
                  </div>
                  <div
                    className="shrink-0 font-bold"
                    style={{ color: '#d4a017', fontSize: '1.1rem', fontFamily: 'var(--font-playfair, serif)' }}
                  >
                    ₺{p.price}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Call Button */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-20">
        <button
          onClick={() => { setCallModal(true); setSent(false) }}
          className="font-bold px-8 py-4 rounded-2xl text-base shadow-xl transition-transform active:scale-95"
          style={{ background: '#3d2b1f', color: '#d4a017', boxShadow: '0 4px 24px rgba(61,43,31,0.35)' }}
        >
          🔔 Garson Çağır
        </button>
      </div>

      {/* Call Modal */}
      {callModal && (
        <div className="fixed inset-0 z-30 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-t-3xl p-6"
            style={{ background: '#fff', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {sent ? (
              <div className="py-8 text-center">
                <div className="text-5xl mb-4">✅</div>
                <p className="font-bold text-xl" style={{ color: '#3d2b1f', fontFamily: 'var(--font-playfair, serif)' }}>
                  Çağrınız iletildi!
                </p>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '8px' }}>
                  Garsonunuz en kısa sürede gelecek.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 style={{ fontFamily: 'var(--font-playfair, serif)', color: '#3d2b1f', fontSize: '1.2rem', fontWeight: 700 }}>
                    Ne yapmamızı istersiniz?
                  </h2>
                  <button onClick={() => setCallModal(false)} style={{ color: '#9ca3af', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {TIP_OPTIONS.map((opt) => (
                    <button
                      key={opt.tip}
                      onClick={() => setSelectedTip(opt.tip)}
                      className="rounded-2xl p-4 text-center transition-all"
                      style={
                        selectedTip === opt.tip
                          ? { background: '#3d2b1f', border: '2px solid #3d2b1f' }
                          : { background: '#fefaf3', border: '2px solid rgba(61,43,31,0.1)' }
                      }
                    >
                      <div className="text-2xl mb-1">{opt.icon}</div>
                      <p className="text-xs font-semibold" style={{ color: selectedTip === opt.tip ? '#d4a017' : '#3d2b1f' }}>
                        {opt.label}
                      </p>
                    </button>
                  ))}
                </div>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Not ekle (isteğe bağlı)..."
                  className="w-full rounded-xl resize-none text-sm"
                  rows={2}
                  style={{ background: '#fefaf3', border: '1px solid rgba(61,43,31,0.15)', padding: '12px', color: '#3d2b1f', outline: 'none' }}
                />

                <button
                  onClick={sendCall}
                  disabled={!selectedTip || sending}
                  className="w-full mt-4 py-4 rounded-2xl font-bold text-base disabled:opacity-40 transition-opacity"
                  style={{ background: '#d4a017', color: '#3d2b1f' }}
                >
                  {sending ? 'Gönderiliyor...' : 'Garson Çağır 🔔'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
