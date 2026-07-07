'use client'

import { Gift } from 'lucide-react'
import type { LoyaltyPreview } from '@/lib/types'

interface LoyaltyPreviewBadgeProps {
  preview: LoyaltyPreview
  variant?: 'pending' | 'eligible'
}

export default function LoyaltyPreviewBadge({ preview, variant = 'eligible' }: LoyaltyPreviewBadgeProps) {
  const isPending = variant === 'pending'

  return (
    <div
      className="rounded-xl px-3 py-2.5 border"
      style={{
        background: isPending ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
        borderColor: isPending ? 'rgba(245,158,11,0.22)' : 'rgba(34,197,94,0.22)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{
            background: isPending ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
          }}
        >
          <Gift
            size={16}
            style={{ color: isPending ? '#d97706' : '#16a34a' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-medium"
            style={{ color: isPending ? '#92400e' : '#166534' }}
          >
            {isPending
              ? 'Hesap ödenince kazanacak:'
              : 'Hesap ödenince kazanır:'}
          </p>
          <p
            className="text-sm font-bold mt-0.5"
            style={{ color: isPending ? '#b45309' : '#15803d' }}
          >
            {preview.rewardQuantity} {preview.rewardProductName}
          </p>
        </div>
      </div>
    </div>
  )
}
