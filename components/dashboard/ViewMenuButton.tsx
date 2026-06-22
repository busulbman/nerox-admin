'use client'

import { useEffect, useMemo, useState } from 'react'
import { getDocs } from 'firebase/firestore'
import { ExternalLink, UtensilsCrossed } from 'lucide-react'
import { logFirestoreRead } from '@/lib/firestore-debug'
import { normalizeTable } from '@/lib/firestore-models'
import { getRestaurantTablesQuery } from '@/lib/firestore-queries'

interface ViewMenuButtonProps {
  restaurantId: string
  slug?: string | null
  textColor: string
  onNavigate?: () => void
}

export default function ViewMenuButton({
  restaurantId,
  slug,
  textColor,
  onNavigate,
}: ViewMenuButtonProps) {
  const [firstTableId, setFirstTableId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!restaurantId) return

    let cancelled = false

    async function loadFirstTable() {
      setLoading(true)
      setError('')

      try {
        logFirestoreRead('dashboard/menu preview first table', restaurantId)
        const snap = await getDocs(getRestaurantTablesQuery(restaurantId, 1))
        if (cancelled) return

        if (snap.empty) {
          setFirstTableId(null)
          return
        }

        const firstTable = normalizeTable(snap.docs[0].id, snap.docs[0].data() as Record<string, unknown>)
        setFirstTableId(firstTable.id || String(firstTable.number))
      } catch (loadError) {
        console.error('İlk masa yüklenemedi:', loadError)
        if (!cancelled) {
          setFirstTableId(null)
          setError('Menü linki hazırlanamadı.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadFirstTable()

    return () => {
      cancelled = true
    }
  }, [restaurantId])

  const menuPath = useMemo(() => {
    if (!firstTableId) return null
    return `/menu/${slug?.trim() || restaurantId}/${firstTableId}`
  }, [firstTableId, restaurantId, slug])

  const mutedTextColor = `${textColor}80`
  const disabled = loading || !menuPath

  return (
    <div className="px-3 pb-4">
      <a
        href={menuPath ?? undefined}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (!menuPath) {
            event.preventDefault()
            return
          }
          onNavigate?.()
        }}
        aria-disabled={disabled}
        className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
        style={{
          color: textColor,
          background: textColor === '#ffffff' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          opacity: disabled ? 0.6 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        <span className="flex items-center gap-3 min-w-0">
          <UtensilsCrossed size={18} />
          <span className="truncate">{loading ? 'Menü hazırlanıyor...' : 'Menüyü Görüntüle'}</span>
        </span>
        <ExternalLink size={16} />
      </a>

      {!loading && !menuPath && !error && (
        <p className="mt-2 px-1 text-[11px]" style={{ color: mutedTextColor }}>
          Önce masa oluşturun.
        </p>
      )}

      {!loading && error && (
        <p className="mt-2 px-1 text-[11px]" style={{ color: '#fecaca' }}>
          {error}
        </p>
      )}
    </div>
  )
}
