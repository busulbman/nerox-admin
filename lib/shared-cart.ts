import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { SharedCartItem, CartItem, Product } from '@/lib/types'

export function normalizeSharedCartItem(id: string, data: Record<string, unknown>): SharedCartItem | null {
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : ''
  const customerId = typeof data.customerId === 'string' ? data.customerId : ''
  const customerName = typeof data.customerName === 'string' ? data.customerName.trim() : ''
  const productId = typeof data.productId === 'string' ? data.productId : ''
  const productName = typeof data.productName === 'string' ? data.productName.trim() : ''
  const price = typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : 0
  const quantity = typeof data.quantity === 'number' && Number.isFinite(data.quantity) ? Math.max(0, Math.floor(data.quantity)) : 0

  if (!sessionId || !customerId || !customerName || !productId || !productName || quantity <= 0) {
    return null
  }

  return {
    id,
    sessionId,
    customerId,
    customerName,
    productId,
    productName,
    productDescription: typeof data.productDescription === 'string' ? data.productDescription : undefined,
    productImage: typeof data.productImage === 'string' ? data.productImage : undefined,
    price,
    quantity,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    updatedAt: toMillis(data.updatedAt) ?? Date.now(),
  }
}

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis()
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  return null
}

export function getCartItemsCollectionPath(restaurantId: string, tableId: string) {
  return `restaurants/${restaurantId}/tables/${tableId}/cartItems`
}

export function subscribeToSharedCart(
  restaurantId: string,
  tableId: string,
  sessionId: string,
  onUpdate: (items: SharedCartItem[]) => void,
  onError?: (error: Error) => void
) {
  const cartQuery = query(
    collection(db, getCartItemsCollectionPath(restaurantId, tableId)),
    where('sessionId', '==', sessionId)
  )

  return onSnapshot(
    cartQuery,
    (snapshot) => {
      const items: SharedCartItem[] = []
      for (const docSnap of snapshot.docs) {
        const item = normalizeSharedCartItem(docSnap.id, docSnap.data() as Record<string, unknown>)
        if (item) items.push(item)
      }
      items.sort((a, b) => a.createdAt - b.createdAt)
      onUpdate(items)
    },
    (error) => {
      console.error('Shared cart subscription error:', error)
      onError?.(error)
    }
  )
}

export async function addToSharedCart(
  restaurantId: string,
  tableId: string,
  sessionId: string,
  customerId: string,
  customerName: string,
  product: Product,
  quantity: number
) {
  const cartItemId = `${customerId}_${product.id}`
  const cartItemRef = doc(db, getCartItemsCollectionPath(restaurantId, tableId), cartItemId)

  await setDoc(
    cartItemRef,
    {
      sessionId,
      customerId,
      customerName,
      productId: product.id,
      productName: product.name,
      productDescription: product.description || '',
      productImage: product.image || '',
      price: product.price,
      quantity,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: false }
  )

  return cartItemId
}

export async function updateSharedCartItemQuantity(
  restaurantId: string,
  tableId: string,
  cartItemId: string,
  quantity: number
) {
  const cartItemRef = doc(db, getCartItemsCollectionPath(restaurantId, tableId), cartItemId)

  if (quantity <= 0) {
    await deleteDoc(cartItemRef)
  } else {
    await setDoc(
      cartItemRef,
      {
        quantity,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  }
}

export async function incrementSharedCartItem(
  restaurantId: string,
  tableId: string,
  sessionId: string,
  customerId: string,
  customerName: string,
  product: Product,
  currentQuantity: number,
  delta: number
) {
  const newQuantity = currentQuantity + delta
  const cartItemId = `${customerId}_${product.id}`

  if (newQuantity <= 0) {
    await removeSharedCartItem(restaurantId, tableId, cartItemId)
  } else if (currentQuantity === 0 && delta > 0) {
    await addToSharedCart(restaurantId, tableId, sessionId, customerId, customerName, product, delta)
  } else {
    await updateSharedCartItemQuantity(restaurantId, tableId, cartItemId, newQuantity)
  }
}

export async function removeSharedCartItem(
  restaurantId: string,
  tableId: string,
  cartItemId: string
) {
  const cartItemRef = doc(db, getCartItemsCollectionPath(restaurantId, tableId), cartItemId)
  await deleteDoc(cartItemRef)
}

export async function clearSharedCartForSession(
  restaurantId: string,
  tableId: string,
  sessionId: string,
  cartItems: SharedCartItem[]
) {
  const sessionItems = cartItems.filter((item) => item.sessionId === sessionId)
  if (sessionItems.length === 0) return

  const batch = writeBatch(db)

  for (const item of sessionItems) {
    const cartItemRef = doc(db, getCartItemsCollectionPath(restaurantId, tableId), item.id)
    batch.delete(cartItemRef)
  }

  await batch.commit()
}

export function sharedCartToCartItems(items: SharedCartItem[]): CartItem[] {
  return items.map((item) => ({
    productId: item.productId,
    name: item.productName,
    price: item.price,
    quantity: item.quantity,
    customerName: item.customerName,
  }))
}

export function groupSharedCartByCustomer(items: SharedCartItem[]): Record<string, { total: number; items: SharedCartItem[] }> {
  const groups: Record<string, { total: number; items: SharedCartItem[] }> = {}

  for (const item of items) {
    if (!groups[item.customerName]) {
      groups[item.customerName] = { total: 0, items: [] }
    }

    groups[item.customerName].items.push(item)
    groups[item.customerName].total += item.price * item.quantity
  }

  return groups
}

export function calculateSharedCartTotal(items: SharedCartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function getSharedCartCount(items: SharedCartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}
