'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDocs } from 'firebase/firestore'
import { logFirestoreRead } from '@/lib/firestore-debug'
import { getRestaurantActiveWaitersQuery } from '@/lib/firestore-queries'
import { db, RESTAURANT_ID } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import type { UserProfile } from '@/lib/types'

const BROWN = '#3d2b1f'
const GOLD = '#d4a017'
const MEDALS = ['🥇', '🥈', '🥉']

function tsToMs(ts: unknown): number {
  if (!ts) return 0
  if (typeof ts === 'number') return ts
  if (typeof (ts as { toMillis?: unknown }).toMillis === 'function') return (ts as { toMillis(): number }).toMillis()
  if (typeof (ts as { toDate?: unknown }).toDate === 'function') return (ts as { toDate(): Date }).toDate().getTime()
  return 0
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

export default function LeaderboardPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [waiters, setWaiters] = useState<UserProfile[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!user || !profile) { router.replace('/waiter/login'); return }
    if (profile.role !== 'waiter') {
      router.replace(profile.role === 'admin' ? '/dashboard' : '/waiter/login')
      return
    }
  }, [user, profile, loading, router])

  useEffect(() => {
    let cancelled = false

    async function loadWaiters() {
      logFirestoreRead('waiter/leaderboard', RESTAURANT_ID)
      const snap = await getDocs(getRestaurantActiveWaitersQuery(RESTAURANT_ID))
      if (cancelled) return
      const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile))
      list.sort((a, b) => {
        const callDiff = (b.totalCalls ?? 0) - (a.totalCalls ?? 0)
        if (callDiff !== 0) return callDiff
        return (b.avgRating ?? 0) - (a.avgRating ?? 0)
      })
      setWaiters(list)
      setDataLoading(false)
    }

    void loadWaiters()

    return () => {
      cancelled = true
    }
  }, [])

  if (loading || !profile || profile.role !== 'waiter') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f4' }}>
        <p className="text-sm animate-pulse" style={{ color: 'rgba(61,43,31,0.4)' }}>Yükleniyor...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: '#faf7f4' }}>
      <header className="sticky top-0 z-20" style={{ background: BROWN }}>
        <div className="px-5 pt-4 pb-4 flex items-center justify-between">
          <div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Varina Chocolate</p>
            <p className="font-bold text-lg leading-tight mt-0.5" style={{ color: GOLD }}>Sıralama 🏆</p>
          </div>
          <button
            onClick={() => router.replace('/waiter')}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
          >
            ← Geri
          </button>
        </div>
      </header>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {dataLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-2xl h-16 animate-pulse" style={{ border: '1px solid #f0ede9' }} />
            ))}
          </div>
        ) : waiters.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center" style={{ border: '1px solid #f0ede9' }}>
            <p className="text-gray-400 text-sm">Garson bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {waiters.map((waiter, index) => {
              const isMe = waiter.uid === profile.uid
              const medal = MEDALS[index] ?? null

              return (
                <div
                  key={waiter.uid}
                  className="rounded-2xl px-5 py-4 flex items-center gap-4"
                  style={{
                    background: isMe ? BROWN : '#fff',
                    border: `2px solid ${isMe ? GOLD : '#f0ede9'}`,
                    boxShadow: isMe ? '0 2px 12px rgba(61,43,31,0.2)' : undefined,
                  }}
                >
                  <div className="w-8 text-center shrink-0">
                    {medal ? (
                      <span className="text-xl">{medal}</span>
                    ) : (
                      <span className="text-sm font-bold" style={{ color: isMe ? 'rgba(255,255,255,0.4)' : '#d1d5db' }}>
                        {index + 1}
                      </span>
                    )}
                  </div>

                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: isMe ? GOLD : '#f0ede9', color: isMe ? BROWN : '#6b7280' }}
                  >
                    {waiter.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate" style={{ color: isMe ? GOLD : BROWN }}>
                        {waiter.name}
                      </p>
                      {isMe && (
                        <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: GOLD, color: BROWN }}>
                          Sen
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(waiter.isOnline ?? false) ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                      )}
                      <p className="text-xs" style={{ color: isMe ? 'rgba(255,255,255,0.45)' : '#9ca3af' }}>
                        {(waiter.avgRating ?? 0) > 0 ? `${waiter.avgRating!.toFixed(1)} ★` : '—'}
                        {!waiter.isOnline && waiter.lastSeen ? ` · ${formatLastSeen(waiter.lastSeen)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-xl leading-none" style={{ color: isMe ? GOLD : BROWN }}>
                      {waiter.totalCalls ?? 0}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: isMe ? 'rgba(255,255,255,0.45)' : '#9ca3af' }}>
                      çağrı
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
