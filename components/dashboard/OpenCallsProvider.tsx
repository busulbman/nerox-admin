'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { logFirestoreRead } from '@/lib/firestore-debug'
import { normalizeWaiterCall } from '@/lib/firestore-models'
import { getRestaurantOpenCallsQuery } from '@/lib/firestore-queries'
import type { WaiterCall } from '@/lib/types'

type OpenCallsContextValue = {
  openCalls: WaiterCall[]
  pendingCalls: WaiterCall[]
  pendingCount: number
}

const OpenCallsContext = createContext<OpenCallsContextValue>({
  openCalls: [],
  pendingCalls: [],
  pendingCount: 0,
})

export function OpenCallsProvider({
  restaurantId,
  children,
}: {
  restaurantId: string
  children: React.ReactNode
}) {
  const [openCalls, setOpenCalls] = useState<WaiterCall[]>([])

  useEffect(() => {
    if (!restaurantId) return

    logFirestoreRead('dashboard/open calls listener', restaurantId)
    const unsubscribe = onSnapshot(getRestaurantOpenCallsQuery(restaurantId), (snap) => {
      setOpenCalls(
        snap.docs.map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
      )
    })

    return unsubscribe
  }, [restaurantId])

  const value = useMemo(() => {
    const pendingCalls = openCalls.filter((call) => call.durum === 'bekliyor')
    return {
      openCalls,
      pendingCalls,
      pendingCount: pendingCalls.length,
    }
  }, [openCalls])

  return <OpenCallsContext.Provider value={value}>{children}</OpenCallsContext.Provider>
}

export function useOpenCalls() {
  return useContext(OpenCallsContext)
}
