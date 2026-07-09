'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import {
  Bell,
  BellOff,
  ChefHat,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  Timer,
  User,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { FeatureLockedPage } from '@/components/FeatureGate'
import { useFeatures } from '@/lib/use-features'
import { normalizeWaiterCall } from '@/lib/firestore-models'
import { db } from '@/lib/firebase'
import type { WaiterCall, KitchenStatus } from '@/lib/types'
import { KITCHEN_STATUS_LABELS } from '@/lib/types'

const TWENTY_MINUTES_MS = 20 * 60 * 1000

const STORAGE_KEY_SOUND = 'kitchen-sound-enabled'
const STORAGE_KEY_NOTIFIED = 'kitchen-notified-orders'

function getStoredSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(STORAGE_KEY_SOUND) !== 'false'
}

function setStoredSoundEnabled(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY_SOUND, String(enabled))
}

function getNotifiedOrders(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  const stored = localStorage.getItem(STORAGE_KEY_NOTIFIED)
  if (!stored) return new Set()
  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) return new Set(parsed)
  } catch {
    // ignore
  }
  return new Set()
}

function addNotifiedOrder(orderId: string) {
  const set = getNotifiedOrders()
  set.add(orderId)
  const arr = Array.from(set).slice(-100)
  localStorage.setItem(STORAGE_KEY_NOTIFIED, JSON.stringify(arr))
}

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    gainNode.gain.value = 0.3

    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.15)

    setTimeout(() => {
      const osc2 = audioContext.createOscillator()
      const gain2 = audioContext.createGain()
      osc2.connect(gain2)
      gain2.connect(audioContext.destination)
      osc2.frequency.value = 1000
      osc2.type = 'sine'
      gain2.gain.value = 0.3
      osc2.start()
      osc2.stop(audioContext.currentTime + 0.15)
    }, 180)
  } catch {
    // Audio not available
  }
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function formatElapsed(createdAt: number) {
  const diff = Date.now() - createdAt
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Az önce'
  if (minutes < 60) return `${minutes} dk`
  const hours = Math.floor(minutes / 60)
  return `${hours} saat ${minutes % 60} dk`
}

function getKitchenStatus(call: WaiterCall): KitchenStatus | null {
  return call.kitchenStatus === 'pending' ||
    call.kitchenStatus === 'preparing' ||
    call.kitchenStatus === 'ready' ||
    call.kitchenStatus === 'delivered'
    ? call.kitchenStatus
    : null
}

function isKitchenVisibleOrder(call: WaiterCall) {
  return call.tip === 'sipariş' && getKitchenStatus(call) !== null
}

// Small neutral status dot colors — used only as tiny indicators, not as card
// backgrounds, so the panel stays on the dashboard's neutral design language.
const KITCHEN_STATUS_DOT: Record<KitchenStatus, string> = {
  pending: '#f59e0b',
  preparing: '#3b82f6',
  ready: '#10b981',
  delivered: '#94a3b8',
}

