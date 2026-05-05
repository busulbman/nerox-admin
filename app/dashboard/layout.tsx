'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }

    // Profil yüklendi ama waiter rolü → garson paneline yönlendir
    if (profile?.role === 'waiter') {
      router.replace('/waiter')
      return
    }

    // Profil yok (ilk admin kurulumu) veya admin → erişim izni verilir
  }, [user, profile, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f4' }}>
        <p className="text-sm" style={{ color: 'rgba(61,43,31,0.4)' }}>Yükleniyor...</p>
      </div>
    )
  }

  // Waiter gelip burada sıkışmasın
  if (profile?.role === 'waiter') return null
  if (!user) return null

  return (
    <div className="flex min-h-screen" style={{ background: '#faf7f4' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
