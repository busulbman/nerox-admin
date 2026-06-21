'use client'

import Image from 'next/image'
import { useEffect, useEffectEvent, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { useAuth } from '@/components/AuthProvider'
import { getSessionOpenCallsQuery, getSessionPaymentCallsQuery } from '@/lib/firestore-queries'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { db } from '@/lib/firebase'
import { normalizeTable, normalizeWaiterCall } from '@/lib/firestore-models'
import {
  DEFAULT_MENU_PRIMARY_COLOR,
  EMPTY_MENU_THEME_SETTINGS,
  getMenuPrimaryTextColor,
  normalizeMenuThemeSettings,
  resolveMenuDisplayName,
} from '@/lib/menu-theme'
import {
  DEFAULT_SECONDARY_COLOR,
  EMPTY_RESTAURANT_GENERAL_SETTINGS,
  normalizeRestaurantGeneralSettings,
  resolveRestaurantBusinessName,
} from '@/lib/restaurant-settings'
import { calculateCartTotal, groupCartItemsByCustomer } from '@/lib/order-utils'
import type { CartItem, Category, MenuThemeSettings, Product, RestaurantGeneralSettings, Table, WaiterCall } from '@/lib/types'

type CallTip = 'sipariş' | 'hesap' | 'yardım'
type AccessState = 'checking' | 'ready' | 'locked' | 'cleaning' | 'missing' | 'error'
type TableLookupResult = { tableDocId: string; table: Table }
type RatingForm = { serviceRating: number; waiterRating: number; comment: string }
type ProductMeta = {
  imageUrl: string
  fallbackEmoji: string
  ingredientIcons: string[]
  prepTime: number
  calories: number
  rating: string
  popular: boolean
}

const TIP_OPTIONS: { tip: CallTip; icon: string; label: string; desc: string }[] = [
  { tip: 'sipariş', icon: '📋', label: 'Sipariş', desc: 'Sipariş vermek istiyorum' },
  { tip: 'hesap', icon: '💳', label: 'Hesap', desc: 'Hesabı getirin lütfen' },
  { tip: 'yardım', icon: '🙋', label: 'Yardım', desc: 'Yardıma ihtiyacım var' },
]

const ACTIVE_SESSION_MESSAGE = 'Bu masada aktif oturum var. Lütfen garsondan yardım isteyin.'
const CLEANING_MESSAGE = 'Bu masa şu anda hazırlanıyor. Lütfen garsondan yardım isteyin.'
const ACTIVE_HELP_REQUEST_MESSAGE = 'Zaten aktif yardım talebiniz var. Garsonunuz geliyor, lütfen bekleyin.'
const ACTIVE_PAYMENT_REQUEST_MESSAGE = 'Hesap talebiniz zaten iletildi. Lütfen garsonunuzu bekleyin.'
const SESSION_CLOSED_MESSAGE = 'Bu masa oturumu kapatıldı. Lütfen garsondan yardım isteyin.'
const STAFF_RATING_MESSAGE = 'Personel hesabı ile müşteri puanlaması gönderilemez.'
const EMPTY_RATING_FORM: RatingForm = { serviceRating: 0, waiterRating: 0, comment: '' }

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `session-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

function getSessionStorageKey(tableId: string) {
  return `nerox_session_${tableId}`
}

function getLegacySessionStorageKey(restaurantId: string, tableDocId: string) {
  return `nerox:table-session:${restaurantId}:${tableDocId}`
}

function readStoredSessionId(routeTableId: string, restaurantId: string, tableDocId?: string | null) {
  const primary = window.localStorage.getItem(getSessionStorageKey(routeTableId))
  if (primary) return primary
  if (!tableDocId) return null
  return window.localStorage.getItem(getLegacySessionStorageKey(restaurantId, tableDocId))
}

function persistSessionId(routeTableId: string, restaurantId: string, tableDocId: string, sessionId: string) {
  window.localStorage.setItem(getSessionStorageKey(routeTableId), sessionId)
  window.localStorage.setItem(getLegacySessionStorageKey(restaurantId, tableDocId), sessionId)
}

function clearStoredSessionId(routeTableId: string, restaurantId: string, tableDocId?: string | null) {
  window.localStorage.removeItem(getSessionStorageKey(routeTableId))
  if (tableDocId) {
    window.localStorage.removeItem(getLegacySessionStorageKey(restaurantId, tableDocId))
  }
}

function getRatingPromptKey(restaurantId: string, callId: string) {
  return `nerox:rating-prompted:${restaurantId}:${callId}`
}

function getCustomerNameKey(restaurantId: string, tableId: string) {
  return `nerox_customer_name_${restaurantId}_${tableId}`
}

function getCartKey(restaurantId: string, tableId: string, sessionId: string) {
  return `nerox_cart_${restaurantId}_${tableId}_${sessionId}`
}

function readCustomerName(restaurantId: string, tableId: string, sessionId: string): string | null {
  const tableScoped = window.localStorage.getItem(getCustomerNameKey(restaurantId, tableId))
  if (tableScoped) return tableScoped

  return window.localStorage.getItem(`nerox_customer_name_${restaurantId}_${tableId}_${sessionId}`)
}

function saveCustomerName(restaurantId: string, tableId: string, name: string) {
  window.localStorage.setItem(getCustomerNameKey(restaurantId, tableId), name)
}

function readCart(restaurantId: string, tableId: string, sessionId: string): CartItem[] {
  try {
    const stored = window.localStorage.getItem(getCartKey(restaurantId, tableId, sessionId))
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveCart(restaurantId: string, tableId: string, sessionId: string, cart: CartItem[]) {
  window.localStorage.setItem(getCartKey(restaurantId, tableId, sessionId), JSON.stringify(cart))
}

function hashString(value: string): number {
  return value.split('').reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0)
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase('tr')
}

function formatPrice(price: number) {
  return `₺${price.toLocaleString('tr-TR')}`
}

function getTipLockMessage(tip: CallTip | null): string | null {
  if (tip === 'yardım') return ACTIVE_HELP_REQUEST_MESSAGE
  if (tip === 'hesap') return ACTIVE_PAYMENT_REQUEST_MESSAGE
  return null
}

function getProductMeta(product: Product, categoryName: string): ProductMeta {
  const haystack = normalizeText(`${product.name} ${product.description} ${categoryName}`)
  const key = hashString(`${product.id}:${product.name}:${categoryName}`)
  const magnitude = Math.abs(key)

  const fallbackEmoji =
    haystack.includes('vafle') || haystack.includes('waffle')
      ? '🧇'
      : haystack.includes('krep')
        ? '🥞'
        : haystack.includes('kahve') || haystack.includes('latte') || haystack.includes('cappuccino') || haystack.includes('espresso')
          ? '☕'
          : haystack.includes('dondurma') || haystack.includes('milkshake')
            ? '🍨'
            : haystack.includes('pasta') || haystack.includes('cheesecake') || haystack.includes('cake')
              ? '🍰'
              : haystack.includes('çikolata') || haystack.includes('fondant') || haystack.includes('brownie') || haystack.includes('trüf')
                ? '🍫'
                : '🍽️'

  const ingredientIcons = ['🌾']
  if (!haystack.includes('vegan')) ingredientIcons.push('🥚')
  if (!haystack.includes('sorbe')) ingredientIcons.push('🧈')
  if (
    haystack.includes('çikolata') ||
    haystack.includes('fondant') ||
    haystack.includes('brownie') ||
    haystack.includes('trüf') ||
    haystack.includes('cocoa')
  ) {
    ingredientIcons.push('🍫')
  }

  return {
    imageUrl: typeof product.image === 'string' ? product.image.trim() : '',
    fallbackEmoji,
    ingredientIcons: ingredientIcons.slice(0, 4),
    prepTime: 10 + (magnitude % 11),
    calories: 200 + (magnitude % 401),
    rating: (4.2 + (magnitude % 8) * 0.1).toFixed(1),
    popular:
      haystack.includes('signature') ||
      haystack.includes('fondant') ||
      haystack.includes('latte') ||
      haystack.includes('çikolata') ||
      magnitude % 3 === 0,
  }
}

async function findTableForMenu(restaurantId: string, tableId: string): Promise<TableLookupResult | null> {
  const directRef = doc(db, 'restaurants', restaurantId, 'tables', tableId)
  const directSnap = await getDoc(directRef)

  if (directSnap.exists()) {
    return {
      tableDocId: directSnap.id,
      table: normalizeTable(directSnap.id, directSnap.data() as Record<string, unknown>),
    }
  }

  const parsedNumber = Number.parseInt(tableId, 10)
  if (!Number.isFinite(parsedNumber)) return null

  const numberSnap = await getDocs(
    query(
      collection(db, 'restaurants', restaurantId, 'tables'),
      where('number', '==', parsedNumber),
      limit(1)
    )
  )

  if (numberSnap.empty) {
    return {
      tableDocId: tableId,
      table: {
        id: tableId,
        number: parsedNumber,
        status: 'boş',
        sessionId: null,
        openedAt: null,
        createdAt: null,
        updatedAt: null,
      },
    }
  }

  const matchedDoc = numberSnap.docs[0]
  return {
    tableDocId: matchedDoc.id,
    table: normalizeTable(matchedDoc.id, matchedDoc.data() as Record<string, unknown>),
  }
}

async function fetchSessionActivity(restaurantId: string, tableDocId: string, sessionId: string) {
  logFirestoreRead('menu/session activity', { restaurantId, tableId: tableDocId, sessionId })
  const [tableSnap, openCallsSnap, paymentCallsSnap] = await Promise.all([
    getDoc(doc(db, 'restaurants', restaurantId, 'tables', tableDocId)),
    getDocs(getSessionOpenCallsQuery(restaurantId, sessionId)),
    getDocs(getSessionPaymentCallsQuery(restaurantId, sessionId)),
  ])

  const nextTable = tableSnap.exists()
    ? normalizeTable(tableSnap.id, tableSnap.data() as Record<string, unknown>)
    : null

  const nextOpenCalls = openCallsSnap.docs
    .map((snap) => normalizeWaiterCall(snap.id, snap.data() as Record<string, unknown>))
    .filter((call) => call.tableId === tableDocId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const nextPaymentCalls = paymentCallsSnap.docs
    .map((snap) => normalizeWaiterCall(snap.id, snap.data() as Record<string, unknown>))
    .filter((call) => call.tableId === tableDocId)
    .sort((a, b) => b.createdAt - a.createdAt)

  return {
    table: nextTable,
    openCalls: nextOpenCalls,
    paymentCalls: nextPaymentCalls,
    latestCallAt: nextOpenCalls[0]?.createdAt ?? nextPaymentCalls[0]?.createdAt ?? null,
  }
}

export default function MenuPage() {
  const params = useParams<{ restaurantId: string; tableId: string }>()
  const { restaurantId, tableId } = params
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [menuSettings, setMenuSettings] = useState<MenuThemeSettings>(EMPTY_MENU_THEME_SETTINGS)
  const [generalSettings, setGeneralSettings] = useState<RestaurantGeneralSettings>(EMPTY_RESTAURANT_GENERAL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const [tableDocId, setTableDocId] = useState<string | null>(null)
  const [table, setTable] = useState<Table | null>(null)
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [accessMessage, setAccessMessage] = useState<string | null>(null)
  const [sessionCalls, setSessionCalls] = useState<WaiterCall[]>([])
  const [paymentCalls, setPaymentCalls] = useState<WaiterCall[]>([])
  const [ratedCallIds, setRatedCallIds] = useState<Record<string, true>>({})
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [detailQuantity, setDetailQuantity] = useState(1)
  const [favoriteIds, setFavoriteIds] = useState<Record<string, boolean>>({})

  // Cart & Customer name
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [customerNameModal, setCustomerNameModal] = useState(false)
  const [customerNameInput, setCustomerNameInput] = useState('')
  const [cartDrawer, setCartDrawer] = useState(false)
  const [orderSending, setOrderSending] = useState(false)
  const [orderSent, setOrderSent] = useState(false)

  const [callModal, setCallModal] = useState(false)
  const [selectedTip, setSelectedTip] = useState<CallTip | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const [ratingModal, setRatingModal] = useState(false)
  const [ratingTargetCallId, setRatingTargetCallId] = useState<string | null>(null)
  const [ratingForm, setRatingForm] = useState<RatingForm>(EMPTY_RATING_FORM)
  const [ratingSending, setRatingSending] = useState(false)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [ratingMessage, setRatingMessage] = useState<string | null>(null)
  const refreshSessionActivity = useEffectEvent(async (nextSessionId: string, nextTableDocId: string) => {
    const activity = await fetchSessionActivity(restaurantId, nextTableDocId, nextSessionId)

    if (activity.table) {
      setTable(activity.table)
    }

    setSessionCalls(activity.openCalls)
    setPaymentCalls(activity.paymentCalls)
  })

  useEffect(() => {
    async function loadMenu() {
      logFirestoreRead('menu/products + categories + settings', restaurantId)
      const [catSnap, prodSnap, menuSettingsSnap, generalSettingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'restaurants', restaurantId, 'categories'), orderBy('order', 'asc'))),
        getDocs(collection(db, 'restaurants', restaurantId, 'products')),
        getDoc(doc(db, 'restaurants', restaurantId, 'settings', 'menu')),
        getDoc(doc(db, 'restaurants', restaurantId, 'settings', 'general')),
      ])

      const nextCategories = catSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
      const nextProducts = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product))

      setCategories(nextCategories)
      setProducts(nextProducts)
      setMenuSettings(menuSettingsSnap.exists() ? normalizeMenuThemeSettings(menuSettingsSnap.data()) : { ...EMPTY_MENU_THEME_SETTINGS })
      setGeneralSettings(generalSettingsSnap.exists() ? normalizeRestaurantGeneralSettings(generalSettingsSnap.data()) : { ...EMPTY_RESTAURANT_GENERAL_SETTINGS })
      setActiveCat(nextCategories[0]?.id ?? null)
      setLoading(false)
    }

    void loadMenu()
  }, [restaurantId])

  useEffect(() => {
    let cancelled = false

    async function initSession() {
      setAccessState('checking')
      setAccessMessage(null)
      setActionMessage(null)
      setSessionId(null)
      setTableDocId(null)
      setTable(null)
      setSessionCalls([])
      setPaymentCalls([])
      setRatedCallIds({})
      setCustomerName(null)
      setCustomerNameInput('')
      setCustomerNameModal(false)
      setCart([])
      setCartDrawer(false)
      setOrderSent(false)
      setRatingModal(false)
      setRatingTargetCallId(null)
      setRatingMessage(null)
      setRatingSubmitted(false)
      setRatingForm(EMPTY_RATING_FORM)

      try {
        logFirestoreRead('menu/find table', { restaurantId, tableId })
        const resolved = await findTableForMenu(restaurantId, tableId)
        if (!resolved) {
          if (cancelled) return
          setAccessState('missing')
          setAccessMessage('Bu masa bulunamadı. Lütfen garsondan yardım isteyin.')
          return
        }

        if (cancelled) return

        setTableDocId(resolved.tableDocId)
        setTable(resolved.table)

        const localSessionId = readStoredSessionId(tableId, restaurantId, resolved.tableDocId)
        const tableRef = doc(db, 'restaurants', restaurantId, 'tables', resolved.tableDocId)

        const result = await runTransaction(db, async (transaction) => {
          logFirestoreWrite('menu/init session transaction', { restaurantId, tableId: resolved.tableDocId, storedSessionId: localSessionId })
          const snap = await transaction.get(tableRef)

          if (!snap.exists()) {
            const nextSessionId = createSessionId()
            transaction.set(tableRef, {
              id: resolved.tableDocId,
              number: resolved.table.number,
              status: 'aktif',
              sessionId: nextSessionId,
              openedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })

            return {
              state: 'ready' as const,
              message: null,
              table: {
                ...resolved.table,
                status: 'aktif' as const,
                sessionId: nextSessionId,
              },
              sessionId: nextSessionId,
            }
          }

          const currentTable = normalizeTable(snap.id, snap.data() as Record<string, unknown>)

          if (currentTable.status === 'temizlik') {
            return {
              state: 'cleaning' as const,
              message: CLEANING_MESSAGE,
              table: currentTable,
              sessionId: null,
            }
          }

          if (currentTable.status === 'boş') {
            const nextSessionId = createSessionId()
            transaction.update(tableRef, {
              status: 'aktif',
              sessionId: nextSessionId,
              openedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })

            return {
              state: 'ready' as const,
              message: null,
              table: { ...currentTable, status: 'aktif' as const, sessionId: nextSessionId },
              sessionId: nextSessionId,
            }
          }

          if (localSessionId && currentTable.sessionId === localSessionId) {
            return {
              state: 'ready' as const,
              message: null,
              table: currentTable,
              sessionId: localSessionId,
            }
          }

          if (
            currentTable.sessionId &&
            (currentTable.status === 'aktif' || currentTable.status === 'çağrı var' || currentTable.status === 'hesap istendi')
          ) {
            return {
              state: 'ready' as const,
              message: null,
              table: currentTable,
              sessionId: currentTable.sessionId,
            }
          }

          return {
            state: 'locked' as const,
            message: ACTIVE_SESSION_MESSAGE,
            table: currentTable,
            sessionId: null,
          }
        })

        if (cancelled) return

        if (result.table) {
          setTable(result.table)
        }

        if (result.state === 'ready' && result.sessionId) {
          persistSessionId(tableId, restaurantId, resolved.tableDocId, result.sessionId)
          setSessionId(result.sessionId)
          setAccessState('ready')
          setAccessMessage(null)
          void refreshSessionActivity(result.sessionId, resolved.tableDocId)
          return
        }

        clearStoredSessionId(tableId, restaurantId, resolved.tableDocId)
        setAccessState(result.state)
        setAccessMessage(result.message)
      } catch (error) {
        if (cancelled) return
        setAccessState('error')
        setAccessMessage(error instanceof Error ? error.message : 'Masa oturumu başlatılamadı.')
      }
    }

    initSession()

    return () => {
      cancelled = true
    }
  }, [restaurantId, tableId])

  // Load customer name and cart from localStorage when session is ready
  useEffect(() => {
    if (!sessionId || !tableDocId) return

    const currentSessionId = sessionId
    let cancelled = false

    async function loadStoredCustomerState() {
      await Promise.resolve()

      const storedName = readCustomerName(restaurantId, tableId, currentSessionId)
      const storedCart = readCart(restaurantId, tableId, currentSessionId)

      if (cancelled) return

      if (storedName) {
        setCustomerName(storedName)
        setCustomerNameInput(storedName)
        setCustomerNameModal(false)
      } else {
        setCustomerName(null)
        setCustomerNameInput('')
        setCustomerNameModal(true)
      }

      setCart(storedCart)
    }

    void loadStoredCustomerState()

    return () => {
      cancelled = true
    }
  }, [restaurantId, tableId, tableDocId, sessionId])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (!sessionId || !tableDocId) return
    saveCart(restaurantId, tableId, sessionId, cart)
  }, [cart, restaurantId, tableId, tableDocId, sessionId])

  useEffect(() => {
    if (!sessionId || !tableDocId) return

    const currentTableDocId = tableDocId
    const currentSessionId = sessionId
    let cancelled = false

    async function refreshOnVisibility() {
      await refreshSessionActivity(currentSessionId, currentTableDocId)
      if (cancelled) return
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void refreshOnVisibility()
      }
    }

    function handleFocus() {
      void refreshOnVisibility()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [restaurantId, sessionId, tableDocId])

  const completedPaymentCall =
    paymentCalls.find((call) => call.tip === 'hesap' && call.durum === 'tamamlandı' && call.sessionId === sessionId) ?? null

  const activeRatingCall =
    (ratingTargetCallId
      ? paymentCalls.find((call) => call.id === ratingTargetCallId) ?? null
      : null) ?? completedPaymentCall

  const hasExistingRatingForActiveCall =
    !!activeRatingCall && !!ratedCallIds[activeRatingCall.id]

  useEffect(() => {
    if (!sessionId || !completedPaymentCall || ratingModal || hasExistingRatingForActiveCall) return

    let cancelled = false
    const targetCall = completedPaymentCall

    async function checkExistingRating() {
      const promptKey = getRatingPromptKey(restaurantId, targetCall.id)
      const ratingSnap = await getDoc(doc(db, 'restaurants', restaurantId, 'ratings', targetCall.id))

      if (cancelled) return

      if (ratingSnap.exists()) {
        setRatedCallIds((current) => ({ ...current, [targetCall.id]: true }))
        return
      }

      if (window.localStorage.getItem(promptKey)) return

      window.localStorage.setItem(promptKey, '1')
      setRatingTargetCallId(targetCall.id)
      setRatingMessage(null)
      setRatingSubmitted(false)
      setRatingForm(EMPTY_RATING_FORM)
      setRatingModal(true)
    }

    void checkExistingRating()

    return () => {
      cancelled = true
    }
  }, [completedPaymentCall, hasExistingRatingForActiveCall, ratingModal, restaurantId, sessionId])

  function openCallModal() {
    if (callButtonDisabled) return
    setActionMessage(null)
    setSent(false)
    setCallModal(true)
  }

  function openCartDrawer() {
    setActionMessage(null)
    setCartDrawer(true)
  }

  function closeCallModal() {
    setCallModal(false)
    setSelectedTip(null)
    setNote('')
  }

  function closeRatingModal() {
    setRatingModal(false)
    setRatingTargetCallId(null)
    setRatingMessage(null)
    setRatingSubmitted(false)
    setRatingForm(EMPTY_RATING_FORM)
  }

  function openProduct(product: Product) {
    setSelectedProduct(product)
    setDetailQuantity(1)
  }

  function toggleFavorite(productId: string) {
    setFavoriteIds((current) => ({ ...current, [productId]: !current[productId] }))
  }

  function adjustDetailQuantity(direction: 'inc' | 'dec') {
    setDetailQuantity((current) => {
      if (direction === 'inc') return current + 1
      return Math.max(1, current - 1)
    })
  }

  function addToCart(product: Product, quantity: number) {
    if (!customerName) {
      setCustomerNameInput('')
      setCustomerNameModal(true)
      return
    }
    setCart((current) => {
      const existingIndex = current.findIndex(
        (item) => item.productId === product.id && item.customerName === customerName
      )
      if (existingIndex >= 0) {
        const updated = [...current]
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        }
        return updated
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity,
          customerName,
        },
      ]
    })
  }

  function updateCartItemQuantity(productId: string, customerName: string, delta: number) {
    setCart((current) => {
      const index = current.findIndex(
        (item) => item.productId === productId && item.customerName === customerName
      )
      if (index < 0) return current
      const updated = [...current]
      const newQty = updated[index].quantity + delta
      if (newQty <= 0) {
        updated.splice(index, 1)
      } else {
        updated[index] = { ...updated[index], quantity: newQty }
      }
      return updated
    })
  }

  function removeCartItem(productId: string, customerName: string) {
    setCart((current) => current.filter(
      (item) => !(item.productId === productId && item.customerName === customerName)
    ))
  }

  function handleQuickAdd(product: Product) {
    addToCart(product, 1)
  }

  function handleAddFromSheet() {
    if (!selectedProduct) return
    addToCart(selectedProduct, detailQuantity)
    setSelectedProduct(null)
    setDetailQuantity(1)
  }

  function handleSaveCustomerName() {
    const trimmed = customerNameInput.trim()
    if (!trimmed) return
    saveCustomerName(restaurantId, tableId, trimmed)
    setCustomerName(trimmed)
    setCustomerNameInput(trimmed)
    setCustomerNameModal(false)
  }

  async function sendOrder() {
    if (cart.length === 0 || !tableDocId || !sessionId || !customerName) return

    setOrderSending(true)
    setActionMessage(null)

    try {
      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableDocId)
      const liveTableSnap = await getDoc(tableRef)

      if (!liveTableSnap.exists()) {
        setActionMessage('Bu masa bulunamadı.')
        return
      }

      const liveTable = normalizeTable(liveTableSnap.id, liveTableSnap.data() as Record<string, unknown>)

      if (liveTable.sessionId !== sessionId) {
        setActionMessage('Masa oturumu değişmiş. Sayfayı yenileyin.')
        return
      }

      const grouped = groupCartItemsByCustomer(cart)
      const totalPrice = calculateCartTotal(cart)
      const batch = writeBatch(db)
      const callsCollection = collection(db, 'restaurants', restaurantId, 'calls')
      const newCallRef = doc(callsCollection)

      batch.set(newCallRef, {
        tableId: tableDocId,
        tableNumber: table?.number ?? liveTable.number,
        sessionId,
        restaurantId,
        tip: 'sipariş',
        durum: 'bekliyor',
        status: 'open',
        customerName,
        createdAt: serverTimestamp(),
        waiterId: null,
        waiterName: null,
        note: '',
        items: cart,
        totalPrice,
        groupedByCustomer: grouped,
      })

      if (liveTable.status === 'aktif') {
        batch.update(tableRef, {
          status: 'çağrı var',
          updatedAt: serverTimestamp(),
        })
      }

      logFirestoreWrite('menu/send order', { restaurantId, tableId: tableDocId, items: cart.length })
      await batch.commit()

      setOrderSent(true)
      setCart([])
      const activity = await fetchSessionActivity(restaurantId, tableDocId, sessionId)
      if (activity.table) {
        setTable(activity.table)
      }
      setSessionCalls(activity.openCalls)
      setPaymentCalls(activity.paymentCalls)
      window.setTimeout(() => {
        setOrderSent(false)
        setCartDrawer(false)
      }, 3000)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Sipariş gönderilemedi.')
    } finally {
      setOrderSending(false)
    }
  }

  async function sendCall() {
    if (!selectedTip || !tableDocId) return

    setSending(true)
    setActionMessage(null)

    try {
      const storedSessionId = readStoredSessionId(tableId, restaurantId, tableDocId)
      const activeSessionId = sessionId ?? storedSessionId

      if (!activeSessionId) {
        setActionMessage('Masa oturumu bulunamadı. Sayfayı yenileyin.')
        return
      }

      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableDocId)
      logFirestoreRead('menu/send call table', { restaurantId, tableId: tableDocId })
      const liveTableSnap = await getDoc(tableRef)

      if (!liveTableSnap.exists()) {
        setActionMessage('Bu masa bulunamadı. Lütfen garsondan yardım isteyin.')
        return
      }

      const liveTable = normalizeTable(liveTableSnap.id, liveTableSnap.data() as Record<string, unknown>)

      if (liveTable.status === 'temizlik') {
        setActionMessage(CLEANING_MESSAGE)
        return
      }

      if (liveTable.status !== 'aktif' && liveTable.status !== 'çağrı var' && liveTable.status !== 'hesap istendi') {
        setActionMessage('Masa şu anda aktif değil.')
        return
      }

      if (liveTable.sessionId !== activeSessionId) {
        setActionMessage(ACTIVE_SESSION_MESSAGE)
        return
      }

      if (selectedTip === 'yardım' || selectedTip === 'hesap') {
        logFirestoreRead('menu/session calls before create', { restaurantId, sessionId: activeSessionId, tip: selectedTip })
        const sessionQuery = query(
          collection(db, 'restaurants', restaurantId, 'calls'),
          where('sessionId', '==', activeSessionId),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
        const sessionSnap = await getDocs(sessionQuery)
        const liveSessionCalls = sessionSnap.docs
          .map((doc) => normalizeWaiterCall(doc.id, doc.data() as Record<string, unknown>))
          .filter((call) => call.tableId === tableDocId && call.tip === selectedTip)
          .sort((a, b) => b.createdAt - a.createdAt)

        const openRequest = liveSessionCalls.find((call) => call.durum === 'bekliyor' || call.durum === 'kabul edildi')
        if (openRequest) {
          setActionMessage(getTipLockMessage(selectedTip))
          return
        }
      }

      const callsCollection = collection(db, 'restaurants', restaurantId, 'calls')
      const newCallRef = doc(callsCollection)
      const batch = writeBatch(db)
      const parsedTableNumber = Number.parseInt(tableId, 10)

      batch.set(newCallRef, {
        tableId: tableDocId,
        tableNumber: Number.isFinite(parsedTableNumber) ? parsedTableNumber : liveTable.number,
        sessionId: activeSessionId,
        restaurantId,
        tip: selectedTip,
        durum: 'bekliyor',
        status: 'open',
        createdAt: serverTimestamp(),
        waiterId: null,
        waiterName: null,
        customerName: customerName ?? null,
        note: note.trim() || '',
      })

      const nextStatus = selectedTip === 'hesap' ? 'hesap istendi' : 'çağrı var'
      if (liveTable.status !== nextStatus) {
        batch.update(tableRef, {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        })
      }

      logFirestoreWrite('menu/create call', { restaurantId, tableId: tableDocId, tip: selectedTip })
      await batch.commit()
      setSessionId(activeSessionId)
      const newOpenCall: WaiterCall = {
          id: newCallRef.id,
          tableId: tableDocId,
          tableNumber: Number.isFinite(parsedTableNumber) ? parsedTableNumber : liveTable.number,
          sessionId: activeSessionId,
          restaurantId,
          tip: selectedTip,
          durum: 'bekliyor',
          status: 'open',
          waiterId: undefined,
          waiterName: undefined,
          customerName: customerName ?? undefined,
          note: note.trim() || '',
          createdAt: Date.now(),
        }
      setSessionCalls((current) => [newOpenCall, ...current].slice(0, 50))
      setTable((current) => (current ? { ...current, status: nextStatus } : current))

      setSent(true)
      window.setTimeout(() => {
        setSent(false)
        closeCallModal()
      }, 2500)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Çağrı gönderilemedi.')
    } finally {
      setSending(false)
    }
  }

  async function submitRating() {
    if (!activeRatingCall || !sessionId || !tableDocId) return

    if (!ratingForm.serviceRating || !ratingForm.waiterRating) {
      setRatingMessage('Lütfen iki puanı da seçin.')
      return
    }

    if (profile?.role === 'admin' || profile?.role === 'waiter') {
      setRatingMessage(STAFF_RATING_MESSAGE)
      return
    }

    setRatingSending(true)
    setRatingMessage(null)

    try {
      const ratingRef = doc(db, 'restaurants', restaurantId, 'ratings', activeRatingCall.id)
      const callRef = doc(db, 'restaurants', restaurantId, 'calls', activeRatingCall.id)
      logFirestoreRead('menu/rating validation', { restaurantId, callId: activeRatingCall.id })
      const [existingRatingSnap, callSnap] = await Promise.all([getDoc(ratingRef), getDoc(callRef)])

      if (existingRatingSnap.exists()) {
        setRatingMessage('Bu ödeme için değerlendirme zaten gönderildi.')
        return
      }

      if (!callSnap.exists()) {
        setRatingMessage('Puanlanacak hesap kaydı bulunamadı.')
        return
      }

      const liveCall = normalizeWaiterCall(callSnap.id, callSnap.data() as Record<string, unknown>)

      if (liveCall.tip !== 'hesap' || liveCall.durum !== 'tamamlandı') {
        setRatingMessage('Puanlama yalnızca tamamlanmış hesap işlemi sonrası gönderilebilir.')
        return
      }

      if (liveCall.sessionId !== sessionId) {
        setRatingMessage('Oturum doğrulanamadı. Lütfen garsondan yardım isteyin.')
        return
      }

      const ratingStatus = liveCall.waiterId && liveCall.waiterName ? 'approved' : 'suspicious'

      logFirestoreWrite('menu/submit rating', { restaurantId, callId: liveCall.id })
      await setDoc(ratingRef, {
        restaurantId,
        tableId: tableDocId,
        tableNumber: table?.number ?? liveCall.tableNumber,
        sessionId,
        callId: liveCall.id,
        waiterId: liveCall.waiterId ?? null,
        waiterName: liveCall.waiterName ?? null,
        serviceRating: ratingForm.serviceRating,
        waiterRating: ratingForm.waiterRating,
        comment: ratingForm.comment.trim(),
        status: ratingStatus,
        createdAt: serverTimestamp(),
      })
      setRatedCallIds((current) => ({ ...current, [liveCall.id]: true }))

      setRatingSubmitted(true)
      window.setTimeout(() => {
        closeRatingModal()
      }, 2500)
    } catch (error) {
      setRatingMessage(error instanceof Error ? error.message : 'Puanlama gönderilemedi.')
    } finally {
      setRatingSending(false)
    }
  }

  const visibleProducts = products
    .filter((product) => product.categoryId === activeCat && product.available)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  const categoryCounts = Object.fromEntries(
    categories.map((category) => [
      category.id,
      products.filter((product) => product.categoryId === category.id && product.available).length,
    ])
  )

  const categoryNames = Object.fromEntries(categories.map((category) => [category.id, category.name]))

  // Use general settings first, fall back to menu settings for backwards compatibility
  const hasGeneralSettings = generalSettings.businessName || generalSettings.logoUrl || generalSettings.primaryColor !== DEFAULT_SECONDARY_COLOR
  const menuDisplayName = hasGeneralSettings
    ? resolveRestaurantBusinessName(generalSettings)
    : resolveMenuDisplayName(menuSettings)
  const menuLogoUrl = hasGeneralSettings && generalSettings.logoUrl
    ? generalSettings.logoUrl
    : menuSettings.logoUrl
  const menuPrimaryColor = hasGeneralSettings && generalSettings.secondaryColor
    ? generalSettings.secondaryColor
    : (menuSettings.primaryColor || DEFAULT_MENU_PRIMARY_COLOR)
  const menuPrimaryTextColor = getMenuPrimaryTextColor(menuPrimaryColor)

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const cartTotal = calculateCartTotal(cart)
  const cartGrouped = groupCartItemsByCustomer(cart)
  const hasActiveHelpRequest = sessionCalls.some((call) => call.tip === 'yardım')
  const hasActivePaymentRequest = sessionCalls.some((call) => call.tip === 'hesap')
  const selectedTipLockMessage =
    selectedTip === 'yardım' && hasActiveHelpRequest
      ? ACTIVE_HELP_REQUEST_MESSAGE
      : selectedTip === 'hesap' && hasActivePaymentRequest
        ? ACTIVE_PAYMENT_REQUEST_MESSAGE
        : null
  const sessionMatchesTable = !!table && !!sessionId && table.sessionId === sessionId
  const isPreparing = table?.status === 'temizlik'
  const isDifferentActiveSession =
    !!table &&
    (table.status === 'aktif' || table.status === 'çağrı var' || table.status === 'hesap istendi') &&
    !sessionMatchesTable
  const isSessionClosed = !!table && table.status === 'boş' && !!sessionId && table.sessionId !== sessionId
  const isStaffUser = profile?.role === 'admin' || profile?.role === 'waiter'
  const ratingSubmitDisabled =
    ratingSending ||
    ratingSubmitted ||
    !activeRatingCall ||
    !ratingForm.serviceRating ||
    !ratingForm.waiterRating ||
    isStaffUser ||
    (authLoading && !!user)

  const derivedAccessMessage =
    accessMessage ??
    (isPreparing
      ? CLEANING_MESSAGE
      : isDifferentActiveSession
        ? ACTIVE_SESSION_MESSAGE
        : isSessionClosed
          ? SESSION_CLOSED_MESSAGE
          : null)

  const infoMessage =
    derivedAccessMessage ??
    actionMessage

  const callButtonDisabled =
    accessState === 'checking' ||
    accessState === 'missing' ||
    accessState === 'error' ||
    !!derivedAccessMessage ||
    sending

  const displayTableLabel = table?.number ? String(table.number) : tableId
  const canDismissCustomerModal = !!customerName
  const modalSendDisabled =
    !selectedTip ||
    sending ||
    !!derivedAccessMessage ||
    !!selectedTipLockMessage

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-center text-[#3d2b1f]">
          <div className="text-4xl mb-3 animate-pulse">☕</div>
          <p style={{ fontFamily: 'var(--font-playfair), serif', fontSize: '1.1rem' }}>Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes menu-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        @keyframes menu-sheet-in {
          0% { transform: translateY(100%); }
          100% { transform: translateY(0); }
        }
      `}</style>

      <div
        className="min-h-screen bg-[#fafafa] text-[#1a1a1a] pb-44"
        style={{ fontFamily: 'var(--font-dm-sans), var(--font-geist-sans), sans-serif' }}
      >
        <header className="sticky top-0 z-20 bg-[#fafafa]/95 backdrop-blur-xl border-b border-black/5">
          <div className="max-w-5xl mx-auto px-4 pt-5 pb-4">
            <div className="grid grid-cols-[40px_1fr_40px] items-center gap-3">
              <button
                onClick={() => router.back()}
                className="h-10 w-10 rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)] flex items-center justify-center text-[#3d2b1f]"
                aria-label="Geri"
              >
                <span className="text-lg">←</span>
              </button>

              <div className="text-center">
                {menuLogoUrl && (
                  <div className="mb-2 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={menuLogoUrl}
                      alt={menuDisplayName}
                      className="h-11 w-11 rounded-2xl object-cover border border-black/5 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
                    />
                  </div>
                )}
                <p
                  className="text-[1.2rem] font-semibold leading-none"
                  style={{ fontFamily: 'var(--font-playfair), serif', color: '#3d2b1f' }}
                >
                  {menuDisplayName}
                </p>
              </div>

              <div className="relative flex justify-end">
                <button
                  onClick={openCartDrawer}
                  className="h-10 w-10 rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)] flex items-center justify-center text-[#3d2b1f]"
                  aria-label="Sepet"
                >
                  <span className="text-lg">👜</span>
                </button>
                {cartCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                  >
                    {cartCount}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[22px] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#888888]">Masa {displayTableLabel} • Hoş geldiniz</p>
                  <p className="text-[13px] mt-1 text-[#3d2b1f]/80">
                    {customerName ? `👋 ${customerName}` : 'Günün favorilerini keşfedin'}
                  </p>
                </div>
                {customerName && (
                  <button
                    onClick={() => { setCustomerNameInput(customerName); setCustomerNameModal(true) }}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: '#f3f4f6', color: '#6b7280' }}
                  >
                    Değiştir
                  </button>
                )}
              </div>
            </div>

            {categories.length > 0 && (
              <div className="mt-4 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
                <div className="flex gap-3 w-max pr-4">
                  {categories.map((category) => {
                    const active = activeCat === category.id
                    const count = categoryCounts[category.id] ?? 0

                    return (
                      <button
                        key={category.id}
                        onClick={() => setActiveCat(category.id)}
                        className="shrink-0 rounded-full px-4 py-2.5 flex items-center gap-2 border transition-all"
                        style={
                          active
                            ? { background: menuPrimaryColor, color: menuPrimaryTextColor, borderColor: menuPrimaryColor }
                            : { background: '#fff', color: '#888888', borderColor: 'rgba(0,0,0,0.06)' }
                        }
                      >
                        <span className="text-sm font-semibold">{category.name}</span>
                        <span
                          className="min-w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center px-2"
                          style={active ? { background: 'rgba(255,255,255,0.22)', color: '#fff' } : { background: '#f3f4f6', color: '#6b7280' }}
                        >
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 pt-5">
          {visibleProducts.length === 0 ? (
            <div className="rounded-[28px] bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              <p className="text-4xl mb-3">🍽️</p>
              <p className="text-sm text-[#888888]">Bu kategoride ürün bulunamadı.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {visibleProducts.map((product, index) => {
                const categoryName = categoryNames[product.categoryId] ?? ''
                const meta = getProductMeta(product, categoryName)
                const isFavorite = !!favoriteIds[product.id]

                return (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProduct(product)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openProduct(product)
                      }
                    }}
                    className="text-left rounded-[24px] bg-white overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.08)] active:scale-[0.98] transition-transform cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#d4a017]/40"
                  >
                    <div className="relative">
                      <MenuProductImage
                        key={`${product.id}:${meta.imageUrl || 'placeholder'}`}
                        alt={product.name}
                        imageUrl={meta.imageUrl}
                        fallbackEmoji={meta.fallbackEmoji}
                        heightClass="h-[140px]"
                        priority={index === 0}
                      />

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleFavorite(product.id)
                        }}
                        className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
                        aria-label="Favori"
                      >
                        <span className={`text-lg ${isFavorite ? 'text-rose-500' : 'text-[#3d2b1f]'}`}>
                          {isFavorite ? '♥' : '♡'}
                        </span>
                      </button>
                    </div>

                    <div className="px-3.5 pb-3.5 pt-3">
                      <p className="text-[14px] font-bold leading-tight text-[#1a1a1a]">{product.name}</p>
                      <p
                        className="mt-1 text-[12px] leading-5 text-[#888888] min-h-10"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {product.description || 'Şef dokunuşuyla hazırlanan özel lezzet.'}
                      </p>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[15px] font-bold" style={{ color: menuPrimaryColor }}>{formatPrice(product.price)}</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleQuickAdd(product)
                          }}
                          className="h-9 w-9 rounded-full font-black text-lg flex items-center justify-center shadow-[0_8px_16px_rgba(212,160,23,0.28)]"
                          style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                          aria-label="Hızlı ekle"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>

        <div className="fixed bottom-0 inset-x-0 z-20 px-4 pb-5">
          <div className="max-w-5xl mx-auto">
            {infoMessage && (
              <div className="mb-3 rounded-[20px] bg-white px-4 py-3 shadow-[0_10px_26px_rgba(0,0,0,0.08)] border border-black/5">
                <p className="text-[13px] leading-5 text-[#3d2b1f]">{infoMessage}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={openCallModal}
                disabled={callButtonDisabled}
                className={`rounded-[22px] px-5 py-4 font-bold text-sm shadow-[0_12px_24px_rgba(61,43,31,0.18)] transition-all ${
                  cartCount > 0 ? 'flex-[1.1]' : 'flex-1'
                } disabled:opacity-50`}
                style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
              >
                {accessState === 'checking'
                  ? 'Masa kontrol ediliyor...'
                  : 'Garson Çağır'}
              </button>

              {cartCount > 0 && (
                <button
                  type="button"
                  onClick={openCartDrawer}
                  className="flex-1 rounded-[22px] bg-white px-4 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.08)] border border-black/5 text-left"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#888888]">Sepet</p>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#1a1a1a]">{cartCount} ürün</p>
                      <p className="text-xs text-[#888888]">Siparişe hazır</p>
                    </div>
                    <p className="text-[15px] font-bold" style={{ color: menuPrimaryColor }}>{formatPrice(cartTotal)}</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {selectedProduct && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] flex items-end">
            <div
              className="relative w-full bg-[#fafafa] rounded-t-[32px] overflow-hidden max-h-[92vh]"
              style={{ animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
              <div className="h-1.5 w-14 rounded-full bg-black/10 mx-auto mt-3 mb-3" />
              <div className="relative">
                <MenuProductImage
                  key={`${selectedProduct.id}:${getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '').imageUrl || 'placeholder'}`}
                  alt={selectedProduct.name}
                  imageUrl={getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '').imageUrl}
                  fallbackEmoji={getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '').fallbackEmoji}
                  heightClass="h-[250px]"
                  roundedClass="rounded-none"
                  priority
                />
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-[#3d2b1f] shadow-[0_10px_24px_rgba(0,0,0,0.15)]"
                  aria-label="Kapat"
                >
                  <span className="text-xl leading-none">×</span>
                </button>
              </div>

              <div className="px-5 pt-5 pb-36 overflow-y-auto max-h-[calc(92vh-250px)]">
                {(() => {
                  const meta = getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '')
                  return (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2
                            className="text-[24px] font-bold leading-tight text-[#3d2b1f]"
                            style={{ fontFamily: 'var(--font-playfair), serif' }}
                          >
                            {selectedProduct.name}
                          </h2>

                          <div className="flex items-center gap-2 mt-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#3d2b1f] shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
                              <span style={{ color: menuPrimaryColor }}>★</span>
                              {meta.rating}
                            </span>
                            {meta.popular && (
                              <span className="inline-flex items-center rounded-full bg-[#fff5cf] px-3 py-1 text-xs font-semibold text-[#9a6d00]">
                                Popüler
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-[28px] font-bold" style={{ color: menuPrimaryColor }}>{formatPrice(selectedProduct.price)}</p>
                      </div>

                      <div className="h-px bg-black/6 my-6" />

                      <section>
                        <h3
                          className="text-[18px] font-bold text-[#3d2b1f]"
                          style={{ fontFamily: 'var(--font-playfair), serif' }}
                        >
                          Açıklama
                        </h3>
                        <p className="mt-3 text-[14px] leading-7 text-[#666]">
                          {selectedProduct.description || 'Günün en sevilen dokularını taşıyan, sıcak ve zarif bir lezzet deneyimi.'}
                        </p>
                      </section>

                      <section className="mt-6">
                        <h3
                          className="text-[18px] font-bold text-[#3d2b1f]"
                          style={{ fontFamily: 'var(--font-playfair), serif' }}
                        >
                          İçindekiler
                        </h3>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {meta.ingredientIcons.map((icon) => (
                            <span
                              key={`${selectedProduct.id}-${icon}`}
                              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-[#3d2b1f] shadow-[0_8px_18px_rgba(0,0,0,0.05)]"
                            >
                              <span>{icon}</span>
                              <span className="text-xs font-semibold text-[#888888]">Malzeme</span>
                            </span>
                          ))}
                        </div>
                      </section>

                      <section className="mt-6 grid grid-cols-2 gap-3">
                        <InfoTile label="Hazırlanma Süresi" value={`${meta.prepTime} dk`} />
                        <InfoTile label="Kalori" value={`${meta.calories} kcal`} />
                      </section>
                    </>
                  )
                })()}
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-[#fafafa]/95 backdrop-blur-xl border-t border-black/6 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="max-w-5xl mx-auto flex items-center gap-3">
                  <div className="flex items-center rounded-full bg-white px-2 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.08)] border border-black/5">
                    <button
                      onClick={() => adjustDetailQuantity('dec')}
                      className="h-9 w-9 rounded-full bg-[#f4f4f4] text-[#3d2b1f] text-xl flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="w-12 text-center text-base font-bold text-[#1a1a1a]">{detailQuantity}</span>
                    <button
                      onClick={() => adjustDetailQuantity('inc')}
                      className="h-9 w-9 rounded-full text-xl flex items-center justify-center"
                      style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={handleAddFromSheet}
                    className="flex-1 rounded-[20px] px-5 py-4 font-bold text-sm shadow-[0_16px_28px_rgba(212,160,23,0.28)]"
                    style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                  >
                    Sepete Ekle — {formatPrice(selectedProduct.price * detailQuantity)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {customerNameModal && (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center sm:justify-center">
            <div
              className="w-full bg-[#fafafa] rounded-t-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px] sm:pb-6"
              style={{ animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2
                    className="text-[24px] font-bold text-[#3d2b1f]"
                    style={{ fontFamily: 'var(--font-playfair), serif' }}
                  >
                    İsminizi yazın
                  </h2>
                  <p className="text-sm text-[#888888] mt-1">
                    Siparişler kişi bazlı takip edilsin diye bu cihaz için adınızı kaydedelim.
                  </p>
                </div>
                {canDismissCustomerModal && (
                  <button
                    onClick={() => setCustomerNameModal(false)}
                    className="h-10 w-10 rounded-full bg-white text-[#3d2b1f] shadow-[0_8px_18px_rgba(0,0,0,0.08)] text-xl shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>

              <input
                value={customerNameInput}
                onChange={(event) => setCustomerNameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleSaveCustomerName()
                  }
                }}
                placeholder="Örnek: Ahmet"
                autoFocus
                className="w-full rounded-[22px] bg-white px-4 py-4 text-base text-[#1a1a1a] outline-none border border-black/8 shadow-[0_8px_20px_rgba(0,0,0,0.05)]"
              />

              <div className="mt-5 flex gap-3">
                {canDismissCustomerModal && (
                  <button
                    onClick={() => setCustomerNameModal(false)}
                    className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-semibold"
                    style={{ background: '#fff', color: '#3d2b1f', border: '1px solid rgba(61,43,31,0.12)' }}
                  >
                    Vazgeç
                  </button>
                )}
                <button
                  onClick={handleSaveCustomerName}
                  disabled={!customerNameInput.trim()}
                  className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-bold disabled:opacity-50"
                  style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                >
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        )}

        {callModal && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] flex items-end">
            <div
              className="w-full bg-[#fafafa] rounded-t-[32px] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              style={{ animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
              {sent ? (
                <div className="py-10 text-center">
                  <div className="text-5xl mb-4">✅</div>
                  <p
                    className="text-[24px] font-bold text-[#3d2b1f]"
                    style={{ fontFamily: 'var(--font-playfair), serif' }}
                  >
                    Çağrınız iletildi
                  </p>
                  <p className="text-sm text-[#888888] mt-2">Garsonunuz en kısa sürede yanınızda olacak.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2
                        className="text-[24px] font-bold text-[#3d2b1f]"
                        style={{ fontFamily: 'var(--font-playfair), serif' }}
                      >
                        Garson Çağır
                      </h2>
                      <p className="text-sm text-[#888888] mt-1">Talebinizi seçin, ekibi hızlıca bilgilendirelim.</p>
                    </div>
                    <button onClick={closeCallModal} className="h-10 w-10 rounded-full bg-white text-[#3d2b1f] shadow-[0_8px_18px_rgba(0,0,0,0.08)]">
                      ×
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {TIP_OPTIONS.map((opt) => {
                      const tipDisabled =
                        (opt.tip === 'yardım' && hasActiveHelpRequest) ||
                        (opt.tip === 'hesap' && hasActivePaymentRequest)

                      return (
                        <button
                          key={opt.tip}
                          onClick={() => {
                            if (tipDisabled) return
                            setSelectedTip(opt.tip)
                            setActionMessage(null)
                          }}
                          disabled={tipDisabled}
                          className="rounded-[22px] px-3 py-4 text-left border shadow-[0_8px_20px_rgba(0,0,0,0.05)] transition-all disabled:opacity-60"
                          style={
                            selectedTip === opt.tip && !tipDisabled
                              ? { background: menuPrimaryColor, borderColor: menuPrimaryColor, color: menuPrimaryTextColor }
                              : { background: '#fff', borderColor: 'rgba(0,0,0,0.06)', color: '#1a1a1a' }
                          }
                        >
                          <div className="text-2xl mb-3">{opt.icon}</div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold">{opt.label}</p>
                            {tipDisabled && (
                              <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#a16207]">
                                Aktif
                              </span>
                            )}
                          </div>
                          <p className={`text-[11px] mt-1 leading-4 ${selectedTip === opt.tip && !tipDisabled ? 'text-white/65' : 'text-[#888888]'}`}>
                            {tipDisabled ? getTipLockMessage(opt.tip) : opt.desc}
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="İsterseniz küçük bir not ekleyin..."
                    className="mt-4 w-full rounded-[22px] resize-none bg-white text-sm text-[#1a1a1a] px-4 py-4 outline-none border border-black/6 shadow-[0_8px_20px_rgba(0,0,0,0.04)]"
                    rows={3}
                  />

                  {(selectedTipLockMessage || actionMessage) && (
                    <p className="text-sm mt-3 text-[#c2410c]">{selectedTipLockMessage ?? actionMessage}</p>
                  )}

                  <button
                    onClick={sendCall}
                    disabled={modalSendDisabled}
                    className="w-full mt-4 rounded-[22px] px-5 py-4 font-bold text-sm disabled:opacity-50"
                    style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                  >
                    {sending ? 'Gönderiliyor...' : 'Talebi Gönder'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Cart Drawer ── */}
        {cartDrawer && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] flex items-end">
            <div
              className="w-full bg-[#fafafa] rounded-t-[32px] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
              style={{ animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
              {orderSent ? (
                <div className="py-10 text-center">
                  <div className="text-5xl mb-4">✅</div>
                  <p
                    className="text-[24px] font-bold text-[#3d2b1f]"
                    style={{ fontFamily: 'var(--font-playfair), serif' }}
                  >
                    Siparişiniz iletildi
                  </p>
                  <p className="text-sm text-[#888888] mt-2">Garsonunuz siparişinizi hazırlıyor.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2
                        className="text-[24px] font-bold text-[#3d2b1f]"
                        style={{ fontFamily: 'var(--font-playfair), serif' }}
                      >
                        Sepetim
                      </h2>
                      <p className="text-sm text-[#888888] mt-1">{cartCount} ürün • {formatPrice(cartTotal)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {customerName && (
                        <button
                          onClick={() => {
                            setCustomerNameInput(customerName)
                            setCustomerNameModal(true)
                          }}
                          className="rounded-full bg-white px-3 py-2 text-xs font-medium text-[#3d2b1f] shadow-[0_8px_18px_rgba(0,0,0,0.08)]"
                        >
                          İsmi Değiştir
                        </button>
                      )}
                      <button
                        onClick={() => setCartDrawer(false)}
                        className="h-10 w-10 rounded-full bg-white text-[#3d2b1f] shadow-[0_8px_18px_rgba(0,0,0,0.08)] text-xl"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {cart.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-4xl mb-3">👜</p>
                      <p className="text-sm text-[#888888]">Sepetiniz boş</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {Object.entries(cartGrouped).map(([groupName, group]) => (
                          <div
                            key={groupName}
                            className="rounded-[20px] bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.05)] border border-black/5"
                          >
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div>
                                <p className="font-semibold text-base text-[#3d2b1f]">{groupName}</p>
                                <p className="text-xs text-[#888888] mt-1">{group.items.length} kalem ürün</p>
                              </div>
                              <p className="font-bold shrink-0" style={{ color: menuPrimaryColor }}>{formatPrice(group.total)}</p>
                            </div>

                            <div className="space-y-3">
                              {group.items.map((item) => (
                                <div key={`${groupName}-${item.productId}`} className="rounded-2xl bg-[#faf7f4] px-3 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-sm text-[#3d2b1f]">{item.name}</p>
                                      <p className="text-xs text-[#888888] mt-1">Birim: {formatPrice(item.price)}</p>
                                    </div>
                                    <p className="font-bold shrink-0" style={{ color: menuPrimaryColor }}>{formatPrice(item.price * item.quantity)}</p>
                                  </div>
                                  <div className="flex items-center justify-between mt-3">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => updateCartItemQuantity(item.productId, item.customerName, -1)}
                                        className="h-8 w-8 rounded-full bg-white text-[#3d2b1f] text-lg flex items-center justify-center"
                                      >
                                        −
                                      </button>
                                      <span className="w-8 text-center text-sm font-bold text-[#1a1a1a]">{item.quantity}</span>
                                      <button
                                        onClick={() => updateCartItemQuantity(item.productId, item.customerName, 1)}
                                        className="h-8 w-8 rounded-full text-lg flex items-center justify-center"
                                        style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                                      >
                                        +
                                      </button>
                                    </div>
                                    <button
                                      onClick={() => removeCartItem(item.productId, item.customerName)}
                                      className="text-xs text-[#ef4444] font-medium"
                                    >
                                      Kaldır
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {actionMessage && (
                        <p className="text-sm mt-4 text-[#c2410c]">{actionMessage}</p>
                      )}

                      <div className="mt-5 pt-4 border-t border-black/6">
                        <div className="space-y-2 mb-4">
                          {Object.entries(cartGrouped).map(([groupName, group]) => (
                            <div key={`${groupName}-summary`} className="flex items-center justify-between text-sm">
                              <span className="font-medium text-[#3d2b1f]">{groupName}</span>
                              <span className="font-semibold text-[#3d2b1f]">{formatPrice(group.total)}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between pt-2 border-t border-black/6">
                            <span className="text-sm font-semibold text-[#3d2b1f]">Masa Toplamı</span>
                            <span className="text-xl font-bold" style={{ color: menuPrimaryColor }}>{formatPrice(cartTotal)}</span>
                          </div>
                        </div>
                        <button
                          onClick={sendOrder}
                          disabled={orderSending || cart.length === 0 || !customerName}
                          className="w-full rounded-[22px] px-5 py-4 font-bold text-sm disabled:opacity-50 shadow-[0_16px_28px_rgba(212,160,23,0.28)]"
                          style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                        >
                          {orderSending ? 'Gönderiliyor...' : 'Siparişi Gönder'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {ratingModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45">
            <div
              className="w-full max-w-lg rounded-t-3xl p-6"
              style={{
                background: '#fefaf3',
                paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
                animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {ratingSubmitted ? (
                <div className="py-8 text-center">
                  <div className="text-5xl mb-4">⭐</div>
                  <p className="font-bold text-xl" style={{ color: '#3d2b1f', fontFamily: 'var(--font-playfair), serif' }}>
                    Teşekkür ederiz
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '8px' }}>
                    Değerlendirmeniz başarıyla alındı.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-playfair), serif', color: '#3d2b1f', fontSize: '1.3rem', fontWeight: 700 }}>
                        Deneyiminizi değerlendirin
                      </h2>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '8px', lineHeight: 1.5 }}>
                        Hizmeti ve garson deneyimini birkaç saniyede puanlayabilirsiniz.
                      </p>
                    </div>
                    <button onClick={closeRatingModal} style={{ color: '#9ca3af', fontSize: '1.5rem', lineHeight: 1 }}>
                      ×
                    </button>
                  </div>

                  <div className="space-y-4">
                    <StarRatingField
                      label="Genel hizmet puanı"
                      value={ratingForm.serviceRating}
                      activeColor={menuPrimaryColor}
                      onChange={(value) => setRatingForm((current) => ({ ...current, serviceRating: value }))}
                    />
                    <StarRatingField
                      label="Garson puanı"
                      value={ratingForm.waiterRating}
                      activeColor={menuPrimaryColor}
                      onChange={(value) => setRatingForm((current) => ({ ...current, waiterRating: value }))}
                    />

                    <div>
                      <p className="text-sm font-semibold mb-2" style={{ color: '#3d2b1f' }}>
                        Yorumunuz
                      </p>
                      <textarea
                        value={ratingForm.comment}
                        onChange={(event) => setRatingForm((current) => ({ ...current, comment: event.target.value }))}
                        placeholder="Opsiyonel yorum yazın..."
                        className="w-full rounded-2xl resize-none text-sm"
                        rows={4}
                        style={{ background: '#fff', border: '1px solid rgba(61,43,31,0.12)', padding: '14px', color: '#3d2b1f', outline: 'none' }}
                      />
                    </div>
                  </div>

                  {(ratingMessage || isStaffUser) && (
                    <p className="text-sm mt-4" style={{ color: '#c2410c' }}>
                      {ratingMessage ?? STAFF_RATING_MESSAGE}
                    </p>
                  )}

                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={closeRatingModal}
                      className="flex-1 py-3.5 rounded-2xl font-semibold text-sm"
                      style={{ background: '#fff', color: '#3d2b1f', border: '1px solid rgba(61,43,31,0.12)' }}
                    >
                      Daha sonra
                    </button>
                    <button
                      onClick={submitRating}
                      disabled={ratingSubmitDisabled}
                      className="flex-1 py-3.5 rounded-2xl font-bold text-sm disabled:opacity-50"
                      style={{ background: '#3d2b1f', color: '#fefaf3' }}
                    >
                      {ratingSending ? 'Gönderiliyor...' : 'Gönder'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function MenuProductImage({
  imageUrl,
  alt,
  fallbackEmoji,
  heightClass,
  roundedClass = 'rounded-[12px]',
  priority,
}: {
  imageUrl: string
  alt: string
  fallbackEmoji: string
  heightClass: string
  roundedClass?: string
  priority?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const hasImage = imageUrl.length > 0

  return (
    <div className={`relative overflow-hidden bg-[#f2ede2] ${heightClass} ${roundedClass}`}>
      {hasImage && !failed && (
        <Image
          src={imageUrl}
          alt={alt}
          fill
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          className={`object-cover transition duration-500 ${loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true)
            setLoaded(true)
          }}
        />
      )}

      {!loaded && !failed && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(110deg, rgba(255,255,255,0) 20%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 80%), linear-gradient(0deg, #ece7dc, #f6f2ea)',
            backgroundSize: '200% 100%',
            animation: 'menu-shimmer 1.6s linear infinite',
          }}
        />
      )}

      {(!hasImage || failed) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
          style={{
            background: 'linear-gradient(160deg, #f7f2e8 0%, #ece3d3 100%)',
          }}
        >
          <span className="text-5xl">{fallbackEmoji}</span>
          <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b7355]">
            Gorsel Hazirlaniyor
          </span>
        </div>
      )}
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
      <p className="text-xs uppercase tracking-[0.18em] text-[#888888]">{label}</p>
      <p className="text-lg font-bold text-[#3d2b1f] mt-2">{value}</p>
    </div>
  )
}

function StarRatingField({
  label,
  value,
  activeColor = DEFAULT_MENU_PRIMARY_COLOR,
  onChange,
}: {
  label: string
  value: number
  activeColor?: string
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: '#3d2b1f' }}>
          {label}
        </p>
        <span className="text-xs font-semibold" style={{ color: '#9ca3af' }}>
          {value > 0 ? `${value}/5` : 'Seçilmedi'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="text-3xl transition-transform active:scale-90"
            style={{ color: star <= value ? activeColor : '#d1d5db' }}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}
