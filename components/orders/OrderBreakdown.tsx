import { calculateCartTotal, groupCartItemsByCustomer } from '@/lib/order-utils'
import type { CartItem, CustomerGroup, WaiterCall } from '@/lib/types'

function formatPrice(price: number) {
  return `₺${price.toLocaleString('tr-TR')}`
}

function getCallGroups(call: Pick<WaiterCall, 'items' | 'groupedByCustomer'>): Record<string, CustomerGroup> {
  if (call.groupedByCustomer && Object.keys(call.groupedByCustomer).length > 0) {
    return call.groupedByCustomer
  }

  return call.items && call.items.length > 0 ? groupCartItemsByCustomer(call.items) : {}
}

function getGroupItemsKey(customerName: string, items: CartItem[]) {
  return `${customerName}-${items.map((item) => `${item.productId}-${item.quantity}`).join('_')}`
}

export default function OrderBreakdown({
  call,
  className = '',
  showCustomerLabel = true,
}: {
  call: Pick<WaiterCall, 'tip' | 'customerName' | 'items' | 'groupedByCustomer' | 'totalPrice'>
  className?: string
  showCustomerLabel?: boolean
}) {
  if (call.tip !== 'sipariş') return null

  const groups = getCallGroups(call)
  const groupEntries = Object.entries(groups)
  const allItems = groupEntries.flatMap(([, group]) => group.items)
  const totalPrice = call.totalPrice ?? calculateCartTotal(allItems)

  if (groupEntries.length === 0 && !call.customerName) return null

  return (
    <div className={`rounded-xl border border-black/5 bg-white/75 p-3 ${className}`}>
      {showCustomerLabel && call.customerName && (
        <p className="text-xs font-medium text-gray-500 mb-2">
          Siparişi oluşturan: <span className="font-semibold text-[var(--text)]">{call.customerName}</span>
        </p>
      )}

      <div className="space-y-2.5">
        {groupEntries.map(([customerName, group]) => (
          <div key={getGroupItemsKey(customerName, group.items)} className="rounded-lg bg-white px-3 py-2.5 border border-black/5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text)]">{customerName}</p>
              <p className="text-sm font-bold text-[var(--primary)]">{formatPrice(group.total)}</p>
            </div>

            <div className="mt-2 space-y-1.5">
              {group.items.map((item) => (
                <div key={`${customerName}-${item.productId}`} className="flex items-center justify-between gap-3 text-xs">
                  <p className="min-w-0 text-gray-600">
                    <span className="font-semibold text-[var(--text)]">{item.quantity}x</span> {item.name}
                  </p>
                  <span className="shrink-0 font-medium text-gray-500">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {totalPrice > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-black/6 pt-3">
          <span className="text-sm font-semibold text-[var(--text)]">Masa Toplamı</span>
          <span className="text-sm font-bold text-[var(--primary)]">{formatPrice(totalPrice)}</span>
        </div>
      )}
    </div>
  )
}
