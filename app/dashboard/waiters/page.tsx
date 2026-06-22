'use client'

import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { ref as dbRef, onValue } from 'firebase/database'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { getCallCompletedAt, normalizeRating, normalizeWaiterCall } from '@/lib/firestore-models'
import {
  getRestaurantRecentCompletedCallsQuery,
  getRestaurantRecentRatingsQuery,
  getRestaurantWaiterUsersQuery,
} from '@/lib/firestore-queries'
import { auth, createFirebaseUser, db, ensureRealtimeDatabaseAuth, rtdb } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import type { Rating, UserProfile, WaiterCall } from '@/lib/types'

type PresenceData = {
  online: boolean
  name: string
  lastSeen: number
}

const BROWN = 'var(--text)'
const GOLD = 'var(--primary)'
const PRIMARY_FOREGROUND = 'var(--primary-foreground)'

type WaiterForm = { name: string; email: string; password: string }
type WaiterPerformance = {
  waiter: UserProfile
  rank: number
  avgWaiterRating: number | null
  totalRatings: number
  todayCompletedCalls: number
  totalCompletedCalls: number
  avgResponseMs: number | null
  latestComment: string | null
  recentComments: string[]
}

const EMPTY_FORM: WaiterForm = { name: '', email: '', password: '' }
const MEDALS = ['🥇', '🥈', '🥉'] as const

function tsToMs(ts: unknown): number {
  if (!ts) return 0
  if (typeof ts === 'number') return ts
  if (typeof (ts as { toMillis?: unknown }).toMillis === 'function') return (ts as { toMillis(): number }).toMillis()
  if (typeof (ts as { toDate?: unknown }).toDate === 'function') return (ts as { toDate(): Date }).toDate().getTime()
  return 0
}

function getTodayStartTs() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function averageNumber(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatLastSeen(ts: unknown): string {
  const ms = tsToMs(ts)
  if (!ms) return 'bilinmiyor'
  const m = Math.floor((Date.now() - ms) / 60000)
  if (m < 1) return 'az önce'
  if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} sa önce`
  return `${Math.floor(h / 24)} gün önce`
}

function formatRating(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} ★`
}

function formatResponseTime(ms: number | null): string {
  if (ms === null) return '—'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds} sn`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes} dk` : `${minutes} dk ${seconds} sn`
}

function truncateComment(value: string, max = 88): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const inputCls =
  'theme-input rounded-lg text-sm'

