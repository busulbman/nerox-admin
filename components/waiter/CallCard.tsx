import { Check, ChefHat, Clock3 } from 'lucide-react'
import { getCallTableLabel } from '@/lib/firestore-models'
import CustomerRewards from '@/components/orders/CustomerRewards'
import LoyaltyPreviewBadge from '@/components/orders/LoyaltyPreviewBadge'
import OrderBreakdown from '@/components/orders/OrderBreakdown'
import { getCallTipUi } from '@/lib/call-tip-ui'
import type { WaiterCall } from '@/lib/types'

function elapsed(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff} sn`
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`
  return `${Math.floor(diff / 3600)} sa`
}

interface Props {
  call: WaiterCall
  variant: 'pending' | 'active'
  onAccept?: () => void
  onComplete?: () => void
  busy?: boolean
  restaurantId?: string
  actor?: { uid: string; name: string; role: 'admin' | 'waiter' }
}

export default function CallCard({ call, variant, onAccept, onComplete, busy = false, restaurantId, actor }: Props) {
  const meta = getCallTipUi(call.tip)
  const AccentIcon = meta.Icon

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: '#fff',
        border: `2px solid ${variant === 'pending' ? '#e5e7eb' : meta.accent}`,
        boxShadow: variant === 'active' ? `0 0 0 4px ${meta.surface}` : undefined,
      }}
    >
      {/* Top bar */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ background: variant === 'active' ? meta.surface : '#f9fafb' }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: meta.surface, color: meta.accent }}>
            <AccentIcon className="h-5 w-5" />
          </span>
          <span
            className="font-semibold text-sm"
            style={{ color: meta.accent }}
          >
            {meta.label}
          </span>
          {variant === 'active' && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ background: meta.accent, color: '#fff' }}
            >
              Aktif
            </span>
          )}
          {call.tip === 'sipariş' && call.kitchenStatus === 'ready' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500 px-2 py-0.5 text-xs font-medium text-white">
              <ChefHat className="h-3 w-3" />
              Hazır
            </span>
          )}
          {call.tip === 'sipariş' && call.kitchenStatus === 'preparing' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-medium text-white">
              <ChefHat className="h-3 w-3" />
              Hazırlanıyor
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <Clock3 className="h-3.5 w-3.5" />
            {elapsed(call.createdAt)} önce
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p
              className="text-3xl font-black tracking-tight"
              style={{ color: 'var(--text)' }}
            >
              Masa {getCallTableLabel(call)}
            </p>
            {call.note ? (
              <p className="text-sm text-gray-500 mt-1 italic">&quot;{call.note}&quot;</p>
            ) : null}
            {call.customerName && call.tip !== 'sipariş' ? (
              <p className="text-xs text-gray-500 mt-1">
                Müşteri: <span className="font-semibold text-[var(--text)]">{call.customerName}</span>
              </p>
            ) : null}
            {variant === 'active' && call.acceptedAt ? (
              <p className="text-xs text-gray-400 mt-1">
                {elapsed(call.acceptedAt)} önce kabul edildi
              </p>
            ) : null}
          </div>
        </div>

        <OrderBreakdown call={call} className="mb-3" />

        {call.loyaltyPreview && call.loyaltyPreview.eligible && (
          <div className="mb-3">
            <LoyaltyPreviewBadge preview={call.loyaltyPreview} />
          </div>
        )}

        {call.customerId && restaurantId && actor && (
          <div className="mb-3">
            <CustomerRewards
              restaurantId={restaurantId}
              customerId={call.customerId}
              customerName={call.customerName}
              actor={actor}
            />
          </div>
        )}

        {/* Action button */}
        {variant === 'pending' && onAccept ? (
          <button
            onClick={onAccept}
            disabled={busy}
            className="w-full py-4 rounded-xl font-bold text-base active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {busy ? 'Kabul Ediliyor...' : 'Kabul Et →'}
          </button>
        ) : variant === 'active' && onComplete ? (
          <button
            onClick={onComplete}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition-transform active:scale-95 disabled:opacity-50"
            style={{ background: '#22c55e', color: '#fff' }}
          >
            {busy ? 'Tamamlanıyor...' : <><Check className="h-5 w-5" />Tamamlandı</>}
          </button>
        ) : null}
      </div>
    </div>
  )
}
