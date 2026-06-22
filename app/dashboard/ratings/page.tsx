'use client'

import { useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore'
import { useAuth } from '@/components/AuthProvider'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { normalizeRating } from '@/lib/firestore-models'
import { getRestaurantRecentRatingsQuery } from '@/lib/firestore-queries'
import { db } from '@/lib/firebase'
import type { Rating } from '@/lib/types'

const BROWN = 'var(--text)'
const GOLD = 'var(--primary)'
const PRIMARY_FOREGROUND = 'var(--primary-foreground)'

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
  const { profile } = useAuth()
  const restaurantId = profile?.restaurantId || ''

  const [ratings, setRatings] = useState<Rating[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [waiterFilter, setWaiterFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteBusyId, setDeleteBusyId] = useState<string | 'bulk' | null>(null)

  useEffect(() => {
    logFirestoreRead('dashboard/ratings', restaurantId)
    const unsubscribe = onSnapshot(
      getRestaurantRecentRatingsQuery(restaurantId),
      (snap) => {
        setRatings(
          snap.docs
            .map((ratingDoc) => normalizeRating(ratingDoc.id, ratingDoc.data() as Record<string, unknown>))
            .sort((left, right) => right.createdAt - left.createdAt)
        )
        setError('')
        setLoading(false)
      },
      (snapshotError) => {
        console.error('Yorumlar yüklenemedi:', snapshotError)
        setRatings([])
        setError('Yorumlar yüklenemedi. Lütfen tekrar deneyin.')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [restaurantId])

  const waiterOptions = useMemo(
    () =>
      Array.from(
        new Set(ratings.map((rating) => rating.waiterName).filter((value): value is string => !!value))
      ).sort((a, b) => a.localeCompare(b, 'tr')),
    [ratings]
  )

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
  const allVisibleSelected =
    filteredRatings.length > 0 && filteredRatings.every((rating) => selectedIds.has(rating.id))

  function toggleSelection(ratingId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(ratingId)) next.delete(ratingId)
      else next.add(ratingId)
      return next
    })
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) => {
        const next = new Set(current)
        for (const rating of filteredRatings) {
          next.delete(rating.id)
        }
        return next
      })
      return
    }

    setSelectedIds((current) => {
      const next = new Set(current)
      for (const rating of filteredRatings) {
        next.add(rating.id)
      }
      return next
    })
  }

  async function deleteSingleRating(rating: Rating) {
    const confirmed = window.confirm(`Masa ${rating.tableNumber > 0 ? rating.tableNumber : rating.tableId} yorumunu silmek istiyor musunuz?`)
    if (!confirmed) return

    setDeleteBusyId(rating.id)
    setError('')
    try {
      logFirestoreWrite('dashboard/delete rating', { restaurantId, ratingId: rating.id })
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'ratings', rating.id))
      setSelectedIds((current) => {
        const next = new Set(current)
        next.delete(rating.id)
        return next
      })
    } catch (deleteError) {
      console.error('Yorum silinemedi:', deleteError)
      setError('Yorum silinemedi. Lütfen tekrar deneyin.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  async function deleteSelectedRatings() {
    if (selectedIds.size === 0) return

    const confirmed = window.confirm(`${selectedIds.size} yorumu silmek istiyor musunuz?`)
    if (!confirmed) return

    const idsToDelete = new Set(selectedIds)
    setDeleteBusyId('bulk')
    setError('')

    try {
      const batch = writeBatch(db)
      for (const ratingId of idsToDelete) {
        batch.delete(doc(db, 'restaurants', restaurantId, 'ratings', ratingId))
      }
      logFirestoreWrite('dashboard/bulk delete ratings', [...idsToDelete])
      await batch.commit()
      setSelectedIds(new Set())
      setSelectionMode(false)
    } catch (deleteError) {
      console.error('Toplu yorum silme başarısız:', deleteError)
      setError('Seçili yorumlar silinemedi. Lütfen tekrar deneyin.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  const noRatings = !loading && ratings.length === 0
  const noFilteredRatings = !loading && ratings.length > 0 && filteredRatings.length === 0

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Yorumlar</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {loading ? 'Yorumlar yükleniyor...' : `${filteredRatings.length} değerlendirme görüntüleniyor`}
          </p>
        </div>

        {!loading && ratings.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSelectionMode((current) => !current)
                setSelectedIds(new Set())
              }}
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={selectionMode ? { background: GOLD, color: PRIMARY_FOREGROUND } : { background: '#fff', color: '#6b7280', border: '1px solid var(--border-soft)' }}
            >
              {selectionMode ? 'Seçimi İptal' : 'Seç'}
            </button>

            {selectionMode && filteredRatings.length > 0 && (
              <button
                onClick={toggleSelectAllVisible}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ background: '#fff', color: BROWN, border: '1px solid var(--border-soft)' }}
              >
                {allVisibleSelected ? 'Seçimi Kaldır' : 'Görünenleri Seç'}
              </button>
            )}

            {selectionMode && selectedIds.size > 0 && (
              <button
                onClick={() => void deleteSelectedRatings()}
                disabled={deleteBusyId === 'bulk'}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#dc2626' }}
              >
                {deleteBusyId === 'bulk' ? 'Siliniyor...' : `Seçilenleri Sil (${selectedIds.size})`}
              </button>
            )}
          </div>
        )}
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
              className="theme-input rounded-lg text-sm"
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
              className="theme-input rounded-lg text-sm"
            >
              <option value="all">Tüm zamanlar</option>
              <option value="today">Bugün</option>
              <option value="7d">Son 7 gün</option>
              <option value="30d">Son 30 gün</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm mb-6"
          style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <RatingsLoadingSection title="Son Yorumlar" />
          <RatingsLoadingSection title="Şüpheli Yorumlar" />
        </div>
      ) : noRatings ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
          Henüz yorum bulunmuyor.
        </div>
      ) : noFilteredRatings ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm">
          Filtrelere uygun yorum bulunamadı.
        </div>
      ) : (
        <>
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg" style={{ color: BROWN }}>Son Yorumlar</h2>
              <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'var(--primary-soft)', color: BROWN }}>
                {approvedRatings.length} kayıt
              </span>
            </div>

            {approvedRatings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
                Onaylı yorum yok.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {approvedRatings.map((rating) => (
                  <RatingCard
                    key={rating.id}
                    rating={rating}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(rating.id)}
                    busy={deleteBusyId === rating.id}
                    onToggleSelect={() => toggleSelection(rating.id)}
                    onDelete={() => void deleteSingleRating(rating)}
                  />
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
                  <RatingCard
                    key={rating.id}
                    rating={rating}
                    suspicious
                    selectionMode={selectionMode}
                    selected={selectedIds.has(rating.id)}
                    busy={deleteBusyId === rating.id}
                    onToggleSelect={() => toggleSelection(rating.id)}
                    onDelete={() => void deleteSingleRating(rating)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
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

function RatingsLoadingSection({ title }: { title: string }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg" style={{ color: BROWN }}>{title}</h2>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-400">Yükleniyor</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[1, 2].map((item) => (
          <div key={item} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="space-y-2">
                <div className="h-5 w-28 rounded bg-gray-100" />
                <div className="h-4 w-24 rounded bg-gray-100" />
              </div>
              <div className="h-4 w-20 rounded bg-gray-100" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="h-18 rounded-xl bg-gray-100" />
              <div className="h-18 rounded-xl bg-gray-100" />
            </div>
            <div className="h-12 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </section>
  )
}

function RatingCard({
  rating,
  suspicious,
  selectionMode,
  selected,
  busy,
  onToggleSelect,
  onDelete,
}: {
  rating: Rating
  suspicious?: boolean
  selectionMode: boolean
  selected: boolean
  busy: boolean
  onToggleSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="bg-white rounded-xl border p-5"
      style={{
        borderColor: suspicious ? '#fdba74' : selected ? GOLD : 'var(--border-soft)',
        background: suspicious ? '#fffaf4' : '#fff',
        boxShadow: selected ? '0 0 0 2px var(--primary-soft)' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          {selectionMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="mt-1 h-4 w-4"
              style={{ accentColor: GOLD }}
            />
          )}
          <div>
            <p className="font-semibold text-lg" style={{ color: BROWN }}>
              Masa {rating.tableNumber > 0 ? rating.tableNumber : rating.tableId}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {rating.waiterName || 'İşletme'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs font-semibold" style={{ color: suspicious ? '#c2410c' : '#6b7280' }}>
            {formatDate(rating.createdAt)}
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            {suspicious && (
              <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#ffedd5', color: '#c2410c' }}>
                Şüpheli
              </span>
            )}
            <button
              onClick={onDelete}
              disabled={busy}
              className="inline-flex rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
              style={{ background: '#fee2e2', color: '#b91c1c' }}
            >
              {busy ? 'Siliniyor...' : 'Sil'}
            </button>
          </div>
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
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
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
