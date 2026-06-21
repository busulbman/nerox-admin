import type { CartItem, CustomerGroup } from '@/lib/types'

type CartItemLike = Partial<CartItem>

export function normalizeCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const item = value as CartItemLike
  const productId = typeof item.productId === 'string' ? item.productId : ''
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  const customerName = typeof item.customerName === 'string' ? item.customerName.trim() : ''
  const price = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0
  const quantity =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity)
      ? Math.max(0, Math.floor(item.quantity))
      : 0

  if (!productId || !name || !customerName || quantity <= 0) return null

  return {
    productId,
    name,
    price,
    quantity,
    customerName,
  }
}

export function groupCartItemsByCustomer(items: CartItem[]): Record<string, CustomerGroup> {
  const groups: Record<string, CustomerGroup> = {}

  for (const item of items) {
    if (!groups[item.customerName]) {
      groups[item.customerName] = { total: 0, items: [] }
    }

    groups[item.customerName].items.push(item)
    groups[item.customerName].total += item.price * item.quantity
  }

  return groups
}

export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function mergeCartItems(existing: CartItem[], incoming: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>()

  for (const item of [...existing, ...incoming]) {
    const key = `${item.customerName}::${item.productId}`
    const prev = merged.get(key)

    if (!prev) {
      merged.set(key, { ...item })
      continue
    }

    merged.set(key, {
      ...prev,
      quantity: prev.quantity + item.quantity,
      price: item.price,
      name: item.name,
    })
  }

  return [...merged.values()]
}
