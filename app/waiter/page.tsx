'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  collection, doc, getDocs, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db, rd, RESTAURANT_ID } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import CallCard from '@/components/waiter/CallCard'
import {
  getCallTableLabel, normalizeRating, normalizeTable, normalizeWaiterCall,
} from '@/lib/firestore-models'
import type { Category, Product, Rating, Table, WaiterCall } from '@/lib/types'
import { requestPermission, showNotification } from '@/lib/notifications'

type Section = 'pending' | 'active' | 'done'
type Tab = 'calls' | 'menu' | 'tables'

const BROWN = '#3d2b1f'
const GOLD = '#d4a017'

const TABLE_STATUS_LABEL: Record<string, string> = {
  boş: 'Boş', aktif: 'Aktif', 'çağrı var': 'Çağrı Var',
  'hesap istendi': 'Hesap', temizlik: 'Temizlik', kapalı: 'Kapalı',
}
const TABLE_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  boş:             { bg: '#f3f4f6', text: '#6b7280' },
  aktif:           { bg: '#dcfce7', text: '#15803d' },
  'çağrı var':     { bg: '#fef3c7', text: '#a16207' },
  'hesap istendi': { bg: '#ffedd5', text: '#c2410c' },
  temizlik:        { bg: '#dbeafe', text: '#1d4ed8' },
  kapalı:          { bg: '#fee2e2', text: '#b91c1c' },
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

  const [activeTab,  setActiveTab]  = useState<Tab>('calls')
  const [openSection, setOpenSection] = useState<Section>('pending')

  // Calls
  const [pending, setPending]   = useState<WaiterCall[]>([])
  const [active,  setActive]    = useState<WaiterCall[]>([])
  const [done,    setDone]      = useState<WaiterCall[]>([])
  const [myRatings, setMyRatings] = useState<Rating[]>([])
  const [, setTick] = useState(0)

  // Menu
  const [categories, setCategories] = useState<Category[]>([])
  const [products,   setProducts]   = useState<Product[]>([])
  const [activeCat,  setActiveCat]  = useState<string | null>(null)
  const [menuLoaded, setMenuLoaded] = useState(false)

  // Tables
  const [tables,       setTables]       = useState<Table[]>([])
  const [tablesLoaded, setTablesLoaded] = useState(false)
  const [tablesBusy,   setTablesBusy]   = useState<string | null>(null)
  const [tablesMsg,    setTablesMsg]    = useState('')

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
      router.replace(profile.role === 'admin' ? '/dashboard' : '/waiter/login'); return
    }
    if (profile.active === false) { router.replace('/waiter/login'); return }
  }, [user, profile, loading, router])

  // ─── Online status — true on mount, false on explicit logout only ────────
  useEffect(() => {
    if (!user || !profile || profile.role !== 'waiter') return
    const userRef = doc(db, 'users', user.uid)
    updateDoc(userRef, { isOnline: true, lastSeen: serverTimestamp() }).catch(() => {})
  }, [user, profile])

  // ─── Calls listener ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter') return
    const todayTs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() })()

    return onSnapshot(
      collection(db, 'restaurants', profile.restaurantId, 'calls'),
      (snap) => {
        const all = snap.docs.map((d) => normalizeWaiterCall(d.id, d.data() as Record<string, unknown>))
        const pendingList = all.filter((c) => c.durum === 'bekliyor').sort((a, b) => a.createdAt - b.createdAt)

        if (callsInitialized.current) {
          const tips: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }
          for (const call of pendingList) {
            if (!prevPendingIds.current.has(call.id)) {
              showNotification('🔔 Yeni Çağrı!', `Masa ${getCallTableLabel(call)} — ${tips[call.tip] ?? call.tip}`, '/waiter')
            }
          }
        }
        callsInitialized.current = true
        prevPendingIds.current = new Set(pendingList.map((c) => c.id))

        console.log('CALLS UPDATED:', all.length, all)
        setPending(pendingList)
        setActive(all.filter((c) => c.durum === 'kabul edildi' && c.waiterId === profile.uid).sort((a, b) => a.createdAt - b.createdAt))
        setDone(all.filter((c) => c.durum === 'tamamlandı' && c.waiterId === profile.uid && c.createdAt >= todayTs).sort((a, b) => b.createdAt - a.createdAt))
      }
    )
  }, [profile])

  // ─── Ratings listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter') return
    return onSnapshot(collection(db, 'restaurants', profile.restaurantId, 'ratings'), (snap) => {
      setMyRatings(
        snap.docs
          .map((d) => normalizeRating(d.id, d.data() as Record<string, unknown>))
          .filter((r) => r.waiterId === profile.uid)
          .sort((a, b) => b.createdAt - a.createdAt)
      )
    })
  }, [profile])

  // ─── Tables listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter') return
    return onSnapshot(
      collection(db, 'restaurants', profile.restaurantId, 'tables'),
      (snap) => {
        setTables(
          snap.docs
            .map((d) => normalizeTable(d.id, d.data() as Record<string, unknown>))
            .sort((a, b) => a.number - b.number)
        )
        setTablesLoaded(true)
      },
      (err) => {
        console.error('Tables listener error:', err)
        setTablesLoaded(true)
      }
    )
  }, [profile])

  // ─── Menu loader (once) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || menuLoaded) return
    async function loadMenu() {
      const [catSnap, prodSnap] = await Promise.all([
        getDocs(query(collection(db, 'restaurants', RESTAURANT_ID, 'categories'), orderBy('order', 'asc'))),
        getDocs(collection(db, 'restaurants', RESTAURANT_ID, 'products')),
      ])
      const cats = catSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
      setCategories(cats)
      setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)))
      setActiveCat(cats[0]?.id ?? null)
      setMenuLoaded(true)
    }
    loadMenu().catch(() => {})
  }, [profile, menuLoaded])

  // ─── Tick for elapsed times ───────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function acceptCall(call: WaiterCall) {
    if (!profile) return
    await updateDoc(doc(db, 'restaurants', profile.restaurantId, 'calls', call.id), {
      durum: 'kabul edildi', waiterId: profile.uid, waiterName: profile.name, acceptedAt: serverTimestamp(),
    })
    setOpenSection('active')
  }

  async function completeCall(call: WaiterCall) {
    if (!profile) return
    try {
      const updates: Promise<void>[] = [
        updateDoc(doc(db, 'restaurants', profile.restaurantId, 'calls', call.id), {
          durum: 'tamamlandı', resolvedAt: serverTimestamp(),
        }),
      ]
      if (call.tableId) {
        updates.push(updateDoc(doc(db, 'restaurants', profile.restaurantId, 'tables', call.tableId), {
          status: 'aktif', updatedAt: serverTimestamp(),
        }))
      }
      await Promise.all(updates)
    } catch (err) {
      console.error('Çağrı tamamlama hatası:', err)
    }
  }

  async function openTableSession(table: Table) {
    setTablesBusy(table.id)
    setTablesMsg('')
    const newSessionId = createSessionId()
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(rd('tables', table.id))
        if (!snap.exists()) throw new Error('Masa bulunamadı.')
        const t = normalizeTable(snap.id, snap.data() as Record<string, unknown>)
        if (t.status !== 'boş') throw new Error(`Masa şu anda "${TABLE_STATUS_LABEL[t.status] ?? t.status}" durumunda.`)
        tx.update(rd('tables', table.id), {
          status: 'aktif', sessionId: newSessionId, openedAt: serverTimestamp(), updatedAt: serverTimestamp(),
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
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { isOnline: false, lastSeen: serverTimestamp() })
      } catch {
        // ignore — sign out regardless
      }
    }
    await signOut(auth).catch(() => {})
    router.replace('/waiter/login')
  }

  // ─── Guard state ──────────────────────────────────────────────────────────
  if (loading || !profile || profile.role !== 'waiter') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f4' }}>
        <p className="text-sm animate-pulse" style={{ color: 'rgba(61,43,31,0.4)' }}>Yükleniyor...</p>
      </div>
    )
  }

  const tipLabel: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }
  const todayTs = getTodayStartTs()
  const todayRatingsCount  = myRatings.filter((r) => r.createdAt >= todayTs).length
  const avgWaiterRating    = average(myRatings.map((r) => r.waiterRating))
  const visibleProducts    = products.filter((p) => p.categoryId === activeCat && p.available).sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  return (
    <div className="min-h-screen pb-20" style={{ background: '#faf7f4' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-20" style={{ background: BROWN }}>
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Varina Chocolate</p>
              <p className="font-bold text-lg leading-tight mt-0.5" style={{ color: GOLD }}>
                Merhaba, {profile.name.split(' ')[0]} 👋
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => router.push('/waiter/leaderboard')}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(212,160,23,0.2)', color: GOLD }}
              >
                🏆
              </button>
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
              >
                Çıkış
              </button>
            </div>
          </div>

          {activeTab === 'calls' && (
            <div className="flex gap-2 mt-3 pb-1">
              <StatPill value={pending.length} label="Bekliyor" active={openSection === 'pending'} urgent={pending.length > 0} onClick={() => setOpenSection('pending')} />
              <StatPill value={active.length}  label="Aktifim"  active={openSection === 'active'}  onClick={() => setOpenSection('active')} />
              <StatPill value={done.length}    label="Bugün ✓"  active={openSection === 'done'}    onClick={() => setOpenSection('done')} />
            </div>
          )}
        </div>
      </header>

      {/* ── Tab content ── */}
      <div className="px-4 py-5 max-w-lg mx-auto">

        {/* ÇAĞRILAR TAB */}
        {activeTab === 'calls' && (
          <div className="space-y-6">
            {/* Puanlarım */}
            <section>
              <SectionHeader label="Puanlarım" count={myRatings.length} badge={myRatings.length > 0 ? 'green' : undefined} />
              <div className="bg-white rounded-2xl border border-[#f0ede9] p-5">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <MiniStatCard label="Ortalama" value={avgWaiterRating === '—' ? '—' : `${avgWaiterRating} ★`} />
                  <MiniStatCard label="Toplam"   value={String(myRatings.length)} />
                  <MiniStatCard label="Bugün"    value={String(todayRatingsCount)} />
                </div>
                {myRatings.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Henüz yorum yok.</p>
                ) : (
                  <div className="space-y-3">
                    {myRatings.slice(0, 5).map((r) => (
                      <div key={r.id} className="rounded-xl px-4 py-3" style={{ background: '#faf7f4' }}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="text-sm font-semibold" style={{ color: BROWN }}>
                              Masa {r.tableNumber > 0 ? r.tableNumber : r.tableId}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(r.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Garson</p>
                            <p className="text-sm font-semibold" style={{ color: BROWN }}>{r.waiterRating}/5</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          <Stars value={r.waiterRating} />
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

            {/* Bekleyen */}
            {openSection === 'pending' && (
              <section>
                <SectionHeader label="Bekleyen Çağrılar" count={pending.length} badge={pending.length > 0 ? 'red' : undefined} />
                {pending.length === 0 ? (
                  <EmptyState icon="✅" text="Bekleyen çağrı yok" />
                ) : (
                  <div className="space-y-3">
                    {pending.map((call) => <CallCard key={call.id} call={call} variant="pending" onAccept={() => acceptCall(call)} />)}
                  </div>
                )}
              </section>
            )}

            {/* Aktif */}
            {openSection === 'active' && (
              <section>
                <SectionHeader label="Aktif Çağrılarım" count={active.length} badge={active.length > 0 ? 'gold' : undefined} />
                {active.length === 0 ? (
                  <EmptyState icon="⏳" text="Aktif çağrın yok" />
                ) : (
                  <div className="space-y-3">
                    {active.map((call) => <CallCard key={call.id} call={call} variant="active" onComplete={() => completeCall(call)} />)}
                  </div>
                )}
              </section>
            )}

            {/* Tamamlananlar */}
            {openSection === 'done' && (
              <section>
                <SectionHeader label="Bugün Tamamladıklarım" count={done.length} badge={done.length > 0 ? 'green' : undefined} />
                {done.length === 0 ? (
                  <EmptyState icon="📋" text="Henüz tamamlanan çağrı yok" />
                ) : (
                  <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #f0ede9' }}>
                    {done.map((call, i) => (
                      <div
                        key={call.id}
                        className="flex items-center justify-between px-5 py-3"
                        style={{ borderTop: i > 0 ? '1px solid #f9f7f5' : undefined }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: '#faf7f4', color: BROWN }}>
                            Masa {getCallTableLabel(call)}
                          </span>
                          <span className="text-sm text-gray-500">{tipLabel[call.tip] ?? call.tip}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {call.resolvedAt ? `${Math.round((call.resolvedAt - call.createdAt) / 60000)} dk` : '—'}
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
            {!menuLoaded ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map((i) => <div key={i} className="bg-white rounded-2xl h-16 animate-pulse border border-gray-100" />)}
              </div>
            ) : (
              <>
                {categories.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCat(cat.id)}
                        className="shrink-0 px-4 py-2 rounded-full text-sm font-medium"
                        style={
                          activeCat === cat.id
                            ? { background: BROWN, color: GOLD }
                            : { background: '#fff', color: BROWN, border: '1px solid #f0ede9' }
                        }
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
                {visibleProducts.length === 0 ? (
                  <EmptyState icon="🍽️" text="Bu kategoride ürün yok" />
                ) : (
                  <div className="space-y-3">
                    {visibleProducts.map((p) => (
                      <div key={p.id} className="bg-white rounded-2xl p-4 flex items-start justify-between gap-4" style={{ border: '1px solid #f0ede9' }}>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm" style={{ color: BROWN }}>{p.name}</p>
                          {p.description && <p className="text-xs text-gray-400 mt-1 leading-5">{p.description}</p>}
                        </div>
                        <p className="font-bold shrink-0" style={{ color: GOLD }}>₺{p.price}</p>
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
              <EmptyState icon="🪑" text="Henüz masa eklenmemiş" />
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
                        border: `2px solid ${isBoş ? '#e5e7eb' : sc.bg}`,
                        boxShadow: isBoş ? '0 1px 4px rgba(0,0,0,0.06)' : undefined,
                      }}
                    >
                      <p className="font-bold text-lg leading-none" style={{ color: isBoş ? BROWN : sc.text }}>
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
        style={{ background: '#fff', borderColor: '#f0ede9', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {([
          { id: 'calls' as Tab, icon: '🔔', label: 'Çağrılar', badge: pending.length > 0 ? pending.length : 0 },
          { id: 'menu'   as Tab, icon: '📋', label: 'Menü',     badge: 0 },
          { id: 'tables' as Tab, icon: '🪑', label: 'Masalar',  badge: 0 },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex flex-col items-center py-3 relative"
          >
            <span className="text-xl leading-none">{tab.icon}</span>
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

function SectionHeader({ label, count, badge }: { label: string; count: number; badge?: 'red' | 'gold' | 'green' }) {
  const colors = { red: { bg: '#ef4444', text: '#fff' }, gold: { bg: GOLD, text: BROWN }, green: { bg: '#22c55e', text: '#fff' } }
  const c = badge ? colors[badge] : null
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-sm font-bold tracking-wide uppercase" style={{ color: BROWN }}>{label}</span>
      {c && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>{count}</span>}
    </div>
  )
}

function StatPill({ value, label, active, urgent, onClick }: {
  value: number; label: string; active: boolean; urgent?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl py-2 px-3 text-center transition-all"
      style={active ? { background: GOLD } : { background: 'rgba(255,255,255,0.1)' }}
    >
      <p className="text-lg font-black leading-none" style={{ color: active ? BROWN : urgent && value > 0 ? '#fca5a5' : '#fff' }}>
        {value}
      </p>
      <p className="text-xs mt-0.5" style={{ color: active ? BROWN : 'rgba(255,255,255,0.6)' }}>{label}</p>
    </button>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-2xl px-5 py-8 text-center" style={{ background: '#fff', border: '1px solid #f0ede9' }}>
      <p className="text-3xl mb-2">{icon}</p>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}

function MiniStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-3 text-center" style={{ background: '#faf7f4' }}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold" style={{ color: BROWN }}>{value}</p>
    </div>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <span className="text-sm tracking-[0.2em]" style={{ color: GOLD }}>
      {'★'.repeat(Math.max(0, Math.min(5, value)))}
      <span style={{ color: '#d1d5db' }}>{'★'.repeat(Math.max(0, 5 - value))}</span>
    </span>
  )
}