export default function WaitersPage() {
  const { user, profile } = useAuth()
  const restaurantId = profile?.restaurantId || ''
  const [waiters, setWaiters] = useState<UserProfile[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [recentCompletedCalls, setRecentCompletedCalls] = useState<WaiterCall[]>([])
  const [presence, setPresence] = useState<Record<string, PresenceData>>({})
  const [presenceWarning, setPresenceWarning] = useState('')

  const [form, setForm] = useState<WaiterForm>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [editingWaiter, setEditingWaiter] = useState<UserProfile | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadWaiters = useCallback(async () => {
    logFirestoreRead('dashboard/waiters', restaurantId)
    const snap = await getDocs(getRestaurantWaiterUsersQuery(restaurantId))
    setWaiters(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)))
  }, [restaurantId])

  const loadRatings = useCallback(async () => {
    logFirestoreRead('dashboard/waiters ratings', restaurantId)
    const snap = await getDocs(getRestaurantRecentRatingsQuery(restaurantId))
    setRatings(snap.docs.map((d) => normalizeRating(d.id, d.data() as Record<string, unknown>)))
  }, [restaurantId])

  const loadRecentCompletedCalls = useCallback(async () => {
    logFirestoreRead('dashboard/waiters completed calls', restaurantId)
    const snap = await getDocs(getRestaurantRecentCompletedCallsQuery(restaurantId))
    setRecentCompletedCalls(
      snap.docs.map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
    )
  }, [restaurantId])

  useEffect(() => {
    let cancelled = false

    async function loadAll() {
      await Promise.all([loadWaiters(), loadRatings(), loadRecentCompletedCalls()])
      if (cancelled) return
    }

    void loadAll()

    return () => {
      cancelled = true
    }
  }, [loadRatings, loadRecentCompletedCalls, loadWaiters])

  // RTDB presence listener - only start after auth is ready
  useEffect(() => {
    if (!user || !profile || profile.role !== 'admin') return
    if (!rtdb) return
    const presenceDb: NonNullable<typeof rtdb> = rtdb

    let unsubscribe: (() => void) | null = null
    let cancelled = false

    async function startPresenceListener() {
      try {
        const authReady = await ensureRealtimeDatabaseAuth()
        if (!authReady || cancelled) {
          if (!cancelled) {
            setPresence({})
            setPresenceWarning('Canlı durum bilgisi şu anda kullanılamıyor.')
          }
          return
        }
        if (cancelled) return

        const path = `presence/${restaurantId}/waiters`
        const presenceRef = dbRef(presenceDb, path)
        unsubscribe = onValue(
          presenceRef,
          (snap) => {
            const data = snap.val() as Record<string, PresenceData> | null
            setPresence(data ?? {})
            setPresenceWarning('')
          },
          (error) => {
            if (process.env.NODE_ENV !== 'production') {
              console.error('RTDB PRESENCE READ ERROR', {
                path,
                uid: auth.currentUser?.uid,
                error,
              })
            }
            setPresence({})
            setPresenceWarning('Canlı durum bilgisi alınamadı.')
          }
        )
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('RTDB PRESENCE INIT ERROR', {
            path: `presence/${restaurantId}/waiters`,
            uid: auth.currentUser?.uid,
            error,
          })
        }
        if (!cancelled) {
          setPresence({})
          setPresenceWarning('Canlı durum bilgisi alınamadı.')
        }
      }
    }

    void startPresenceListener()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [profile, restaurantId, user])

  async function handleAdd() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setAddError('İsim, geçerli e-posta ve en az 6 karakterli şifre gerekli.')
      return
    }

    setAdding(true)
    setAddError('')

    try {
      logFirestoreWrite('dashboard/create waiter', form.email.trim())
      const uid = await createFirebaseUser(form.email.trim(), form.password)
      await setDoc(doc(db, 'users', uid), {
        uid,
        email: form.email.trim(),
        role: 'waiter',
        name: form.name.trim(),
        restaurantId,
        active: true,
        avgRating: 0,
        totalCalls: 0,
        isOnline: false,
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await loadWaiters()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hata oluştu.'
      setAddError(msg.includes('email-already-in-use') ? 'Bu e-posta zaten kayıtlı.' : msg)
    } finally {
      setAdding(false)
    }
  }

  async function toggleActive(waiter: UserProfile) {
    try {
      logFirestoreWrite('dashboard/toggle waiter active', waiter.uid)
      await updateDoc(doc(db, 'users', waiter.uid), { active: !waiter.active })
      await loadWaiters()
    } catch (err) {
      console.error('Durum güncelleme hatası:', err)
    }
  }

  function openEdit(waiter: UserProfile) {
    setEditingWaiter(waiter)
    setEditName(waiter.name)
    setEditEmail(waiter.email)
    setEditError('')
  }

  async function handleEditSave() {
    if (!editingWaiter) return
    if (!editName.trim() || !editEmail.trim()) {
      setEditError('İsim ve e-posta zorunludur.')
      return
    }

    setEditSaving(true)
    setEditError('')

    try {
      logFirestoreWrite('dashboard/edit waiter', editingWaiter.uid)
      await updateDoc(doc(db, 'users', editingWaiter.uid), {
        name: editName.trim(),
        email: editEmail.trim(),
      })
      await loadWaiters()
      setEditingWaiter(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Güncelleme başarısız.')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(waiter: UserProfile) {
    if (!window.confirm(`${waiter.name} adlı garsonu silmek istediğinizden emin misiniz?\nFirestore kaydı silinir.`)) return

    setDeletingId(waiter.uid)

    try {
      logFirestoreWrite('dashboard/delete waiter', waiter.uid)
      await deleteDoc(doc(db, 'users', waiter.uid))
      await loadWaiters()
    } catch (err) {
      console.error('Garson silme hatası:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const todayStart = getTodayStartTs()
  const rankedWaiters = waiters
    .map((waiter) => {
      const waiterRatings = ratings
        .filter((rating) => rating.waiterId === waiter.uid)
        .sort((a, b) => b.createdAt - a.createdAt)

      const completedCalls = recentCompletedCalls.filter((call) => call.waiterId === waiter.uid)
      const todayCompletedCalls = completedCalls.filter((call) => getCallCompletedAt(call) >= todayStart)
      const responseTimes = completedCalls
        .filter((call) => call.acceptedAt && call.createdAt)
        .map((call) => call.acceptedAt! - call.createdAt)

      const recentComments = waiterRatings
        .map((rating) => rating.comment.trim())
        .filter(Boolean)
        .slice(0, 2)

      return {
        waiter,
        rank: 0,
        avgWaiterRating: averageNumber(waiterRatings.map((rating) => rating.waiterRating)),
        totalRatings: waiterRatings.length,
        todayCompletedCalls: todayCompletedCalls.length,
        totalCompletedCalls: waiter.totalCalls ?? completedCalls.length,
        avgResponseMs: averageNumber(responseTimes),
        latestComment: recentComments[0] ?? null,
        recentComments,
      } satisfies WaiterPerformance
    })
    .sort((left, right) => {
      const ratingDiff = (right.avgWaiterRating ?? -1) - (left.avgWaiterRating ?? -1)
      if (ratingDiff !== 0) return ratingDiff

      const commentDiff = right.totalRatings - left.totalRatings
      if (commentDiff !== 0) return commentDiff

      const completionDiff = right.totalCompletedCalls - left.totalCompletedCalls
      if (completionDiff !== 0) return completionDiff

      return left.waiter.name.localeCompare(right.waiter.name, 'tr')
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }))

  const topThree = rankedWaiters.slice(0, 3)
  const teamAverage = averageNumber(rankedWaiters.map((waiter) => waiter.avgWaiterRating).filter((value): value is number => value !== null))
  const totalComments = rankedWaiters.reduce((sum, waiter) => sum + waiter.totalRatings, 0)
  const onlineCount = waiters.filter((waiter) => presence[waiter.uid]?.online).length
  const realtimePresenceWarning =
    presenceWarning || (!rtdb ? 'Canlı durum bilgisi şu anda kullanılamıyor.' : '')

  return (
    <>
      <div className="p-8 space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Garson Yönetimi</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              Canlı performans sıralaması, yorumlar ve çağrı tamamlama verileri.
            </p>
          </div>
          <button
            onClick={() => {
              setShowForm(!showForm)
              setAddError('')
              setForm(EMPTY_FORM)
            }}
            className="font-semibold px-5 py-2.5 rounded-xl text-sm shrink-0"
            style={{ background: GOLD, color: PRIMARY_FOREGROUND }}
          >
            {showForm ? 'İptal' : '+ Garson Ekle'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <OverviewCard label="Toplam Garson" value={String(waiters.length)} sub={`${onlineCount} çevrimiçi`} />
          <OverviewCard label="Takım Ortalaması" value={formatRating(teamAverage)} sub={`${totalComments} toplam değerlendirme`} />
          <OverviewCard
            label="Bugün Tamamlanan"
            value={String(rankedWaiters.reduce((sum, waiter) => sum + waiter.todayCompletedCalls, 0))}
            sub="garson bazlı tamamlanan çağrı"
          />
        </div>

        {realtimePresenceWarning && (
          <div
            className="rounded-2xl px-4 py-3 text-sm"
            style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}
          >
            {realtimePresenceWarning}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-lg shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
            <h2 className="font-semibold mb-1" style={{ color: BROWN }}>Yeni Garson</h2>
            <p className="text-gray-400 text-xs mb-4">
              Firebase Auth kullanıcısı oluşturulur ve role = &quot;waiter&quot; atanır.
            </p>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Ad Soyad *" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              <input type="email" className={inputCls} placeholder="E-posta *" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
              <input type="password" className={inputCls} placeholder="Şifre (min. 6 karakter) *" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
            </div>
            {addError && <p className="text-red-500 text-sm mt-3">{addError}</p>}
            <button
              onClick={handleAdd}
              disabled={adding}
              className="mt-4 font-semibold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
              style={{ background: GOLD, color: PRIMARY_FOREGROUND }}
            >
              {adding ? 'Oluşturuluyor...' : 'Garson Oluştur'}
            </button>
          </div>
        )}

        {rankedWaiters.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-14 text-center text-gray-400 text-sm">
            Henüz garson eklenmemiş.
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-xl" style={{ color: BROWN }}>Performans Sıralaması</h2>
                  <p className="text-sm text-gray-400 mt-1">İlk 3 garson yorum puanı ve hizmet performansına göre öne çıkarılır.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                {topThree.map((entry, index) => (
                  <div
                    key={entry.waiter.uid}
                    className="rounded-[28px] border p-6 shadow-[0_18px_36px_rgba(0,0,0,0.08)]"
                    style={{
                      background: index === 0 ? 'linear-gradient(180deg, var(--primary-soft) 0%, #ffffff 72%)' : '#ffffff',
                      borderColor: 'var(--border-soft)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black"
                            style={{
                              background: index === 0 ? GOLD : 'var(--surface-muted)',
                              color: index === 0 ? PRIMARY_FOREGROUND : BROWN,
                            }}
                          >
                            #{entry.rank}
                          </span>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Sıra #{entry.rank}</p>
                            <h3 className="text-xl font-bold mt-1" style={{ color: BROWN }}>{entry.waiter.name}</h3>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <StatusBadge active={entry.waiter.active} />
                          <OnlineBadge online={!!presence[entry.waiter.uid]?.online} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Ort. puan</p>
                        <p className="text-2xl font-black" style={{ color: GOLD }}>{formatRating(entry.avgWaiterRating)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-5">
                      <MetricTile label="Toplam yorum" value={String(entry.totalRatings)} />
                      <MetricTile label="Bugün tamamlanan" value={String(entry.todayCompletedCalls)} />
                      <MetricTile label="Toplam çağrı" value={String(entry.totalCompletedCalls)} />
                      <MetricTile label="Ort. cevap" value={formatResponseTime(entry.avgResponseMs)} />
                    </div>

                    <div className="mt-5 rounded-2xl px-4 py-4" style={{ background: 'var(--surface-muted)' }}>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Son yorum özeti</p>
                      <p className="text-sm leading-6 mt-2" style={{ color: entry.latestComment ? '#4b5563' : '#9ca3af' }}>
                        {entry.latestComment ? truncateComment(entry.latestComment, 120) : 'Henüz yorum yok.'}
                      </p>
                      {entry.recentComments.length > 1 && (
                        <p className="text-xs text-gray-400 mt-2">
                          + {truncateComment(entry.recentComments[1], 56)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-xl" style={{ color: BROWN }}>Tüm Garsonlar</h2>
                  <p className="text-sm text-gray-400 mt-1">Sıralama; ortalama puan, yorum sayısı ve tamamlanan çağrı adedine göre yapılır.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
                <div className="hidden xl:grid xl:grid-cols-[72px_1.5fr_120px_120px_150px_140px_120px_1.7fr_140px] gap-3 px-6 py-4 border-b border-gray-100 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                  <span>Sıra</span>
                  <span>Garson</span>
                  <span>Ortalama</span>
                  <span>Yorum</span>
                  <span>Tamamlanan</span>
                  <span>Cevap</span>
                  <span>Durum</span>
                  <span>Son yorum</span>
                  <span className="text-right">Aksiyon</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {rankedWaiters.map((entry) => (
                    <div key={entry.waiter.uid} className="px-5 py-5 xl:px-6">
                      <div className="xl:hidden space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold shrink-0"
                              style={{ background: entry.waiter.active ? GOLD : '#9ca3af', color: entry.waiter.active ? PRIMARY_FOREGROUND : '#fff' }}
                            >
                              {entry.waiter.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface-muted)', color: BROWN }}>
                                  #{entry.rank}
                                </span>
                                <p className="font-semibold truncate" style={{ color: BROWN }}>{entry.waiter.name}</p>
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {presence[entry.waiter.uid]?.online ? 'Çevrimiçi' : formatLastSeen(presence[entry.waiter.uid]?.lastSeen)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Puan</p>
                            <p className="font-bold" style={{ color: GOLD }}>{formatRating(entry.avgWaiterRating)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <MetricTile label="Toplam yorum" value={String(entry.totalRatings)} />
                          <MetricTile label="Tamamlanan" value={`${entry.todayCompletedCalls} / ${entry.totalCompletedCalls}`} />
                          <MetricTile label="Ort. cevap" value={formatResponseTime(entry.avgResponseMs)} />
                          <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
                            <p className="text-xs text-gray-400 mb-1">Durum</p>
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge active={entry.waiter.active} />
                              <OnlineBadge online={!!presence[entry.waiter.uid]?.online} />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
                          <p className="text-xs text-gray-400 mb-1">Son yorum</p>
                          <p className="text-sm leading-6" style={{ color: entry.latestComment ? '#4b5563' : '#9ca3af' }}>
                            {entry.latestComment ? truncateComment(entry.latestComment) : 'Henüz yorum yok.'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => toggleActive(entry.waiter)}
                            className="text-xs font-semibold px-3 py-2 rounded-full"
                            style={entry.waiter.active ? { background: '#dcfce7', color: '#15803d' } : { background: '#f3f4f6', color: '#6b7280' }}
                          >
                            {entry.waiter.active ? 'Aktif' : 'Pasif'}
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(entry.waiter)}
                              className="text-gray-500 hover:text-blue-500 text-xs px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors"
                            >
                              Düzenle
                            </button>
                            <button
                              onClick={() => handleDelete(entry.waiter)}
                              disabled={deletingId === entry.waiter.uid}
                              className="text-gray-500 hover:text-red-500 text-xs px-3 py-2 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                              {deletingId === entry.waiter.uid ? 'Siliniyor...' : 'Sil'}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="hidden xl:grid xl:grid-cols-[72px_1.5fr_120px_120px_150px_140px_120px_1.7fr_140px] gap-3 items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface-muted)', color: BROWN }}>
                            #{entry.rank}
                          </span>
                          {entry.rank <= 3 && <span className="text-lg">{MEDALS[entry.rank - 1]}</span>}
                        </div>

                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold shrink-0"
                            style={{ background: entry.waiter.active ? GOLD : '#9ca3af', color: entry.waiter.active ? PRIMARY_FOREGROUND : '#fff' }}
                          >
                            {entry.waiter.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate" style={{ color: BROWN }}>{entry.waiter.name}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {presence[entry.waiter.uid]?.online ? 'Çevrimiçi' : formatLastSeen(presence[entry.waiter.uid]?.lastSeen)}
                            </p>
                          </div>
                        </div>

                        <div className="font-semibold" style={{ color: GOLD }}>{formatRating(entry.avgWaiterRating)}</div>
                        <div className="text-gray-600">{entry.totalRatings}</div>
                        <div className="text-gray-600">{entry.todayCompletedCalls} / {entry.totalCompletedCalls}</div>
                        <div className="text-gray-600">{formatResponseTime(entry.avgResponseMs)}</div>
                        <div className="flex flex-col gap-2">
                          <StatusBadge active={entry.waiter.active} />
                          <OnlineBadge online={!!presence[entry.waiter.uid]?.online} />
                        </div>
                        <p className="text-sm leading-6" style={{ color: entry.latestComment ? '#4b5563' : '#9ca3af' }}>
                          {entry.latestComment ? truncateComment(entry.latestComment) : 'Henüz yorum yok.'}
                        </p>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleActive(entry.waiter)}
                            className="text-xs font-semibold px-3 py-2 rounded-full"
                            style={entry.waiter.active ? { background: '#dcfce7', color: '#15803d' } : { background: '#f3f4f6', color: '#6b7280' }}
                          >
                            {entry.waiter.active ? 'Aktif' : 'Pasif'}
                          </button>
                          <button
                            onClick={() => openEdit(entry.waiter)}
                            className="text-gray-500 hover:text-blue-500 text-xs px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors"
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleDelete(entry.waiter)}
                            disabled={deletingId === entry.waiter.uid}
                            className="text-gray-500 hover:text-red-500 text-xs px-3 py-2 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {deletingId === entry.waiter.uid ? 'Siliniyor...' : 'Sil'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {editingWaiter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingWaiter(null) }}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-bold text-lg mb-4" style={{ color: BROWN }}>Garson Düzenle</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Ad Soyad</label>
                <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">E-posta</label>
                <input type="email" className={inputCls} value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">
                  Not: E-posta değişikliği yalnızca Firestore kaydını günceller.
                </p>
              </div>
            </div>
            {editError && <p className="text-red-500 text-sm mt-3">{editError}</p>}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditingWaiter(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: '#f3f4f6', color: '#6b7280' }}
              >
                İptal
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: GOLD, color: PRIMARY_FOREGROUND }}
              >
                {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function OverviewCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 px-5 py-5 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{label}</p>
      <p className="text-2xl font-black mt-2" style={{ color: BROWN }}>{value}</p>
      <p className="text-sm text-gray-400 mt-1">{sub}</p>
    </div>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold" style={{ color: BROWN }}>{value}</p>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center"
      style={active ? { background: '#dcfce7', color: '#15803d' } : { background: '#f3f4f6', color: '#6b7280' }}
    >
      {active ? 'Aktif' : 'Pasif'}
    </span>
  )
}

function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span
      className="text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center"
      style={online ? { background: '#ecfeff', color: '#0f766e' } : { background: '#f9fafb', color: '#9ca3af' }}
    >
      {online ? 'Çevrimiçi' : 'Çevrimdışı'}
    </span>
  )
}
