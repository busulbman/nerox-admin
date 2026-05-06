'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const NAV = [
  { href: '/dashboard',          label: 'Genel Bakış', icon: '📊' },
  { href: '/dashboard/menu',     label: 'Menü',        icon: '🍽️' },
  { href: '/dashboard/calls',    label: 'Çağrılar',    icon: '🔔' },
  { href: '/dashboard/tables',   label: 'Masalar / QR', icon: '🪑' },
  { href: '/dashboard/ratings',  label: 'Yorumlar',    icon: '⭐' },
  { href: '/dashboard/waiters',  label: 'Garsonlar',   icon: '👨‍🍳' },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  async function handleLogout() {
    await signOut(auth).catch(() => {})
    router.replace('/login')
  }

  return (
    <>
      {/* ── Mobile overlay ── */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={[
          // Layout
          'fixed md:static inset-y-0 left-0 z-50',
          'w-64 shrink-0 flex flex-col min-h-screen',
          // Slide animation (mobile only)
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Always visible on desktop
          'md:translate-x-0',
        ].join(' ')}
        style={{ background: '#3d2b1f' }}
      >
        {/* Close button (mobile only) */}
        <div className="md:hidden flex items-center justify-between px-5 pt-4 pb-1">
          <p className="font-bold text-base" style={{ color: '#d4a017' }}>☕ Nerox Admin</p>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none px-1"
            aria-label="Menüyü kapat"
          >
            ×
          </button>
        </div>

        {/* Logo (desktop only) */}
        <div className="hidden md:block px-6 py-5 border-b border-white/10">
          <p className="font-bold text-lg" style={{ color: '#d4a017' }}>☕ Nerox Admin</p>
          <p className="text-white/50 text-xs mt-0.5">Varina Chocolate</p>
        </div>

        {/* Nav */}
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
                    ? { background: '#d4a017', color: '#3d2b1f', fontWeight: 600 }
                    : { color: 'rgba(255,255,255,0.75)' }
                }
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <span>🚪</span> Çıkış Yap
          </button>
        </div>
      </aside>
    </>
  )
}
