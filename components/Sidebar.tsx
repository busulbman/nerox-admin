'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import {
  LayoutDashboard,
  UtensilsCrossed,
  Bell,
  QrCode,
  Star,
  Users,
  Settings,
  LogOut,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import ViewMenuButton from '@/components/dashboard/ViewMenuButton'
import { useRestaurantSettingsContext } from '@/components/RestaurantSettingsProvider'
import { auth } from '@/lib/firebase'
import { resolveRestaurantBusinessName, resolveRestaurantLogoUrl, getContrastColor } from '@/lib/restaurant-settings'

const NAV = [
  { href: '/dashboard',          label: 'Genel Bakış',   Icon: LayoutDashboard },
  { href: '/dashboard/menu',     label: 'Menü',          Icon: UtensilsCrossed },
  { href: '/dashboard/calls',    label: 'Çağrılar',      Icon: Bell },
  { href: '/dashboard/tables',   label: 'Masalar / QR',  Icon: QrCode },
  { href: '/dashboard/ratings',  label: 'Yorumlar',      Icon: Star },
  { href: '/dashboard/waiters',  label: 'Garsonlar',     Icon: Users },
  { href: '/dashboard/settings', label: 'Genel Ayarlar', Icon: Settings },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const { profile } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const { settings, primaryColor } = useRestaurantSettingsContext()

  const restaurantId = profile?.restaurantId || ''
  const businessName = resolveRestaurantBusinessName(settings)
  const logoUrl = resolveRestaurantLogoUrl(settings)
  const textColor = getContrastColor(primaryColor)
  const activeItemBg = textColor === '#ffffff' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'
  const panelTitle = `${businessName} Yönetim Paneli`

  async function handleLogout() {
    await signOut(auth).catch(() => {})
    router.replace('/login')
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          'fixed md:static inset-y-0 left-0 z-50',
          'w-64 shrink-0 flex flex-col min-h-screen',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
        ].join(' ')}
        style={{ background: primaryColor }}
      >
        <div className="md:hidden flex items-center justify-between px-5 pt-4 pb-1">
          <p className="font-bold text-base" style={{ color: textColor }}>{panelTitle}</p>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: textColor }}
            aria-label="Menüyü kapat"
          >
            <X size={20} />
          </button>
        </div>

        <div className="hidden md:block px-6 py-5 border-b" style={{ borderColor: `${textColor}20` }}>
          <div className="flex items-center gap-3">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={businessName}
                className="h-10 w-10 rounded-xl object-cover"
                style={{ border: `1px solid ${textColor}20` }}
              />
            )}
            <div>
              <p className="font-bold text-lg" style={{ color: textColor }}>{panelTitle}</p>
              <p className="text-xs mt-0.5" style={{ color: `${textColor}80` }}>Yönetim</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors"
                style={
                  active
                    ? { background: activeItemBg, color: textColor, fontWeight: 600 }
                    : { color: `${textColor}bf` }
                }
              >
                <item.Icon size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <ViewMenuButton
          restaurantId={restaurantId}
          slug={settings?.slug}
          textColor={textColor}
          onNavigate={onClose}
        />

        <div className="px-3 py-4 border-t" style={{ borderColor: `${textColor}20` }}>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg transition-colors hover:opacity-80"
            style={{ color: `${textColor}80` }}
          >
            <LogOut size={18} />
            Çıkış Yap
          </button>
        </div>
      </aside>
    </>
  )
}
