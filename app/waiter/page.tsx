'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  addDoc, collection, doc, getDocs, onSnapshot,
  runTransaction, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore'
import { ref as dbRef, set as dbSet, onDisconnect as dbOnDisconnect, onValue, serverTimestamp as rtdbServerTimestamp } from 'firebase/database'
import { signOut } from 'firebase/auth'
import { Armchair, Bell, CircleCheckBig, ClipboardList, Clock3, LogOut, Minus, Plus, Trophy, UtensilsCrossed, X } from 'lucide-react'
import { auth, db, rd, rtdb } from '@/lib/firebase'
import { completeRestaurantCall } from '@/lib/call-sync'
import { useAuth } from '@/components/AuthProvider'
import CallCard from '@/components/waiter/CallCard'
import ProfilePhotoPicker from '@/components/ProfilePhotoPicker'
import UserAvatar from '@/components/UserAvatar'
import {
  getRestaurantOpenCallsQuery,
  getMenuCategoriesQuery,
  getMenuProductsQuery,
  getRestaurantRecentCompletedCallsQuery,
  getRestaurantTablesQuery,
  getWaiterRecentRatingsQuery,
} from '@/lib/firestore-queries'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import {
  getCallCompletedAt, getCallTableLabel, normalizeRating, normalizeTable, normalizeWaiterCall,
} from '@/lib/firestore-models'
import type { Category, Product, Rating, Table, TableStatus, WaiterCall } from '@/lib/types'
import { requestPermission, showNotification } from '@/lib/notifications'
import {
  initializeAudioWithUserInteraction,
  isAudioEnabled,
  isAudioInitialized,
  playNotificationSound,
  setAudioEnabled,
} from '@/lib/audio-notification'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import {
  DEFAULT_PRIMARY_COLOR,
  resolveRestaurantBusinessName,
} from '@/lib/restaurant-settings'
import { isImgBbConfigured, uploadImageToImgBB } from '@/lib/imgbb'
import LoadingScreen from '@/components/LoadingScreen'
import { buildThemePalette, buildThemeStyleVars } from '@/lib/ui-theme'

type Section = 'pending' | 'active' | 'done'
type Tab = 'calls' | 'menu' | 'tables'
type OrderStep = 'table' | 'products' | 'confirm'
type OrderCartItem = {
  productId: string
  name: string
  price: number
  quantity: number
}

const DEFAULT_BROWN = DEFAULT_PRIMARY_COLOR
const DEFAULT_GOLD = 'var(--primary-soft)'

const TABLE_STATUS_LABEL: Record<string, string> = {
  boş: 'Boş', aktif: 'Aktif', 'çağrı var': 'Çağrı Var',
  'hesap istendi': 'Hesap', temizlik: 'Temizlik', kapalı: 'Kapalı',
}
const TABLE_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  boş:             { bg: 'var(--surface-muted)', text: 'var(--muted)' },
  aktif:           { bg: 'var(--success-soft)', text: 'var(--success)' },
  'çağrı var':     { bg: 'var(--warning-soft)', text: 'var(--warning)' },
  'hesap istendi': { bg: 'var(--info-soft)', text: 'var(--info)' },
  temizlik:        { bg: 'var(--primary-soft)', text: 'var(--primary)' },
  kapalı:          { bg: 'var(--error-soft)', text: 'var(--error)' },
}

function getTodayStartTs() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime()
}

function averageNumber(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function resolveStoredAverageRating(profile: { averageRating?: number | null; avgRating?: number } | null) {
  if (!profile) return null
  if (typeof profile.averageRating === 'number' && Number.isFinite(profile.averageRating)) {
    return profile.averageRating
  }
  if (typeof profile.avgRating === 'number' && Number.isFinite(profile.avgRating)) {
    return profile.avgRating
  }
  return null
}

function formatDate(ts: number): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts)
}

