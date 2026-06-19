'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getDocs, onSnapshot, type QuerySnapshot } from 'firebase/firestore'
import { logFirestoreRead } from '@/lib/firestore-debug'
import { normalizeWaiterCall } from '@/lib/firestore-models'
import { getRestaurantOpenCallsQuery } from '@/lib/firestore-queries'
import type { WaiterCall } from '@/lib/types'

type OpenCallsContextValue = {
  openCalls: WaiterCall[]
  pendingCalls: WaiterCall[]
  pendingCount: number
  connectionLost: boolean
}

const OpenCallsContext = createContext<OpenCallsContextValue>({
  openCalls: [],
  pendingCalls: [],
  pendingCount: 0,
  connectionLost: false,
})

export function OpenCallsProvider({
  restaurantId,
  children,
}: {
  restaurantId: string
  children: React.ReactNode
}) {
  const [openCalls, setOpenCalls] = useState<WaiterCall[]>([])
  const [connectionLost, setConnectionLost] = useState(false)

  useEffect(() => {
    if (!restaurantId) return

    function processSnapshot(snap: QuerySnapshot) {
      setConnectionLost(false)
      setOpenCalls(
        snap.docs.map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
      )
    }

    function handleSnapshotError(error: Error) {
      console.error('Dashboard Firestore bağlantı hatası:', error)
      setConnectionLost(true)
    }

    logFirestoreRead('dashboard/open calls listener', restaurantId)
    const unsubscribe = onSnapshot(
      getRestaurantOpenCallsQuery(restaurantId),
      processSnapshot,
      handleSnapshotError
    )

    // Visibility/focus handler: refetch when tab becomes active again
    async function refetchOnWake() {
      try {
        logFirestoreRead('dashboard/refetch on wake', restaurantId)
        const snap = await getDocs(getRestaurantOpenCallsQuery(restaurantId))
        processSnapshot(snap)
      } catch (err) {
        console.error('Dashboard çağrı yenileme hatası:', err)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refetchOnWake()
      }
    }

    function handleFocus() {
      void refetchOnWake()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [restaurantId])

  const value = useMemo(() => {
    const pendingCalls = openCalls.filter((call) => call.durum === 'bekliyor')
    return {
      openCalls,
      pendingCalls,
      pendingCount: pendingCalls.length,
      connectionLost,
    }
  }, [openCalls, connectionLost])

  return <OpenCallsContext.Provider value={value}>{children}</OpenCallsContext.Provider>
}

export function useOpenCalls() {
  return useContext(OpenCallsContext)
}
