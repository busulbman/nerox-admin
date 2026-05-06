'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { onSnapshot } from 'firebase/firestore'
import { useAuth } from '@/components/AuthProvider'
import { rc } from '@/lib/firebase'
import { requestPermission, showNotification } from '@/lib/notifications'
import Sidebar from '@/components/Sidebar'

const TIP_LABEL: Record<string, string> = { sipariş: 'Sipariş', hesap: 'Hesap', yardım: 'Yardım' }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const prevCallIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    if (profile?.role === 'waiter') { router.replace('/waiter'); return }
  }, [user, profile, loading, router])

  // Bildirim izni — admin/profil yok durumunda da çalışır
  useEffect(() => {
    if (!user || profile?.role === 'waiter') return
    requestPermission()
  }, [user, profile])

  // Yeni bekleyen çağrılarda bildirim gönder
  useEffect(() => {
    if (!user || profile?.role === 'waiter') return

    const unsub = onSnapshot(rc('calls'), (snap) => {
      const pendingDocs = snap.docs.filter((d) => d.data().durum === 'bekliyor')

      if (initialized.current) {
        for (const d of pendingDocs) {
          if (!prevCallIds.current.has(d.id)) {
            const data = d.data()
            const tableNum = data.tableNumber ?? data.tableId ?? '?'
            const tip = TIP_LABEL[data.tip as string] ?? (data.tip as string) ?? ''
            showNotification(`🔔 Masa ${tableNum} Çağırıyor`, `${tip} talebi`, '/dashboard/calls')
          }
        }
      }

      initialized.current = true
      prevCallIds.current = new Set(pendingDocs.map((d) => d.id))
    })

    return unsub
  }, [user, profile])

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
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
