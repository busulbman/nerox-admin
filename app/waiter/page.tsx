'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  doc, getDocs, onSnapshot,
  runTransaction, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { ref as dbRef, set as dbSet, onDisconnect as dbOnDisconnect, onValue, serverTimestamp as rtdbServerTimestamp } from 'firebase/database'
import { signOut } from 'firebase/auth'
import { Armchair, Bell, CircleCheckBig, ClipboardList, Clock3, LogOut, Trophy, UtensilsCrossed } from 'lucide-react'
import { auth, db, rd, rtdb } from '@/lib/firebase'
import { completeRestaurantCall } from '@/lib/call-sync'
import { useAuth } from '@/components/AuthProvider'
import CallCard from '@/components/waiter/CallCard'
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
import { buildThemePalette, buildThemeStyleVars } from '@/lib/ui-theme'

type Section = 'pending' | 'active' | 'done'
type Tab = 'calls' | 'menu' | 'tables'

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

function average(values: number[]): string {
  if (values.length === 0) return '—'
  return (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)
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

  const prevPendingIds    = useRef<Set<string>>(new Set())
  const callsInitialized  = useRef(false)

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
    if (!profile || profile.role !== 'waiter' || activeTab !== 'calls' || openSection !== 'done' || !restaurantId) return

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
  }, [activeTab, openSection, profile, restaurantId])

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
      logFirestoreWrite('waiter/accept call', { restaurantId, callId: call.id })

      const batch = writeBatch(db)

      // Update call status
      batch.update(doc(db, 'restaurants', restaurantId, 'calls', call.id), {
        durum: 'kabul edildi',
        status: 'accepted',
        waiterId: profile.uid,
        waiterName: profile.name,
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

  // ─── Guard state ──────────────────────────────────────────────────────────
  if (loading || !profile || profile.role !== 'waiter') {
    return (
      <div className="theme-page flex min-h-screen items-center justify-center" style={themeVars}>
        <p className="animate-pulse text-sm text-[var(--muted)]">Yükleniyor...</p>
      </div>
    )
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
  const avgWaiterRating    = average(myRatings.map((r) => r.waiterRating))
  const isCurrentMenuLoaded = loadedMenuRestaurantId === restaurantId
  const menuCategories = isCurrentMenuLoaded ? categories : []
  const menuProducts = isCurrentMenuLoaded ? products : []
  const visibleProducts = menuProducts.filter((p) => p.categoryId === activeCat && p.available).sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return (
    <div className="theme-page min-h-screen pb-20" style={themeVars}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20"
        style={{ background: `linear-gradient(135deg, ${BROWN} 0%, ${BROWN}dd 100%)` }}
      >
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.62)' }}>{panelTitle}</p>
              <p className="font-bold text-lg leading-tight mt-0.5" style={{ color: PRIMARY_FOREGROUND }}>
                Merhaba, {profile.name.split(' ')[0]}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
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
                Çıkış
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
      <div className="px-4 py-5 max-w-lg mx-auto">

        {/* ÇAĞRILAR TAB */}
        {activeTab === 'calls' && (
          <div className="space-y-6">
            {/* Puanlarım */}
            <section>
              <SectionHeader label="Puanlarım" count={myRatings.length} badge={myRatings.length > 0 ? 'green' : undefined} primaryColor={BROWN} secondaryColor={GOLD} />
              <div className="theme-card rounded-2xl p-5">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <MiniStatCard label="Ortalama" value={avgWaiterRating === '—' ? '—' : `${avgWaiterRating} ★`} primaryColor={TEXT} surfaceMuted={SURFACE_MUTED} />
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
                  background: tablesMsg.includes('açıldı') ? '#f0fdf4' : '#fff7ed',
                  color:      tablesMsg.includes('açıldı') ? '#15803d'  : '#c2410c',
                  border: `1px solid ${tablesMsg.includes('açıldı') ? '#86efac' : '#fdba74'}`,
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
