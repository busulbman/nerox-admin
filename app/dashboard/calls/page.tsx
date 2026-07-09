'use client'

import { useEffect, useState } from 'react'
import { deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore'
import { CircleCheckBig, ClipboardList } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { SkeletonGrid } from '@/components/Skeleton'
import { useOpenCalls } from '@/components/dashboard/OpenCallsProvider'
import CustomerRewards from '@/components/orders/CustomerRewards'
import LoyaltyPreviewBadge from '@/components/orders/LoyaltyPreviewBadge'
import OrderBreakdown from '@/components/orders/OrderBreakdown'
import { completeRestaurantCall, markOrderPaid } from '@/lib/call-sync'
import { getCallTipUi } from '@/lib/call-tip-ui'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { getCallCompletedAt, getCallTableLabel, isOpenWaiterCallStatus, normalizeWaiterCall } from '@/lib/firestore-models'
import { getRestaurantRecentCompletedCallsQuery } from '@/lib/firestore-queries'
import { db } from '@/lib/firebase'
import type { WaiterCall } from '@/lib/types'

const PRIMARY = 'var(--primary)'
const TEXT = 'var(--text)'
const PRIMARY_FOREGROUND = 'var(--primary-foreground)'

type CallsTab = 'open' | 'completed'

function getOpenCallStatusBadge(call: WaiterCall) {
  if (call.tip === 'sipariş') {
    if (call.durum === 'bekliyor') {
      return { label: 'Garson Onayı Bekliyor', style: { background: '#fee2e2', color: '#dc2626' } }
    }
    if (call.kitchenStatus === 'pending') {
      return { label: 'Mutfağa Gönderildi', style: { background: '#fef3c7', color: '#a16207' } }
    }
    if (call.kitchenStatus === 'preparing') {
      return { label: 'Hazırlanıyor', style: { background: '#ffedd5', color: '#c2410c' } }
    }
    if (call.kitchenStatus === 'ready') {
      return { label: 'Hazır', style: { background: '#dcfce7', color: '#15803d' } }
    }
    if (call.kitchenStatus === 'delivered') {
      return { label: 'Teslim Edildi', style: { background: '#dbeafe', color: '#1d4ed8' } }
    }
  }

  return call.durum === 'kabul edildi'
    ? { label: 'Kabul Edildi', style: { background: '#fef3c7', color: '#a16207' } }
    : { label: 'Bekliyor', style: { background: '#fee2e2', color: '#dc2626' } }
}

function getPaymentBadge(call: WaiterCall) {
  if (call.tip !== 'sipariş') return null
  return call.paymentStatus === 'paid'
    ? { label: 'Ödendi', style: { background: '#d1fae5', color: '#047857' } }
    : { label: 'Ödenmedi', style: { background: '#f3f4f6', color: '#6b7280' } }
}

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
  const { user, profile } = useAuth()
  const restaurantId = profile?.restaurantId || ''
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
      if (!restaurantId) return
      logFirestoreRead('dashboard/completed calls', restaurantId)
      const snap = await getDocs(getRestaurantRecentCompletedCallsQuery(restaurantId))
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
      const actor = user && profile ? {
        uid: user.uid,
        name: profile.name || 'İşletme',
        role: profile.role as 'admin' | 'waiter',
      } : undefined

      logFirestoreWrite('dashboard/complete call', { restaurantId: call.restaurantId || restaurantId, callId: call.id })
      await completeRestaurantCall(call.restaurantId || restaurantId, call, actor)
    } catch (err) {
      console.error('Çağrı tamamlama hatası:', err)
    } finally {
      setBusyId(null)
    }
  }

  async function closeOrderPayment(call: WaiterCall) {
    if (!user || !profile) return
    setBusyId(call.id)
    try {
      logFirestoreWrite('dashboard/close order payment', { restaurantId: call.restaurantId || restaurantId, callId: call.id })
      await markOrderPaid(call.restaurantId || restaurantId, call, {
        uid: user.uid,
        name: profile.name || 'İşletme',
        role: profile.role as 'admin' | 'waiter',
      })
      if (tab === 'completed') {
        await loadCompletedCalls()
      }
    } catch (err) {
      console.error('Hesap kapatma hatası:', err)
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
    const callRestaurantId = call.restaurantId || restaurantId
    const confirmed = window.confirm(`Masa ${getCallTableLabel(call)} için tamamlanan çağrıyı silmek istiyor musunuz?`)
    if (!confirmed) return

    setDeleteBusyId(call.id)
    setCompletedError('')
    try {
      logFirestoreWrite('dashboard/delete completed call', { restaurantId: callRestaurantId, callId: call.id })
      await deleteDoc(doc(db, 'restaurants', callRestaurantId, 'calls', call.id))
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
        batch.delete(doc(db, 'restaurants', call.restaurantId || restaurantId, 'calls', call.id))
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
          <h1 className="font-bold text-2xl" style={{ color: TEXT }}>Garson Çağrıları</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Açık çağrılar canlı dinlenir, tamamlananlar otomatik arşive düşer.
          </p>
        </div>

        <div className="inline-flex rounded-2xl bg-white p-1.5 border border-gray-100 shadow-sm">
          <button
            onClick={() => handleTabChange('open')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={tab === 'open' ? { background: PRIMARY, color: PRIMARY_FOREGROUND } : { color: '#6b7280' }}
          >
            Açık Çağrılar
            {openCalls.length > 0 ? ` (${openCalls.length})` : ''}
          </button>
          <button
            onClick={() => handleTabChange('completed')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={tab === 'completed' ? { background: PRIMARY, color: PRIMARY_FOREGROUND } : { color: '#6b7280' }}
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
            style={selectionMode ? { background: PRIMARY, color: PRIMARY_FOREGROUND } : { background: '#fff', color: '#6b7280', border: '1px solid var(--border-soft)' }}
          >
            {selectionMode ? 'Seçimi İptal' : 'Seç'}
          </button>

          {selectionMode && completedCalls.length > 0 && (
            <button
              onClick={toggleSelectAllCompleted}
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ background: '#fff', color: TEXT, border: '1px solid var(--border-soft)' }}
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
        <SkeletonGrid count={6} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" />
      ) : visibleCalls.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          {tab === 'open' ? (
            <CircleCheckBig className="mx-auto mb-3 h-10 w-10 text-[var(--primary)]" />
          ) : (
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-[var(--primary)]" />
          )}
          <p className="text-gray-400 text-sm">
            {tab === 'open' ? 'Açık çağrı yok' : 'Henüz tamamlanan çağrı yok'}
          </p>
        </div>
      ) : tab === 'open' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedOpenCalls.map((call) => {
            const tipUi = getCallTipUi(call.tip)
            const TipIcon = tipUi.Icon
            const statusBadge = getOpenCallStatusBadge(call)
            const paymentBadge = getPaymentBadge(call)
            return (
              <div
                key={call.id}
                className="bg-white rounded-xl p-5 flex flex-col gap-3 border-2"
                style={{ borderColor: `${tipUi.accent}24`, background: tipUi.surface }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div
                      className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white"
                      style={{ color: tipUi.accent }}
                    >
                      <TipIcon className="h-6 w-6" />
                    </div>
                    <p className="font-semibold mt-1" style={{ color: TEXT }}>{tipUi.label}</p>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block"
                      style={statusBadge.style}
                    >
                      {statusBadge.label}
                    </span>
                    {paymentBadge && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full mt-1 ml-1 inline-block"
                        style={paymentBadge.style}
                      >
                        {paymentBadge.label}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: TEXT }}>#{getCallTableLabel(call)}</div>
                    <div className="text-gray-400 text-xs">Masa</div>
                  </div>
                </div>

                {call.waiterName && (
                  <p className="text-xs text-gray-500">
                    Garson: <span className="font-semibold text-[var(--text)]">{call.waiterName}</span>
                  </p>
                )}

                {call.customerName && call.tip !== 'sipariş' && (
                  <p className="text-xs text-gray-500">
                    Müşteri: <span className="font-semibold text-[var(--text)]">{call.customerName}</span>
                  </p>
                )}

                <OrderBreakdown call={call} />

                {call.loyaltyPreview && call.loyaltyPreview.eligible && (
                  <LoyaltyPreviewBadge preview={call.loyaltyPreview} />
                )}

                {call.customerId && user && profile && (
                  <CustomerRewards
                    restaurantId={call.restaurantId || restaurantId}
                    customerId={call.customerId}
                    customerName={call.customerName}
                    actor={{ uid: user.uid, name: profile.name || 'İşletme', role: profile.role as 'admin' | 'waiter' }}
                  />
                )}

                {call.note && <p className="text-gray-500 text-sm italic">&quot;{call.note}&quot;</p>}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400 text-xs">⏱ {elapsed(call.createdAt)} önce</span>
                  {call.tip === 'sipariş' ? (
                    <button
                      onClick={() => closeOrderPayment(call)}
                      disabled={busyId === call.id}
                      className="text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      style={{ background: '#22c55e' }}
                    >
                      {busyId === call.id ? 'İşleniyor...' : 'Hesap Ödendi ✓'}
                    </button>
                  ) : (
                    <button
                      onClick={() => resolveCall(call)}
                      disabled={busyId === call.id}
                      className="text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      style={{ background: '#22c55e' }}
                    >
                      {busyId === call.id ? 'İşleniyor...' : 'Tamamlandı ✓'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {completedCalls.map((call) => {
            const tipUi = getCallTipUi(call.tip)
            const TipIcon = tipUi.Icon
            const completedAt = getCallCompletedAt(call)
            const selected = selectedCompletedIds.has(call.id)
            const paymentBadge = getPaymentBadge(call)
            const needsPayment = call.tip === 'sipariş' && call.paymentStatus !== 'paid'

            return (
              <div
                key={call.id}
                className="bg-white rounded-2xl border px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                style={{ borderColor: selected ? PRIMARY : 'var(--border-soft)', boxShadow: selected ? '0 0 0 2px var(--primary-soft)' : undefined }}
              >
                <div className="flex items-start gap-4">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleCompletedSelection(call.id)}
                      className="mt-3 h-4 w-4"
                      style={{ accentColor: PRIMARY }}
                    />
                  )}
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ background: tipUi.surface, color: tipUi.accent }}
                  >
                    <TipIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: TEXT }}>
                        Masa {getCallTableLabel(call)}
                      </p>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#15803d' }}>
                        Tamamlandı
                      </span>
                      {paymentBadge && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={paymentBadge.style}>
                          {paymentBadge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {tipUi.label}
                      {call.waiterName ? ` • ${call.waiterName}` : ''}
                    </p>
                    {call.customerName && call.tip !== 'sipariş' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Müşteri: <span className="font-semibold text-[var(--text)]">{call.customerName}</span>
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
                    <div className="mt-3 flex gap-2 md:justify-end">
                      {needsPayment && (
                        <button
                          onClick={() => void closeOrderPayment(call)}
                          disabled={busyId === call.id}
                          className="inline-flex rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: '#22c55e' }}
                        >
                          {busyId === call.id ? 'İşleniyor...' : 'Hesap Ödendi ✓'}
                        </button>
                      )}
                      <button
                        onClick={() => void deleteCompletedCall(call)}
                        disabled={deleteBusyId === call.id}
                        className="inline-flex rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        style={{ background: '#fee2e2', color: '#b91c1c' }}
                      >
                        {deleteBusyId === call.id ? 'Siliniyor...' : 'Sil'}
                      </button>
                    </div>
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