function createSessionId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Math.random().toString(16).slice(2)}-${Date.now()}`
}

export default function WaiterPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const restaurantId = profile?.restaurantId || ''
  const { settings: restaurantSettings } = useRestaurantSettings(restaurantId)

  const themePalette = buildThemePalette(restaurantSettings?.primaryColor)
  const themeVars = buildThemeStyleVars(themePalette.primary)
  const BROWN = themePalette.primary
  const PRIMARY_FOREGROUND = themePalette.primaryForeground
  const GOLD = themePalette.primarySoft
  const TEXT = themePalette.text
  const SURFACE_MUTED = themePalette.surfaceMuted
  const BORDER_SOFT = themePalette.borderSoft
  const businessName = resolveRestaurantBusinessName(restaurantSettings)
  const panelTitle = `${businessName} Garson Paneli`
  const tableDocRef = (tableId: string) => rd(restaurantId, 'tables', tableId)

  const [activeTab,  setActiveTab]  = useState<Tab>('calls')
  const [openSection, setOpenSection] = useState<Section>('pending')

  // Calls
  const [pending, setPending]   = useState<WaiterCall[]>([])
  const [active,  setActive]    = useState<WaiterCall[]>([])
  const [done,    setDone]      = useState<WaiterCall[]>([])
  const [myRatings, setMyRatings] = useState<Rating[]>([])
  const [callBusyId, setCallBusyId] = useState<string | null>(null)
  const [callError, setCallError] = useState('')
  const [, setTick] = useState(0)

  // Menu
  const [categories, setCategories] = useState<Category[]>([])
  const [products,   setProducts]   = useState<Product[]>([])
  const [activeCat,  setActiveCat]  = useState<string | null>(null)
  const [loadedMenuRestaurantId, setLoadedMenuRestaurantId] = useState<string | null>(null)

  // Tables
  const [tables,       setTables]       = useState<Table[]>([])
  const [tablesLoaded, setTablesLoaded] = useState(false)
  const [tablesBusy,   setTablesBusy]   = useState<string | null>(null)
  const [tablesMsg,    setTablesMsg]    = useState('')
  const [profileDraftName, setProfileDraftName] = useState<string | null>(null)
  const [profileDraftPhotoUrl, setProfileDraftPhotoUrl] = useState<string | null | undefined>(undefined)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false)
  const [profileFeedback, setProfileFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  // Connection status for resilience
  const [connectionLost, setConnectionLost] = useState(false)

  // Audio notification state - use lazy initialization
  const [audioEnabled, setAudioEnabledState] = useState(() => {
    if (typeof window === 'undefined') return false
    return isAudioEnabled()
  })
  const [audioInitialized, setAudioInitializedState] = useState(() => {
    if (typeof window === 'undefined') return false
    return isAudioInitialized()
  })

  // Manual order creation
  const [orderModal, setOrderModal] = useState(false)
  const [orderStep, setOrderStep] = useState<OrderStep>('table')
  const [selectedOrderTable, setSelectedOrderTable] = useState<Table | null>(null)
  const [orderCart, setOrderCart] = useState<OrderCartItem[]>([])
  const [orderSending, setOrderSending] = useState(false)
  const [orderActiveCat, setOrderActiveCat] = useState<string | null>(null)

  const prevPendingIds    = useRef<Set<string>>(new Set())
  const callsInitialized  = useRef(false)
  const profilePhotoUploadEnabled = isImgBbConfigured()

  // ─── Notification permission ──────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter') return
    requestPermission()
  }, [profile])

  // ─── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (!user || !profile) { router.replace('/waiter/login'); return }
    if (profile.role !== 'waiter') {
      router.replace(profile.role === 'super_admin' ? '/super-admin' : profile.role === 'admin' ? '/dashboard' : '/waiter/login'); return
    }
    if (profile.active === false) { router.replace('/waiter/login'); return }
  }, [user, profile, loading, router])

  // ─── RTDB presence system ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !profile || profile.role !== 'waiter' || !restaurantId || !rtdb) return

    const uid = user.uid
    const waiterName = profile.name
    const presenceRef = dbRef(rtdb, `presence/${restaurantId}/waiters/${uid}`)
    const connectedRef = dbRef(rtdb, '.info/connected')

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return

      dbOnDisconnect(presenceRef).set({
        online: false,
        name: waiterName,
        lastSeen: rtdbServerTimestamp(),
      }).then(() => {
        dbSet(presenceRef, {
          online: true,
          name: waiterName,
          lastSeen: rtdbServerTimestamp(),
        })
      }).catch((err) => console.error('RTDB presence error:', err))
    })

    return () => unsubscribe()
  }, [profile, restaurantId, user])

  async function fetchDoneCalls(waiterId: string, restaurantId: string) {
    const snap = await getDocs(getRestaurantRecentCompletedCallsQuery(restaurantId))
    return snap.docs
      .map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
      .filter((call) => call.waiterId === waiterId)
      .sort((a, b) => getCallCompletedAt(b) - getCallCompletedAt(a))
  }

  // ─── Open calls listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter' || !restaurantId) return

    const currentProfile = profile

    function processSnapshot(snap: import('firebase/firestore').QuerySnapshot) {
      setConnectionLost(false)
      console.log('[WAITER DEBUG] Received calls snapshot, count:', snap.docs.length)
      const all = snap.docs.map((d) => normalizeWaiterCall(d.id, d.data() as Record<string, unknown>))
      const pendingList = all.filter((c) => c.durum === 'bekliyor').sort((a, b) => a.createdAt - b.createdAt)

      if (callsInitialized.current) {
        const tips: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }
        let hasNewCall = false
        for (const call of pendingList) {
          if (!prevPendingIds.current.has(call.id)) {
            hasNewCall = true
            showNotification('Yeni çağrı', `Masa ${getCallTableLabel(call)} — ${tips[call.tip] ?? call.tip}`, '/waiter')
          }
        }
        if (hasNewCall) {
          void playNotificationSound()
        }
      }
      callsInitialized.current = true
      prevPendingIds.current = new Set(pendingList.map((c) => c.id))

      setPending(pendingList)
      setActive(all.filter((c) => c.durum === 'kabul edildi' && c.waiterId === currentProfile.uid).sort((a, b) => a.createdAt - b.createdAt))
    }

    function handleSnapshotError(error: Error) {
      console.error('Firestore bağlantı hatası:', error)
      setConnectionLost(true)
    }

    logFirestoreRead('waiter/open calls listener', restaurantId)
    const unsubscribe = onSnapshot(
      getRestaurantOpenCallsQuery(restaurantId),
      processSnapshot,
      handleSnapshotError
    )

    return () => {
      unsubscribe()
    }
  }, [profile, restaurantId])

  // ─── Ratings listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter' || activeTab !== 'calls' || !restaurantId) return

    const currentProfile = profile
    let cancelled = false

    async function loadMyRatings() {
      logFirestoreRead('waiter/ratings', { restaurantId, waiterId: currentProfile.uid })
      const snap = await getDocs(getWaiterRecentRatingsQuery(restaurantId, currentProfile.uid))
      if (cancelled) return
      setMyRatings(
        snap.docs
          .map((d) => normalizeRating(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => b.createdAt - a.createdAt)
      )
    }

    void loadMyRatings()

    return () => {
      cancelled = true
    }
  }, [activeTab, profile, restaurantId])

  // ─── Done calls on demand ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter' || activeTab !== 'calls' || !restaurantId) return

    const currentProfile = profile
    let cancelled = false

    async function loadDoneCalls() {
      const allCompleted = await fetchDoneCalls(currentProfile.uid, restaurantId)
      if (cancelled) return
      setDone(allCompleted.filter((call) => getCallCompletedAt(call) >= getTodayStartTs()))
    }

    void loadDoneCalls()

    return () => {
      cancelled = true
    }
  }, [activeTab, profile, restaurantId])

  // ─── Tables listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter' || activeTab !== 'tables' || !restaurantId) return

    let cancelled = false

    async function loadTables() {
      setTablesLoaded(false)
      try {
        logFirestoreRead('waiter/tables', restaurantId)
        const snap = await getDocs(getRestaurantTablesQuery(restaurantId))
        if (cancelled) return
        setTables(
          snap.docs
            .map((d) => normalizeTable(d.id, d.data() as Record<string, unknown>))
            .sort((a, b) => a.number - b.number)
        )
      } catch (err) {
        console.error('Tables load error:', err)
      } finally {
        if (!cancelled) setTablesLoaded(true)
      }
    }

    void loadTables()

    return () => {
      cancelled = true
    }
  }, [activeTab, profile, restaurantId])

  // ─── Menu loader (once) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || !restaurantId || loadedMenuRestaurantId === restaurantId) return

    const currentRestaurantId = restaurantId

    async function loadMenu() {
      const [catSnap, prodSnap] = await Promise.all([
        getDocs(getMenuCategoriesQuery(currentRestaurantId)),
        getDocs(getMenuProductsQuery(currentRestaurantId)),
      ])
      const cats = catSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
      setCategories(cats)
      setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)))
      setActiveCat(cats[0]?.id ?? null)
      setLoadedMenuRestaurantId(currentRestaurantId)
    }
    loadMenu().catch(() => {})
  }, [loadedMenuRestaurantId, profile, restaurantId])

  // ─── Tick for elapsed times ───────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'calls' || (pending.length === 0 && active.length === 0 && done.length === 0)) return

    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [active.length, activeTab, done.length, pending.length])

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function acceptCall(call: WaiterCall) {
    if (!profile || !restaurantId) return
    setCallBusyId(call.id)
    setCallError('')
    try {
      const waiterAverageRatingSnapshot = resolveStoredAverageRating(profile)
      logFirestoreWrite('waiter/accept call', { restaurantId, callId: call.id })

      const batch = writeBatch(db)

      // Update call status
      batch.update(doc(db, 'restaurants', restaurantId, 'calls', call.id), {
        durum: 'kabul edildi',
        status: 'accepted',
        waiterId: profile.uid,
        waiterName: profile.name,
        waiterPhotoUrl: profile.photoUrl ?? null,
        waiterAverageRating: waiterAverageRatingSnapshot,
        acceptedAt: serverTimestamp(),
      })

      // Update table status to aktif (garson kabul etti, çağrı artık işleniyor)
      if (call.tableId) {
        batch.update(tableDocRef(call.tableId), {
          status: 'aktif' as TableStatus,
          updatedAt: serverTimestamp(),
        })
      }

      await batch.commit()
      setOpenSection('active')
    } catch (err) {
      console.error('Çağrı kabul hatası:', err)
      setCallError(err instanceof Error ? err.message : 'Çağrı kabul edilemedi.')
    } finally {
      setCallBusyId(null)
    }
  }

  async function completeCall(call: WaiterCall) {
    if (!profile || !restaurantId) return
    setCallBusyId(call.id)
    setCallError('')
    try {
      logFirestoreWrite('waiter/complete call', { restaurantId, callId: call.id })
      await completeRestaurantCall(restaurantId, call, {
        uid: profile.uid,
        name: profile.name,
        role: 'waiter',
      })
      setActive((current) => current.filter((activeCall) => activeCall.id !== call.id))
      if (activeTab === 'calls' && openSection === 'done') {
        const allCompleted = await fetchDoneCalls(profile.uid, restaurantId)
        setDone(allCompleted.filter((doneCall) => getCallCompletedAt(doneCall) >= getTodayStartTs()))
      }
    } catch (err) {
      console.error('Çağrı tamamlama hatası:', err)
      setCallError(err instanceof Error ? err.message : 'Çağrı tamamlanamadı.')
    } finally {
      setCallBusyId(null)
    }
  }

  async function handleProfilePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setProfilePhotoUploading(true)
    setProfileFeedback(null)

    try {
      const result = await uploadImageToImgBB(file)
      if (!result.success) {
        setProfileFeedback({ tone: 'error', text: result.error })
        return
      }

      setProfileDraftPhotoUrl(result.url)
    } finally {
      setProfilePhotoUploading(false)
    }
  }

  async function saveProfile() {
    if (!profile) return

    const nextName = (profileDraftName ?? profile.name).trim()
    const nextPhotoUrl = profileDraftPhotoUrl !== undefined ? profileDraftPhotoUrl : (profile.photoUrl ?? null)

    if (!nextName) {
      setProfileFeedback({ tone: 'error', text: 'Ad alanı boş bırakılamaz.' })
      return
    }

    setProfileSaving(true)
    setProfileFeedback(null)

    try {
      logFirestoreWrite('waiter/update profile', profile.uid)
      await updateDoc(doc(db, 'users', profile.uid), {
        name: nextName,
        photoUrl: nextPhotoUrl ?? null,
        updatedAt: serverTimestamp(),
      })
      setProfileDraftName(null)
      setProfileDraftPhotoUrl(undefined)
      setProfileFeedback({ tone: 'success', text: 'Profiliniz güncellendi.' })
    } catch (error) {
      console.error('Waiter profile update error:', error)
      setProfileFeedback({ tone: 'error', text: 'Profil güncellenemedi. Lütfen tekrar deneyin.' })
    } finally {
      setProfileSaving(false)
    }
  }

  async function openTableSession(table: Table) {
    setTablesBusy(table.id)
    setTablesMsg('')
    const newSessionId = createSessionId()
    try {
      logFirestoreWrite('waiter/open table session', { tableId: table.id, sessionId: newSessionId })
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tableDocRef(table.id))
        if (!snap.exists()) throw new Error('Masa bulunamadı.')
        const t = normalizeTable(snap.id, snap.data() as Record<string, unknown>)
        if (t.status !== 'boş') throw new Error(`Masa şu anda "${TABLE_STATUS_LABEL[t.status] ?? t.status}" durumunda.`)
        tx.update(tableDocRef(table.id), {
          status: 'aktif', sessionId: newSessionId, openedAt: serverTimestamp(), lastPaymentCompletedAt: null, lastPaymentWaiterName: null, updatedAt: serverTimestamp(),
        })
      })
      setTablesMsg(`Masa ${table.number} açıldı.`)
    } catch (err) {
      setTablesMsg(err instanceof Error ? err.message : 'Hata oluştu.')
    } finally {
      setTablesBusy(null)
    }
  }

  async function handleLogout() {
    if (user && profile && restaurantId && rtdb) {
      // Clear RTDB presence
      try {
        const presenceRef = dbRef(rtdb, `presence/${restaurantId}/waiters/${user.uid}`)
        await dbSet(presenceRef, {
          online: false,
          name: profile.name,
          lastSeen: rtdbServerTimestamp(),
        })
      } catch { /* ignore */ }
    }
    await signOut(auth).catch(() => {})
    router.replace('/waiter/login')
  }

  // ─── Manual Order Creation ────────────────────────────────────────────────

  function openOrderModal() {
    setOrderModal(true)
    setOrderStep('table')
    setSelectedOrderTable(null)
    setOrderCart([])
    setOrderActiveCat(categories[0]?.id ?? null)
  }

  function closeOrderModal() {
    setOrderModal(false)
    setOrderStep('table')
    setSelectedOrderTable(null)
    setOrderCart([])
  }

  async function selectTableForOrder(table: Table) {
    if (table.status === 'boş') {
      // Open the table first
      const newSessionId = createSessionId()
      try {
        logFirestoreWrite('waiter/open table for order', { tableId: table.id, sessionId: newSessionId })
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(tableDocRef(table.id))
          if (!snap.exists()) throw new Error('Masa bulunamadı.')
          const t = normalizeTable(snap.id, snap.data() as Record<string, unknown>)
          if (t.status !== 'boş') throw new Error(`Masa şu anda "${TABLE_STATUS_LABEL[t.status] ?? t.status}" durumunda.`)
          tx.update(tableDocRef(table.id), {
            status: 'aktif', sessionId: newSessionId, openedAt: serverTimestamp(), lastPaymentCompletedAt: null, lastPaymentWaiterName: null, updatedAt: serverTimestamp(),
          })
        })
        // Refresh table data and proceed
        setSelectedOrderTable({ ...table, status: 'aktif', sessionId: newSessionId })
        setOrderStep('products')
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Masa açılamadı.')
      }
    } else if (table.status === 'aktif' || table.status === 'çağrı var' || table.status === 'hesap istendi') {
      // Use existing session
      setSelectedOrderTable(table)
      setOrderStep('products')
    } else {
      alert(`Bu masa sipariş alınamaz durumda: ${TABLE_STATUS_LABEL[table.status] ?? table.status}`)
    }
  }

  function addToOrderCart(product: Product) {
    setOrderCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id)
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }]
    })
  }

  function updateOrderCartQuantity(productId: string, delta: number) {
    setOrderCart((prev) => {
      return prev
        .map((item) => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item)
        .filter((item) => item.quantity > 0)
    })
  }

  const orderCartTotal = orderCart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const orderCartCount = orderCart.reduce((sum, item) => sum + item.quantity, 0)

  async function submitOrder() {
    if (!selectedOrderTable || !profile || orderCart.length === 0) return

    setOrderSending(true)
    try {
      const waiterAverageRatingSnapshot = resolveStoredAverageRating(profile)
      const items = orderCart.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }))

      const groupedByCustomer = {
        'Garson Siparişi': {
          customerId: profile.uid,
          items: items,
          total: orderCartTotal,
        },
      }

      const callData = {
        restaurantId,
        tableId: selectedOrderTable.id,
        tableNumber: selectedOrderTable.number,
        sessionId: selectedOrderTable.sessionId,
        tip: 'sipariş',
        durum: 'kabul edildi',
        status: 'accepted',
        customerName: 'Garson Siparişi',
        waiterId: profile.uid,
        waiterName: profile.name,
        waiterPhotoUrl: profile.photoUrl ?? null,
        waiterAverageRating: waiterAverageRatingSnapshot,
        createdByRole: 'waiter',
        createdById: profile.uid,
        createdByName: profile.name,
        items,
        groupedByCustomer,
        totalPrice: orderCartTotal,
        note: '',
        createdAt: serverTimestamp(),
        acceptedAt: serverTimestamp(),
      }

      logFirestoreWrite('waiter/create manual order', { tableId: selectedOrderTable.id, totalPrice: orderCartTotal })
      await addDoc(collection(db, 'restaurants', restaurantId, 'calls'), callData)

      closeOrderModal()
      setTablesMsg(`Masa ${selectedOrderTable.number} siparişi oluşturuldu.`)
    } catch (err) {
      console.error('Order creation failed:', err)
      alert(err instanceof Error ? err.message : 'Sipariş oluşturulamadı.')
    } finally {
      setOrderSending(false)
    }
  }

  // ─── Guard state ──────────────────────────────────────────────────────────
  if (loading || !profile || profile.role !== 'waiter') {
    return <LoadingScreen variant="waiter" />
  }

  if (!restaurantId) {
    return (
      <div className="theme-page flex min-h-screen items-center justify-center px-6" style={themeVars}>
        <div className="theme-card max-w-sm rounded-[1.75rem] px-6 py-8 text-center">
          <p className="text-lg font-semibold text-[var(--text)]">İşletme hesabı bulunamadı.</p>
          <p className="mt-2 text-sm text-gray-500">Garson hesabı için geçerli bir `restaurantId` tanımlanmalı.</p>
        </div>
      </div>
    )
  }

  const tipLabel: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }
  const todayTs = getTodayStartTs()
  const todayRatingsCount  = myRatings.filter((r) => r.createdAt >= todayTs).length
  const storedAverageRating = resolveStoredAverageRating(profile)
  const avgWaiterRatingValue = averageNumber(myRatings.map((r) => r.waiterRating)) ?? storedAverageRating
  const avgWaiterRatingLabel = avgWaiterRatingValue === null ? '—' : `${avgWaiterRatingValue.toFixed(1)} ★`
  const displayedProfileName = profileDraftName ?? profile.name
  const displayedProfilePhotoUrl = profileDraftPhotoUrl !== undefined ? profileDraftPhotoUrl : (profile.photoUrl ?? null)
  const totalCompletedCalls = profile.completedCalls ?? profile.totalCalls ?? done.length
  const isCurrentMenuLoaded = loadedMenuRestaurantId === restaurantId
  const menuCategories = isCurrentMenuLoaded ? categories : []
  const menuProducts = isCurrentMenuLoaded ? products : []
  const visibleProducts = menuProducts.filter((p) => p.categoryId === activeCat && p.available).sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return (
    <div className="theme-page min-h-screen overflow-x-hidden pb-20" style={themeVars}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20"
        style={{ background: `linear-gradient(135deg, ${BROWN} 0%, ${BROWN}dd 100%)` }}
      >
        <div className="px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs" style={{ color: 'rgba(255,255,255,0.62)' }}>{panelTitle}</p>
              <p className="mt-0.5 font-bold text-lg leading-tight" style={{ color: PRIMARY_FOREGROUND }}>
                Merhaba, {profile.name.split(' ')[0]}
              </p>
            </div>
            <div className="mt-1 flex shrink-0 items-center gap-2">
              <button
                onClick={async () => {
                  if (!audioInitialized) {
                    await initializeAudioWithUserInteraction()
                    setAudioEnabled(true)
                    setAudioEnabledState(true)
                    setAudioInitializedState(true)
                    void playNotificationSound()
                  } else {
                    const newValue = !audioEnabled
                    setAudioEnabled(newValue)
                    setAudioEnabledState(newValue)
                    if (newValue) void playNotificationSound()
                  }
                }}
                className="inline-flex items-center justify-center rounded-xl px-3 py-2"
                style={{
                  background: audioEnabled ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.10)',
                  color: PRIMARY_FOREGROUND,
                }}
                aria-label={audioEnabled ? 'Sesi kapat' : 'Sesi aç'}
              >
                <Bell className="h-4 w-4" style={{ opacity: audioEnabled ? 1 : 0.5 }} />
              </button>
              <button
                onClick={() => router.push('/waiter/leaderboard')}
                className="inline-flex items-center justify-center rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.14)', color: PRIMARY_FOREGROUND }}
                aria-label="Garson sıralaması"
              >
                <Trophy className="h-4 w-4" />
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.86)' }}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Çıkış</span>
              </button>
            </div>
          </div>

          {activeTab === 'calls' && (
            <div className="flex gap-2 mt-3 pb-1">
              <StatPill value={pending.length} label="Bekliyor" active={openSection === 'pending'} urgent={pending.length > 0} onClick={() => setOpenSection('pending')} primaryColor={BROWN} secondaryColor={PRIMARY_FOREGROUND} />
              <StatPill value={active.length}  label="Aktifim"  active={openSection === 'active'}  onClick={() => setOpenSection('active')} primaryColor={BROWN} secondaryColor={PRIMARY_FOREGROUND} />
              <StatPill value={done.length}    label="Bugün"  active={openSection === 'done'}    onClick={() => setOpenSection('done')} primaryColor={BROWN} secondaryColor={PRIMARY_FOREGROUND} />
            </div>
          )}
        </div>
      </header>

      {/* ── Audio notification prompt ── */}
      {!audioInitialized && (
        <div
          className="px-4 py-3 text-center"
          style={{ background: '#fef3c7', color: '#92400e' }}
        >
          <p className="text-sm font-medium mb-2">Yeni çağrılarda sesli bildirim almak ister misiniz?</p>
          <button
            onClick={async () => {
              await initializeAudioWithUserInteraction()
              setAudioEnabled(true)
              setAudioEnabledState(true)
              setAudioInitializedState(true)
              void playNotificationSound()
            }}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: '#f59e0b', color: '#fff' }}
          >
            Sesi Aç
          </button>
          <button
            onClick={() => {
              setAudioEnabled(false)
              setAudioInitializedState(true)
            }}
            className="ml-2 px-4 py-1.5 rounded-lg text-sm"
            style={{ background: 'rgba(0,0,0,0.08)', color: '#92400e' }}
          >
            Hayır
          </button>
        </div>
      )}

      {/* ── Connection lost banner ── */}
      {connectionLost && (
        <div
          className="px-4 py-2 text-center text-sm"
          style={{ background: SURFACE_MUTED, color: TEXT }}
        >
          Bağlantı koptu, yeniden bağlanılıyor...
        </div>
      )}

      {!rtdb && (
        <div
          className="px-4 py-2 text-center text-sm"
          style={{ background: '#eff6ff', color: '#1d4ed8' }}
        >
          Canlı durum kapalı.
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="mx-auto max-w-lg px-4 py-5">
        <section className="theme-card rounded-[28px] p-5 mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <UserAvatar
                name={displayedProfileName}
                photoUrl={displayedProfilePhotoUrl}
                className="border-2"
                style={{ width: '4.5rem', height: '4.5rem', borderColor: BORDER_SOFT, background: SURFACE_MUTED }}
                fallbackStyle={{ color: TEXT }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Profil</p>
                <p className="mt-1 truncate text-xl font-bold" style={{ color: TEXT }}>{displayedProfileName}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      background: profile.active === false ? '#f3f4f6' : 'var(--success-soft)',
                      color: profile.active === false ? '#6b7280' : 'var(--success)',
                    }}
                  >
                    {profile.active === false ? 'Pasif' : 'Aktif'}
                  </span>
                  <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: SURFACE_MUTED, color: TEXT }}>
                    {avgWaiterRatingLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStatCard label="Bugün Tamamlanan" value={String(done.length)} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
              <MiniStatCard label="Toplam Tamamlanan" value={String(totalCompletedCalls)} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
              <MiniStatCard label="Ort. Puan" value={avgWaiterRatingLabel} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
              <MiniStatCard label="Durum" value={profile.active === false ? 'Pasif' : 'Aktif'} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
            </div>

            <ProfilePhotoPicker
              name={displayedProfileName}
              photoUrl={displayedProfilePhotoUrl}
              label="Profil fotoğrafı"
              helperText="Müşteri kartında ve garson listesinde görünür."
              disabledText={!profilePhotoUploadEnabled ? 'ImgBB API anahtarı olmadığı için yükleme kapalı.' : undefined}
              uploading={profilePhotoUploading}
              disabled={!profilePhotoUploadEnabled}
              onFileChange={handleProfilePhotoChange}
              onClear={() => setProfileDraftPhotoUrl(null)}
            />

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Ad Soyad</label>
              <input
                className="theme-input rounded-lg text-sm"
                value={displayedProfileName}
                onChange={(event) => setProfileDraftName(event.target.value)}
              />
            </div>

            {profileFeedback && (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{
                  background: profileFeedback.tone === 'success' ? 'var(--success-soft)' : '#fff7ed',
                  color: profileFeedback.tone === 'success' ? 'var(--success)' : '#c2410c',
                  border: `1px solid ${profileFeedback.tone === 'success' ? 'rgba(16,185,129,0.24)' : '#fdba74'}`,
                }}
              >
                {profileFeedback.text}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setProfileDraftName(null)
                  setProfileDraftPhotoUrl(undefined)
                  setProfileFeedback(null)
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-medium"
                style={{ background: SURFACE_MUTED, color: TEXT }}
              >
                Sıfırla
              </button>
              <button
                onClick={saveProfile}
                disabled={profileSaving || profilePhotoUploading || !displayedProfileName.trim()}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: BROWN, color: PRIMARY_FOREGROUND }}
              >
                {profileSaving ? 'Kaydediliyor...' : profilePhotoUploading ? 'Fotoğraf Yükleniyor...' : 'Profili Kaydet'}
              </button>
            </div>
          </div>
        </section>

        {/* ÇAĞRILAR TAB */}
        {activeTab === 'calls' && (
          <div className="space-y-6">
            {/* Puanlarım */}
            <section>
              <SectionHeader label="Puanlarım" count={myRatings.length} badge={myRatings.length > 0 ? 'green' : undefined} primaryColor={BROWN} secondaryColor={GOLD} />
              <div className="theme-card rounded-2xl p-5">
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MiniStatCard label="Ortalama" value={avgWaiterRatingLabel} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
                  <MiniStatCard label="Toplam"   value={String(myRatings.length)} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
                  <MiniStatCard label="Bugün"    value={String(todayRatingsCount)} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
                </div>
                {myRatings.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Henüz yorum yok.</p>
                ) : (
                  <div className="space-y-3">
                    {myRatings.slice(0, 5).map((r) => (
                      <div key={r.id} className="rounded-xl px-4 py-3" style={{ background: SURFACE_MUTED }}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="text-sm font-semibold" style={{ color: TEXT }}>
                              Masa {r.tableNumber > 0 ? r.tableNumber : r.tableId}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(r.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Garson</p>
                            <p className="text-sm font-semibold" style={{ color: TEXT }}>{r.waiterRating}/5</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          <Stars value={r.waiterRating} secondaryColor={GOLD} />
                          <span className="text-xs text-gray-400">Hizmet {r.serviceRating}/5</span>
                        </div>
                        <p className="text-sm leading-6" style={{ color: r.comment ? '#4b5563' : '#9ca3af' }}>
                          {r.comment || 'Yorum bırakılmadı.'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {callError && (
              <div
                className="rounded-2xl px-4 py-3 text-sm"
                style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}
              >
                {callError}
              </div>
            )}

            {/* Bekleyen */}
            {openSection === 'pending' && (
              <section>
                <SectionHeader label="Bekleyen Çağrılar" count={pending.length} badge={pending.length > 0 ? 'red' : undefined} primaryColor={BROWN} secondaryColor={GOLD} />
                {pending.length === 0 ? (
                  <EmptyState icon={<CircleCheckBig size={32} />} text="Bekleyen çağrı yok" />
                ) : (
                  <div className="space-y-3">
                    {pending.map((call) => (
                      <CallCard
                        key={call.id}
                        call={call}
                        variant="pending"
                        busy={callBusyId === call.id}
                        onAccept={() => acceptCall(call)}
                        restaurantId={restaurantId}
                        actor={user && profile ? { uid: user.uid, name: profile.name || 'Garson', role: 'waiter' } : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Aktif */}
            {openSection === 'active' && (
              <section>
                <SectionHeader label="Aktif Çağrılarım" count={active.length} badge={active.length > 0 ? 'gold' : undefined} primaryColor={BROWN} secondaryColor={GOLD} />
                {active.length === 0 ? (
                  <EmptyState icon={<Clock3 size={32} />} text="Aktif çağrın yok" />
                ) : (
                  <div className="space-y-3">
                    {active.map((call) => (
                      <CallCard
                        key={call.id}
                        call={call}
                        variant="active"
                        busy={callBusyId === call.id}
                        onComplete={() => completeCall(call)}
                        restaurantId={restaurantId}
                        actor={user && profile ? { uid: user.uid, name: profile.name || 'Garson', role: 'waiter' } : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Tamamlananlar */}
            {openSection === 'done' && (
              <section>
                <SectionHeader label="Bugün Tamamladıklarım" count={done.length} badge={done.length > 0 ? 'green' : undefined} primaryColor={BROWN} secondaryColor={GOLD} />
                {done.length === 0 ? (
                  <EmptyState icon={<ClipboardList size={32} />} text="Henüz tamamlanan çağrı yok" />
                ) : (
                  <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDER_SOFT}` }}>
                    {done.map((call, i) => (
                      <div
                        key={call.id}
                        className="flex items-center justify-between px-5 py-3"
                        style={{ borderTop: i > 0 ? '1px solid #f9f7f5' : undefined }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: SURFACE_MUTED, color: TEXT }}>
                            Masa {getCallTableLabel(call)}
                          </span>
                          <span className="text-sm text-gray-500">{tipLabel[call.tip] ?? call.tip}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {call.completedAt ? `${Math.round((call.completedAt - call.createdAt) / 60000)} dk` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* MENÜ TAB */}
        {activeTab === 'menu' && (
          <div>
            {!isCurrentMenuLoaded ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map((i) => <div key={i} className="bg-white rounded-2xl h-16 animate-pulse border border-gray-100" />)}
              </div>
            ) : (
              <>
                {menuCategories.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
                    {menuCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCat(cat.id)}
                        className="shrink-0 px-4 py-2 rounded-full text-sm font-medium"
                        style={
                          activeCat === cat.id
                            ? { background: BROWN, color: PRIMARY_FOREGROUND }
                            : { background: '#fff', color: TEXT, border: `1px solid ${BORDER_SOFT}` }
                        }
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
                {visibleProducts.length === 0 ? (
                  <EmptyState
                    icon={<UtensilsCrossed size={32} />}
                    text={menuProducts.some((product) => product.available) ? 'Bu kategoride ürün yok' : 'Henüz ürün eklenmedi'}
                  />
                ) : (
                  <div className="space-y-3">
                    {visibleProducts.map((p) => (
                      <div key={p.id} className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${BORDER_SOFT}` }}>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm" style={{ color: TEXT }}>{p.name}</p>
                          {p.description && <p className="text-xs text-gray-400 mt-1 leading-5">{p.description}</p>}
                        </div>
                        <p className="font-bold shrink-0" style={{ color: BROWN }}>₺{p.price}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MASA SEÇ TAB */}
        {activeTab === 'tables' && (
          <div>
            <p className="text-xs text-gray-400 mb-3">
              Boş masaya tıklayarak oturum açabilirsiniz.
            </p>
            {tablesMsg && (
              <div
                className="mb-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  background: tablesMsg.includes('açıldı') || tablesMsg.includes('oluşturuldu') ? '#f0fdf4' : '#fff7ed',
                  color:      tablesMsg.includes('açıldı') || tablesMsg.includes('oluşturuldu') ? '#15803d'  : '#c2410c',
                  border: `1px solid ${tablesMsg.includes('açıldı') || tablesMsg.includes('oluşturuldu') ? '#86efac' : '#fdba74'}`,
                }}
              >
                {tablesMsg}
              </div>
            )}
            {!tablesLoaded ? (
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6].map((i) => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-gray-100" />)}
              </div>
            ) : tables.length === 0 ? (
              <EmptyState icon={<Armchair size={32} />} text="Henüz masa eklenmemiş" />
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {tables.map((table) => {
                  const sc = TABLE_STATUS_COLOR[table.status] ?? TABLE_STATUS_COLOR.boş
                  const isBoş = table.status === 'boş'
                  const busy = tablesBusy === table.id

                  return (
                    <button
                      key={table.id}
                      disabled={!isBoş || busy}
                      onClick={() => isBoş && openTableSession(table)}
                      className="rounded-2xl p-3 text-center transition-all disabled:opacity-60"
                      style={{
                        background: isBoş ? '#fff' : sc.bg,
                        border: `2px solid ${isBoş ? BORDER_SOFT : sc.bg}`,
                        boxShadow: isBoş ? '0 1px 4px rgba(0,0,0,0.06)' : undefined,
                      }}
                    >
                      <p className="font-bold text-lg leading-none" style={{ color: isBoş ? TEXT : sc.text }}>
                        {table.number}
                      </p>
                      <p className="text-xs mt-1.5" style={{ color: isBoş ? '#9ca3af' : sc.text }}>
                        {busy ? '...' : TABLE_STATUS_LABEL[table.status] ?? table.status}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex border-t"
        style={{ background: '#fff', borderColor: BORDER_SOFT, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {([
          { id: 'calls' as Tab, Icon: Bell, label: 'Çağrılar', badge: pending.length > 0 ? pending.length : 0 },
          { id: 'menu'   as Tab, Icon: UtensilsCrossed, label: 'Menü', badge: 0 },
          { id: 'tables' as Tab, Icon: Armchair, label: 'Masalar', badge: 0 },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex flex-col items-center py-3 relative"
          >
            <tab.Icon size={22} style={{ color: activeTab === tab.id ? BROWN : '#9ca3af' }} />
            <span
              className="text-xs mt-1 font-medium"
              style={{ color: activeTab === tab.id ? BROWN : '#9ca3af' }}
            >
              {tab.label}
            </span>
            {tab.badge > 0 && (
              <span
                className="absolute top-2 right-1/4 w-4 h-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                style={{ background: '#ef4444' }}
              >
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: BROWN }} />
            )}
          </button>
        ))}
      </nav>

      {/* ── Floating New Order Button ── */}
      <button
        onClick={openOrderModal}
        className="fixed left-4 right-4 z-30 flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition-all active:scale-95 sm:left-auto sm:right-4 sm:w-auto"
        style={{
          bottom: 'calc(70px + env(safe-area-inset-bottom))',
          right: '16px',
          background: BROWN,
          color: PRIMARY_FOREGROUND,
          boxShadow: `0 8px 24px ${BROWN}44`,
        }}
      >
        <Plus size={18} />
        Yeni Sipariş
      </button>

      {/* ── Order Creation Modal ── */}
      {orderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex flex-col">
          <div
            className="flex-1 flex flex-col mt-auto rounded-t-[28px] overflow-hidden"
            style={{ background: '#fff', maxHeight: '92vh' }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: BORDER_SOFT, background: SURFACE_MUTED }}
            >
              <div className="flex items-center gap-3">
                {orderStep !== 'table' && (
                  <button
                    onClick={() => setOrderStep(orderStep === 'confirm' ? 'products' : 'table')}
                    className="p-1.5 rounded-lg"
                    style={{ background: '#fff' }}
                  >
                    <X size={18} style={{ color: TEXT, transform: 'rotate(45deg)' }} />
                  </button>
                )}
                <div>
                  <p className="font-bold text-base" style={{ color: TEXT }}>
                    {orderStep === 'table' && 'Masa Seç'}
                    {orderStep === 'products' && `Masa ${selectedOrderTable?.number} - Ürün Ekle`}
                    {orderStep === 'confirm' && 'Siparişi Onayla'}
                  </p>
                  {orderStep === 'products' && orderCartCount > 0 && (
                    <p className="text-xs" style={{ color: BROWN }}>{orderCartCount} ürün · ₺{orderCartTotal}</p>
                  )}
                </div>
              </div>
              <button
                onClick={closeOrderModal}
                className="p-2 rounded-full"
                style={{ background: '#fff' }}
              >
                <X size={20} style={{ color: TEXT }} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Step 1: Table Selection */}
              {orderStep === 'table' && (
                <div>
                  <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>
                    Sipariş almak istediğiniz masayı seçin. Boş masalar otomatik açılır.
                  </p>
                  {!tablesLoaded ? (
                    <div className="grid grid-cols-3 gap-3">
                      {[1,2,3,4,5,6].map((i) => <div key={i} className="bg-gray-100 rounded-2xl h-20 animate-pulse" />)}
                    </div>
                  ) : tables.length === 0 ? (
                    <EmptyState icon={<Armchair size={32} />} text="Henüz masa eklenmemiş" />
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {tables.map((table) => {
                        const sc = TABLE_STATUS_COLOR[table.status] ?? TABLE_STATUS_COLOR.boş
                        const canOrder = ['boş', 'aktif', 'çağrı var', 'hesap istendi'].includes(table.status)
                        return (
                          <button
                            key={table.id}
                            disabled={!canOrder}
                            onClick={() => selectTableForOrder(table)}
                            className="rounded-2xl p-3 text-center transition-all disabled:opacity-40"
                            style={{
                              background: canOrder ? '#fff' : sc.bg,
                              border: `2px solid ${canOrder ? BORDER_SOFT : sc.bg}`,
                            }}
                          >
                            <p className="font-bold text-lg leading-none" style={{ color: canOrder ? TEXT : sc.text }}>
                              {table.number}
                            </p>
                            <p className="text-xs mt-1.5" style={{ color: canOrder ? '#9ca3af' : sc.text }}>
                              {TABLE_STATUS_LABEL[table.status] ?? table.status}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Product Selection */}
              {orderStep === 'products' && (
                <div>
                  {/* Categories */}
                  {categories.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => setOrderActiveCat(cat.id)}
                          className="shrink-0 px-4 py-2 rounded-full text-sm font-medium"
                          style={
                            orderActiveCat === cat.id
                              ? { background: BROWN, color: PRIMARY_FOREGROUND }
                              : { background: '#fff', color: TEXT, border: `1px solid ${BORDER_SOFT}` }
                          }
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Products */}
                  <div className="space-y-2">
                    {products
                      .filter((p) => p.categoryId === orderActiveCat && p.available)
                      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
                      .map((product) => {
                        const cartItem = orderCart.find((item) => item.productId === product.id)
                        const quantity = cartItem?.quantity ?? 0

                        return (
                          <div
                            key={product.id}
                            className="flex items-center justify-between rounded-2xl p-4"
                            style={{ background: '#fff', border: `1px solid ${BORDER_SOFT}` }}
                          >
                            <div className="flex-1 min-w-0 mr-3">
                              <p className="font-semibold text-sm" style={{ color: TEXT }}>{product.name}</p>
                              <p className="font-bold text-sm mt-1" style={{ color: BROWN }}>₺{product.price}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {quantity > 0 ? (
                                <>
                                  <button
                                    onClick={() => updateOrderCartQuantity(product.id, -1)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{ background: SURFACE_MUTED }}
                                  >
                                    <Minus size={16} style={{ color: TEXT }} />
                                  </button>
                                  <span className="w-6 text-center font-bold text-sm" style={{ color: TEXT }}>{quantity}</span>
                                  <button
                                    onClick={() => updateOrderCartQuantity(product.id, 1)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{ background: BROWN, color: PRIMARY_FOREGROUND }}
                                  >
                                    <Plus size={16} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => addToOrderCart(product)}
                                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                                  style={{ background: SURFACE_MUTED, color: BROWN }}
                                >
                                  Ekle
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Step 3: Confirm */}
              {orderStep === 'confirm' && (
                <div>
                  <div className="rounded-2xl p-4 mb-4" style={{ background: SURFACE_MUTED }}>
                    <p className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Masa {selectedOrderTable?.number}</p>
                    <div className="space-y-2">
                      {orderCart.map((item) => (
                        <div key={item.productId} className="flex items-center justify-between text-sm">
                          <span style={{ color: TEXT }}>{item.quantity}x {item.name}</span>
                          <span className="font-semibold" style={{ color: BROWN }}>₺{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t mt-3 pt-3 flex items-center justify-between" style={{ borderColor: BORDER_SOFT }}>
                      <span className="font-bold" style={{ color: TEXT }}>Toplam</span>
                      <span className="font-bold text-lg" style={{ color: BROWN }}>₺{orderCartTotal}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {orderStep === 'products' && orderCart.length > 0 && (
              <div
                className="shrink-0 px-4 py-4 border-t"
                style={{ borderColor: BORDER_SOFT, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                <button
                  onClick={() => setOrderStep('confirm')}
                  className="w-full rounded-2xl py-4 font-bold text-sm"
                  style={{ background: BROWN, color: PRIMARY_FOREGROUND }}
                >
                  Devam Et · ₺{orderCartTotal}
                </button>
              </div>
            )}

            {orderStep === 'confirm' && (
              <div
                className="shrink-0 px-4 py-4 border-t"
                style={{ borderColor: BORDER_SOFT, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                <button
                  onClick={submitOrder}
                  disabled={orderSending || orderCart.length === 0}
                  className="w-full rounded-2xl py-4 font-bold text-sm disabled:opacity-50"
                  style={{ background: BROWN, color: PRIMARY_FOREGROUND }}
                >
                  {orderSending ? 'Gönderiliyor...' : 'Siparişi Oluştur'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ label, count, badge, primaryColor = DEFAULT_BROWN, secondaryColor = DEFAULT_GOLD }: { label: string; count: number; badge?: 'red' | 'gold' | 'green'; primaryColor?: string; secondaryColor?: string }) {
  const colors = { red: { bg: '#ef4444', text: '#fff' }, gold: { bg: secondaryColor, text: primaryColor }, green: { bg: '#22c55e', text: '#fff' } }
  const c = badge ? colors[badge] : null
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-sm font-bold tracking-wide uppercase" style={{ color: primaryColor }}>{label}</span>
      {c && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>{count}</span>}
    </div>
  )
}

function StatPill({ value, label, active, urgent, onClick, primaryColor = DEFAULT_BROWN, secondaryColor = DEFAULT_GOLD }: {
  value: number; label: string; active: boolean; urgent?: boolean; onClick: () => void; primaryColor?: string; secondaryColor?: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl py-2 px-3 text-center transition-all"
      style={active ? { background: secondaryColor } : { background: 'rgba(255,255,255,0.1)' }}
    >
      <p className="text-lg font-black leading-none" style={{ color: active ? primaryColor : urgent && value > 0 ? '#fca5a5' : '#fff' }}>
        {value}
      </p>
      <p className="text-xs mt-0.5" style={{ color: active ? primaryColor : 'rgba(255,255,255,0.6)' }}>{label}</p>
    </button>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl px-5 py-8 text-center" style={{ background: '#fff', border: '1px solid var(--border-soft)' }}>
      <div className="flex justify-center mb-2 text-gray-300">{icon}</div>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}

function MiniStatCard({ label, value, primaryColor = DEFAULT_BROWN, surfaceMuted = 'var(--surface-muted)' }: { label: string; value: string; primaryColor?: string; surfaceMuted?: string }) {
  return (
    <div className="rounded-xl px-3 py-3 text-center" style={{ background: surfaceMuted }}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold" style={{ color: primaryColor }}>{value}</p>
    </div>
  )
}

function Stars({ value, secondaryColor = DEFAULT_GOLD }: { value: number; secondaryColor?: string }) {
  return (
    <span className="text-sm tracking-[0.2em]" style={{ color: secondaryColor }}>
      {'★'.repeat(Math.max(0, Math.min(5, value)))}
      <span style={{ color: '#d1d5db' }}>{'★'.repeat(Math.max(0, 5 - value))}</span>
    </span>
  )
}
