'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  BadgeCheck,
  Check,
  CircleCheckBig,
  ClipboardList,
  Copy,
  Gift,
  Globe,
  LoaderCircle,
  Phone,
  SearchX,
  ShoppingBag,
  ShoppingCart,
  UserRound,
  UtensilsCrossed,
  Wifi,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import UserAvatar from '@/components/UserAvatar'
import LoadingScreen from '@/components/LoadingScreen'
import DemoMenuTour, { DEMO_TOUR_STORAGE_KEY } from '@/components/menu/DemoMenuTour'
import MenuDeveloperFooter from '@/components/menu/MenuDeveloperFooter'
import { getCallTipUi } from '@/lib/call-tip-ui'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { db } from '@/lib/firebase'
import { resolveRestaurantBySlugOrId, type ResolvedRestaurant } from '@/lib/restaurant-resolver'
import { getMenuCategoriesQuery, getMenuProductsQuery, getRestaurantActiveLoyaltyCampaignsQuery } from '@/lib/firestore-queries'
import { normalizeLoyaltyCampaign, normalizeTable, normalizeWaiterCall } from '@/lib/firestore-models'
import {
  DEFAULT_MENU_PRIMARY_COLOR,
  EMPTY_MENU_THEME_SETTINGS,
  normalizeMenuThemeSettings,
  resolveMenuDisplayName,
} from '@/lib/menu-theme'
import {
  EMPTY_RESTAURANT_GENERAL_SETTINGS,
  getRestaurantAccessBlockMessage,
  mergeRestaurantGeneralSettings,
  resolveRestaurantBusinessName,
} from '@/lib/restaurant-settings'
import { calculateCartTotal, groupCartItemsByCustomer } from '@/lib/order-utils'
import {
  createTableSessionWindow,
  isLiveTableSessionStatus,
  isTableSessionExpired,
  isTableSessionLive,
} from '@/lib/table-session'
import { buildThemePalette, buildThemeStyleVars, withAlpha } from '@/lib/ui-theme'
import {
  DEFAULT_LANGUAGE,
  getDefaultCustomerName,
  getOrCreateCustomerId,
  readStoredLanguage,
  saveLanguage,
  SUPPORTED_LANGUAGES,
  t,
  type MenuLanguage,
} from '@/lib/menu-i18n'
import {
  addToSharedCart,
  calculateSharedCartTotal,
  clearSharedCartForSession,
  getSharedCartCount,
  groupSharedCartByCustomer,
  removeSharedCartItem,
  sharedCartToCartItems,
  subscribeToSharedCart,
  updateSharedCartItemQuantity,
} from '@/lib/shared-cart'
import { getOrderFlowStage, type OrderFlowStage } from '@/lib/types'
import type {
  Category,
  LoyaltyCampaign,
  MenuThemeSettings,
  Product,
  RestaurantGeneralSettings,
  SharedCartItem,
  Table,
  WaiterCall,
} from '@/lib/types'
import { formatPriceWithConversion, getExchangeRates, type ExchangeRates } from '@/lib/currency'
import { calculatePendingRewards } from '@/lib/loyalty-rewards'

type CallTip = 'sipariş' | 'hesap' | 'yardım'
type AccessState = 'checking' | 'ready' | 'locked' | 'cleaning' | 'expired' | 'missing' | 'error'
type TableLookupResult = { tableDocId: string; table: Table }
type RatingForm = { serviceRating: number; waiterRating: number; comment: string }
type OnboardingStep = 'language' | 'name' | 'done'
type LoyaltyCustomerState = { id: string; name: string; phone: string }
type LoyaltyRegisterForm = { name: string; phone: string; email: string }
type PublicLoyaltyReward = {
  id: string
  campaignId: string
  campaignName: string
  rewardProductName: string
  rewardQuantity: number
}
type PublicLoyaltyProgress = {
  campaignId: string
  campaignName: string
  targetProductName: string
  requiredQuantity: number
  rewardProductName: string
  rewardQuantity: number
  currentQuantity: number
  totalEarnedRewards: number
}
type WaiterAssistNotice = {
  callId: string
  tableId: string
  sessionId: string
  tip: CallTip
  waiterName: string
  waiterPhotoUrl?: string | null
  waiterAverageRating?: number | null
}
type ProductMeta = {
  imageUrl: string
  fallbackEmoji: string
  prepTime: number
  calories: number
  rating: string
  popular: boolean
}

type CachedMenuData = {
  categories: Category[]
  products: Product[]
  menuSettings: MenuThemeSettings
  generalSettings: RestaurantGeneralSettings
}

const menuDataCache = new Map<string, CachedMenuData>()
const TIP_OPTIONS: CallTip[] = ['sipariş', 'hesap', 'yardım']

const ORDER_STAGE_I18N_KEY: Record<OrderFlowStage, string> = {
  awaiting_approval: 'orderStatusAwaitingApproval',
  sent_to_kitchen: 'orderStatusSentToKitchen',
  preparing: 'orderStatusPreparing',
  ready: 'orderStatusReady',
  delivered: 'orderStatusDelivered',
  paid: 'orderStatusPaid',
}

