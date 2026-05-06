'use client'

import { useEffect, useState } from 'react'
import { getDocs } from 'firebase/firestore'
import { logFirestoreRead } from '@/lib/firestore-debug'
import { getRestaurantRecentRatingsQuery } from '@/lib/firestore-queries'
import { normalizeRating } from '@/lib/firestore-models'
import { RESTAURANT_ID } from '@/lib/firebase'
import type { Rating } from '@/lib/types'

const BROWN = '#3d2b1f'
const GOLD = '#d4a017'

type DateFilter = 'all' | 'today' | '7d' | '30d'

function getDateThreshold(filter: DateFilter): number | null {
  const now = Date.now()

  if (filter === 'today') {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }

  if (filter === '7d') return now - 7 * 24 * 60 * 60 * 1000
  if (filter === '30d') return now - 30 * 24 * 60 * 60 * 1000
  return null
}

function formatDate(ts: number): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts)
}

function average(values: number[]): string {
  if (values.length === 0) return '—'
  const total = values.reduce((sum, value) => sum + value, 0)
  return (total / values.length).toFixed(1)
}

export default function RatingsPage() {
  const [ratings, setRatings] = useState<Rating[]>([])
  const [waiterFilter, setWaiterFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  useEffect(() => {
    let cancelled = false

    async function loadRatings() {
      logFirestoreRead('dashboard/ratings', RESTAURANT_ID)
      const snap = await getDocs(getRestaurantRecentRatingsQuery(RESTAURANT_ID))
      if (cancelled) return
      const nextRatings = snap.docs
        .map((doc) => normalizeRating(doc.id, doc.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt - a.createdAt)

      setRatings(nextRatings)
    }

    void loadRatings()

    return () => {
      cancelled = true
    }
  }, [])

  const waiterOptions = Array.from(
    new Set(ratings.map((rating) => rating.waiterName).filter((value): value is string => !!value))
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  const threshold = getDateThreshold(dateFilter)
  const filteredRatings = ratings.filter((rating) => {
    const matchesWaiter = waiterFilter === 'all' || rating.waiterName === waiterFilter
    const matchesDate = threshold === null || rating.createdAt >= threshold
    return matchesWaiter && matchesDate
  })

  const approvedRatings = filteredRatings.filter((rating) => rating.status === 'approved')
  const suspiciousRatings = filteredRatings.filter((rating) => rating.status === 'suspicious')

  const averageService = average(approvedRatings.map((rating) => rating.serviceRating))
  const averageWaiter = average(approvedRatings.map((rating) => rating.waiterRating))

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Yorumlar</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {filteredRatings.length} değerlendirme görüntüleniyor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Ortalama Hizmet" value={averageService === '—' ? '—' : `${averageService} / 5`} />
        <StatCard label="Ortalama Garson" value={averageWaiter === '—' ? '—' : `${averageWaiter} / 5`} />
        <StatCard label="Toplam Yorum" value={String(approvedRatings.length)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: BROWN }}>
              Garsona Göre
            </label>
            <select
              value={waiterFilter}
              onChange={(event) => setWaiterFilter(event.target.value)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]"
            >
              <option value="all">Tüm garsonlar</option>
              {waiterOptions.map((waiterName) => (
                <option key={waiterName} value={waiterName}>
                  {waiterName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: BROWN }}>
              Tarihe Göre
            </label>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]"
            >
              <option value="all">Tüm zamanlar</option>
              <option value="today">Bugün</option>
              <option value="7d">Son 7 gün</option>
              <option value="30d">Son 30 gün</option>
            </select>
          </div>
        </div>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg" style={{ color: BROWN }}>Son Yorumlar</h2>
          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: '#faf5e6', color: BROWN }}>
            {approvedRatings.length} kayıt
          </span>
        </div>

        {approvedRatings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
            Filtrelere uygun yorum bulunamadı.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {approvedRatings.map((rating) => (
              <RatingCard key={rating.id} rating={rating} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg" style={{ color: BROWN }}>Şüpheli Yorumlar</h2>
          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: '#fff7ed', color: '#c2410c' }}>
            {suspiciousRatings.length} kayıt
          </span>
        </div>

        {suspiciousRatings.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
            Şüpheli yorum yok.
          </div>
        ) : (
          <div className="space-y-4">
            {suspiciousRatings.map((rating) => (
              <RatingCard key={rating.id} rating={rating} suspicious />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <p className="text-sm text-gray-400 mb-2">{label}</p>
      <p className="text-3xl font-bold" style={{ color: BROWN }}>
        {value}
      </p>
    </div>
  )
}

function RatingCard({ rating, suspicious }: { rating: Rating; suspicious?: boolean }) {
  return (
    <div
      className="bg-white rounded-xl border p-5"
      style={{
        borderColor: suspicious ? '#fdba74' : '#f0ede9',
        background: suspicious ? '#fffaf4' : '#fff',
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="font-semibold text-lg" style={{ color: BROWN }}>
            Masa {rating.tableNumber > 0 ? rating.tableNumber : rating.tableId}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {rating.waiterName ?? 'Garson bilgisi yok'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold" style={{ color: suspicious ? '#c2410c' : '#6b7280' }}>
            {formatDate(rating.createdAt)}
          </p>
          {suspicious && (
            <span className="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#ffedd5', color: '#c2410c' }}>
              Şüpheli
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <RatingValue label="Genel hizmet" value={rating.serviceRating} />
        <RatingValue label="Garson puanı" value={rating.waiterRating} />
      </div>

      <p className="text-sm leading-6" style={{ color: rating.comment ? '#4b5563' : '#9ca3af' }}>
        {rating.comment || 'Yorum bırakılmadı.'}
      </p>
    </div>
  )
}

function RatingValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: '#faf7f4' }}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-lg font-bold" style={{ color: BROWN }}>
          {value}/5
        </span>
        <span className="text-sm tracking-[0.2em]" style={{ color: GOLD }}>
          {'★'.repeat(Math.max(0, Math.min(5, value)))}
          <span style={{ color: '#d1d5db' }}>{'★'.repeat(Math.max(0, 5 - value))}</span>
        </span>
      </div>
    </div>
  )
}
