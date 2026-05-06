'use client'

import { useEffect, useState } from 'react'
import { getDocs } from 'firebase/firestore'
import { useOpenCalls } from '@/components/dashboard/OpenCallsProvider'
import { completeRestaurantCall } from '@/lib/call-sync'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { getCallCompletedAt, getCallTableLabel, isOpenWaiterCallStatus, normalizeWaiterCall } from '@/lib/firestore-models'
import { getRestaurantRecentCompletedCallsQuery } from '@/lib/firestore-queries'
import { RESTAURANT_ID } from '@/lib/firebase'
import type { WaiterCall } from '@/lib/types'

const TIP_CONFIG: Record<string, { label: string; icon: string; border: string; bg: string }> = {
  sipariş: { label: 'Sipariş', icon: '📋', border: '#fed7aa', bg: '#fff7ed' },
  hesap: { label: 'Hesap', icon: '💳', border: '#bbf7d0', bg: '#f0fdf4' },
  yardım: { label: 'Yardım', icon: '🙋', border: '#bfdbfe', bg: '#eff6ff' },
}

type CallsTab = 'open' | 'completed'

function elapsed(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff} sn`
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`
  return `${Math.floor(diff / 3600)} sa`
}

function formatDate(ts: number): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts)
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds} sn`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes} dk` : `${minutes} dk ${seconds} sn`
}

export default function CallsPage() {
  const { openCalls } = useOpenCalls()
  const [tab, setTab] = useState<CallsTab>('open')
  const [completedCalls, setCompletedCalls] = useState<WaiterCall[]>([])
  const [completedLoading, setCompletedLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (tab !== 'completed') return

    let cancelled = false

    async function loadCompletedCalls() {
      setCompletedLoading(true)
      try {
        logFirestoreRead('dashboard/completed calls', RESTAURANT_ID)
        const snap = await getDocs(getRestaurantRecentCompletedCallsQuery(RESTAURANT_ID))
        if (cancelled) return
        setCompletedCalls(
          snap.docs
            .map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
            .sort((a, b) => getCallCompletedAt(b) - getCallCompletedAt(a))
        )
      } finally {
        if (!cancelled) setCompletedLoading(false)
      }
    }

    void loadCompletedCalls()

    return () => {
      cancelled = true
    }
  }, [tab])

  useEffect(() => {
    if (tab !== 'open' || openCalls.length === 0) return

    const interval = setInterval(() => setTick((t) => t + 1), 15_000)
    return () => clearInterval(interval)
  }, [openCalls.length, tab])

  async function resolveCall(call: WaiterCall) {
    setBusyId(call.id)
    try {
      logFirestoreWrite('dashboard/complete call', { restaurantId: call.restaurantId || RESTAURANT_ID, callId: call.id })
      await completeRestaurantCall(call.restaurantId || RESTAURANT_ID, call)
    } catch (err) {
      console.error('Çağrı tamamlama hatası:', err)
    } finally {
      setBusyId(null)
    }
  }

  const sortedOpenCalls = openCalls
    .filter((call) => isOpenWaiterCallStatus(call.durum))
    .sort((a, b) => a.createdAt - b.createdAt)
  const visibleCalls = tab === 'open' ? sortedOpenCalls : completedCalls

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: '#3d2b1f' }}>Garson Çağrıları</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Açık çağrılar canlı dinlenir, tamamlananlar otomatik arşive düşer.
          </p>
        </div>

        <div className="inline-flex rounded-2xl bg-white p-1.5 border border-gray-100 shadow-sm">
          <button
            onClick={() => setTab('open')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={tab === 'open' ? { background: '#3d2b1f', color: '#fff' } : { color: '#6b7280' }}
          >
            Açık Çağrılar
            {openCalls.length > 0 ? ` (${openCalls.length})` : ''}
          </button>
          <button
            onClick={() => setTab('completed')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={tab === 'completed' ? { background: '#d4a017', color: '#3d2b1f' } : { color: '#6b7280' }}
          >
            Tamamlananlar
            {completedCalls.length > 0 ? ` (${completedCalls.length})` : ''}
          </button>
        </div>
      </div>

      {tab === 'completed' && completedLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          <div className="text-4xl mb-3 animate-pulse">🧾</div>
          <p className="text-gray-400 text-sm">Tamamlanan çağrılar yükleniyor</p>
        </div>
      ) : visibleCalls.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          <div className="text-4xl mb-3">{tab === 'open' ? '✅' : '🧾'}</div>
          <p className="text-gray-400 text-sm">
            {tab === 'open' ? 'Açık çağrı yok' : 'Henüz tamamlanan çağrı yok'}
          </p>
        </div>
      ) : tab === 'open' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {openCalls.map((call) => {
            const cfg = TIP_CONFIG[call.tip] ?? TIP_CONFIG.yardım
            return (
              <div
                key={call.id}
                className="bg-white rounded-xl p-5 flex flex-col gap-3 border-2"
                style={{ borderColor: cfg.border, background: cfg.bg }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-3xl">{cfg.icon}</span>
                    <p className="font-semibold mt-1" style={{ color: '#3d2b1f' }}>{cfg.label}</p>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block"
                      style={
                        call.durum === 'kabul edildi'
                          ? { background: '#fef3c7', color: '#a16207' }
                          : { background: '#fee2e2', color: '#dc2626' }
                      }
                    >
                      {call.durum === 'kabul edildi' ? 'Kabul Edildi' : 'Bekliyor'}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: '#3d2b1f' }}>#{getCallTableLabel(call)}</div>
                    <div className="text-gray-400 text-xs">Masa</div>
                  </div>
                </div>

                {call.waiterName && (
                  <p className="text-xs text-gray-500">
                    Garson: <span className="font-semibold text-[#3d2b1f]">{call.waiterName}</span>
                  </p>
                )}

                {call.note && <p className="text-gray-500 text-sm italic">&quot;{call.note}&quot;</p>}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400 text-xs">⏱ {elapsed(call.createdAt)} önce</span>
                  <button
                    onClick={() => resolveCall(call)}
                    disabled={busyId === call.id}
                    className="text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    style={{ background: '#22c55e' }}
                  >
                    {busyId === call.id ? 'İşleniyor...' : 'Tamamlandı ✓'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {completedCalls.map((call) => {
            const cfg = TIP_CONFIG[call.tip] ?? TIP_CONFIG.yardım
            const completedAt = getCallCompletedAt(call)

            return (
              <div
                key={call.id}
                className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: cfg.bg }}
                  >
                    {cfg.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: '#3d2b1f' }}>
                        Masa {getCallTableLabel(call)}
                      </p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#15803d' }}>
                        Tamamlandı
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {cfg.label}
                      {call.waiterName ? ` • ${call.waiterName}` : ''}
                    </p>
                    {call.note && <p className="text-sm text-gray-500 mt-2 italic">&quot;{call.note}&quot;</p>}
                  </div>
                </div>

                <div className="text-sm text-gray-500 md:text-right">
                  <p>{formatDate(completedAt)}</p>
                  <p className="mt-1">Toplam süre: {formatDuration(completedAt - call.createdAt)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
