'use client'

import { useEffect, useState } from 'react'
import { Gift, LoaderCircle, Check } from 'lucide-react'
import { getCustomerAvailableRewards, redeemReward } from '@/lib/loyalty-rewards'
import type { LoyaltyReward } from '@/lib/types'

export default function CustomerRewards({
  restaurantId,
  customerId,
  customerName,
  actor,
}: {
  restaurantId: string
  customerId: string
  customerName?: string
  actor: { uid: string; name: string; role: 'admin' | 'waiter' }
}) {
  const [rewards, setRewards] = useState<LoyaltyReward[]>([])
  const [loading, setLoading] = useState(true)
  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!restaurantId || !customerId) return

    let cancelled = false
    getCustomerAvailableRewards(restaurantId, customerId)
      .then((data) => {
        if (!cancelled) {
          setRewards(data)
          setLoading(false)
        }
      })
      .catch((error) => {
        console.error('Failed to load rewards:', error)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [restaurantId, customerId])

  async function handleRedeem(reward: LoyaltyReward) {
    if (redeemingId) return

    setRedeemingId(reward.id)
    setMessage(null)

    try {
      await redeemReward(restaurantId, customerId, reward.id, actor)
      setRewards((current) => current.filter((r) => r.id !== reward.id))
      setMessage({ type: 'success', text: `${reward.rewardQuantity} ${reward.rewardProductName} hediyesi kullanıldı.` })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Hediye kullanılamadı.' })
    } finally {
      setRedeemingId(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.06)] p-3">
        <div className="flex items-center gap-2 text-sm text-[#166534]">
          <LoaderCircle size={16} className="animate-spin" />
          <span>Hediyeler yükleniyor...</span>
        </div>
      </div>
    )
  }

  if (rewards.length === 0) return null

  return (
    <div className="rounded-xl border border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.06)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Gift size={16} className="text-[#16a34a]" />
        <span className="text-sm font-semibold text-[#166534]">
          {customerName ? `${customerName} hediye hakkı var` : 'Müşteri hediye hakkı var'}
        </span>
      </div>

      {message && (
        <div
          className="mb-2 rounded-lg px-3 py-2 text-xs"
          style={
            message.type === 'success'
              ? { background: 'rgba(34,197,94,0.15)', color: '#166534' }
              : { background: 'rgba(239,68,68,0.1)', color: '#b91c1c' }
          }
        >
          {message.text}
        </div>
      )}

      <div className="space-y-2">
        {rewards.map((reward) => (
          <div
            key={reward.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 border border-[rgba(34,197,94,0.18)]"
          >
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                {reward.rewardQuantity} {reward.rewardProductName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{reward.campaignName}</p>
            </div>
            <button
              onClick={() => handleRedeem(reward)}
              disabled={redeemingId === reward.id}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: '#16a34a' }}
            >
              {redeemingId === reward.id ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Kullandır
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
