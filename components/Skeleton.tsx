import type { CSSProperties } from 'react'

/**
 * Theme-aware skeleton primitive. Uses the dashboard theme surfaces so it works
 * with any panelPrimaryColor and in light/dark. Prefer these over spinners for
 * page/list loading states.
 */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: 'var(--surface-hover)', ...style }}
    />
  )
}

/** A neutral card shell with a few skeleton lines. */
export function SkeletonCard({ className = '', lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border-soft)' }}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  )
}

/** A responsive grid of skeleton cards for list/grid pages. */
export function SkeletonGrid({ count = 6, className = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' }: {
  count?: number
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
