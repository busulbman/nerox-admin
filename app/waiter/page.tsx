'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import CallCard from '@/components/waiter/CallCard'
import type { WaiterCall } from '@/lib/types'

type Section = 'pending' | 'active' | 'done'

function SectionHeader({
  label,
  count,
  badge,
}: {
  label: string
  count: number
  badge?: 'red' | 'gold' | 'green'
}) {
  const colors = {
    red:   { bg: '#ef4444', text: '#fff' },
    gold:  { bg: '#d4a017', text: '#3d2b1f' },
    green: { bg: '#22c55e', text: '#fff' },
  }
  const c = badge ? colors[badge] : null
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <span className="text-sm font-bold tracking-wide uppercase" style={{ color: '#3d2b1f' }}>
        {label}
      </span>
      {c && (
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: c.bg, color: c.text }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

export default function WaiterPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  const [pending, setPending]   = useState<WaiterCall[]>([])
  const [active, setActive]     = useState<WaiterCall[]>([])
  const [done, setDone]         = useState<WaiterCall[]>([])
  const [, setTick]             = useState(0)
  const [openSection, setOpenSection] = useState<Section>('pending')

  // ─── Guard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/waiter/login'); return }
    if (!profile) { router.replace('/waiter/login'); return }
    if (profile.role !== 'waiter') { router.replace(profile.role === 'admin' ? '/dashboard' : '/waiter/login'); return }
    if (profile.active === false) { router.replace('/waiter/login'); return }
  }, [user, profile, loading, router])

  // ─── Firestore listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || profile.role !== 'waiter') return

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayTs = todayStart.getTime()

    const unsub = onSnapshot(
      collection(db, 'restaurants', profile.restaurantId, 'calls'),
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WaiterCall))

        setPending(
          all
            .filter((c) => c.durum === 'bekliyor')
            .sort((a, b) => a.createdAt - b.createdAt)
        )
        setActive(
          all
            .filter((c) => c.durum === 'kabul edildi' && c.waiterId === profile.uid)
            .sort((a, b) => a.createdAt - b.createdAt)
        )
        setDone(
          all
            .filter(
              (c) =>
                c.durum === 'tamamlandı' &&
                c.waiterId === profile.uid &&
                c.createdAt >= todayTs
            )
            .sort((a, b) => b.createdAt - a.createdAt)
        )
      }
    )
    return unsub
  }, [profile])

  // Elapsed süresi için periyodik re-render
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // ─── Actions ─────────────────────────────────────────────────────────────
  async function acceptCall(call: WaiterCall) {
    if (!profile) return
    await updateDoc(doc(db, 'restaurants', profile.restaurantId, 'calls', call.id), {
      durum: 'kabul edildi',
      waiterId: profile.uid,
      waiterName: profile.name,
      acceptedAt: Date.now(),
    })
    setOpenSection('active')
  }

  async function completeCall(call: WaiterCall) {
    if (!profile) return
    await updateDoc(doc(db, 'restaurants', profile.restaurantId, 'calls', call.id), {
      durum: 'tamamlandı',
      resolvedAt: Date.now(),
    })
  }

  async function handleLogout() {
    await signOut(auth)
    router.replace('/waiter/login')
  }

  // ─── Guard states ────────────────────────────────────────────────────────
  if (loading || !profile || profile.role !== 'waiter') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f4' }}>
        <p className="text-sm animate-pulse" style={{ color: 'rgba(61,43,31,0.4)' }}>Yükleniyor...</p>
      </div>
    )
  }

  const tipLabel: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }

  return (
    <div className="min-h-screen" style={{ background: '#faf7f4' }}>
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20" style={{ background: '#3d2b1f' }}>
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Varina Chocolate
              </p>
              <p className="font-bold text-lg leading-tight mt-0.5" style={{ color: '#d4a017' }}>
                Merhaba, {profile.name.split(' ')[0]} 👋
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg mt-1"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            >
              Çıkış
            </button>
          </div>

          {/* Stats strip */}
          <div className="flex gap-2 mt-3 pb-1">
            <StatPill
              value={pending.length}
              label="Bekliyor"
              active={openSection === 'pending'}
              urgent={pending.length > 0}
              onClick={() => setOpenSection('pending')}
            />
            <StatPill
              value={active.length}
              label="Aktifim"
              active={openSection === 'active'}
              onClick={() => setOpenSection('active')}
            />
            <StatPill
              value={done.length}
              label="Bugün ✓"
              active={openSection === 'done'}
              onClick={() => setOpenSection('done')}
            />
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="px-4 py-5 max-w-lg mx-auto space-y-6">

        {/* BEKLEYEN ÇAĞRILAR */}
        <section>
          <SectionHeader
            label="Bekleyen Çağrılar"
            count={pending.length}
            badge={pending.length > 0 ? 'red' : undefined}
          />
          {pending.length === 0 ? (
            <EmptyState icon="✅" text="Bekleyen çağrı yok" />
          ) : (
            <div className="space-y-3">
              {pending.map((call) => (
                <CallCard
                  key={call.id}
                  call={call}
                  variant="pending"
                  onAccept={() => acceptCall(call)}
                />
              ))}
            </div>
          )}
        </section>

        {/* AKTİF ÇAĞRILARIM */}
        <section>
          <SectionHeader
            label="Aktif Çağrılarım"
            count={active.length}
            badge={active.length > 0 ? 'gold' : undefined}
          />
          {active.length === 0 ? (
            <EmptyState icon="⏳" text="Aktif çağrın yok" />
          ) : (
            <div className="space-y-3">
              {active.map((call) => (
                <CallCard
                  key={call.id}
                  call={call}
                  variant="active"
                  onComplete={() => completeCall(call)}
                />
              ))}
            </div>
          )}
        </section>

        {/* BUGÜN TAMAMLANANLAR */}
        <section>
          <SectionHeader
            label="Bugün Tamamladıklarım"
            count={done.length}
            badge={done.length > 0 ? 'green' : undefined}
          />
          {done.length === 0 ? (
            <EmptyState icon="📋" text="Henüz tamamlanan çağrı yok" />
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: '#fff', border: '1px solid #f0ede9' }}
            >
              {done.map((call, i) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between px-5 py-3"
                  style={{
                    borderTop: i > 0 ? '1px solid #f9f7f5' : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs font-bold px-2 py-1 rounded-lg"
                      style={{ background: '#faf7f4', color: '#3d2b1f' }}
                    >
                      Masa {call.tableId}
                    </span>
                    <span className="text-sm text-gray-500">
                      {tipLabel[call.tip] ?? call.tip}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {call.resolvedAt
                      ? `${Math.round((call.resolvedAt - call.createdAt) / 60000)} dk`
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="h-6" />
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatPill({
  value,
  label,
  active,
  urgent,
  onClick,
}: {
  value: number
  label: string
  active: boolean
  urgent?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl py-2 px-3 text-center transition-all"
      style={
        active
          ? { background: '#d4a017' }
          : { background: 'rgba(255,255,255,0.1)' }
      }
    >
      <p
        className="text-lg font-black leading-none"
        style={{
          color: active ? '#3d2b1f' : urgent && value > 0 ? '#fca5a5' : '#fff',
        }}
      >
        {value}
      </p>
      <p
        className="text-xs mt-0.5"
        style={{ color: active ? '#3d2b1f' : 'rgba(255,255,255,0.6)' }}
      >
        {label}
      </p>
    </button>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      className="rounded-2xl px-5 py-8 text-center"
      style={{ background: '#fff', border: '1px solid #f0ede9' }}
    >
      <p className="text-3xl mb-2">{icon}</p>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}
