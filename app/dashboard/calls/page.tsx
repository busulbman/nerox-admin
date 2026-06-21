'use client'

import { useEffect, useState } from 'react'
import { deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore'
import { useOpenCalls } from '@/components/dashboard/OpenCallsProvider'
import OrderBreakdown from '@/components/orders/OrderBreakdown'
import { completeRestaurantCall } from '@/lib/call-sync'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { getCallCompletedAt, getCallTableLabel, isOpenWaiterCallStatus, normalizeWaiterCall } from '@/lib/firestore-models'
import { getRestaurantRecentCompletedCallsQuery } from '@/lib/firestore-queries'
import { db, RESTAURANT_ID } from '@/lib/firebase'
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
  const [completedError, setCompletedError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | 'bulk' | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedCompletedIds, setSelectedCompletedIds] = useState<Set<string>>(new Set())
  const [, setTick] = useState(0)

  async function loadCompletedCalls() {
    setCompletedLoading(true)
    setCompletedError('')
    try {
      logFirestoreRead('dashboard/completed calls', RESTAURANT_ID)
      const snap = await getDocs(getRestaurantRecentCompletedCallsQuery(RESTAURANT_ID))
      setCompletedCalls(
        snap.docs
          .map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
          .sort((a, b) => getCallCompletedAt(b) - getCallCompletedAt(a))
      )
    } catch (error) {
      console.error('Tamamlanan çağrılar yüklenemedi:', error)
      setCompletedError('Tamamlanan çağrılar yüklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setCompletedLoading(false)
    }
  }

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

  function toggleCompletedSelection(callId: string) {
    setSelectedCompletedIds((current) => {
      const next = new Set(current)
      if (next.has(callId)) next.delete(callId)
      else next.add(callId)
      return next
    })
  }

  function toggleSelectAllCompleted() {
    if (selectedCompletedIds.size === completedCalls.length) {
      setSelectedCompletedIds(new Set())
      return
    }
    setSelectedCompletedIds(new Set(completedCalls.map((call) => call.id)))
  }

  async function deleteCompletedCall(call: WaiterCall) {
    const restaurantId = call.restaurantId || RESTAURANT_ID
    const confirmed = window.confirm(`Masa ${getCallTableLabel(call)} için tamamlanan çağrıyı silmek istiyor musunuz?`)
    if (!confirmed) return

    setDeleteBusyId(call.id)
    setCompletedError('')
    try {
      logFirestoreWrite('dashboard/delete completed call', { restaurantId, callId: call.id })
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'calls', call.id))
      setCompletedCalls((current) => current.filter((completedCall) => completedCall.id !== call.id))
      setSelectedCompletedIds((current) => {
        const next = new Set(current)
        next.delete(call.id)
        return next
      })
    } catch (error) {
      console.error('Tamamlanan çağrı silinemedi:', error)
      setCompletedError('Çağrı silinemedi. Lütfen tekrar deneyin.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  async function deleteSelectedCompletedCalls() {
    if (selectedCompletedIds.size === 0) return

    const confirmed = window.confirm(`${selectedCompletedIds.size} tamamlanan çağrıyı silmek istiyor musunuz?`)
    if (!confirmed) return

    const selectedIds = new Set(selectedCompletedIds)
    const callsToDelete = completedCalls.filter((call) => selectedIds.has(call.id))

    if (callsToDelete.length === 0) return

    setDeleteBusyId('bulk')
    setCompletedError('')
    try {
      const batch = writeBatch(db)
      for (const call of callsToDelete) {
        batch.delete(doc(db, 'restaurants', call.restaurantId || RESTAURANT_ID, 'calls', call.id))
      }
      logFirestoreWrite('dashboard/bulk delete completed calls', callsToDelete.map((call) => call.id))
      await batch.commit()
      setCompletedCalls((current) => current.filter((call) => !selectedIds.has(call.id)))
      setSelectedCompletedIds(new Set())
      setSelectionMode(false)
    } catch (error) {
      console.error('Toplu çağrı silme başarısız:', error)
      setCompletedError('Seçili çağrılar silinemedi. Lütfen tekrar deneyin.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  function handleTabChange(nextTab: CallsTab) {
    setTab(nextTab)
    if (nextTab === 'completed') {
      void loadCompletedCalls()
      return
    }
    setSelectionMode(false)
    setSelectedCompletedIds(new Set())
    setCompletedError('')
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
            onClick={() => handleTabChange('open')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={tab === 'open' ? { background: '#3d2b1f', color: '#fff' } : { color: '#6b7280' }}
          >
            Açık Çağrılar
            {openCalls.length > 0 ? ` (${openCalls.length})` : ''}
          </button>
          <button
            onClick={() => handleTabChange('completed')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={tab === 'completed' ? { background: '#d4a017', color: '#3d2b1f' } : { color: '#6b7280' }}
          >
            Tamamlananlar
            {completedCalls.length > 0 ? ` (${completedCalls.length})` : ''}
          </button>
        </div>
      </div>

      {tab === 'completed' && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => {
              setSelectionMode((current) => !current)
              setSelectedCompletedIds(new Set())
            }}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={selectionMode ? { background: '#d4a017', color: '#3d2b1f' } : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }}
          >
            {selectionMode ? 'Seçimi İptal' : 'Seç'}
          </button>

          {selectionMode && completedCalls.length > 0 && (
            <button
              onClick={toggleSelectAllCompleted}
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ background: '#fff', color: '#3d2b1f', border: '1px solid #e5e7eb' }}
            >
              {selectedCompletedIds.size === completedCalls.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
            </button>
          )}

          {selectionMode && selectedCompletedIds.size > 0 && (
            <button
              onClick={() => void deleteSelectedCompletedCalls()}
              disabled={deleteBusyId === 'bulk'}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#dc2626' }}
            >
              {deleteBusyId === 'bulk' ? 'Siliniyor...' : `Seçilenleri Sil (${selectedCompletedIds.size})`}
            </button>
          )}
        </div>
      )}

      {completedError && tab === 'completed' && (
        <div
          className="rounded-xl px-4 py-3 text-sm mb-5"
          style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}
        >
          {completedError}
        </div>
      )}

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
          {sortedOpenCalls.map((call) => {
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

                {call.customerName && call.tip !== 'sipariş' && (
                  <p className="text-xs text-gray-500">
                    Müşteri: <span className="font-semibold text-[#3d2b1f]">{call.customerName}</span>
                  </p>
                )}

                <OrderBreakdown call={call} />

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
            const selected = selectedCompletedIds.has(call.id)

            return (
              <div
                key={call.id}
                className="bg-white rounded-2xl border px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                style={{ borderColor: selected ? '#d4a017' : '#f3f4f6', boxShadow: selected ? '0 0 0 2px rgba(212,160,23,0.15)' : undefined }}
              >
                <div className="flex items-start gap-4">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleCompletedSelection(call.id)}
                      className="mt-3 h-4 w-4 accent-[#d4a017]"
                    />
                  )}
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
                    {call.customerName && call.tip !== 'sipariş' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Müşteri: <span className="font-semibold text-[#3d2b1f]">{call.customerName}</span>
                      </p>
                    )}
                    <OrderBreakdown call={call} className="mt-3" />
                    {call.note && <p className="text-sm text-gray-500 mt-2 italic">&quot;{call.note}&quot;</p>}
                  </div>
                </div>

                <div className="text-sm text-gray-500 md:text-right">
                  <p>{formatDate(completedAt)}</p>
                  <p className="mt-1">Toplam süre: {formatDuration(completedAt - call.createdAt)}</p>
                  {!selectionMode && (
                    <button
                      onClick={() => void deleteCompletedCall(call)}
                      disabled={deleteBusyId === call.id}
                      className="mt-3 inline-flex rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      style={{ background: '#fee2e2', color: '#b91c1c' }}
                    >
                      {deleteBusyId === call.id ? 'Siliniyor...' : 'Sil'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
