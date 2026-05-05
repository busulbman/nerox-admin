'use client'

import { useState, useEffect } from 'react'
import { query, where, onSnapshot } from 'firebase/firestore'
import { rc } from '@/lib/firebase'
import { seedVarinaChocolate } from '@/lib/seed'

interface Stats {
  pending: number
  products: number
  categories: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ pending: 0, products: 0, categories: 0 })
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState('')

  useEffect(() => {
    const unsubCalls = onSnapshot(
      query(rc('calls'), where('durum', '==', 'bekliyor')),
      (s) => setStats((p) => ({ ...p, pending: s.size }))
    )
    const unsubProds = onSnapshot(rc('products'), (s) =>
      setStats((p) => ({ ...p, products: s.size }))
    )
    const unsubCats = onSnapshot(rc('categories'), (s) =>
      setStats((p) => ({ ...p, categories: s.size }))
    )
    return () => { unsubCalls(); unsubProds(); unsubCats() }
  }, [])

  async function handleSeed() {
    setSeeding(true)
    setSeedMsg('')
    try {
      await seedVarinaChocolate()
      setSeedMsg('✓ Varina Chocolate demo verisi başarıyla yüklendi!')
    } catch (err) {
      setSeedMsg(err instanceof Error ? err.message : 'Hata oluştu.')
    } finally {
      setSeeding(false)
    }
  }

  const statCards = [
    { label: 'Bekleyen Çağrı', value: stats.pending, highlight: stats.pending > 0, icon: '🔔' },
    { label: 'Toplam Ürün', value: stats.products, highlight: false, icon: '🍽️' },
    { label: 'Kategori', value: stats.categories, highlight: false, icon: '📂' },
  ]

  return (
    <div className="p-8">
      <h1 className="font-bold text-2xl mb-1" style={{ color: '#3d2b1f' }}>Genel Bakış</h1>
      <p className="text-gray-400 text-sm mb-8">Varina Chocolate — Günlük özet</p>

      <div className="grid grid-cols-3 gap-4 mb-10">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl p-6 border"
            style={{
              borderColor: card.highlight ? '#d4a017' : '#f0ede9',
              boxShadow: card.highlight ? '0 2px 12px rgba(212,160,23,0.12)' : undefined,
            }}
          >
            <div className="text-2xl mb-2">{card.icon}</div>
            <div className="text-3xl font-bold" style={{ color: card.highlight ? '#d4a017' : '#3d2b1f' }}>
              {card.value}
            </div>
            <div className="text-gray-400 text-sm mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-100 max-w-md">
        <h2 className="font-semibold mb-1" style={{ color: '#3d2b1f' }}>Demo Veri</h2>
        <p className="text-gray-400 text-sm mb-4">
          5 kategori, 24 ürün ve 3 demo çağrı yükler. Yalnızca boş veritabanında çalışır.
        </p>
        {seedMsg && (
          <p className="text-sm mb-3" style={{ color: seedMsg.startsWith('✓') ? '#16a34a' : '#ef4444' }}>
            {seedMsg}
          </p>
        )}
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm"
          style={{ background: '#d4a017', color: '#3d2b1f' }}
        >
          {seeding ? 'Yükleniyor...' : '🍫 Varina Demo Verisi Yükle'}
        </button>
      </div>
    </div>
  )
}
