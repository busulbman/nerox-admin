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

function StatCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: typeof Clock
  color: 'amber' | 'orange' | 'green' | 'blue'
}) {
  const colors = {
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs font-medium opacity-80">{label}</p>
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
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
            <ChefHat className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mutfak Paneli</h1>
            <p className="text-sm text-gray-500">Sipariş hazırlık durumlarını yönetin</p>
          </div>
        </div>
        <button
          onClick={toggleSound}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
            soundEnabled
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          {soundEnabled ? 'Ses Açık' : 'Ses Kapalı'}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Bekliyor" value={pending.length} icon={Clock} color="amber" />
        <StatCard label="Hazırlanıyor" value={preparing.length} icon={Timer} color="orange" />
        <StatCard label="Hazır" value={ready.length} icon={CheckCircle2} color="green" />
        <StatCard label="Bugün Toplam" value={todayTotal} icon={Package} color="blue" />
      </div>

      {/* Mobile Filter */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
        {(['all', 'pending', 'preparing', 'ready', 'delivered'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setMobileFilter(status)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              mobileFilter === status
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {status === 'all' ? 'Tümü' : KITCHEN_STATUS_LABELS[status]}
            {status !== 'all' && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">
                {status === 'pending' ? pending.length :
                 status === 'preparing' ? preparing.length :
                 status === 'ready' ? ready.length : delivered.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Mobile View */}
          <div className="space-y-3 lg:hidden">
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center text-gray-500">
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
              color="amber"
              updating={updating}
              onStatusChange={updateKitchenStatus}
              currentTime={currentTime}
            />
            <KanbanColumn
              title="Hazırlanıyor"
              orders={preparing}
              color="orange"
              updating={updating}
              onStatusChange={updateKitchenStatus}
              currentTime={currentTime}
            />
            <KanbanColumn
              title="Hazır"
              orders={ready}
              color="green"
              updating={updating}
              onStatusChange={updateKitchenStatus}
              currentTime={currentTime}
            />
            <KanbanColumn
              title="Teslim Edildi"
              orders={delivered}
              color="blue"
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

function KanbanColumn({ title, orders, color, updating, onStatusChange, currentTime }: {
  title: string
  orders: WaiterCall[]
  color: 'amber' | 'orange' | 'green' | 'blue'
  updating: string | null
  onStatusChange: (order: WaiterCall, status: KitchenStatus) => void
  currentTime: number
}) {
  const headerColors = {
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
  }

  return (
    <div className="flex flex-col rounded-2xl bg-gray-100/50">
      <div className={`rounded-t-2xl border-b px-4 py-3 ${headerColors[color]}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <span className="rounded-full bg-white/50 px-2 py-0.5 text-sm font-medium">
            {orders.length}
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 320px)' }}>
        {orders.length === 0 ? (
          <div className="rounded-xl bg-white/50 p-4 text-center text-sm text-gray-400">
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

  const cardColors = {
    pending: isOverdue ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50',
    preparing: 'border-orange-200 bg-orange-50',
    ready: 'border-green-200 bg-green-50',
    delivered: 'border-gray-200 bg-white',
  }

  const nextAction = {
    pending: { label: 'Hazırlanmaya Başla', next: 'preparing' as KitchenStatus, color: 'bg-orange-500 hover:bg-orange-600' },
    preparing: { label: 'Hazır', next: 'ready' as KitchenStatus, color: 'bg-green-500 hover:bg-green-600' },
    ready: { label: 'Teslim Edildi', next: 'delivered' as KitchenStatus, color: 'bg-blue-500 hover:bg-blue-600' },
    delivered: null,
  }

  const action = nextAction[status]

  return (
    <div className={`rounded-xl border p-3 ${cardColors[status]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-lg px-2 py-1 text-sm font-bold ${
            isOverdue ? 'bg-red-500 text-white' : 'bg-white text-gray-900'
          }`}>
            Masa {order.tableNumber}
          </span>
          {isOverdue && (
            <span className="text-xs font-medium text-red-600">20+ dk</span>
          )}
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>{formatTime(order.createdAt)}</div>
          <div className="text-gray-400">{formatElapsed(order.createdAt)}</div>
        </div>
      </div>

      {/* Items */}
      <div className="mt-3 space-y-1">
        {order.groupedByCustomer ? (
          Object.entries(order.groupedByCustomer).map(([name, group]) => (
            <div key={name} className="rounded-lg bg-white/60 p-2">
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                <User className="h-3 w-3" /> {name}
              </div>
              {group.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>{item.quantity}x {item.name}</span>
                  {!compact && <span className="text-gray-500">{item.price * item.quantity} TL</span>}
                </div>
              ))}
            </div>
          ))
        ) : order.items?.map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span>{item.quantity}x {item.name}</span>
            {!compact && <span className="text-gray-500">{item.price * item.quantity} TL</span>}
          </div>
        ))}
      </div>

      {order.note && (
        <div className="mt-2 rounded-lg bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
          Not: {order.note}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2">
        <div className="text-xs text-gray-500">
          {totalItems} ürün {!compact && order.totalPrice ? `• ${order.totalPrice} TL` : ''}
        </div>
        {action && (
          <button
            onClick={() => onStatusChange(order, action.next)}
            disabled={updating}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50 ${action.color}`}
          >
            {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
