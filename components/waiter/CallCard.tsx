import { getCallTableLabel } from '@/lib/firestore-models'
import OrderBreakdown from '@/components/orders/OrderBreakdown'
import type { WaiterCall } from '@/lib/types'

const TIP_META: Record<string, { icon: string; label: string; accent: string; lightBg: string }> = {
  sipariş: { icon: '📋', label: 'Sipariş',  accent: '#c2410c', lightBg: '#fff7ed' },
  hesap:   { icon: '💳', label: 'Hesap',    accent: '#15803d', lightBg: '#f0fdf4' },
  yardım:  { icon: '🙋', label: 'Yardım',   accent: '#1d4ed8', lightBg: '#eff6ff' },
}

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
}

export default function CallCard({ call, variant, onAccept, onComplete, busy = false }: Props) {
  const meta = TIP_META[call.tip] ?? TIP_META.yardım

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: '#fff',
        border: `2px solid ${variant === 'pending' ? '#e5e7eb' : meta.accent}`,
        boxShadow: variant === 'active' ? `0 0 0 4px ${meta.lightBg}` : undefined,
      }}
    >
      {/* Top bar */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ background: variant === 'active' ? meta.lightBg : '#f9fafb' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
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
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            ⏱ {elapsed(call.createdAt)} önce
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p
              className="text-3xl font-black tracking-tight"
              style={{ color: '#3d2b1f' }}
            >
              Masa {getCallTableLabel(call)}
            </p>
            {call.note ? (
              <p className="text-sm text-gray-500 mt-1 italic">&quot;{call.note}&quot;</p>
            ) : null}
            {call.customerName && call.tip !== 'sipariş' ? (
              <p className="text-xs text-gray-500 mt-1">
                Müşteri: <span className="font-semibold text-[#3d2b1f]">{call.customerName}</span>
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

        {/* Action button */}
        {variant === 'pending' && onAccept ? (
          <button
            onClick={onAccept}
            disabled={busy}
            className="w-full py-4 rounded-xl font-bold text-base active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: '#d4a017', color: '#3d2b1f' }}
          >
            {busy ? 'Kabul Ediliyor...' : 'Kabul Et →'}
          </button>
        ) : variant === 'active' && onComplete ? (
          <button
            onClick={onComplete}
            disabled={busy}
            className="w-full py-4 rounded-xl font-bold text-base active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: '#22c55e', color: '#fff' }}
          >
            {busy ? 'Tamamlanıyor...' : '✓ Tamamlandı'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