function StatCard({ label, value, icon: Icon, dotColor }: {
  label: string
  value: number
  icon: typeof Clock
  dotColor?: string
}) {
  return (
    <div
      className="rounded-2xl border p-4 shadow-sm"
      style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</p>
          <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--muted)' }}>
            {dotColor && <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />}
            {label}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function KitchenPage() {
  const { user, profile } = useAuth()
  const restaurantId = profile?.restaurantId || ''
  const { restaurant } = useRestaurantSettingsContext()
  const features = useFeatures(restaurant)

  const [orders, setOrders] = useState<WaiterCall[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(() => getStoredSoundEnabled())
  const [mobileFilter, setMobileFilter] = useState<KitchenStatus | 'all'>('all')
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const notifiedRef = useRef<Set<string>>(new Set())
  const kitchenEnabled = features.kitchen

  useEffect(() => {
    notifiedRef.current = getNotifiedOrders()
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!restaurantId) return

    const callsRef = collection(db, 'restaurants', restaurantId, 'calls')
    const kitchenStatuses: KitchenStatus[] = ['pending', 'preparing', 'ready', 'delivered']

    const processSnapshot = (snapshot: import('firebase/firestore').QuerySnapshot) => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStart = today.getTime()
      const nextOrders = snapshot.docs
        .map((docSnap) => normalizeWaiterCall(docSnap.id, docSnap.data() as Record<string, unknown>))
        .filter((call) => isKitchenVisibleOrder(call))
        .sort((a, b) => a.createdAt - b.createdAt)

      if (soundEnabled) {
        const newPending = nextOrders.filter(
          (order) =>
            order.createdAt >= todayStart &&
            getKitchenStatus(order) === 'pending' &&
            !notifiedRef.current.has(order.id)
        )
        if (newPending.length > 0) {
          playNotificationSound()
          newPending.forEach((order) => {
            notifiedRef.current.add(order.id)
            addNotifiedOrder(order.id)
          })
        }
      }

      setOrders(nextOrders)
      setLoading(false)
    }

    let activeUnsubscribe: (() => void) | null = null

    const subscribe = (preferKitchenQuery: boolean) => {
      const activeQuery = preferKitchenQuery
        ? query(callsRef, where('tip', '==', 'sipariş'), where('kitchenStatus', 'in', kitchenStatuses))
        : query(callsRef, where('tip', '==', 'sipariş'))

      activeUnsubscribe = onSnapshot(
        activeQuery,
        processSnapshot,
        (error) => {
          if (preferKitchenQuery && error.code === 'failed-precondition') {
            console.warn('Kitchen query index eksik. Tip bazlı sorguya geri düşüldü.', error)
            if (activeUnsubscribe) {
              activeUnsubscribe()
              activeUnsubscribe = null
            }
            subscribe(false)
            return
          }
          console.error('Kitchen orders listener error:', error)
          setLoading(false)
        }
      )
    }

    subscribe(true)
    return () => {
      if (activeUnsubscribe) activeUnsubscribe()
    }
  }, [restaurantId, soundEnabled])

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      setStoredSoundEnabled(next)
      return next
    })
  }, [])

  const updateKitchenStatus = useCallback(async (order: WaiterCall, newStatus: KitchenStatus) => {
    if (!restaurantId || !user || !profile) return

    setUpdating(order.id)

    try {
      const callRef = doc(db, 'restaurants', restaurantId, 'calls', order.id)
      const updates: Record<string, unknown> = {
        kitchenStatus: newStatus,
        kitchenUpdatedById: user.uid,
        kitchenUpdatedByName: profile.name || 'Admin',
      }

      if (newStatus === 'preparing') {
        updates.preparingAt = Date.now()
      } else if (newStatus === 'ready') {
        updates.readyAt = Date.now()
      } else if (newStatus === 'delivered') {
        updates.deliveredAt = Date.now()
      }

      await updateDoc(callRef, updates)
    } catch (error) {
      console.error('Kitchen status update error:', error)
    } finally {
      setUpdating(null)
    }
  }, [restaurantId, user, profile])

  const todayOrders = useMemo(() => {
    const today = new Date(currentTime)
    today.setHours(0, 0, 0, 0)
    return orders.filter((order) => order.createdAt >= today.getTime())
  }, [currentTime, orders])

  const { pending, preparing, ready, delivered, todayTotal } = useMemo(() => {
    return {
      pending: todayOrders.filter((o) => getKitchenStatus(o) === 'pending'),
      preparing: todayOrders.filter((o) => getKitchenStatus(o) === 'preparing'),
      ready: todayOrders.filter((o) => getKitchenStatus(o) === 'ready'),
      delivered: todayOrders.filter((o) => getKitchenStatus(o) === 'delivered'),
      todayTotal: todayOrders.length,
    }
  }, [todayOrders])

  const filteredOrders = useMemo(() => {
    if (mobileFilter === 'all') return todayOrders
    return todayOrders.filter((o) => getKitchenStatus(o) === mobileFilter)
  }, [todayOrders, mobileFilter])

  if (!kitchenEnabled) {
    return <FeatureLockedPage feature="kitchen" />
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: 'var(--page-bg)' }}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          >
            <ChefHat className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Mutfak Paneli</h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Sipariş hazırlık durumlarını yönetin</p>
          </div>
        </div>
        <button
          onClick={toggleSound}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition"
          style={
            soundEnabled
              ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' }
              : { background: 'var(--surface)', color: 'var(--muted)', borderColor: 'var(--border-soft)' }
          }
        >
          {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          {soundEnabled ? 'Ses Açık' : 'Ses Kapalı'}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Bekliyor" value={pending.length} icon={Clock} dotColor={KITCHEN_STATUS_DOT.pending} />
        <StatCard label="Hazırlanıyor" value={preparing.length} icon={Timer} dotColor={KITCHEN_STATUS_DOT.preparing} />
        <StatCard label="Hazır" value={ready.length} icon={CheckCircle2} dotColor={KITCHEN_STATUS_DOT.ready} />
        <StatCard label="Bugün Toplam" value={todayTotal} icon={Package} />
      </div>

      {/* Mobile Filter */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {(['all', 'pending', 'preparing', 'ready', 'delivered'] as const).map((status) => {
          const active = mobileFilter === status
          return (
            <button
              key={status}
              onClick={() => setMobileFilter(status)}
              className="shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition"
              style={
                active
                  ? { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' }
                  : { background: 'var(--surface)', color: 'var(--muted)', borderColor: 'var(--border-soft)' }
              }
            >
              {status === 'all' ? 'Tümü' : KITCHEN_STATUS_LABELS[status]}
              {status !== 'all' && (
                <span className="ml-1.5 rounded-full px-1.5 text-xs" style={{ background: active ? 'rgba(255,255,255,0.22)' : 'var(--surface-muted)' }}>
                  {status === 'pending' ? pending.length :
                   status === 'preparing' ? preparing.length :
                   status === 'ready' ? ready.length : delivered.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <KitchenSkeleton />
      ) : (
        <>
          {/* Mobile View */}
          <div className="space-y-3 lg:hidden">
            {filteredOrders.length === 0 ? (
              <div
                className="rounded-2xl border p-8 text-center text-sm shadow-sm"
                style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)', color: 'var(--muted)' }}
              >
                Sipariş bulunamadı
              </div>
            ) : (
              filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  updating={updating === order.id}
                  onStatusChange={updateKitchenStatus}
                  currentTime={currentTime}
                />
              ))
            )}
          </div>

          {/* Desktop Kanban View */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4">
            <KanbanColumn
              title="Bekliyor"
              orders={pending}
              dotColor={KITCHEN_STATUS_DOT.pending}
              updating={updating}
              onStatusChange={updateKitchenStatus}
              currentTime={currentTime}
            />
            <KanbanColumn
              title="Hazırlanıyor"
              orders={preparing}
              dotColor={KITCHEN_STATUS_DOT.preparing}
              updating={updating}
              onStatusChange={updateKitchenStatus}
              currentTime={currentTime}
            />
            <KanbanColumn
              title="Hazır"
              orders={ready}
              dotColor={KITCHEN_STATUS_DOT.ready}
              updating={updating}
              onStatusChange={updateKitchenStatus}
              currentTime={currentTime}
            />
            <KanbanColumn
              title="Teslim Edildi"
              orders={delivered}
              dotColor={KITCHEN_STATUS_DOT.delivered}
              updating={updating}
              onStatusChange={updateKitchenStatus}
              currentTime={currentTime}
            />
          </div>
        </>
      )}
    </div>
  )
}

function KanbanColumn({ title, orders, dotColor, updating, onStatusChange, currentTime }: {
  title: string
  orders: WaiterCall[]
  dotColor: string
  updating: string | null
  onStatusChange: (order: WaiterCall, status: KitchenStatus) => void
  currentTime: number
}) {
  return (
    <div
      className="flex flex-col rounded-2xl border shadow-sm"
      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border-soft)' }}
    >
      <div className="rounded-t-2xl border-b px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold" style={{ color: 'var(--text)' }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: dotColor }} />
            {title}
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-sm font-medium"
            style={{ background: 'var(--surface)', color: 'var(--muted)' }}
          >
            {orders.length}
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        {orders.length === 0 ? (
          <div className="rounded-xl p-4 text-center text-sm" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
            Sipariş yok
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              updating={updating === order.id}
              onStatusChange={onStatusChange}
              compact
              currentTime={currentTime}
            />
          ))
        )}
      </div>
    </div>
  )
}

