'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { Menu, Bell, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { OpenCallsProvider, useOpenCalls } from '@/components/dashboard/OpenCallsProvider'
import { RestaurantSettingsProvider, useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { auth } from '@/lib/firebase'
import { requestPermission, showLocalNotification } from '@/lib/notifications'
import { clearRecentOnboardingCompletion, hasRecentOnboardingCompletion } from '@/lib/onboarding'
import { getRestaurantAccessBlockMessage, resolveRestaurantBusinessName } from '@/lib/restaurant-settings'
import { buildThemeStyleVars } from '@/lib/ui-theme'
import FloatingHelpButton from '@/components/dashboard/FloatingHelpButton'
import { OnboardingProvider } from '@/components/dashboard/OnboardingProvider'
import TrialWelcomeCard from '@/components/dashboard/TrialWelcomeCard'
import LoadingScreen from '@/components/LoadingScreen'
import Sidebar from '@/components/Sidebar'

const TIP_LABEL: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebar_collapsed'

function getInitialSidebarState() {
  if (typeof window === 'undefined') {
    return { mobileOpen: false, collapsed: false }
  }

  return {
    mobileOpen: false,
    collapsed: window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true',
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }

    if (profile?.role === 'super_admin') {
      router.replace('/super-admin')
    }
  }, [loading, profile?.role, router, user])

  if (loading || !user || profile?.role === 'super_admin') {
    return <LoadingScreen variant="admin" />
  }

  if (!profile?.restaurantId) {
    return (
      <div className="theme-page flex min-h-screen items-center justify-center px-6">
        <div className="theme-card max-w-sm rounded-[1.75rem] px-6 py-8 text-center">
          <p className="text-lg font-semibold text-[var(--text)]">İşletme hesabı bulunamadı.</p>
          <p className="mt-2 text-sm text-gray-500">Kullanıcı profilinizde `restaurantId` tanımlı değil.</p>
        </div>
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
  const { settings, restaurant, loading: restaurantLoading, primaryColor, textColor } = useRestaurantSettingsContext()
  const router = useRouter()
  const restaurantId = profile?.restaurantId || ''
  const businessName = resolveRestaurantBusinessName(settings)
  const panelTitle = `${businessName} Yönetim Paneli`
  const accessBlockMessage = getRestaurantAccessBlockMessage(restaurant)
  const hasExpiredAccess = accessBlockMessage === 'Aboneliğinizin süresi dolmuş.'
  const hasOnboardingCompletionOverride = hasRecentOnboardingCompletion(restaurantId)

  const [sidebarState, setSidebarState] = useState(getInitialSidebarState)

  const prevCallIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role === 'super_admin') { router.replace('/super-admin'); return }
    if (profile?.role === 'waiter') { router.replace('/waiter'); return }
    if (profile?.role === 'admin') {
      if (restaurantLoading) return

      if (restaurant?.onboardingCompleted === true) {
        clearRecentOnboardingCompletion(restaurantId)
        return
      }

      if (!hasOnboardingCompletionOverride && restaurant?.onboardingCompleted === false) {
        router.replace('/onboarding')
      }
    }
  }, [
    hasOnboardingCompletionOverride,
    loading,
    profile,
    restaurant?.onboardingCompleted,
    restaurantId,
    restaurantLoading,
    router,
    user,
  ])

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

  function openMobileSidebar() {
    setSidebarState((current) => ({ ...current, mobileOpen: true }))
  }

  function closeMobileSidebar() {
    setSidebarState((current) => ({ ...current, mobileOpen: false }))
  }

  function toggleDesktopSidebar() {
    setSidebarState((current) => {
      const nextCollapsed = !current.collapsed
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, nextCollapsed ? 'true' : 'false')
      }
      return { ...current, collapsed: nextCollapsed }
    })
  }

  const themeVars = buildThemeStyleVars(primaryColor)
  const DesktopSidebarToggleIcon = sidebarState.collapsed ? PanelLeftOpen : PanelLeftClose

  if (loading || (profile?.role === 'admin' && restaurantLoading)) {
    return <LoadingScreen variant="admin" />
  }

  if (profile?.role === 'waiter') return null
  if (!user) return null
  if (profile?.role === 'admin' && restaurant?.onboardingCompleted === false && !hasOnboardingCompletionOverride) {
    return null
  }

  return (
    <OnboardingProvider restaurantId={restaurantId} onOpenSidebar={openMobileSidebar}>
      <div className="theme-page flex min-h-screen overflow-x-hidden" style={themeVars}>
        <header
          className="md:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between gap-2 px-4"
          style={{ background: 'var(--primary)' }}
        >
          <button
            onClick={openMobileSidebar}
            className="w-9 h-9 flex items-center justify-center rounded-lg"
            style={{ color: textColor, background: `${textColor}15` }}
            aria-label="Menüyü aç"
          >
            <Menu size={20} />
          </button>

          <p className="min-w-0 flex-1 truncate px-2 text-center font-bold text-sm" style={{ color: textColor }}>{panelTitle}</p>

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

        <Sidebar
          isOpen={sidebarState.mobileOpen}
          isCollapsed={sidebarState.collapsed}
          onClose={closeMobileSidebar}
        />

        <FloatingHelpButton />
        <TrialWelcomeCard restaurant={restaurant} restaurantId={restaurantId} />

        <main
          className={[
            'min-w-0 flex-1 overflow-x-hidden pt-14 md:pt-0',
            sidebarState.mobileOpen ? 'overflow-y-hidden md:overflow-y-auto' : 'overflow-y-auto',
          ].join(' ')}
        >
          <div
            className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-4 border-b px-6 backdrop-blur md:flex"
            style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'var(--border-soft)' }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={toggleDesktopSidebar}
                className="flex h-10 w-10 items-center justify-center rounded-xl border transition-colors duration-300 ease-in-out hover:bg-[var(--surface-muted)]"
                style={{ color: 'var(--text)', borderColor: 'var(--border-soft)' }}
                aria-label={sidebarState.collapsed ? 'Paneli aç' : 'Paneli daralt'}
                title={sidebarState.collapsed ? 'Paneli aç' : 'Paneli daralt'}
              >
                <DesktopSidebarToggleIcon size={18} />
              </button>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{panelTitle}</p>
                <p className="text-xs text-[var(--text-secondary)]">Yönetim paneli</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => router.push('/dashboard/calls')}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border transition-colors duration-300 ease-in-out hover:bg-[var(--surface-muted)]"
                  style={{ color: 'var(--text)', borderColor: 'var(--border-soft)' }}
                  aria-label="Çağrılar"
                  title="Çağrılar"
                >
                  <Bell size={18} />
                </button>
                {pendingCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: '#ef4444' }}
                  >
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="flex h-10 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors duration-300 ease-in-out hover:bg-[var(--surface-muted)]"
                style={{ color: 'var(--text)', borderColor: 'var(--border-soft)' }}
                aria-label="Çıkış"
                title="Çıkış"
              >
                <LogOut size={16} />
                <span className="ml-2">Çıkış</span>
              </button>
            </div>
          </div>

          {connectionLost && (
            <div
              className="px-4 py-2 text-center text-sm"
              style={{ background: 'var(--surface-muted)', color: 'var(--text)', borderBottom: '1px solid var(--border-soft)' }}
            >
              Bağlantı koptu, yeniden bağlanılıyor...
            </div>
          )}
          {accessBlockMessage && (
            <div
              className="px-4 py-3 text-center text-sm"
              style={
                hasExpiredAccess
                  ? { background: 'var(--error-soft)', color: 'var(--error)', borderBottom: '1px solid rgba(239,68,68,0.24)' }
                  : { background: 'var(--warning-soft)', color: 'var(--warning)', borderBottom: '1px solid rgba(245,158,11,0.24)' }
              }
            >
              {accessBlockMessage} Admin panelinde uyarı gösterilir ve QR menü geçici olarak kullanılamıyor.
            </div>
          )}
          {children}
        </main>
      </div>
    </OnboardingProvider>
  )
}
