'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { Menu, Bell, LogOut } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { OpenCallsProvider, useOpenCalls } from '@/components/dashboard/OpenCallsProvider'
import { RestaurantSettingsProvider, useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { auth } from '@/lib/firebase'
import { requestPermission, showLocalNotification } from '@/lib/notifications'
import Sidebar from '@/components/Sidebar'

const TIP_LABEL: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()

  if (loading || !user || !profile?.restaurantId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f4' }}>
        <p className="text-sm" style={{ color: 'rgba(61,43,31,0.4)' }}>Yükleniyor...</p>
      </div>
    )
  }

  return (
    <RestaurantSettingsProvider restaurantId={profile.restaurantId}>
      <OpenCallsProvider restaurantId={profile.restaurantId}>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </OpenCallsProvider>
    </RestaurantSettingsProvider>
  )
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const { pendingCalls, pendingCount, connectionLost } = useOpenCalls()
  const { primaryColor, textColor } = useRestaurantSettingsContext()
  const router = useRouter()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  const prevCallIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role === 'waiter') { router.replace('/waiter'); return }
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!user || profile?.role === 'waiter') return
    requestPermission()
  }, [user, profile])

  useEffect(() => {
    if (!user || profile?.role === 'waiter') return

    if (initialized.current) {
      for (const call of pendingCalls) {
        if (!prevCallIds.current.has(call.id)) {
          const tableNum = call.tableNumber || call.tableId || '?'
          const tip = TIP_LABEL[call.tip] ?? call.tip
          showLocalNotification(`Masa ${tableNum} Çağırıyor`, `${tip} talebi`, '/dashboard/calls')
        }
      }
    }

    initialized.current = true
    prevCallIds.current = new Set(pendingCalls.map((call) => call.id))
  }, [pendingCalls, profile, user])

  async function handleLogout() {
    await signOut(auth).catch(() => {})
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f4' }}>
        <p className="text-sm" style={{ color: 'rgba(61,43,31,0.4)' }}>Yükleniyor...</p>
      </div>
    )
  }

  if (profile?.role === 'waiter') return null
  if (!user) return null

  return (
    <div className="flex min-h-screen" style={{ background: '#faf7f4' }}>
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-14"
        style={{ background: primaryColor }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg"
          style={{ color: textColor, background: `${textColor}15` }}
          aria-label="Menüyü aç"
        >
          <Menu size={20} />
        </button>

        <p className="font-bold text-sm" style={{ color: textColor }}>Nerox Admin</p>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => router.push('/dashboard/calls')}
              className="w-9 h-9 flex items-center justify-center rounded-lg"
              style={{ color: textColor, background: `${textColor}15` }}
              aria-label="Çağrılar"
            >
              <Bell size={18} />
            </button>
            {pendingCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white font-bold animate-pulse"
                style={{ background: '#ef4444', fontSize: '10px' }}
              >
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="w-9 h-9 flex items-center justify-center rounded-lg"
            style={{ color: textColor, background: `${textColor}15` }}
            aria-label="Çıkış"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {connectionLost && (
          <div
            className="px-4 py-2 text-center text-sm"
            style={{ background: '#fef3c7', color: '#a16207' }}
          >
            Bağlantı koptu, yeniden bağlanılıyor...
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