function OrderCard({ order, updating, onStatusChange, compact = false, currentTime }: {
  order: WaiterCall
  updating: boolean
  onStatusChange: (order: WaiterCall, status: KitchenStatus) => void
  compact?: boolean
  currentTime: number
}) {
  const status = getKitchenStatus(order)
  if (!status) return null
  const isOverdue = status === 'pending' && (currentTime - order.createdAt) > TWENTY_MINUTES_MS
  const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0

  const nextAction = {
    pending: { label: 'Hazırlanmaya Başla', next: 'preparing' as KitchenStatus },
    preparing: { label: 'Hazır', next: 'ready' as KitchenStatus },
    ready: { label: 'Teslim Edildi', next: 'delivered' as KitchenStatus },
    delivered: null,
  }

  const action = nextAction[status]

  return (
    <div
      className="rounded-xl border p-3 shadow-sm"
      style={{
        background: 'var(--surface)',
        // Overdue orders keep a functional red accent; everything else is neutral.
        borderColor: isOverdue ? '#fca5a5' : 'var(--border-soft)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold"
            style={{ background: 'var(--surface-muted)', color: 'var(--text)' }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: isOverdue ? '#ef4444' : KITCHEN_STATUS_DOT[status] }} />
            Masa {order.tableNumber}
          </span>
          {isOverdue && (
            <span className="text-xs font-medium" style={{ color: '#dc2626' }}>20+ dk</span>
          )}
        </div>
        <div className="text-right text-xs" style={{ color: 'var(--muted)' }}>
          <div>{formatTime(order.createdAt)}</div>
          <div style={{ opacity: 0.8 }}>{formatElapsed(order.createdAt)}</div>
        </div>
      </div>

      {/* Items */}
      <div className="mt-3 space-y-1" style={{ color: 'var(--text)' }}>
        {order.groupedByCustomer ? (
          Object.entries(order.groupedByCustomer).map(([name, group]) => (
            <div key={name} className="rounded-lg p-2" style={{ background: 'var(--surface-muted)' }}>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--muted)' }}>
                <User className="h-3 w-3" /> {name}
              </div>
              {group.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>{item.quantity}x {item.name}</span>
                  {!compact && <span style={{ color: 'var(--muted)' }}>{item.price * item.quantity} TL</span>}
                </div>
              ))}
            </div>
          ))
        ) : order.items?.map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span>{item.quantity}x {item.name}</span>
            {!compact && <span style={{ color: 'var(--muted)' }}>{item.price * item.quantity} TL</span>}
          </div>
        ))}
      </div>

      {order.note && (
        <div className="mt-2 rounded-lg px-2 py-1 text-xs" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
          Not: {order.note}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          {totalItems} ürün {!compact && order.totalPrice ? `• ${order.totalPrice} TL` : ''}
        </div>
        {action && (
          <button
            onClick={() => onStatusChange(order, action.next)}
            disabled={updating}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

function KitchenSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-4">
      {Array.from({ length: 4 }).map((_, colIdx) => (
        <div
          key={colIdx}
          className="flex flex-col rounded-2xl border shadow-sm"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border-soft)' }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
            <div className="h-4 w-24 animate-pulse rounded" style={{ background: 'var(--surface-hover)' }} />
          </div>
          <div className="space-y-3 p-3">
            {Array.from({ length: 2 }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="rounded-xl border p-3 shadow-sm"
                style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="h-6 w-20 animate-pulse rounded-lg" style={{ background: 'var(--surface-hover)' }} />
                  <div className="h-4 w-12 animate-pulse rounded" style={{ background: 'var(--surface-hover)' }} />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded" style={{ background: 'var(--surface-hover)' }} />
                  <div className="h-4 w-2/3 animate-pulse rounded" style={{ background: 'var(--surface-hover)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