const ORDER_STAGE_COLORS: Record<OrderFlowStage, { bg: string; text: string }> = {
  awaiting_approval: { bg: '#fee2e2', text: '#dc2626' },
  sent_to_kitchen: { bg: '#fef3c7', text: '#a16207' },
  preparing: { bg: '#ffedd5', text: '#c2410c' },
  ready: { bg: '#dcfce7', text: '#15803d' },
  delivered: { bg: '#dbeafe', text: '#1d4ed8' },
  paid: { bg: '#d1fae5', text: '#047857' },
}
const EMPTY_RATING_FORM: RatingForm = { serviceRating: 0, waiterRating: 0, comment: '' }
const EMPTY_LOYALTY_FORM: LoyaltyRegisterForm = { name: '', phone: '', email: '' }
const ANONYMOUS_CUSTOMER_NAME_PATTERN_BASE = /^(Müşteri|Customer|Клиент|عميل)(?:\s+(\d+))?$/

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `session-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

function getSessionStorageKey(tableId: string) {
  return `nerox_session_${tableId}`
}

function getScopedSessionStorageKey(restaurantId: string, tableDocId: string) {
  return `table_session_${restaurantId}_${tableDocId}`
}

function getLegacySessionStorageKey(restaurantId: string, tableDocId: string) {
  return `nerox:table-session:${restaurantId}:${tableDocId}`
}

function readStoredSessionId(routeTableId: string, restaurantId: string, tableDocId?: string | null) {
  if (tableDocId) {
    const scoped = window.localStorage.getItem(getScopedSessionStorageKey(restaurantId, tableDocId))
    if (scoped) return scoped
  }
  const primary = window.localStorage.getItem(getSessionStorageKey(routeTableId))
  if (primary) return primary
  if (!tableDocId) return null
  return window.localStorage.getItem(getLegacySessionStorageKey(restaurantId, tableDocId))
}

function persistSessionId(routeTableId: string, restaurantId: string, tableDocId: string, sessionId: string) {
  window.localStorage.setItem(getScopedSessionStorageKey(restaurantId, tableDocId), sessionId)
  window.localStorage.setItem(getSessionStorageKey(routeTableId), sessionId)
  window.localStorage.setItem(getLegacySessionStorageKey(restaurantId, tableDocId), sessionId)
}

function clearStoredSessionId(routeTableId: string, restaurantId: string, tableDocId?: string | null) {
  window.localStorage.removeItem(getSessionStorageKey(routeTableId))
  if (tableDocId) {
    window.localStorage.removeItem(getScopedSessionStorageKey(restaurantId, tableDocId))
    window.localStorage.removeItem(getLegacySessionStorageKey(restaurantId, tableDocId))
  }
}

function getInactiveSessionMessage(
  language: MenuLanguage,
  table: Table | null | undefined,
  sessionId: string | null | undefined,
  now = Date.now(),
) {
  if (!table) return t(language, 'sessionInactive')
  if (table.status === 'temizlik') return t(language, 'tableBeingPrepared')
  if (sessionId && table.sessionId === sessionId && isTableSessionExpired(table, now)) {
    return t(language, 'sessionExpired')
  }
  return t(language, 'sessionInactive')
}

function getRatingPromptKey(restaurantId: string, callId: string) {
  return `nerox:rating-prompted:${restaurantId}:${callId}`
}

function getCustomerNameKey(restaurantId: string, tableId: string) {
  return `nerox_customer_name_${restaurantId}_${tableId}`
}

function getLoyaltyPromptKey(restaurantId: string, tableDocId: string, sessionId: string) {
  return `nerox:loyalty-prompted:${restaurantId}:${tableDocId}:${sessionId}`
}

function getLoyaltyCustomerStorageKey(restaurantId: string, field: 'id' | 'name' | 'phone') {
  return `nerox:loyalty-customer:${restaurantId}:${field}`
}

function normalizeStoredCustomerName(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed || null
}

function readCustomerName(restaurantId: string, tableId: string, sessionId: string): string | null {
  const tableScoped = normalizeStoredCustomerName(window.localStorage.getItem(getCustomerNameKey(restaurantId, tableId)))
  if (tableScoped) return tableScoped
  return normalizeStoredCustomerName(window.localStorage.getItem(`nerox_customer_name_${restaurantId}_${tableId}_${sessionId}`))
}

function saveCustomerName(restaurantId: string, tableId: string, name: string) {
  window.localStorage.setItem(getCustomerNameKey(restaurantId, tableId), name)
}

function hasLoyaltyPromptBeenHandled(restaurantId: string, tableDocId: string, sessionId: string) {
  return window.localStorage.getItem(getLoyaltyPromptKey(restaurantId, tableDocId, sessionId)) === '1'
}

function persistLoyaltyPromptHandled(restaurantId: string, tableDocId: string, sessionId: string) {
  window.localStorage.setItem(getLoyaltyPromptKey(restaurantId, tableDocId, sessionId), '1')
}

function readStoredLoyaltyCustomer(restaurantId: string): LoyaltyCustomerState | null {
  const id = window.localStorage.getItem(getLoyaltyCustomerStorageKey(restaurantId, 'id'))?.trim() ?? ''
  const name = window.localStorage.getItem(getLoyaltyCustomerStorageKey(restaurantId, 'name'))?.trim() ?? ''
  const phone = window.localStorage.getItem(getLoyaltyCustomerStorageKey(restaurantId, 'phone'))?.trim() ?? ''

  if (!id || !name || !phone) return null

  return { id, name, phone }
}

function persistStoredLoyaltyCustomer(restaurantId: string, customer: LoyaltyCustomerState) {
  window.localStorage.setItem(getLoyaltyCustomerStorageKey(restaurantId, 'id'), customer.id)
  window.localStorage.setItem(getLoyaltyCustomerStorageKey(restaurantId, 'name'), customer.name)
  window.localStorage.setItem(getLoyaltyCustomerStorageKey(restaurantId, 'phone'), customer.phone)
}

function buildLoyaltyCampaignRule(campaign: LoyaltyCampaign, language: MenuLanguage) {
  return t(language, 'loyaltyCampaignRule', {
    required: campaign.requiredQuantity,
    target: campaign.targetProductName,
    reward: campaign.rewardQuantity,
    rewardProduct: campaign.rewardProductName,
  })
}

function collectCustomerNamesFromCalls(calls: WaiterCall[]): string[] {
  const names = new Set<string>()
  for (const call of calls) {
    if (call.customerName?.trim()) names.add(call.customerName.trim())
    if (call.groupedByCustomer) {
      for (const customerName of Object.keys(call.groupedByCustomer)) {
        const trimmed = customerName.trim()
        if (trimmed) names.add(trimmed)
      }
    }
    for (const item of call.items ?? []) {
      if (item.customerName.trim()) names.add(item.customerName.trim())
    }
  }
  return [...names]
}

function getNextAnonymousCustomerName(existingNames: string[], lang: MenuLanguage): string {
  const defaultName = getDefaultCustomerName(lang)
  let maxIndex = 0
  for (const name of existingNames) {
    const match = name.trim().match(ANONYMOUS_CUSTOMER_NAME_PATTERN_BASE)
    if (!match) continue
    const parsedIndex = match[2] ? Number.parseInt(match[2], 10) : 1
    if (Number.isFinite(parsedIndex)) maxIndex = Math.max(maxIndex, parsedIndex)
  }
  if (maxIndex === 0) return defaultName
  return `${defaultName} ${maxIndex + 1}`
}

function hashString(value: string): number {
  return value.split('').reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0)
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase('tr')
}

function getProductMeta(product: Product, categoryName: string): ProductMeta {
  const haystack = normalizeText(`${product.name} ${product.description} ${categoryName}`)
  const key = hashString(`${product.id}:${product.name}:${categoryName}`)
  const magnitude = Math.abs(key)

  const fallbackEmoji =
    haystack.includes('kahve') || haystack.includes('latte') || haystack.includes('cappuccino') || haystack.includes('espresso')
      ? '☕'
      : haystack.includes('dondurma') || haystack.includes('milkshake')
        ? '🍦'
        : haystack.includes('pasta') || haystack.includes('cheesecake') || haystack.includes('cake')
          ? '🍰'
          : haystack.includes('krep') || haystack.includes('vafle') || haystack.includes('waffle')
            ? '🧇'
            : haystack.includes('çikolata') || haystack.includes('fondant') || haystack.includes('brownie') || haystack.includes('trüf')
              ? '🍫'
              : '🍽️'

  return {
    imageUrl: typeof product.image === 'string' ? product.image.trim() : '',
    fallbackEmoji,
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
    query(collection(db, 'restaurants', restaurantId, 'tables'), where('number', '==', parsedNumber), limit(1))
  )
  if (numberSnap.empty) return null
  const matchedDoc = numberSnap.docs[0]
  return {
    tableDocId: matchedDoc.id,
    table: normalizeTable(matchedDoc.id, matchedDoc.data() as Record<string, unknown>),
  }
}

export default function MenuPage() {
  const params = useParams<{ restaurantId: string; tableId: string }>()
  const { restaurantId: slugOrId, tableId } = params
  useAuth()

  const [resolvedRestaurant, setResolvedRestaurant] = useState<ResolvedRestaurant | null>(null)
  const [restaurantNotFound, setRestaurantNotFound] = useState(false)
  const [restaurantAccessReason, setRestaurantAccessReason] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [menuSettings, setMenuSettings] = useState<MenuThemeSettings>(EMPTY_MENU_THEME_SETTINGS)
  const [generalSettings, setGeneralSettings] = useState<RestaurantGeneralSettings>(EMPTY_RESTAURANT_GENERAL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const tableSessionDurationMinutes = generalSettings.tableSessionDurationMinutes

  const restaurantId = resolvedRestaurant?.id ?? ''
  const isDemoRestaurant =
    resolvedRestaurant?.id === 'demo' || (resolvedRestaurant?.slug ?? '').toLowerCase() === 'demo'

  const [tableDocId, setTableDocId] = useState<string | null>(null)
  const [table, setTable] = useState<Table | null>(null)
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [accessMessage, setAccessMessage] = useState<string | null>(null)
  const [sessionCalls, setSessionCalls] = useState<WaiterCall[]>([])
  const [sessionOrders, setSessionOrders] = useState<WaiterCall[]>([])
  const [ordersModal, setOrdersModal] = useState(false)
  const [paymentCalls, setPaymentCalls] = useState<WaiterCall[]>([])
  const [ratedCallIds, setRatedCallIds] = useState<Record<string, true>>({})
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [waiterAssistNotice, setWaiterAssistNotice] = useState<WaiterAssistNotice | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [detailQuantity, setDetailQuantity] = useState(1)

  // Onboarding & Language - use lazy initialization
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(() => {
    if (typeof window === 'undefined') return 'language'
    const storedLang = readStoredLanguage(tableId)
    return storedLang ? 'done' : 'language'
  })
  const [language, setLanguage] = useState<MenuLanguage>(() => {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE
    return readStoredLanguage(tableId) ?? DEFAULT_LANGUAGE
  })
  const [customerId] = useState(() => getOrCreateCustomerId())

  // Cart & Customer name
  const [sharedCart, setSharedCart] = useState<SharedCartItem[]>([])
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [customerNamePersisted, setCustomerNamePersisted] = useState(false)
  const [customerNameModal, setCustomerNameModal] = useState(false)
  const [customerNameInput, setCustomerNameInput] = useState('')
  const [activeLoyaltyCampaign, setActiveLoyaltyCampaign] = useState<LoyaltyCampaign | null>(null)
  const [activeCampaigns, setActiveCampaigns] = useState<LoyaltyCampaign[]>([])
  const [loyaltyProgressList, setLoyaltyProgressList] = useState<PublicLoyaltyProgress[]>([])
  const [loyaltyRefreshKey, setLoyaltyRefreshKey] = useState(0)
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<LoyaltyCustomerState | null>(null)
  const [loyaltyPromptOpen, setLoyaltyPromptOpen] = useState(false)
  const [loyaltyRegisterOpen, setLoyaltyRegisterOpen] = useState(false)
  const [loyaltyRegisterForm, setLoyaltyRegisterForm] = useState<LoyaltyRegisterForm>(EMPTY_LOYALTY_FORM)
  const [loyaltyRegistering, setLoyaltyRegistering] = useState(false)
  const [loyaltyRegisterMessage, setLoyaltyRegisterMessage] = useState<string | null>(null)
  const [availableRewards, setAvailableRewards] = useState<PublicLoyaltyReward[]>([])
  const [cartDrawer, setCartDrawer] = useState(false)
  const [orderSending, setOrderSending] = useState(false)
  const [orderSent, setOrderSent] = useState(false)
  const [orderConfirmModal, setOrderConfirmModal] = useState(false)

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

  const [wifiCopied, setWifiCopied] = useState(false)
  const [languageModal, setLanguageModal] = useState(false)
  const [demoTourOpen, setDemoTourOpen] = useState(false)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null)
  const [currentSessionTime, setCurrentSessionTime] = useState(() => Date.now())
  const previousSessionCallStates = useRef<Map<string, WaiterCall['durum']>>(new Map())
  const previousPaidCallIds = useRef<Set<string>>(new Set())
  const sessionCallsSnapshotSeen = useRef(false)
  const canUseSessionActions = isTableSessionLive(table, sessionId, currentSessionTime)

  useEffect(() => {
    let cancelled = false
    async function resolveRestaurant() {
      setLoading(true)
      setRestaurantNotFound(false)
      setResolvedRestaurant(null)
      setRestaurantAccessReason(null)
      const resolved = await resolveRestaurantBySlugOrId(slugOrId)
      if (cancelled) return
      if (resolved) {
        setResolvedRestaurant(resolved)
        setRestaurantNotFound(false)
        setRestaurantAccessReason(getRestaurantAccessBlockMessage({
          status: resolved.status,
          subscriptionExpiresAt: resolved.subscriptionExpiresAt,
        }))
      } else {
        setResolvedRestaurant(null)
        setRestaurantNotFound(true)
        setLoading(false)
      }
    }
    void resolveRestaurant()
    return () => { cancelled = true }
  }, [slugOrId])

  useEffect(() => {
    if (!restaurantId || restaurantAccessReason) return
    const currentRestaurantId = restaurantId
    async function loadMenu() {
      const cachedMenuData = menuDataCache.get(currentRestaurantId)
      if (cachedMenuData) {
        setCategories(cachedMenuData.categories)
        setProducts(cachedMenuData.products)
        setMenuSettings(cachedMenuData.menuSettings)
        setGeneralSettings(cachedMenuData.generalSettings)
        setActiveCat(cachedMenuData.categories[0]?.id ?? null)
        setLoading(false)
        return
      }
      try {
        console.log('[MENU DEBUG] Loading categories...', currentRestaurantId)
        let catSnap
        try {
          catSnap = await getDocs(getMenuCategoriesQuery(currentRestaurantId))
          console.log('[MENU DEBUG] categories OK, count:', catSnap.docs.length)
        } catch (e) {
          console.error('[MENU DEBUG] FAILED categories:', e)
          throw e
        }

        console.log('[MENU DEBUG] Loading products...')
        let prodSnap
        try {
          prodSnap = await getDocs(getMenuProductsQuery(currentRestaurantId))
          console.log('[MENU DEBUG] products OK, count:', prodSnap.docs.length)
        } catch (e) {
          console.error('[MENU DEBUG] FAILED products:', e)
          throw e
        }

        console.log('[MENU DEBUG] Loading settings/menu...')
        let menuSettingsSnap
        try {
          menuSettingsSnap = await getDoc(doc(db, 'restaurants', currentRestaurantId, 'settings', 'menu'))
          console.log('[MENU DEBUG] settings/menu OK, exists:', menuSettingsSnap.exists())
        } catch (e) {
          console.error('[MENU DEBUG] FAILED settings/menu:', e)
          throw e
        }

        console.log('[MENU DEBUG] Loading settings/general...')
        let generalSettingsSnap
        try {
          generalSettingsSnap = await getDoc(doc(db, 'restaurants', currentRestaurantId, 'settings', 'general'))
          console.log('[MENU DEBUG] settings/general OK, exists:', generalSettingsSnap.exists())
        } catch (e) {
          console.error('[MENU DEBUG] FAILED settings/general:', e)
          throw e
        }

        const nextCategories = catSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
        const nextProducts = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
        const nextMenuSettings = menuSettingsSnap.exists()
          ? normalizeMenuThemeSettings(menuSettingsSnap.data())
          : { ...EMPTY_MENU_THEME_SETTINGS }
        const nextGeneralSettings = mergeRestaurantGeneralSettings(
          generalSettingsSnap.exists() ? generalSettingsSnap.data() : null,
          null,
        )
        menuDataCache.set(currentRestaurantId, {
          categories: nextCategories,
          products: nextProducts,
          menuSettings: nextMenuSettings,
          generalSettings: nextGeneralSettings,
        })
        setCategories(nextCategories)
        setProducts(nextProducts)
        setMenuSettings(nextMenuSettings)
        setGeneralSettings(nextGeneralSettings)
        setActiveCat(nextCategories[0]?.id ?? null)
        console.log('[MENU DEBUG] All loaded successfully!')
      } catch (error) {
        console.error('Menu load error:', error)
        setRestaurantAccessReason(t(language, 'menuUnavailable'))
      } finally {
        setLoading(false)
      }
    }
    void loadMenu()
  }, [language, restaurantAccessReason, restaurantId])

  useEffect(() => {
    if (!restaurantId || restaurantNotFound || restaurantAccessReason || loading) return
    const currentRestaurantId = restaurantId
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
      setCustomerNamePersisted(false)
      setCustomerNameInput('')
      setCustomerNameModal(false)
      setActiveLoyaltyCampaign(null)
      setLoyaltyPromptOpen(false)
      setLoyaltyRegisterOpen(false)
      setLoyaltyRegisterForm(EMPTY_LOYALTY_FORM)
      setLoyaltyRegisterMessage(null)
      setSharedCart([])
      setCartDrawer(false)
      setOrderSent(false)
      setRatingModal(false)
      setRatingTargetCallId(null)
      setRatingMessage(null)
      setRatingSubmitted(false)
      setRatingForm(EMPTY_RATING_FORM)

      try {
        logFirestoreRead('menu/find table', { restaurantId: currentRestaurantId, tableId })
        const resolved = await findTableForMenu(currentRestaurantId, tableId)
        if (!resolved) {
          if (cancelled) return
          setAccessState('missing')
          setAccessMessage(t(language, 'tableNotFound'))
          return
        }
        if (cancelled) return
        setTableDocId(resolved.tableDocId)
        setTable(resolved.table)

        const localSessionId = readStoredSessionId(tableId, currentRestaurantId, resolved.tableDocId)
        const tableRef = doc(db, 'restaurants', currentRestaurantId, 'tables', resolved.tableDocId)

        const result = await runTransaction(db, async (transaction) => {
          const now = Date.now()
          const { sessionStartedAtMs, sessionExpiresAtMs } = createTableSessionWindow(
            { tableSessionDurationMinutes },
            now,
          )
          logFirestoreWrite('menu/init session transaction', {
            restaurantId: currentRestaurantId,
            tableId: resolved.tableDocId,
            storedSessionId: localSessionId,
          })
          const snap = await transaction.get(tableRef)
          if (!snap.exists()) {
            const nextSessionId = createSessionId()
            transaction.set(tableRef, {
              id: resolved.tableDocId,
              number: resolved.table.number,
              status: 'aktif',
              sessionId: nextSessionId,
              openedAt: serverTimestamp(),
              sessionStartedAt: Timestamp.fromMillis(sessionStartedAtMs),
              sessionExpiresAt: Timestamp.fromMillis(sessionExpiresAtMs),
              closedAt: null,
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
                sessionStartedAt: sessionStartedAtMs,
                sessionExpiresAt: sessionExpiresAtMs,
                closedAt: null,
              },
              sessionId: nextSessionId,
              clearStoredSession: false,
            }
          }
          const currentTable = normalizeTable(snap.id, snap.data() as Record<string, unknown>)
          if (currentTable.status === 'temizlik') {
            return {
              state: 'cleaning' as const,
              message: t(language, 'tableBeingPrepared'),
              table: currentTable,
              sessionId: null,
              clearStoredSession: false,
            }
          }
          if (currentTable.status === 'boş') {
            const nextSessionId = createSessionId()
            transaction.update(tableRef, {
              status: 'aktif',
              sessionId: nextSessionId,
              openedAt: serverTimestamp(),
              sessionStartedAt: Timestamp.fromMillis(sessionStartedAtMs),
              sessionExpiresAt: Timestamp.fromMillis(sessionExpiresAtMs),
              closedAt: null,
              updatedAt: serverTimestamp(),
            })
            return {
              state: 'ready' as const,
              message: null,
              table: {
                ...currentTable,
                status: 'aktif' as const,
                sessionId: nextSessionId,
                sessionStartedAt: sessionStartedAtMs,
                sessionExpiresAt: sessionExpiresAtMs,
                closedAt: null,
              },
              sessionId: nextSessionId,
              clearStoredSession: false,
            }
          }

          let liveSessionTable = currentTable
          if (
            liveSessionTable.sessionId &&
            isLiveTableSessionStatus(liveSessionTable.status) &&
            !liveSessionTable.sessionExpiresAt
          ) {
            const fallbackStartedAtMs = liveSessionTable.sessionStartedAt ?? liveSessionTable.openedAt ?? now
            const { sessionExpiresAtMs: fallbackExpiresAtMs } = createTableSessionWindow(
              { tableSessionDurationMinutes },
              fallbackStartedAtMs,
            )
            transaction.update(tableRef, {
              sessionStartedAt: Timestamp.fromMillis(fallbackStartedAtMs),
              sessionExpiresAt: Timestamp.fromMillis(fallbackExpiresAtMs),
              closedAt: null,
              updatedAt: serverTimestamp(),
            })
            liveSessionTable = {
              ...liveSessionTable,
              sessionStartedAt: fallbackStartedAtMs,
              sessionExpiresAt: fallbackExpiresAtMs,
              closedAt: null,
            }
          }

          if (localSessionId && liveSessionTable.sessionId === localSessionId) {
            if (isTableSessionLive(liveSessionTable, localSessionId, now)) {
              return {
                state: 'ready' as const,
                message: null,
                table: liveSessionTable,
                sessionId: localSessionId,
                clearStoredSession: false,
              }
            }
            return {
              state: 'expired' as const,
              message: t(language, 'sessionExpired'),
              table: liveSessionTable,
              sessionId: null,
              clearStoredSession: false,
            }
          }
          if (
            !localSessionId &&
            liveSessionTable.sessionId &&
            isTableSessionLive(liveSessionTable, liveSessionTable.sessionId, now)
          ) {
            return {
              state: 'ready' as const,
              message: null,
              table: liveSessionTable,
              sessionId: liveSessionTable.sessionId,
              clearStoredSession: false,
            }
          }

          if (liveSessionTable.sessionId && isLiveTableSessionStatus(liveSessionTable.status)) {
            return {
              state: isTableSessionExpired(liveSessionTable, now) ? 'expired' as const : 'locked' as const,
              message: getInactiveSessionMessage(language, liveSessionTable, localSessionId, now),
              table: liveSessionTable,
              sessionId: null,
              clearStoredSession: false,
            }
          }

          return {
            state: 'locked' as const,
            message: t(language, 'sessionInactive'),
            table: liveSessionTable,
            sessionId: null,
            clearStoredSession: false,
          }
        })

        if (cancelled) return
        if (result.table) setTable(result.table)
        if (result.state === 'ready' && result.sessionId) {
          persistSessionId(tableId, currentRestaurantId, resolved.tableDocId, result.sessionId)
          setSessionId(result.sessionId)
          setAccessState('ready')
          setAccessMessage(null)
          return
        }
        if (result.clearStoredSession) {
          clearStoredSessionId(tableId, currentRestaurantId, resolved.tableDocId)
        }
        setAccessState(result.state)
        setAccessMessage(result.message)
      } catch (error) {
        if (cancelled) return
        setAccessState('error')
        setAccessMessage(error instanceof Error ? error.message : t(language, 'sessionNotFound'))
      }
    }
    initSession()
    return () => { cancelled = true }
  }, [language, loading, restaurantAccessReason, restaurantId, restaurantNotFound, tableId, tableSessionDurationMinutes])

  // Load customer name when session is ready
  useEffect(() => {
    if (!sessionId || !tableDocId) return
    let cancelled = false
    const loadCustomerState = () => {
      if (cancelled) return
      const storedName = readCustomerName(restaurantId, tableId, sessionId)
      if (storedName) {
        setCustomerName(storedName)
        setCustomerNamePersisted(true)
        setCustomerNameInput(storedName)
      } else {
        const defaultName = getDefaultCustomerName(language)
        setCustomerName(defaultName)
        setCustomerNamePersisted(false)
        setCustomerNameInput('')
      }
    }
    const timeout = requestAnimationFrame(loadCustomerState)
    return () => { cancelled = true; cancelAnimationFrame(timeout) }
  }, [language, restaurantId, sessionId, tableDocId, tableId])

  useEffect(() => {
    let cancelled = false

    const syncStoredCustomer = () => {
      if (cancelled) return

      if (!restaurantId) {
        setLoyaltyCustomer(null)
        return
      }

      const storedCustomer = readStoredLoyaltyCustomer(restaurantId)
      setLoyaltyCustomer(storedCustomer)

      if (storedCustomer) {
        setLoyaltyRegisterForm({ name: storedCustomer.name, phone: storedCustomer.phone, email: '' })
      }
    }

    const frameId = requestAnimationFrame(syncStoredCustomer)

    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [restaurantId])

  useEffect(() => {
    if (onboardingStep !== 'done' || accessState !== 'ready' || !restaurantId || !sessionId || !tableDocId) {
      return
    }

    const currentRestaurantId = restaurantId
    const currentTableDocId = tableDocId
    const currentSessionId = sessionId
    const shouldOfferPrompt = !loyaltyCustomer && !customerNameModal
    let cancelled = false

    async function loadActiveCampaigns() {
      try {
        const campaignSnap = await getDocs(getRestaurantActiveLoyaltyCampaignsQuery(currentRestaurantId, 10))
        if (cancelled) return

        if (campaignSnap.empty) {
          setActiveCampaigns([])
          setActiveLoyaltyCampaign(null)
          setLoyaltyPromptOpen(false)
          return
        }

        const campaigns = campaignSnap.docs.map((docSnap) =>
          normalizeLoyaltyCampaign(docSnap.id, docSnap.data() as Record<string, unknown>),
        )

        setActiveCampaigns(campaigns)
        setActiveLoyaltyCampaign(campaigns[0])

        if (!shouldOfferPrompt) return
        if (hasLoyaltyPromptBeenHandled(currentRestaurantId, currentTableDocId, currentSessionId)) return

        setLoyaltyPromptOpen(true)
        setLoyaltyRegisterMessage(null)
      } catch (error) {
        console.error('Loyalty campaign load error:', error)
      }
    }

    void loadActiveCampaigns()

    return () => {
      cancelled = true
    }
  }, [accessState, customerNameModal, loyaltyCustomer, onboardingStep, restaurantId, sessionId, tableDocId])

  // Demo tour: only on the demo restaurant, once per device
  useEffect(() => {
    if (!isDemoRestaurant || loading || onboardingStep !== 'done') return
    const frameId = requestAnimationFrame(() => {
      if (window.localStorage.getItem(DEMO_TOUR_STORAGE_KEY) === 'true') return
      setDemoTourOpen(true)
    })
    return () => cancelAnimationFrame(frameId)
  }, [isDemoRestaurant, loading, onboardingStep])

  // Fetch exchange rates for currency conversion
  useEffect(() => {
    if (language === 'tr') return
    let cancelled = false
    getExchangeRates().then((rates) => {
      if (!cancelled) setExchangeRates(rates)
    })
    return () => { cancelled = true }
  }, [language])

  // Load loyalty progress + available rewards through the public status API
  // (Firestore rules keep these collections closed to unauthenticated reads)
  useEffect(() => {
    if (!restaurantId || !loyaltyCustomer) return
    const customerId = loyaltyCustomer.id
    let cancelled = false

    async function loadLoyaltyStatus() {
      try {
        const response = await fetch(
          `/api/public/loyalty/status?restaurantId=${encodeURIComponent(restaurantId)}&customerId=${encodeURIComponent(customerId)}`,
          { cache: 'no-store' },
        )
        if (!response.ok) return
        const payload = await response.json().catch(() => null)
        if (cancelled || !payload) return
        setAvailableRewards(Array.isArray(payload.rewards) ? payload.rewards : [])
        setLoyaltyProgressList(Array.isArray(payload.progress) ? payload.progress : [])
      } catch (error) {
        console.error('Loyalty status load error:', error)
      }
    }

    void loadLoyaltyStatus()

    return () => {
      cancelled = true
      setAvailableRewards([])
      setLoyaltyProgressList([])
    }
  }, [restaurantId, loyaltyCustomer?.id, loyaltyRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate pending rewards based on cart items using useMemo
  const pendingRewardsComputed = useMemo(() => {
    if (!loyaltyCustomer || !activeLoyaltyCampaign || sharedCart.length === 0) return []
    const cartItems = sharedCartToCartItems(sharedCart)
    return calculatePendingRewards(cartItems, [activeLoyaltyCampaign])
  }, [sharedCart, activeLoyaltyCampaign, loyaltyCustomer])

  // Subscribe to shared cart
  useEffect(() => {
    if (!restaurantId || !tableDocId || !sessionId || !canUseSessionActions) return
    const unsubscribe = subscribeToSharedCart(
      restaurantId,
      tableDocId,
      sessionId,
      (items) => setSharedCart(items),
      (error) => console.error('Cart subscription error:', error)
    )
    return () => unsubscribe()
  }, [canUseSessionActions, restaurantId, sessionId, tableDocId])

  // Subscribe to table updates
  useEffect(() => {
    if (!restaurantId || !tableDocId) return
    logFirestoreRead('menu/table listener', { restaurantId, tableId: tableDocId })
    const unsubscribe = onSnapshot(
      doc(db, 'restaurants', restaurantId, 'tables', tableDocId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setTable(null)
          return
        }
        setTable(normalizeTable(snapshot.id, snapshot.data() as Record<string, unknown>))
      },
      (error) => {
        console.error('[MENU] Table listener error:', error.code, error.message)
      }
    )
    return () => unsubscribe()
  }, [restaurantId, tableDocId])

  useEffect(() => {
    if (!table?.sessionExpiresAt) return
    const timeoutId = window.setTimeout(() => {
      setCurrentSessionTime(Date.now())
    }, Math.max(0, table.sessionExpiresAt - Date.now()) + 100)
    return () => window.clearTimeout(timeoutId)
  }, [table?.sessionExpiresAt, table?.sessionId])

  // Subscribe to session calls
  useEffect(() => {
    if (!restaurantId || !sessionId || !tableDocId) return
    previousSessionCallStates.current = new Map()
    previousPaidCallIds.current = new Set()
    sessionCallsSnapshotSeen.current = false
    logFirestoreRead('menu/session calls listener', { restaurantId, tableId: tableDocId, sessionId })
    const sessionCallsQuery = query(
      collection(db, 'restaurants', restaurantId, 'calls'),
      where('sessionId', '==', sessionId),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
    const unsubscribe = onSnapshot(
      sessionCallsQuery,
      (snapshot) => {
        const allSessionCalls = snapshot.docs
          .map((docSnap) => normalizeWaiterCall(docSnap.id, docSnap.data() as Record<string, unknown>))
          .filter((call) => call.tableId === tableDocId)
          .sort((a, b) => b.createdAt - a.createdAt)
        const nextStates = new Map<string, WaiterCall['durum']>()
        const nextPaidIds = new Set<string>()
        let nextNotice: WaiterAssistNotice | null = null
        let hasNewlyPaidOrder = false

        for (const call of allSessionCalls) {
          nextStates.set(call.id, call.durum)
          const previousStatus = previousSessionCallStates.current.get(call.id)
          const waiterName = call.waiterName?.trim()

          if (call.tip === 'sipariş' && call.paymentStatus === 'paid') {
            nextPaidIds.add(call.id)
            if (sessionCallsSnapshotSeen.current && !previousPaidCallIds.current.has(call.id)) {
              hasNewlyPaidOrder = true
            }
          }

          if (
            !nextNotice &&
            previousStatus === 'bekliyor' &&
            call.durum === 'kabul edildi' &&
            waiterName
          ) {
            nextNotice = {
              callId: call.id,
              tableId: call.tableId,
              sessionId: call.sessionId,
              tip: call.tip,
              waiterName,
              waiterPhotoUrl: call.waiterPhotoUrl ?? null,
              waiterAverageRating: call.waiterAverageRating ?? null,
            }
          }
        }

        previousSessionCallStates.current = nextStates
        previousPaidCallIds.current = nextPaidIds
        sessionCallsSnapshotSeen.current = true
        setSessionCalls(allSessionCalls.filter((call) => call.durum === 'bekliyor' || call.durum === 'kabul edildi'))
        setSessionOrders(allSessionCalls.filter((call) => call.tip === 'sipariş'))
        setPaymentCalls(allSessionCalls.filter((call) => call.tip === 'hesap'))
        if (nextNotice) setWaiterAssistNotice(nextNotice)
        if (hasNewlyPaidOrder) {
          // Kampanya motoru yalnızca ödeme kapanınca çalışır; küçük gecikme,
          // transaction yazımının durum API'sinden önce oturmasını sağlar.
          window.setTimeout(() => setLoyaltyRefreshKey((key) => key + 1), 2500)
        }
      },
      (error) => {
        console.error('[MENU] Session calls listener error:', error.code, error.message)
      }
    )
    return () => {
      previousSessionCallStates.current = new Map()
      previousPaidCallIds.current = new Set()
      sessionCallsSnapshotSeen.current = false
      unsubscribe()
    }
  }, [restaurantId, sessionId, tableDocId])

  useEffect(() => {
    if (!waiterAssistNotice) return
    const timeoutId = window.setTimeout(() => {
      setWaiterAssistNotice((current) => current?.callId === waiterAssistNotice.callId ? null : current)
    }, 4500)
    return () => window.clearTimeout(timeoutId)
  }, [waiterAssistNotice])

  const completedPaymentCall = paymentCalls.find((call) => call.tip === 'hesap' && call.durum === 'tamamlandı' && call.sessionId === sessionId) ?? null
  const activeRatingCall = (ratingTargetCallId ? paymentCalls.find((call) => call.id === ratingTargetCallId) ?? null : null) ?? completedPaymentCall
  const hasExistingRatingForActiveCall = !!activeRatingCall && !!ratedCallIds[activeRatingCall.id]

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
    return () => { cancelled = true }
  }, [completedPaymentCall, hasExistingRatingForActiveCall, ratingModal, restaurantId, sessionId])

  function handleSelectLanguage(lang: MenuLanguage) {
    setLanguage(lang)
    saveLanguage(tableId, lang)
    setOnboardingStep('name')
  }

  function handleSaveCustomerNameOnboarding() {
    const trimmed = customerNameInput.trim()
    if (trimmed) {
      saveCustomerName(restaurantId, tableId, trimmed)
      setCustomerName(trimmed)
      setCustomerNamePersisted(true)
    } else {
      const defaultName = getDefaultCustomerName(language)
      setCustomerName(defaultName)
      setCustomerNamePersisted(false)
    }
    setOnboardingStep('done')
  }

  function handleContinueWithoutNameOnboarding() {
    const names = [
      ...sharedCart.map((item) => item.customerName),
      ...collectCustomerNamesFromCalls(sessionCalls),
      ...collectCustomerNamesFromCalls(paymentCalls),
    ]
    const nextName = getNextAnonymousCustomerName(names, language)
    setCustomerName(nextName)
    setCustomerNamePersisted(false)
    setOnboardingStep('done')
  }

  function openCallModal() {
    if (callButtonDisabled) return
    setActionMessage(null)
    setSent(false)
    setCallModal(true)
  }

  function openCartDrawer() {
    if (!canUseSessionActions) {
      setActionMessage(sessionActionMessage)
      return
    }
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

  function dismissLoyaltyPrompt() {
    if (restaurantId && tableDocId && sessionId) {
      persistLoyaltyPromptHandled(restaurantId, tableDocId, sessionId)
    }

    setLoyaltyPromptOpen(false)
    setLoyaltyRegisterOpen(false)
    setLoyaltyRegisterMessage(null)
  }

  function openLoyaltyRegister() {
    setLoyaltyPromptOpen(false)
    setLoyaltyRegisterMessage(null)
    setLoyaltyRegisterForm((current) => ({
      ...current,
      name: current.name.trim() || customerName?.trim() || '',
    }))
    setLoyaltyRegisterOpen(true)
  }

  async function submitLoyaltyRegistration() {
    // Kampanya katılımı yalnızca ad + telefon ister; telefon müşteri kimliğidir.
    const name = loyaltyRegisterForm.name.trim()
    const phone = loyaltyRegisterForm.phone.trim()

    if (!restaurantId) {
      setLoyaltyRegisterMessage(t(language, 'customerInfoError'))
      return
    }

    if (!name || !phone) {
      setLoyaltyRegisterMessage(t(language, 'loyaltyNamePhoneRequired'))
      return
    }

    setLoyaltyRegistering(true)
    setLoyaltyRegisterMessage(null)

    try {
      const response = await fetch('/api/public/loyalty/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurantId,
          name,
          phone,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Kampanya kaydı tamamlanamadı.')
      }

      const nextCustomer = {
        id: typeof payload.customerId === 'string' ? payload.customerId : '',
        name: typeof payload.customerName === 'string' ? payload.customerName : name,
        phone: typeof payload.customerPhone === 'string' ? payload.customerPhone : phone,
      }

      if (!nextCustomer.id || !nextCustomer.name || !nextCustomer.phone) {
        throw new Error('Kampanya kaydı yanıtı eksik geldi.')
      }

      persistStoredLoyaltyCustomer(restaurantId, nextCustomer)
      setLoyaltyCustomer(nextCustomer)
      setLoyaltyRegisterForm({ name: nextCustomer.name, phone: nextCustomer.phone, email: '' })
      setLoyaltyRegisterOpen(false)
      setLoyaltyPromptOpen(false)
      setLoyaltyRegisterMessage(null)
      setActionMessage(t(language, 'loyaltyRegistrationReady'))

      if (tableDocId && sessionId) {
        persistLoyaltyPromptHandled(restaurantId, tableDocId, sessionId)
      }

      persistCustomerIdentity(nextCustomer.name)
    } catch (error) {
      setLoyaltyRegisterMessage(error instanceof Error ? error.message : 'Kampanya kaydı tamamlanamadı.')
    } finally {
      setLoyaltyRegistering(false)
    }
  }

  function getKnownCustomerNames() {
    return [
      ...new Set([
        ...sharedCart.map((item) => item.customerName.trim()).filter(Boolean),
        ...collectCustomerNamesFromCalls(sessionCalls),
        ...collectCustomerNamesFromCalls(paymentCalls),
      ]),
    ]
  }

  function persistCustomerIdentity(nextCustomerName: string) {
    if (!restaurantId) return null
    const trimmedCustomerName = nextCustomerName.trim()
    if (!trimmedCustomerName) return null
    saveCustomerName(restaurantId, tableId, trimmedCustomerName)
    setCustomerName(trimmedCustomerName)
    setCustomerNamePersisted(true)
    setCustomerNameInput(trimmedCustomerName)
    setCustomerNameModal(false)
    return { name: trimmedCustomerName }
  }

  function ensureCustomerIdentity(preferredName?: string | null) {
    const trimmedPreferredName = preferredName?.trim() ?? ''
    if (trimmedPreferredName) return persistCustomerIdentity(trimmedPreferredName)
    if (customerNamePersisted && customerName?.trim()) return persistCustomerIdentity(customerName.trim())
    return persistCustomerIdentity(getNextAnonymousCustomerName(getKnownCustomerNames(), language))
  }

  function openProduct(product: Product) {
    setSelectedProduct(product)
    setDetailQuantity(1)
  }

  function adjustDetailQuantity(direction: 'inc' | 'dec') {
    setDetailQuantity((current) => {
      if (direction === 'inc') return current + 1
      return Math.max(1, current - 1)
    })
  }

  async function handleAddToCart(product: Product, quantity: number) {
    if (!canUseSessionActions) {
      setActionMessage(sessionActionMessage)
      return
    }
    if (!customerName || !sessionId || !tableDocId) return
    const existingItem = activeSharedCart.find((item) => item.productId === product.id && item.customerId === customerId)
    if (existingItem) {
      await updateSharedCartItemQuantity(restaurantId, tableDocId, existingItem.id, existingItem.quantity + quantity)
    } else {
      await addToSharedCart(restaurantId, tableDocId, sessionId, customerId, customerName, product, quantity)
    }
  }

  async function handleUpdateCartItemQuantity(item: SharedCartItem, delta: number) {
    if (!canUseSessionActions) {
      setActionMessage(sessionActionMessage)
      return
    }
    if (!tableDocId) return
    const newQuantity = item.quantity + delta
    if (newQuantity <= 0) {
      await removeSharedCartItem(restaurantId, tableDocId, item.id)
    } else {
      await updateSharedCartItemQuantity(restaurantId, tableDocId, item.id, newQuantity)
    }
  }

  async function handleRemoveCartItem(item: SharedCartItem) {
    if (!canUseSessionActions) {
      setActionMessage(sessionActionMessage)
      return
    }
    if (!tableDocId) return
    await removeSharedCartItem(restaurantId, tableDocId, item.id)
  }

  function handleQuickAdd(product: Product) {
    void handleAddToCart(product, 1)
  }

  function handleAddFromSheet() {
    if (!selectedProduct) return
    void handleAddToCart(selectedProduct, detailQuantity)
    setSelectedProduct(null)
    setDetailQuantity(1)
  }

  function handleSaveCustomerName() {
    void ensureCustomerIdentity(customerNameInput)
  }

  function handleContinueWithoutName() {
    void ensureCustomerIdentity()
  }

  async function sendOrder() {
    if (!canUseSessionActions) {
      setActionMessage(sessionActionMessage)
      return
    }
    if (activeSharedCart.length === 0 || !tableDocId || !sessionId) return
    setOrderSending(true)
    setActionMessage(null)

    try {
      const customerState = ensureCustomerIdentity()
      if (!customerState) {
        setActionMessage(t(language, 'customerInfoError'))
        return
      }
      const { name: activeCustomerName } = customerState
      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableDocId)
      const liveTableSnap = await getDoc(tableRef)
      if (!liveTableSnap.exists()) {
        setActionMessage(t(language, 'tableNotFound'))
        return
      }
      const liveTable = normalizeTable(liveTableSnap.id, liveTableSnap.data() as Record<string, unknown>)
      if (!isTableSessionLive(liveTable, sessionId)) {
        setActionMessage(getInactiveSessionMessage(language, liveTable, sessionId))
        return
      }

      const effectiveTableNumber = liveTable.number > 0 ? liveTable.number : (table?.number ?? Number.parseInt(tableId, 10))
      const cartItems = sharedCartToCartItems(activeSharedCart)
      const grouped = groupCartItemsByCustomer(cartItems)
      const totalPrice = calculateCartTotal(cartItems)
      const batch = writeBatch(db)
      const callsCollection = collection(db, 'restaurants', restaurantId, 'calls')
      const newCallRef = doc(callsCollection)

      const loyaltyPreview = loyaltyCustomer && pendingRewardsComputed.length > 0
        ? {
            campaignId: pendingRewardsComputed[0].campaignId,
            campaignName: pendingRewardsComputed[0].campaignName,
            rewardProductName: pendingRewardsComputed[0].rewardProductName,
            rewardQuantity: pendingRewardsComputed[0].rewardQuantity,
            eligible: true,
          }
        : null

      batch.set(newCallRef, {
        tableId: tableDocId,
        tableNumber: effectiveTableNumber,
        sessionId,
        restaurantId,
        tip: 'sipariş',
        durum: 'bekliyor',
        status: 'open',
        customerName: activeCustomerName,
        ...(loyaltyCustomer ? {
          customerId: loyaltyCustomer.id,
          customerPhone: loyaltyCustomer.phone,
        } : {}),
        ...(loyaltyPreview ? { loyaltyPreview } : {}),
        createdAt: serverTimestamp(),
        waiterId: null,
        waiterName: null,
        waiterPhotoUrl: null,
        waiterAverageRating: null,
        note: '',
        items: cartItems,
        totalPrice,
        groupedByCustomer: grouped,
      })

      if (liveTable.status === 'aktif') {
        batch.update(tableRef, { status: 'çağrı var', updatedAt: serverTimestamp() })
      }

      logFirestoreWrite('menu/send order', { restaurantId, tableId: tableDocId, items: cartItems.length })
      await batch.commit()
      await clearSharedCartForSession(restaurantId, tableDocId, sessionId, activeSharedCart)

      setOrderSent(true)
      if (liveTable.status === 'aktif') {
        setTable((current) => (current ? { ...current, status: 'çağrı var', updatedAt: currentSessionTime } : current))
      }
      window.setTimeout(() => {
        setOrderSent(false)
        setCartDrawer(false)
      }, 3000)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t(language, 'orderFailed'))
    } finally {
      setOrderSending(false)
    }
  }

  async function sendCall() {
    if (!canUseSessionActions) {
      setActionMessage(sessionActionMessage)
      return
    }
    if (!selectedTip || !tableDocId) return
    setSending(true)
    setActionMessage(null)

    try {
      const customerState = ensureCustomerIdentity()
      if (!customerState) {
        setActionMessage(t(language, 'customerInfoError'))
        return
      }
      const { name: activeCustomerName } = customerState
      const storedSessionId = readStoredSessionId(tableId, restaurantId, tableDocId)
      const activeSessionId = sessionId ?? storedSessionId
      if (!activeSessionId) {
        setActionMessage(t(language, 'sessionNotFound'))
        return
      }

      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableDocId)
      logFirestoreRead('menu/send call table', { restaurantId, tableId: tableDocId })
      const liveTableSnap = await getDoc(tableRef)
      if (!liveTableSnap.exists()) {
        setActionMessage(t(language, 'tableNotFound'))
        return
      }
      const liveTable = normalizeTable(liveTableSnap.id, liveTableSnap.data() as Record<string, unknown>)
      if (liveTable.status === 'temizlik') {
        setActionMessage(t(language, 'tableBeingPrepared'))
        return
      }
      if (!isTableSessionLive(liveTable, activeSessionId)) {
        setActionMessage(getInactiveSessionMessage(language, liveTable, activeSessionId))
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
          .map((d) => normalizeWaiterCall(d.id, d.data() as Record<string, unknown>))
          .filter((call) => call.tableId === tableDocId && call.tip === selectedTip)
          .sort((a, b) => b.createdAt - a.createdAt)
        const openRequest = liveSessionCalls.find((call) => call.durum === 'bekliyor' || call.durum === 'kabul edildi')
        if (openRequest) {
          setActionMessage(selectedTip === 'yardım' ? t(language, 'activeHelpRequest') : t(language, 'activePaymentRequest'))
          return
        }
      }

      const callsCollection = collection(db, 'restaurants', restaurantId, 'calls')
      const newCallRef = doc(callsCollection)
      const batch = writeBatch(db)
      const effectiveTableNumber = liveTable.number > 0 ? liveTable.number : (table?.number ?? Number.parseInt(tableId, 10))

      batch.set(newCallRef, {
        tableId: tableDocId,
        tableNumber: effectiveTableNumber,
        sessionId: activeSessionId,
        restaurantId,
        tip: selectedTip,
        durum: 'bekliyor',
        status: 'open',
        createdAt: serverTimestamp(),
        waiterId: null,
        waiterName: null,
        waiterPhotoUrl: null,
        waiterAverageRating: null,
        customerName: activeCustomerName,
        note: note.trim() || '',
      })

      const nextStatus = selectedTip === 'hesap' ? 'hesap istendi' : 'çağrı var'
      if (liveTable.status !== nextStatus) {
        batch.update(tableRef, { status: nextStatus, updatedAt: serverTimestamp() })
      }

      logFirestoreWrite('menu/create call', { restaurantId, tableId: tableDocId, tip: selectedTip })
      await batch.commit()
      setSessionId(activeSessionId)
      const newOpenCall: WaiterCall = {
        id: newCallRef.id,
        tableId: tableDocId,
        tableNumber: effectiveTableNumber,
        sessionId: activeSessionId,
        restaurantId,
        tip: selectedTip,
        durum: 'bekliyor',
        status: 'open',
        waiterId: undefined,
        waiterName: undefined,
        waiterPhotoUrl: null,
        waiterAverageRating: null,
        customerName: activeCustomerName,
        note: note.trim() || '',
        createdAt: currentSessionTime,
      }
      setSessionCalls((current) => [newOpenCall, ...current].slice(0, 50))
      setTable((current) => (current ? { ...current, status: nextStatus } : current))

      setSent(true)
      window.setTimeout(() => {
        setSent(false)
        closeCallModal()
      }, 2500)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t(language, 'callFailed'))
    } finally {
      setSending(false)
    }
  }

  async function submitRating() {
    if (!activeRatingCall || !sessionId || !tableDocId) return
    if (!ratingForm.serviceRating || !ratingForm.waiterRating) {
      setRatingMessage(t(language, 'selectBothRatings'))
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
        setRatingMessage(t(language, 'alreadyRated'))
        return
      }
      if (!callSnap.exists()) {
        setRatingMessage(t(language, 'ratingRecordNotFound'))
        return
      }
      const liveCall = normalizeWaiterCall(callSnap.id, callSnap.data() as Record<string, unknown>)
      if (liveCall.tip !== 'hesap' || liveCall.durum !== 'tamamlandı') {
        setRatingMessage(t(language, 'ratingOnlyAfterPayment'))
        return
      }
      if (liveCall.sessionId !== sessionId) {
        setRatingMessage(t(language, 'sessionVerificationFailed'))
        return
      }

      const hasCompleter = !!(liveCall.waiterId || liveCall.completedById)
      const ratingStatus = hasCompleter ? 'approved' : 'suspicious'
      const effectiveWaiterId = liveCall.waiterId ?? liveCall.completedById ?? null
      const effectiveWaiterName = liveCall.waiterName ?? liveCall.completedByName ?? 'İşletme'

      logFirestoreWrite('menu/submit rating', { restaurantId, callId: liveCall.id })
      await setDoc(ratingRef, {
        restaurantId,
        tableId: tableDocId,
        tableNumber: table?.number ?? liveCall.tableNumber,
        sessionId,
        callId: liveCall.id,
        waiterId: effectiveWaiterId,
        waiterName: effectiveWaiterName,
        serviceRating: ratingForm.serviceRating,
        waiterRating: ratingForm.waiterRating,
        comment: ratingForm.comment.trim(),
        status: ratingStatus,
        createdAt: serverTimestamp(),
      })
      setRatedCallIds((current) => ({ ...current, [liveCall.id]: true }))
      setRatingSubmitted(true)
      window.setTimeout(() => closeRatingModal(), 2500)
    } catch (error) {
      setRatingMessage(error instanceof Error ? error.message : t(language, 'ratingFailed'))
    } finally {
      setRatingSending(false)
    }
  }

  async function copyWifiPassword() {
    if (!generalSettings.wifiPassword) return
    try {
      await navigator.clipboard.writeText(generalSettings.wifiPassword)
      setWifiCopied(true)
      setTimeout(() => setWifiCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  function closeDemoTour() {
    window.localStorage.setItem(DEMO_TOUR_STORAGE_KEY, 'true')
    setDemoTourOpen(false)
  }

  function handleLanguageChange(lang: MenuLanguage) {
    setLanguage(lang)
    saveLanguage(tableId, lang)
    setLanguageModal(false)
  }

  const currentLanguageLabel = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.code.toUpperCase() ?? 'TR'

  // Price display helper with currency conversion
  function renderPrice(amount: number, options?: { large?: boolean; inline?: boolean }) {
    const { primary, secondary } = formatPriceWithConversion(amount, language, exchangeRates)
    if (!secondary) {
      return <>{primary}</>
    }
    if (options?.inline) {
      return <>{primary} <span style={{ opacity: 0.6, fontSize: '0.85em' }}>{secondary}</span></>
    }
    return (
      <>
        {primary}
        <span style={{ opacity: 0.55, fontSize: options?.large ? '0.5em' : '0.75em', marginLeft: '4px', fontWeight: 500 }}>
          {secondary}
        </span>
      </>
    )
  }

  const visibleProducts = products
    .filter((product) => product.categoryId === activeCat && product.available)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  const categoryCounts = Object.fromEntries(
    categories.map((category) => [category.id, products.filter((product) => product.categoryId === category.id && product.available).length])
  )
  const categoryNames = Object.fromEntries(categories.map((category) => [category.id, category.name]))

  const hasGeneralSettings = Boolean(generalSettings.businessName || generalSettings.logoUrl)
  const menuDisplayName = hasGeneralSettings ? resolveRestaurantBusinessName(generalSettings) : resolveMenuDisplayName(menuSettings)
  const menuLogoUrl = hasGeneralSettings && generalSettings.logoUrl ? generalSettings.logoUrl : menuSettings.logoUrl
  const menuPrimaryColor = generalSettings.primaryColor || DEFAULT_MENU_PRIMARY_COLOR
  const palette = buildThemePalette(menuPrimaryColor)
  const menuThemeVars = buildThemeStyleVars(menuPrimaryColor)
  const menuPrimaryTextColor = palette.primaryForeground
  const menuTextColor = palette.text
  const menuMutedColor = palette.muted
  const menuSurfaceMuted = palette.surfaceMuted
  const menuBorderColor = palette.borderSoft

  const hasActiveHelpRequest = sessionCalls.some((call) => call.tip === 'yardım')
  const hasActivePaymentRequest = sessionCalls.some((call) => call.tip === 'hesap')
  const activeOrderCount = sessionOrders.filter((order) => getOrderFlowStage(order) !== 'paid').length
  const selectedTipLockMessage =
    selectedTip === 'yardım' && hasActiveHelpRequest
      ? t(language, 'activeHelpRequest')
      : selectedTip === 'hesap' && hasActivePaymentRequest
        ? t(language, 'activePaymentRequest')
        : null
  const sessionMatchesTable = !!table && !!sessionId && table.sessionId === sessionId
  const activeSharedCart = canUseSessionActions ? sharedCart : []
  const cartCount = getSharedCartCount(activeSharedCart)
  const cartTotal = calculateSharedCartTotal(activeSharedCart)
  const cartGrouped = groupSharedCartByCustomer(activeSharedCart)
  const isPreparing = table?.status === 'temizlik'
  const isDifferentActiveSession =
    !!table && isLiveTableSessionStatus(table.status) && !!table.sessionId && !!sessionId && table.sessionId !== sessionId
  const isSessionExpired = sessionMatchesTable && isTableSessionExpired(table, currentSessionTime)
  const isSessionClosed = !!table && table.status === 'boş' && !!sessionId && table.sessionId !== sessionId
  const ratingSubmitDisabled = ratingSending || ratingSubmitted || !activeRatingCall || !ratingForm.serviceRating || !ratingForm.waiterRating

  const derivedAccessMessage =
    accessMessage ??
    (isPreparing
      ? t(language, 'tableBeingPrepared')
      : isSessionExpired || isDifferentActiveSession || isSessionClosed
        ? getInactiveSessionMessage(language, table, sessionId, currentSessionTime)
        : null)

  const infoMessage = derivedAccessMessage ?? actionMessage
  const sessionActionMessage = derivedAccessMessage ?? getInactiveSessionMessage(language, table, sessionId, currentSessionTime)
  const callButtonDisabled = accessState === 'checking' || accessState === 'missing' || accessState === 'error' || !!derivedAccessMessage || sending
  const displayTableLabel = table?.number ? String(table.number) : tableId
  const canDismissCustomerModal = !!customerName
  const loyaltyCampaignRule = activeLoyaltyCampaign ? buildLoyaltyCampaignRule(activeLoyaltyCampaign, language) : null
  const modalSendDisabled = !selectedTip || sending || !!derivedAccessMessage || !!selectedTipLockMessage
  const primaryActionDisabled =
    accessState === 'checking' || accessState === 'missing' || accessState === 'error' || !!derivedAccessMessage || (cartCount > 0 ? orderSending : sending)
  const visibleWaiterAssistNotice =
    waiterAssistNotice &&
    waiterAssistNotice.tableId === tableDocId &&
    waiterAssistNotice.sessionId === sessionId
      ? waiterAssistNotice
      : null
  const waiterAssistMessage =
    visibleWaiterAssistNotice
      ? visibleWaiterAssistNotice.tip === 'sipariş'
        ? t(language, 'waiterAssistOrderMessage', { waiterName: visibleWaiterAssistNotice.waiterName })
        : visibleWaiterAssistNotice.tip === 'hesap'
          ? t(language, 'waiterAssistBillMessage', { waiterName: visibleWaiterAssistNotice.waiterName })
          : t(language, 'waiterAssistHelpMessage', { waiterName: visibleWaiterAssistNotice.waiterName })
      : null

  const isRtl = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.dir === 'rtl'

  if (restaurantNotFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)]" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="px-6 text-center text-[var(--text)]">
          <SearchX className="mx-auto mb-3 h-10 w-10 text-[var(--primary)]" />
          <p className="font-semibold text-lg mb-2">{t(language, 'menuNotFound')}</p>
          <p className="text-sm text-gray-500">{t(language, 'invalidLink')}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return <LoadingScreen variant="menu" message={t(language, 'loading')} />
  }

  if (restaurantAccessReason) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-6" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="w-full max-w-md rounded-[2rem] border bg-white px-6 py-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]" style={{ borderColor: menuBorderColor }}>
          <p className="text-[1.5rem] font-semibold text-[var(--text)]">{t(language, 'menuUnavailable')}</p>
          <p className="mt-3 text-sm leading-6" style={{ color: menuMutedColor }}>{restaurantAccessReason}</p>
        </div>
      </div>
    )
  }

  // Language Selection Screen
  if (onboardingStep === 'language') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ ...menuThemeVars, background: 'var(--page-bg)' }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            {menuLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={menuLogoUrl} alt={menuDisplayName} className="h-16 w-16 mx-auto rounded-2xl object-cover border border-black/5 bg-white shadow-lg mb-4" />
            )}
            <h1 className="text-2xl font-bold" style={{ color: menuTextColor }}>{t(DEFAULT_LANGUAGE, 'selectLanguage')}</h1>
            <p className="mt-2 text-sm" style={{ color: menuMutedColor }}>{t(DEFAULT_LANGUAGE, 'selectLanguageDescription')}</p>
          </div>
          <div className="space-y-3">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className="w-full rounded-2xl bg-white px-5 py-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.06)] border transition-all hover:shadow-[0_12px_32px_rgba(0,0,0,0.1)]"
                style={{ borderColor: menuBorderColor }}
                dir={lang.dir}
              >
                <p className="text-lg font-semibold" style={{ color: menuTextColor }}>{lang.nativeName}</p>
                <p className="text-sm mt-0.5" style={{ color: menuMutedColor }}>{lang.name}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Name Entry Screen
  if (onboardingStep === 'name') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ ...menuThemeVars, background: 'var(--page-bg)' }} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            {menuLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={menuLogoUrl} alt={menuDisplayName} className="h-16 w-16 mx-auto rounded-2xl object-cover border border-black/5 bg-white shadow-lg mb-4" />
            )}
            <h1 className="text-2xl font-bold" style={{ color: menuTextColor }}>{t(language, 'nameChangeTitle')}</h1>
            <p className="mt-2 text-sm" style={{ color: menuMutedColor }}>{t(language, 'nameChangeDescription')}</p>
          </div>
          <input
            value={customerNameInput}
            onChange={(e) => setCustomerNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCustomerNameOnboarding() }}
            placeholder={t(language, 'namePlaceholder')}
            autoFocus
            className="w-full rounded-2xl border border-black/8 bg-white px-5 py-4 text-base outline-none shadow-[0_8px_20px_rgba(0,0,0,0.05)] mb-4"
            style={{ color: menuTextColor }}
          />
          <div className="flex gap-3">
            <button
              onClick={handleContinueWithoutNameOnboarding}
              className="flex-1 rounded-2xl px-4 py-4 text-sm font-semibold border"
              style={{ background: '#fff', color: menuTextColor, borderColor: menuBorderColor }}
            >
              {t(language, 'continueWithoutName')}
            </button>
            <button
              onClick={handleSaveCustomerNameOnboarding}
              className="flex-1 rounded-2xl px-4 py-4 text-sm font-bold"
              style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
            >
              {customerNameInput.trim() ? t(language, 'saveName') : t(language, 'continueBtn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes menu-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes menu-sheet-in { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }
        @keyframes menu-modal-pop { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>

      <div className="min-h-screen overflow-x-hidden pb-44 text-[#1a1a1a]" style={{ ...menuThemeVars, background: 'var(--page-bg)' }} dir={isRtl ? 'rtl' : 'ltr'}>
        <header className="sticky top-0 z-20 border-b border-black/5 backdrop-blur-xl" style={{ background: `${menuSurfaceMuted}f2` }}>
          <div className="max-w-2xl mx-auto px-4 pt-5 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {menuLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={menuLogoUrl} alt={menuDisplayName} className="h-11 w-11 rounded-2xl object-cover border border-black/5 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)]" />
                )}
                <p className="truncate text-[1.2rem] font-semibold leading-none" style={{ color: menuTextColor }}>{menuDisplayName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setLanguageModal(true)}
                  className="flex h-10 items-center justify-center gap-1 rounded-full bg-white px-3 shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
                  style={{ color: menuTextColor }}
                  aria-label="Change language"
                >
                  <Globe size={16} />
                  <span className="text-xs font-semibold">{currentLanguageLabel}</span>
                </button>
                {sessionOrders.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => { setActionMessage(null); setOrdersModal(true) }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
                      style={{ color: menuTextColor }}
                      aria-label={t(language, 'myOrders')}
                    >
                      <ClipboardList size={20} />
                    </button>
                    {activeOrderCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}>
                        {activeOrderCount}
                      </span>
                    )}
                  </div>
                )}
                <div className="relative">
                  <button
                    onClick={openCartDrawer}
                    disabled={!canUseSessionActions}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)] disabled:opacity-50"
                    style={{ color: menuTextColor }}
                    aria-label={t(language, 'cart')}
                  >
                    <ShoppingBag size={20} />
                  </button>
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}>
                      {cartCount}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm" style={{ color: menuMutedColor }}>{t(language, 'table')} {displayTableLabel} • {t(language, 'welcome')}</p>
                  <p className="mt-1 truncate text-[14px] font-semibold" style={{ color: menuTextColor }}>
                    {customerName ? customerName.toUpperCase() : t(language, 'discoverFavorites')}
                  </p>
                </div>
                {customerName && (
                  <button
                    onClick={() => { setCustomerNameInput(customerName); setCustomerNameModal(true) }}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ background: menuSurfaceMuted, color: menuTextColor }}
                  >
                    {t(language, 'changeName')}
                  </button>
                )}
              </div>
              {loyaltyCustomer && (
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold" style={{ borderColor: menuBorderColor, background: menuSurfaceMuted, color: menuTextColor }}>
                  <BadgeCheck size={14} style={{ color: menuPrimaryColor }} />
                  <span className="truncate">{t(language, 'loyaltyAccountActive')}</span>
                </div>
              )}
              {availableRewards.length > 0 && (
                <div className="mt-3 rounded-[18px] px-4 py-3 border" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.22)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(34,197,94,0.15)' }}>
                      <Gift size={18} style={{ color: '#16a34a' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: '#166534' }}>{t(language, 'youHaveRewards')}</p>
                      <p className="text-sm font-bold mt-0.5" style={{ color: '#15803d' }}>
                        {availableRewards.map((r) => `${r.rewardQuantity} ${r.rewardProductName}`).join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {generalSettings.wifiEnabled && generalSettings.wifiName && (
              <div className="mt-3 rounded-[18px] bg-white px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.05)] border" style={{ borderColor: menuBorderColor }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: menuSurfaceMuted }}>
                    <Wifi size={18} style={{ color: menuPrimaryColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: menuMutedColor }}>{t(language, 'wifiInfo')}</p>
                    <p className="text-sm font-semibold truncate" style={{ color: menuTextColor }}>{generalSettings.wifiName}</p>
                  </div>
                  {generalSettings.wifiPassword && (
                    <button
                      onClick={copyWifiPassword}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{ background: menuSurfaceMuted, color: menuTextColor }}
                    >
                      {wifiCopied ? <Check size={14} /> : <Copy size={14} />}
                      {wifiCopied ? t(language, 'copied') : t(language, 'copyPassword')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {categories.length > 0 && (
              <div className="mt-4 -mx-4 px-4 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]">
                <div className="flex gap-2 w-max pb-1">
                  {categories.map((category) => {
                    const active = activeCat === category.id
                    const count = categoryCounts[category.id] ?? 0
                    return (
                      <button
                        key={category.id}
                        onClick={() => setActiveCat(category.id)}
                        className="shrink-0 rounded-full px-4 py-2.5 flex items-center gap-2 border transition-all whitespace-nowrap"
                        style={active ? { background: menuPrimaryColor, color: menuPrimaryTextColor, borderColor: menuPrimaryColor } : { background: '#fff', color: menuMutedColor, borderColor: menuBorderColor }}
                      >
                        <span className="text-sm font-semibold">{category.name}</span>
                        <span className="min-w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center px-1.5" style={active ? { background: 'rgba(255,255,255,0.22)', color: '#fff' } : { background: menuSurfaceMuted, color: menuTextColor }}>
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

        <main className="max-w-2xl mx-auto overflow-x-hidden px-4 pt-5">
          {/* Kampanyalar */}
          {activeCampaigns.length > 0 && (
            <section className="mb-6">
              <div className="mb-3 flex items-center gap-2 px-1">
                <Gift size={15} style={{ color: menuPrimaryColor }} />
                <h2 className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: menuTextColor }}>
                  {t(language, 'loyaltyCampaignsTitle')}
                </h2>
              </div>
              <div className="space-y-3">
                {activeCampaigns.map((campaign) => {
                  const progressEntry = loyaltyProgressList.find((entry) => entry.campaignId === campaign.id) ?? null
                  const campaignRewards = availableRewards.filter((reward) => reward.campaignId === campaign.id)
                  const rewardCount = campaignRewards.reduce((sum, reward) => sum + reward.rewardQuantity, 0)
                  const currentQuantity = progressEntry?.currentQuantity ?? 0
                  const requiredQuantity = campaign.requiredQuantity
                  const remainingQuantity = Math.max(0, requiredQuantity - currentQuantity)
                  const progressRatio = requiredQuantity > 0 ? Math.min(1, currentQuantity / requiredQuantity) : 0

                  return (
                    <div
                      key={campaign.id}
                      className="rounded-[24px] border bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                      style={{ borderColor: menuBorderColor }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: withAlpha(menuPrimaryColor, 0.1) }}>
                          <Gift size={18} style={{ color: menuPrimaryColor }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold leading-snug" style={{ color: menuTextColor }}>{campaign.name}</p>
                          <p className="mt-1 text-[13px] leading-5" style={{ color: menuMutedColor }}>
                            {buildLoyaltyCampaignRule(campaign, language)}
                          </p>
                        </div>
                      </div>

                      {loyaltyCustomer ? (
                        <>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: menuMutedColor }}>
                              {t(language, 'loyaltyYourProgress')}
                            </span>
                            <span className="text-sm font-bold" style={{ color: menuTextColor }}>
                              {currentQuantity}/{requiredQuantity}
                            </span>
                          </div>
                          {requiredQuantity <= 8 ? (
                            <div className="mt-2 flex gap-1.5">
                              {Array.from({ length: requiredQuantity }).map((_, index) => (
                                <span
                                  key={index}
                                  className="h-2.5 flex-1 rounded-full transition-colors"
                                  style={{ background: index < currentQuantity ? menuPrimaryColor : withAlpha(menuPrimaryColor, 0.14) }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: withAlpha(menuPrimaryColor, 0.14) }}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${progressRatio * 100}%`, background: menuPrimaryColor }}
                              />
                            </div>
                          )}
                          {rewardCount > 0 ? (
                            <div className="mt-3 rounded-[16px] border px-3 py-2.5" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.22)' }}>
                              <p className="text-sm font-bold" style={{ color: '#15803d' }}>
                                🎁 {t(language, 'loyaltyRewardReadyShort', { count: rewardCount, product: campaign.rewardProductName })}
                              </p>
                            </div>
                          ) : remainingQuantity > 0 ? (
                            <p className="mt-2 text-xs" style={{ color: menuMutedColor }}>
                              {t(language, 'loyaltyRemainingToReward', { count: remainingQuantity })}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <button
                          onClick={openLoyaltyRegister}
                          className="mt-3 w-full rounded-[16px] px-4 py-3 text-sm font-bold"
                          style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                        >
                          {t(language, 'loyaltyJoinCta')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {visibleProducts.length === 0 ? (
            <div className="rounded-[28px] bg-white px-6 py-16 text-center shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              <UtensilsCrossed className="mx-auto mb-3 h-9 w-9 text-[var(--primary)]" />
              {products.some((product) => product.available) ? (
                <p className="text-sm" style={{ color: menuMutedColor }}>{t(language, 'noProductsInCategory')}</p>
              ) : (
                <>
                  <p className="text-sm" style={{ color: menuMutedColor }}>{t(language, 'noProductsYet')}</p>
                  <p className="mt-2 text-xs" style={{ color: menuMutedColor }}>{t(language, 'addFirstProduct')}</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleProducts.map((product, index) => {
                const categoryName = categoryNames[product.categoryId] ?? ''
                const meta = getProductMeta(product, categoryName)
                return (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProduct(product)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openProduct(product) } }}
                    className="flex items-center gap-4 rounded-2xl bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.995] transition-transform cursor-pointer focus:outline-none"
                    style={{ border: `1px solid ${menuBorderColor}` }}
                  >
                    <MenuProductImage
                      key={`${product.id}:${meta.imageUrl || 'placeholder'}`}
                      alt={product.name}
                      imageUrl={meta.imageUrl}
                      fallbackEmoji={meta.fallbackEmoji}
                      heightClass="h-20 w-20"
                      roundedClass="rounded-xl"
                      priority={index === 0}
                      lang={language}
                    />

                    <div className="flex-1 min-w-0 py-1">
                      <p className="text-[15px] font-bold leading-snug truncate" style={{ color: menuTextColor }}>{product.name}</p>
                      <p className="mt-1 text-[13px] leading-5" style={{ color: menuMutedColor, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {product.description || t(language, 'descriptionFallback')}
                      </p>
                      <p className="mt-2 text-[16px] font-bold" style={{ color: menuPrimaryColor }}>{renderPrice(product.price)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); handleQuickAdd(product) }}
                      disabled={!canUseSessionActions}
                      className="shrink-0 h-10 w-10 rounded-full font-bold text-xl flex items-center justify-center shadow-lg disabled:opacity-50"
                      style={{ background: menuPrimaryColor, color: menuPrimaryTextColor, boxShadow: `0 4px 14px ${withAlpha(menuPrimaryColor, 0.35)}` }}
                      aria-label={t(language, 'quickAdd')}
                    >
                      +
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {isDemoRestaurant && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => setDemoTourOpen(true)}
                className="rounded-full border bg-white px-4 py-2 text-xs font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.06)]"
                style={{ borderColor: menuBorderColor, color: menuMutedColor }}
              >
                {t(language, 'demoTourShowAgain')}
              </button>
            </div>
          )}

          <MenuDeveloperFooter language={language} mutedColor={menuMutedColor} borderColor={menuBorderColor} />
        </main>

        <div className="fixed bottom-0 inset-x-0 z-20 px-4 pb-5 pt-3" style={{ background: `linear-gradient(to top, ${menuSurfaceMuted} 70%, transparent)` }}>
          <div className="max-w-2xl mx-auto">
            {visibleWaiterAssistNotice && waiterAssistMessage && (
              <div className="mb-3 flex justify-end">
                <WaiterAssistToast
                  notice={visibleWaiterAssistNotice}
                  title={t(language, 'waiterAssistTitle')}
                  message={waiterAssistMessage}
                  primaryColor={menuPrimaryColor}
                  textColor={menuTextColor}
                  mutedColor={menuMutedColor}
                  borderColor={menuBorderColor}
                  surfaceColor={menuSurfaceMuted}
                  onClose={() => setWaiterAssistNotice(null)}
                />
              </div>
            )}
            {infoMessage && (
              <div className="mb-3 rounded-[20px] bg-white px-4 py-3 shadow-[0_10px_26px_rgba(0,0,0,0.08)] border border-black/5">
                <p className="text-[13px] leading-5" style={{ color: menuTextColor }}>{infoMessage}</p>
              </div>
            )}
            {cartCount > 0 ? (
              <div className="flex gap-3">
                <button
                  onClick={openCartDrawer}
                  disabled={primaryActionDisabled}
                  className="flex-1 rounded-2xl px-5 py-4 font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-between"
                  style={{ background: menuPrimaryColor, color: menuPrimaryTextColor, boxShadow: `0 12px 28px ${withAlpha(menuPrimaryColor, 0.32)}` }}
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag size={18} />
                    <span>{t(language, 'placeOrder')} ({cartCount})</span>
                  </span>
                  <span className="font-bold">{renderPrice(cartTotal, { inline: true })}</span>
                </button>
                <button
                  type="button"
                  onClick={openCallModal}
                  disabled={callButtonDisabled}
                  className="shrink-0 rounded-2xl border bg-white px-4 py-4 text-sm font-semibold disabled:opacity-50 flex items-center justify-center"
                  style={{ borderColor: menuBorderColor, color: menuTextColor }}
                  aria-label={t(language, 'callWaiter')}
                >
                  <UtensilsCrossed size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={openCallModal}
                disabled={primaryActionDisabled}
                className="w-full rounded-2xl px-5 py-4 font-bold text-sm transition-all disabled:opacity-50"
                style={{ background: menuPrimaryColor, color: menuPrimaryTextColor, boxShadow: `0 12px 28px ${withAlpha(menuPrimaryColor, 0.32)}` }}
              >
                {accessState === 'checking' ? t(language, 'checkingTable') : t(language, 'callWaiter')}
              </button>
            )}
          </div>
        </div>

        {/* Product Detail Sheet */}
        {selectedProduct && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] flex items-end">
            <div className="relative w-full bg-[#fafafa] rounded-t-[32px] overflow-hidden max-h-[92vh]" style={{ animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="h-1.5 w-14 rounded-full bg-black/10 mx-auto mt-3 mb-3" />
              <div className="relative">
                <MenuProductImage
                  key={`${selectedProduct.id}:${getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '').imageUrl || 'placeholder'}`}
                  alt={selectedProduct.name}
                  imageUrl={getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '').imageUrl}
                  fallbackEmoji={getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '').fallbackEmoji}
                  heightClass="h-[250px] w-full"
                  roundedClass="rounded-none"
                  priority
                  lang={language}
                />
                <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-[0_10px_24px_rgba(0,0,0,0.15)] backdrop-blur-sm" style={{ color: menuTextColor }} aria-label={t(language, 'close')}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-5 pt-5 pb-36 overflow-y-auto max-h-[calc(92vh-250px)]">
                {(() => {
                  const meta = getProductMeta(selectedProduct, categoryNames[selectedProduct.categoryId] ?? '')
                  return (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-[24px] font-bold leading-tight" style={{ color: menuTextColor }}>{selectedProduct.name}</h2>
                          <div className="flex items-center gap-2 mt-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-[0_8px_20px_rgba(0,0,0,0.05)]" style={{ color: menuTextColor }}>
                              <span style={{ color: menuPrimaryColor }}>★</span>
                              {meta.rating}
                            </span>
                            {meta.popular && <span className="inline-flex items-center rounded-full bg-[#fff5cf] px-3 py-1 text-xs font-semibold text-[#9a6d00]">{t(language, 'popular')}</span>}
                          </div>
                        </div>
                        <p className="text-[28px] font-bold" style={{ color: menuPrimaryColor }}>{renderPrice(selectedProduct.price, { large: true })}</p>
                      </div>
                      <div className="h-px bg-black/6 my-6" />
                      <section>
                        <h3 className="text-[18px] font-bold" style={{ color: menuTextColor }}>{t(language, 'description')}</h3>
                        <p className="mt-3 text-[14px] leading-7" style={{ color: menuMutedColor }}>{selectedProduct.description || t(language, 'descriptionFallback')}</p>
                      </section>
                      <section className="mt-6 grid grid-cols-2 gap-3">
                        <InfoTile label={t(language, 'prepTime')} value={`${meta.prepTime} ${t(language, 'min')}`} />
                        <InfoTile label={t(language, 'calories')} value={`${meta.calories} ${t(language, 'kcal')}`} />
                      </section>
                    </>
                  )
                })()}
              </div>
              <div className="absolute inset-x-0 bottom-0 border-t border-black/6 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl" style={{ background: `${menuSurfaceMuted}f2` }}>
                <div className="max-w-2xl mx-auto flex items-center gap-3">
                  <div className="flex items-center rounded-full bg-white px-2 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.08)] border border-black/5">
                    <button onClick={() => adjustDetailQuantity('dec')} className="flex h-9 w-9 items-center justify-center rounded-full text-xl" style={{ background: menuSurfaceMuted, color: menuTextColor }}>−</button>
                    <span className="w-12 text-center text-base font-bold text-[#1a1a1a]">{detailQuantity}</span>
                    <button onClick={() => adjustDetailQuantity('inc')} className="h-9 w-9 rounded-full text-xl flex items-center justify-center" style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}>+</button>
                  </div>
                  <button
                    onClick={handleAddFromSheet}
                    disabled={!canUseSessionActions}
                    className="flex-1 rounded-[20px] px-5 py-4 font-bold text-sm disabled:opacity-50"
                    style={{ background: menuPrimaryColor, color: menuPrimaryTextColor, boxShadow: `0 16px 28px ${withAlpha(menuPrimaryColor, 0.28)}` }}
                  >
                    {t(language, 'addToCart')} — {renderPrice(selectedProduct.price * detailQuantity, { inline: true })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* My Orders Modal */}
        {ordersModal && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] flex items-end">
            <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-[32px] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" style={{ background: 'var(--page-bg)', animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-[24px] font-bold" style={{ color: menuTextColor }}>{t(language, 'myOrders')}</h2>
                  <p className="mt-1 text-sm" style={{ color: menuMutedColor }}>{t(language, 'myOrdersDescription')}</p>
                </div>
                <button onClick={() => setOrdersModal(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_8px_18px_rgba(0,0,0,0.08)]" style={{ color: menuTextColor }} aria-label={t(language, 'close')}>
                  <X className="h-5 w-5" />
                </button>
              </div>

              {sessionOrders.length === 0 ? (
                <div className="py-12 text-center">
                  <ClipboardList className="mx-auto mb-3 h-9 w-9" style={{ color: menuMutedColor }} />
                  <p className="text-sm" style={{ color: menuMutedColor }}>{t(language, 'noOrdersYet')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessionOrders.map((order) => {
                    const stage = getOrderFlowStage(order)
                    const stageColor = ORDER_STAGE_COLORS[stage]
                    return (
                      <div
                        key={order.id}
                        className="rounded-[22px] border bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.05)]"
                        style={{ borderColor: menuBorderColor }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className="rounded-full px-3 py-1 text-xs font-bold"
                            style={{ background: stageColor.bg, color: stageColor.text }}
                          >
                            {t(language, ORDER_STAGE_I18N_KEY[stage])}
                          </span>
                          <span className="text-xs" style={{ color: menuMutedColor }}>
                            {new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : language, { hour: '2-digit', minute: '2-digit' }).format(order.createdAt)}
                          </span>
                        </div>

                        {(order.items ?? []).length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {(order.items ?? []).map((item, index) => (
                              <div key={`${order.id}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                                <span style={{ color: menuTextColor }}>{item.quantity}x {item.name}</span>
                                <span className="font-semibold" style={{ color: menuTextColor }}>{renderPrice(item.price * item.quantity, { inline: true })}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {typeof order.totalPrice === 'number' && (
                          <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: menuBorderColor }}>
                            <span className="text-sm font-semibold" style={{ color: menuMutedColor }}>{t(language, 'tableTotal')}</span>
                            <span className="text-base font-bold" style={{ color: menuPrimaryColor }}>{renderPrice(order.totalPrice, { inline: true })}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loyalty Prompt Modal */}
        {loyaltyPromptOpen && activeLoyaltyCampaign && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[2px] sm:items-center sm:justify-center">
            <div
              className="w-full rounded-t-[32px] px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-[28px] sm:px-6 sm:pb-6"
              style={{ background: 'var(--page-bg)', animation: 'menu-modal-pop 240ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: menuSurfaceMuted }}>
                <Gift className="h-6 w-6" style={{ color: menuPrimaryColor }} />
              </div>
              <div className="text-center">
                <h2 className="text-[24px] font-bold" style={{ color: menuTextColor }}>
                  {t(language, 'loyaltyPromptTitle')}
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: menuMutedColor }}>
                  {t(language, 'loyaltyPromptDescription')}
                </p>
              </div>

              <div className="mt-5 rounded-[24px] border bg-white p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.06)]" style={{ borderColor: menuBorderColor }}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: menuPrimaryColor }}>
                  {t(language, 'loyaltyCampaignLabel')}
                </p>
                <p className="mt-2 text-base font-semibold" style={{ color: menuTextColor }}>
                  {activeLoyaltyCampaign.name}
                </p>
                {loyaltyCampaignRule && (
                  <p className="mt-2 text-sm leading-6" style={{ color: menuTextColor }}>
                    {loyaltyCampaignRule}
                  </p>
                )}
                {activeLoyaltyCampaign.description && (
                  <p className="mt-2 text-sm leading-6" style={{ color: menuMutedColor }}>
                    {activeLoyaltyCampaign.description}
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={openLoyaltyRegister}
                  className="flex-1 rounded-[20px] px-5 py-4 text-sm font-bold"
                  style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                >
                  {t(language, 'loyaltyPromptAction')}
                </button>
                <button
                  onClick={dismissLoyaltyPrompt}
                  className="flex-1 rounded-[20px] px-5 py-4 text-sm font-semibold"
                  style={{ background: '#fff', color: menuTextColor, border: `1px solid ${menuBorderColor}` }}
                >
                  {t(language, 'loyaltyPromptLater')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loyalty Register Modal */}
        {loyaltyRegisterOpen && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-[2px] sm:items-center sm:justify-center">
            <div
              className="w-full rounded-t-[32px] px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-[28px] sm:px-6 sm:pb-6"
              style={{ background: 'var(--page-bg)', animation: 'menu-modal-pop 240ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[24px] font-bold" style={{ color: menuTextColor }}>
                    {t(language, 'loyaltyRegisterTitle')}
                  </h2>
                  <p className="mt-2 text-sm leading-6" style={{ color: menuMutedColor }}>
                    {t(language, 'loyaltyRegisterDescription')}
                  </p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: menuSurfaceMuted }}>
                  <Gift className="h-5 w-5" style={{ color: menuPrimaryColor }} />
                </div>
              </div>

              {activeLoyaltyCampaign && loyaltyCampaignRule && (
                <div className="mt-5 rounded-[22px] border bg-white px-4 py-3" style={{ borderColor: menuBorderColor }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: menuPrimaryColor }}>
                    {t(language, 'loyaltyCampaignLabel')}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6" style={{ color: menuTextColor }}>
                    {loyaltyCampaignRule}
                  </p>
                </div>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitLoyaltyRegistration()
                }}
                className="mt-5 space-y-4"
              >
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: menuTextColor }}>
                    <UserRound size={15} />
                    {t(language, 'loyaltyNameLabel')}
                  </span>
                  <input
                    value={loyaltyRegisterForm.name}
                    onChange={(event) => setLoyaltyRegisterForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={t(language, 'loyaltyNameLabel')}
                    className="w-full rounded-[20px] border border-black/8 bg-white px-4 py-4 text-base outline-none shadow-[0_8px_20px_rgba(0,0,0,0.05)]"
                    style={{ color: menuTextColor }}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: menuTextColor }}>
                    <Phone size={15} />
                    {t(language, 'loyaltyPhoneLabel')}
                  </span>
                  <input
                    value={loyaltyRegisterForm.phone}
                    onChange={(event) => setLoyaltyRegisterForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder={t(language, 'loyaltyPhoneLabel')}
                    inputMode="tel"
                    className="w-full rounded-[20px] border border-black/8 bg-white px-4 py-4 text-base outline-none shadow-[0_8px_20px_rgba(0,0,0,0.05)]"
                    style={{ color: menuTextColor }}
                  />
                </label>

                {loyaltyRegisterMessage && (
                  <p className="rounded-[18px] border px-4 py-3 text-sm leading-6" style={{ borderColor: 'rgba(239,68,68,0.18)', background: 'rgba(239,68,68,0.06)', color: '#b91c1c' }}>
                    {loyaltyRegisterMessage}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={loyaltyRegistering}
                    className="flex-1 rounded-[20px] px-5 py-4 text-sm font-bold disabled:opacity-50"
                    style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                  >
                    {loyaltyRegistering ? (
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle size={16} className="animate-spin" />
                        {t(language, 'sending')}
                      </span>
                    ) : (
                      t(language, 'loyaltyRegisterSubmit')
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={dismissLoyaltyPrompt}
                    className="flex-1 rounded-[20px] px-5 py-4 text-sm font-semibold"
                    style={{ background: '#fff', color: menuTextColor, border: `1px solid ${menuBorderColor}` }}
                  >
                    {t(language, 'loyaltyPromptLater')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Customer Name Modal */}
        {customerNameModal && (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center sm:justify-center">
            <div className="w-full rounded-t-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px] sm:pb-6" style={{ background: 'var(--page-bg)', animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-[24px] font-bold" style={{ color: menuTextColor }}>{t(language, 'nameChangeTitle')}</h2>
                  <p className="mt-1 text-sm" style={{ color: menuMutedColor }}>{t(language, 'nameChangeDescription')}</p>
                </div>
                {canDismissCustomerModal && (
                  <button onClick={() => setCustomerNameModal(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_8px_18px_rgba(0,0,0,0.08)]" style={{ color: menuTextColor }}>
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              <input value={customerNameInput} onChange={(event) => setCustomerNameInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleSaveCustomerName() } }} placeholder={t(language, 'namePlaceholder')} autoFocus className="w-full rounded-[22px] border border-black/8 bg-white px-4 py-4 text-base outline-none shadow-[0_8px_20px_rgba(0,0,0,0.05)]" style={{ color: menuTextColor }} />
              <div className="mt-5 flex gap-3">
                {canDismissCustomerModal && <button onClick={() => setCustomerNameModal(false)} className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-semibold" style={{ background: '#fff', color: menuTextColor, border: `1px solid ${menuBorderColor}` }}>{t(language, 'cancel')}</button>}
                <button onClick={handleContinueWithoutName} className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-semibold" style={{ background: '#fff', color: menuTextColor, border: `1px solid ${menuBorderColor}` }}>{t(language, 'continueWithoutName')}</button>
                <button onClick={handleSaveCustomerName} disabled={!customerNameInput.trim()} className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-bold disabled:opacity-50" style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}>{t(language, 'saveName')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Call Modal */}
        {callModal && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] flex items-end">
            <div className="w-full rounded-t-[32px] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" style={{ background: 'var(--page-bg)', animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              {sent ? (
                <div className="py-10 text-center">
                  <CircleCheckBig className="mx-auto mb-4 h-12 w-12 text-[var(--primary)]" />
                  <p className="text-[24px] font-bold" style={{ color: menuTextColor }}>{t(language, 'callSent')}</p>
                  <p className="mt-2 text-sm" style={{ color: menuMutedColor }}>{t(language, 'waiterComing')}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-[24px] font-bold" style={{ color: menuTextColor }}>{t(language, 'callWaiterTitle')}</h2>
                      <p className="mt-1 text-sm" style={{ color: menuMutedColor }}>{t(language, 'callWaiterDescription')}</p>
                    </div>
                    <button onClick={closeCallModal} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_8px_18px_rgba(0,0,0,0.08)]" style={{ color: menuTextColor }}>
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {TIP_OPTIONS.map((tip) => {
                      const tipUi = getCallTipUi(tip)
                      const TipIcon = tipUi.Icon
                      const tipDisabled = (tip === 'yardım' && hasActiveHelpRequest) || (tip === 'hesap' && hasActivePaymentRequest)
                      const tipLabel = tip === 'sipariş' ? t(language, 'order') : tip === 'hesap' ? t(language, 'bill') : t(language, 'help')
                      const tipDesc = tip === 'sipariş' ? t(language, 'orderDescription') : tip === 'hesap' ? t(language, 'billDescription') : t(language, 'helpDescription')
                      return (
                        <button
                          key={tip}
                          onClick={() => { if (!tipDisabled) { setSelectedTip(tip); setActionMessage(null) } }}
                          disabled={tipDisabled}
                          className="w-full rounded-[22px] px-4 py-4 flex items-center gap-4 border shadow-[0_8px_20px_rgba(0,0,0,0.05)] transition-all disabled:opacity-60"
                          style={selectedTip === tip && !tipDisabled ? { background: menuPrimaryColor, borderColor: menuPrimaryColor, color: menuPrimaryTextColor } : { background: '#fff', borderColor: menuBorderColor, color: menuTextColor }}
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl shrink-0" style={{ background: selectedTip === tip && !tipDisabled ? 'rgba(255,255,255,0.14)' : tipUi.surface, color: selectedTip === tip && !tipDisabled ? menuPrimaryTextColor : tipUi.accent }}>
                            <TipIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold">{tipLabel}</p>
                              {tipDisabled && <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#a16207]">{t(language, 'active')}</span>}
                            </div>
                            <p className="mt-1 text-[12px] leading-4" style={{ color: selectedTip === tip && !tipDisabled ? 'rgba(255,255,255,0.72)' : menuMutedColor }}>
                              {tipDisabled ? (tip === 'yardım' ? t(language, 'activeHelpRequest') : t(language, 'activePaymentRequest')) : tipDesc}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t(language, 'addOptionalNote')} className="mt-4 w-full resize-none rounded-[22px] border border-black/6 bg-white px-4 py-4 text-sm outline-none shadow-[0_8px_20px_rgba(0,0,0,0.04)]" style={{ color: menuTextColor }} rows={3} />
                  {(selectedTipLockMessage || actionMessage) && <p className="text-sm mt-3 text-[#c2410c]">{selectedTipLockMessage ?? actionMessage}</p>}
                  <button onClick={sendCall} disabled={modalSendDisabled} className="w-full mt-4 rounded-[22px] px-5 py-4 font-bold text-sm disabled:opacity-50" style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}>
                    {sending ? t(language, 'sending') : t(language, 'sendRequest')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Cart Drawer */}
        {cartDrawer && (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] flex items-end">
            <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-[32px] px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]" style={{ background: 'var(--page-bg)', animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              {orderSent ? (
                <div className="py-10 text-center">
                  <CircleCheckBig className="mx-auto mb-4 h-12 w-12 text-[var(--primary)]" />
                  <p className="text-[24px] font-bold" style={{ color: menuTextColor }}>{t(language, 'orderSent')}</p>
                  <p className="mt-2 text-sm" style={{ color: menuMutedColor }}>{t(language, 'orderPreparing')}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-[24px] font-bold" style={{ color: menuTextColor }}>{t(language, 'myCart')}</h2>
                      <p className="mt-1 text-sm" style={{ color: menuMutedColor }}>{t(language, 'orderItems', { count: cartCount })} • {renderPrice(cartTotal, { inline: true })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {customerName && (
                        <button onClick={() => { setCustomerNameInput(customerName); setCustomerNameModal(true) }} className="rounded-full bg-white px-3 py-2 text-xs font-medium shadow-[0_8px_18px_rgba(0,0,0,0.08)]" style={{ color: menuTextColor }}>
                          {t(language, 'changeName')}
                        </button>
                      )}
                      <button onClick={() => setCartDrawer(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_8px_18px_rgba(0,0,0,0.08)]" style={{ color: menuTextColor }}>
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {activeSharedCart.length === 0 ? (
                    <div className="py-12 text-center">
                      <ShoppingCart size={48} className="mx-auto mb-3 text-[var(--primary)]" />
                      <p className="text-sm" style={{ color: menuMutedColor }}>{t(language, 'cartEmpty')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {Object.entries(cartGrouped).map(([groupName, group]) => (
                            <div key={groupName} className="rounded-[20px] bg-white p-4 shadow-[0_8px_20px_rgba(0,0,0,0.05)] border border-black/5">
                              <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                  <p className="font-semibold text-base" style={{ color: menuTextColor }}>{groupName}</p>
                                  <p className="mt-1 text-xs" style={{ color: menuMutedColor }}>{t(language, 'customerItems', { count: group.items.length })}</p>
                                </div>
                                <p className="font-bold shrink-0" style={{ color: menuPrimaryColor }}>{renderPrice(group.total)}</p>
                              </div>
                              <div className="space-y-3">
                                {group.items.map((item) => {
                                  const canEdit = item.customerId === customerId
                                  return (
                                    <div key={item.id} className="rounded-2xl px-3 py-3" style={{ background: menuSurfaceMuted }}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <p className="font-semibold text-sm" style={{ color: menuTextColor }}>{item.productName}</p>
                                          <p className="mt-1 text-xs" style={{ color: menuMutedColor }}>{t(language, 'unitPrice')}: {renderPrice(item.price, { inline: true })}</p>
                                        </div>
                                        <p className="font-bold shrink-0" style={{ color: menuPrimaryColor }}>{renderPrice(item.price * item.quantity)}</p>
                                      </div>
                                      <div className="flex items-center justify-between mt-3">
                                        {canEdit ? (
                                          <>
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => handleUpdateCartItemQuantity(item, -1)}
                                                disabled={!canUseSessionActions}
                                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg disabled:opacity-50"
                                                style={{ color: menuTextColor }}
                                              >
                                                −
                                              </button>
                                              <span className="w-8 text-center text-sm font-bold text-[#1a1a1a]">{item.quantity}</span>
                                              <button
                                                onClick={() => handleUpdateCartItemQuantity(item, 1)}
                                                disabled={!canUseSessionActions}
                                                className="h-8 w-8 rounded-full text-lg flex items-center justify-center disabled:opacity-50"
                                                style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                                              >
                                                +
                                              </button>
                                            </div>
                                            <button
                                              onClick={() => handleRemoveCartItem(item)}
                                              disabled={!canUseSessionActions}
                                              className="text-xs font-medium text-[#ef4444] disabled:opacity-50"
                                            >
                                              {t(language, 'remove')}
                                            </button>
                                          </>
                                        ) : (
                                          <span className="text-xs" style={{ color: menuMutedColor }}>x{item.quantity}</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                      </div>

                      {pendingRewardsComputed.length > 0 && (
                        <div className="mt-4 rounded-[18px] px-4 py-3 border" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.22)' }}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(34,197,94,0.15)' }}>
                              <Gift size={20} style={{ color: '#16a34a' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold" style={{ color: '#166534' }}>{t(language, 'rewardPending')}</p>
                              <p className="text-sm font-bold mt-0.5" style={{ color: '#15803d' }}>
                                {pendingRewardsComputed.map((r) => `${r.rewardQuantity} ${r.rewardProductName}`).join(', ')}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {actionMessage && <p className="text-sm mt-4 text-[#c2410c]">{actionMessage}</p>}

                      <div className="mt-5 pt-4 border-t border-black/6">
                        <div className="space-y-2 mb-4">
                          {Object.entries(cartGrouped).map(([groupName, group]) => (
                            <div key={`${groupName}-summary`} className="flex items-center justify-between text-sm">
                              <span className="font-medium" style={{ color: menuTextColor }}>{groupName}</span>
                              <span className="font-semibold" style={{ color: menuTextColor }}>{renderPrice(group.total, { inline: true })}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between pt-2 border-t border-black/6">
                            <span className="text-sm font-semibold" style={{ color: menuTextColor }}>{t(language, 'tableTotal')}</span>
                            <span className="text-xl font-bold" style={{ color: menuPrimaryColor }}>{renderPrice(cartTotal, { large: true })}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setOrderConfirmModal(true)}
                          disabled={!canUseSessionActions || orderSending || activeSharedCart.length === 0}
                          className="w-full rounded-[22px] px-5 py-4 font-bold text-sm disabled:opacity-50 shadow-[0_16px_28px_rgba(212,160,23,0.28)]"
                          style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}
                        >
                          {orderSending ? t(language, 'sending') : t(language, 'sendOrder')}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Rating Modal */}
        {ratingModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45">
            <div className="w-full max-w-lg rounded-t-3xl p-6" style={{ background: 'var(--page-bg)', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))', animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              {ratingSubmitted ? (
                <div className="py-8 text-center">
                  <CircleCheckBig className="mx-auto mb-4 h-12 w-12 text-[var(--primary)]" />
                  <p className="text-xl font-bold" style={{ color: menuTextColor }}>{t(language, 'thanksForRating')}</p>
                  <p style={{ color: menuMutedColor, fontSize: '0.875rem', marginTop: '8px' }}>{t(language, 'ratingReceived')}</p>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <h2 style={{ color: menuTextColor, fontSize: '1.3rem', fontWeight: 700 }}>{t(language, 'ratingTitle')}</h2>
                      <p style={{ color: menuMutedColor, fontSize: '0.875rem', marginTop: '8px', lineHeight: 1.5 }}>{t(language, 'ratingDescription')}</p>
                    </div>
                    <button onClick={closeRatingModal} style={{ color: menuMutedColor }}><X className="h-5 w-5" /></button>
                  </div>
                  <div className="space-y-4">
                    <StarRatingField label={t(language, 'serviceRating')} value={ratingForm.serviceRating} activeColor={menuPrimaryColor} notSelectedText={t(language, 'notSelected')} onChange={(value) => setRatingForm((current) => ({ ...current, serviceRating: value }))} />
                    <StarRatingField label={t(language, 'waiterRating')} value={ratingForm.waiterRating} activeColor={menuPrimaryColor} notSelectedText={t(language, 'notSelected')} onChange={(value) => setRatingForm((current) => ({ ...current, waiterRating: value }))} />
                    <div>
                      <p className="mb-2 text-sm font-semibold" style={{ color: menuTextColor }}>{t(language, 'yourComment')}</p>
                      <textarea value={ratingForm.comment} onChange={(event) => setRatingForm((current) => ({ ...current, comment: event.target.value }))} placeholder={t(language, 'optionalComment')} className="w-full rounded-2xl resize-none text-sm" rows={4} style={{ background: '#fff', border: `1px solid ${menuBorderColor}`, padding: '14px', color: menuTextColor, outline: 'none' }} />
                    </div>
                  </div>
                  {ratingMessage && <p className="text-sm mt-4" style={{ color: '#c2410c' }}>{ratingMessage}</p>}
                  <div className="flex gap-3 mt-5">
                    <button onClick={closeRatingModal} className="flex-1 py-3.5 rounded-2xl font-semibold text-sm" style={{ background: '#fff', color: menuTextColor, border: `1px solid ${menuBorderColor}` }}>{t(language, 'later')}</button>
                    <button onClick={submitRating} disabled={ratingSubmitDisabled} className="flex-1 py-3.5 rounded-2xl font-bold text-sm disabled:opacity-50" style={{ background: menuPrimaryColor, color: menuPrimaryTextColor }}>{ratingSending ? t(language, 'sending') : t(language, 'send')}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Order Confirmation Modal */}
        {orderConfirmModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[3px] flex items-center justify-center p-4"
            onClick={() => setOrderConfirmModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-[28px] p-6 shadow-2xl"
              style={{
                background: 'var(--page-bg)',
                animation: 'menu-modal-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-5">
                <div
                  className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                  style={{ background: withAlpha(menuPrimaryColor, 0.12) }}
                >
                  🍳🚀
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: menuTextColor }}>
                  {t(language, 'orderConfirmTitle')}
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: menuMutedColor }}>
                  {t(language, 'orderConfirmText')}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setOrderConfirmModal(false)}
                  className="flex-1 rounded-2xl px-4 py-3.5 text-sm font-semibold border transition-all active:scale-[0.98]"
                  style={{ borderColor: menuBorderColor, color: menuTextColor, background: '#fff' }}
                >
                  {t(language, 'orderConfirmCancel')}
                </button>
                <button
                  onClick={() => { setOrderConfirmModal(false); sendOrder() }}
                  disabled={!canUseSessionActions || orderSending}
                  className="flex-1 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{
                    background: menuPrimaryColor,
                    color: menuPrimaryTextColor,
                    boxShadow: `0 8px 20px ${withAlpha(menuPrimaryColor, 0.35)}`,
                  }}
                >
                  {t(language, 'orderConfirmSend')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Language Modal */}
        {languageModal && (
          <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center sm:justify-center">
            <div className="w-full rounded-t-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-[28px] sm:pb-6" style={{ background: 'var(--page-bg)', animation: 'menu-sheet-in 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold" style={{ color: menuTextColor }}>{t(language, 'selectLanguage')}</h2>
                <button onClick={() => setLanguageModal(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]" style={{ color: menuTextColor }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className="w-full rounded-2xl px-4 py-3.5 text-left border transition-all"
                    style={language === lang.code
                      ? { background: menuPrimaryColor, borderColor: menuPrimaryColor, color: menuPrimaryTextColor }
                      : { background: '#fff', borderColor: menuBorderColor, color: menuTextColor }}
                    dir={lang.dir}
                  >
                    <p className="font-semibold">{lang.nativeName}</p>
                    <p className="text-sm mt-0.5" style={{ opacity: 0.7 }}>{lang.name}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Demo Feature Tour (demo restaurant only) */}
        {isDemoRestaurant && demoTourOpen && (
          <DemoMenuTour
            language={language}
            primaryColor={menuPrimaryColor}
            primaryTextColor={menuPrimaryTextColor}
            textColor={menuTextColor}
            mutedColor={menuMutedColor}
            borderColor={menuBorderColor}
            surfaceMutedColor={menuSurfaceMuted}
            onClose={closeDemoTour}
          />
        )}
      </div>
    </>
  )
}

function WaiterAssistToast({
  notice,
  title,
  message,
  primaryColor,
  textColor,
  mutedColor,
  borderColor,
  surfaceColor,
  onClose,
}: {
  notice: WaiterAssistNotice
  title: string
  message: string
  primaryColor: string
  textColor: string
  mutedColor: string
  borderColor: string
  surfaceColor: string
  onClose: () => void
}) {
  const hasRating = typeof notice.waiterAverageRating === 'number' && Number.isFinite(notice.waiterAverageRating)

  return (
    <div
      className="w-full max-w-sm rounded-[24px] border bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.14)]"
      style={{ borderColor, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(10px)' }}
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          name={notice.waiterName}
          photoUrl={notice.waiterPhotoUrl ?? null}
          className="h-[52px] w-[52px] shrink-0 border-2"
          style={{ borderColor: surfaceColor, background: surfaceColor }}
          fallbackStyle={{ color: textColor }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: primaryColor }}>
                {title}
              </p>
              <p className="mt-1 truncate text-sm font-bold" style={{ color: textColor }}>
                {notice.waiterName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
              style={{ borderColor, color: mutedColor }}
              aria-label={t(DEFAULT_LANGUAGE, 'close')}
            >
              <X size={16} />
            </button>
          </div>
          {hasRating && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: withAlpha(primaryColor, 0.12), color: primaryColor }}>
              <span>★</span>
              <span>{notice.waiterAverageRating?.toFixed(1)}</span>
            </div>
          )}
          <p className="mt-2 text-sm leading-6" style={{ color: mutedColor }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}

function MenuProductImage({ imageUrl, alt, fallbackEmoji, heightClass, roundedClass = 'rounded-[12px]', priority, lang = DEFAULT_LANGUAGE }: { imageUrl: string; alt: string; fallbackEmoji: string; heightClass: string; roundedClass?: string; priority?: boolean; lang?: MenuLanguage }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const hasImage = imageUrl.length > 0

  return (
    <div className={`relative overflow-hidden bg-[#f2ede2] ${heightClass} ${roundedClass} shrink-0`}>
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
          onError={() => { setFailed(true); setLoaded(true) }}
        />
      )}
      {!loaded && !failed && (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: 'linear-gradient(110deg, rgba(255,255,255,0) 20%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 80%), linear-gradient(0deg, #ece7dc, #f6f2ea)', backgroundSize: '200% 100%', animation: 'menu-shimmer 1.6s linear infinite' }}
        />
      )}
      {(!hasImage || failed) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center" style={{ background: 'linear-gradient(160deg, #f7f2e8 0%, #ece3d3 100%)' }}>
          <span className="text-4xl">{fallbackEmoji}</span>
          <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8b7355]">{t(lang, 'imageLoading')}</span>
        </div>
      )}
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
      <p className="text-xs uppercase tracking-[0.18em] text-[#888888]">{label}</p>
      <p className="mt-2 text-lg font-bold text-[var(--text)]">{value}</p>
    </div>
  )
}

function StarRatingField({ label, value, activeColor = DEFAULT_MENU_PRIMARY_COLOR, notSelectedText = 'Not selected', onChange }: { label: string; value: number; activeColor?: string; notSelectedText?: string; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{label}</p>
        <span className="text-xs font-semibold" style={{ color: '#9ca3af' }}>{value > 0 ? `${value}/5` : notSelectedText}</span>
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" onClick={() => onChange(star)} className="text-3xl transition-transform active:scale-90" style={{ color: star <= value ? activeColor : '#d1d5db' }}>★</button>
        ))}
      </div>
    </div>
  )
}
