'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  UtensilsCrossed,
  Bell,
  QrCode,
  Star,
  Users,
  Settings,
  Gift,
  X,
  ChefHat,
  LifeBuoy,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import ViewMenuButton from '@/components/dashboard/ViewMenuButton'
import { useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { resolveRestaurantBusinessName, resolveRestaurantLogoUrl, getContrastColor } from '@/lib/restaurant-settings'
import { useFeatures } from '@/lib/use-features'
import type { RestaurantFeatures } from '@/lib/types'

type NavItem = {
  href: string
  label: string
  Icon: typeof LayoutDashboard
  onboardingId: string | null
  featureKey?: keyof RestaurantFeatures
}

const NAV: NavItem[] = [
  { href: '/dashboard',          label: 'Genel Bakış',   Icon: LayoutDashboard, onboardingId: 'dashboard' },
  { href: '/dashboard/menu',     label: 'Menü',          Icon: UtensilsCrossed, onboardingId: 'menu' },
  { href: '/dashboard/calls',    label: 'Çağrılar',      Icon: Bell,            onboardingId: 'calls' },
  { href: '/dashboard/kitchen',  label: 'Mutfak',        Icon: ChefHat,         onboardingId: null, featureKey: 'kitchen' },
  { href: '/dashboard/tables',   label: 'Masalar / QR',  Icon: QrCode,          onboardingId: 'tables' },
  { href: '/dashboard/loyalty',  label: 'Kampanyalar',   Icon: Gift,            onboardingId: 'campaigns', featureKey: 'loyalty' },
  { href: '/dashboard/ratings',  label: 'Yorumlar',      Icon: Star,            onboardingId: null },
  { href: '/dashboard/waiters',  label: 'Garsonlar',     Icon: Users,           onboardingId: 'waiters' },
  { href: '/dashboard/settings', label: 'Genel Ayarlar', Icon: Settings,        onboardingId: 'settings' },
]

interface SidebarProps {
  isOpen?: boolean
  isCollapsed?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, isCollapsed = false, onClose }: SidebarProps) {
  const { profile } = useAuth()
  const pathname = usePathname()
  const { settings, primaryColor, restaurant } = useRestaurantSettingsContext()
  const features = useFeatures(restaurant)

  const restaurantId = profile?.restaurantId || ''
  const businessName = resolveRestaurantBusinessName(settings)
  const logoUrl = resolveRestaurantLogoUrl(settings)
  const textColor = getContrastColor(primaryColor)
  const panelTitle = `${businessName} Yönetim Paneli`
  const businessInitial = businessName.trim().charAt(0).toUpperCase() || 'N'

  // Active item highlight: a translucent overlay of the sidebar's text color so
  // it reads clearly on top of any panelPrimaryColor background.
  const activeItemStyle = {
    background: textColor === '#ffffff' ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.12)',
    color: textColor,
    fontWeight: 600,
    boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
  } as const

  const visibleNav = NAV.filter((item) => {
    if (!item.featureKey) return true
    return features[item.featureKey]
  })

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || window.innerWidth >= 768) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previousBodyTouchAction = document.body.style.touchAction
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.touchAction = previousBodyTouchAction
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [isOpen])

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex min-h-[100dvh] shrink-0 flex-col overflow-x-visible overflow-y-auto overscroll-contain md:static md:min-h-screen',
          'w-[min(85vw,18rem)]',
          isCollapsed ? 'md:w-[72px]' : 'md:w-[280px]',
          'transform transition-[width,transform] duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
        ].join(' ')}
        style={{ background: primaryColor }}
      >
        <div className="md:hidden flex items-center justify-between px-5 pt-4 pb-1">
          <p className="min-w-0 flex-1 truncate pr-3 font-bold text-base" style={{ color: textColor }}>{panelTitle}</p>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: textColor }}
            aria-label="Menüyü kapat"
          >
            <X size={20} />
          </button>
        </div>

        <div
          className={[
            'hidden border-b py-5 transition-[padding] duration-300 ease-in-out md:flex',
            isCollapsed ? 'justify-center px-3' : 'px-5',
          ].join(' ')}
          style={{ borderColor: `${textColor}20` }}
        >
          <div className={['flex items-center', isCollapsed ? 'justify-center' : 'gap-3'].join(' ')}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={businessName}
                className="h-10 w-10 rounded-xl object-cover"
                style={{ border: `1px solid ${textColor}20` }}
                title={isCollapsed ? panelTitle : undefined}
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                style={{
                  color: textColor,
                  background: textColor === '#ffffff' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                  border: `1px solid ${textColor}20`,
                }}
                title={isCollapsed ? panelTitle : undefined}
              >
                {businessInitial}
              </div>
            )}

            <div className={isCollapsed ? 'hidden' : 'min-w-0'}>
              <p className="truncate font-bold text-lg" style={{ color: textColor }}>{panelTitle}</p>
              <p className="text-xs mt-0.5" style={{ color: `${textColor}80` }}>Yönetim</p>
            </div>
          </div>
        </div>

        <nav className={['flex-1 space-y-1 px-3 py-4', isCollapsed ? 'md:px-2' : ''].join(' ')}>
          {visibleNav.map((item) => {
            const active = item.href === '/dashboard'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <div key={item.href} className="group relative">
                <Link
                  href={item.href}
                  onClick={onClose}
                  data-onboarding={item.onboardingId || undefined}
                  className={[
                    'flex items-center rounded-xl text-sm transition-all duration-300 ease-in-out',
                    isCollapsed ? 'gap-3 px-4 py-2.5 md:justify-center md:px-0 md:py-3' : 'gap-3 px-4 py-2.5',
                  ].join(' ')}
                  style={active ? activeItemStyle : { color: `${textColor}bf` }}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <item.Icon size={18} />
                  </span>
                  <span className={isCollapsed ? 'md:hidden' : ''}>{item.label}</span>
                </Link>

                {isCollapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--text)] px-3 py-1.5 text-xs font-medium text-white shadow-lg md:block md:translate-x-1 md:opacity-0 md:transition-all md:duration-200 md:ease-out md:group-hover:translate-x-0 md:group-hover:opacity-100">
                    {item.label}
                    <div className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[var(--text)]" />
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <ViewMenuButton
          restaurantId={restaurantId}
          slug={settings?.slug}
          textColor={textColor}
          compact={isCollapsed}
          onNavigate={onClose}
        />

        <div className={['border-t px-3 py-4', isCollapsed ? 'md:px-2' : ''].join(' ')} style={{ borderColor: `${textColor}20` }}>
          {(() => {
            const active = pathname === '/dashboard/support' || pathname.startsWith('/dashboard/support/')
            return (
              <div className="group relative">
                <Link
                  href="/dashboard/support"
                  onClick={onClose}
                  className={[
                    'flex items-center rounded-xl text-sm transition-all duration-300 ease-in-out',
                    isCollapsed ? 'gap-3 px-4 py-2.5 md:justify-center md:px-0 md:py-3' : 'gap-3 px-4 py-2.5',
                  ].join(' ')}
                  style={active ? activeItemStyle : { color: `${textColor}bf` }}
                  title={isCollapsed ? 'İletişim & Destek' : undefined}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <LifeBuoy size={18} />
                  </span>
                  <span className={isCollapsed ? 'md:hidden' : ''}>İletişim &amp; Destek</span>
                </Link>

                {isCollapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--text)] px-3 py-1.5 text-xs font-medium text-white shadow-lg md:block md:translate-x-1 md:opacity-0 md:transition-all md:duration-200 md:ease-out md:group-hover:translate-x-0 md:group-hover:opacity-100">
                    İletişim &amp; Destek
                    <div className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[var(--text)]" />
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </aside>
    </>
  )
}
