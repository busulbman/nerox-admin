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
  compact?: boolean
  onNavigate?: () => void
}

export default function ViewMenuButton({
  restaurantId,
  slug,
  textColor,
  compact = false,
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
  const buttonLabel = loading ? 'Menü hazırlanıyor...' : 'Menüyü Görüntüle'

  return (
    <div className={['px-3 pb-4', compact ? 'md:px-2' : ''].join(' ')}>
      <div className="group relative">
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
          className={[
            'flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 ease-in-out',
            compact ? 'md:justify-center md:px-0' : '',
          ].join(' ')}
          style={{
            color: textColor,
            background: textColor === '#ffffff' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            opacity: disabled ? 0.6 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
          }}
          title={compact ? buttonLabel : undefined}
        >
          <span className={['flex min-w-0 items-center gap-3', compact ? 'md:justify-center' : ''].join(' ')}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              <UtensilsCrossed size={18} />
            </span>
            <span className={compact ? 'truncate md:hidden' : 'truncate'}>{buttonLabel}</span>
          </span>
          <ExternalLink size={16} className={compact ? 'md:hidden' : ''} />
        </a>

        {compact && (
          <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--text)] px-3 py-1.5 text-xs font-medium text-white shadow-lg md:block md:translate-x-1 md:opacity-0 md:transition-all md:duration-200 md:ease-out md:group-hover:translate-x-0 md:group-hover:opacity-100">
            {buttonLabel}
            <div className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[var(--text)]" />
          </div>
        )}
      </div>

      {!loading && !menuPath && !error && (
        <p className={compact ? 'mt-2 px-1 text-[11px] md:hidden' : 'mt-2 px-1 text-[11px]'} style={{ color: mutedTextColor }}>
          Önce masa oluşturun.
        </p>
      )}

      {!loading && error && (
        <p className={compact ? 'mt-2 px-1 text-[11px] md:hidden' : 'mt-2 px-1 text-[11px]'} style={{ color: '#fecaca' }}>
          {error}
        </p>
      )}
    </div>
  )
}
