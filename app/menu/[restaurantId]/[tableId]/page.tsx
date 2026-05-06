'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { useAuth } from '@/components/AuthProvider'
import { db } from '@/lib/firebase'
import { normalizeRating, normalizeTable, normalizeWaiterCall } from '@/lib/firestore-models'
import type { Category, Product, Rating, Table, WaiterCall } from '@/lib/types'

type CallTip = 'sipariş' | 'hesap' | 'yardım'
type AccessState = 'checking' | 'ready' | 'locked' | 'cleaning' | 'missing' | 'error'
type TableLookupResult = { tableDocId: string; table: Table }
type RatingForm = { serviceRating: number; waiterRating: number; comment: string }

const TIP_OPTIONS: { tip: CallTip; icon: string; label: string; desc: string }[] = [
  { tip: 'sipariş', icon: '📋', label: 'Sipariş', desc: 'Sipariş vermek istiyorum' },
  { tip: 'hesap', icon: '💳', label: 'Hesap', desc: 'Hesabı getirin lütfen' },
  { tip: 'yardım', icon: '🙋', label: 'Yardım', desc: 'Yardıma ihtiyacım var' },
]

const SESSION_COOLDOWN_MS = 30 * 1000
const ACTIVE_SESSION_MESSAGE = 'Bu masada aktif oturum var. Lütfen garsondan yardım isteyin.'
const CLEANING_MESSAGE = 'Bu masa şu anda hazırlanıyor. Lütfen garsondan yardım isteyin.'
const ACTIVE_REQUEST_MESSAGE = 'Zaten aktif talebiniz var. Garsonunuz geliyor, lütfen bekleyin.'
const SESSION_CLOSED_MESSAGE = 'Bu masa oturumu kapatıldı. Lütfen garsondan yardım isteyin.'
const STAFF_RATING_MESSAGE = 'Personel hesabı ile müşteri puanlaması gönderilemez.'
const EMPTY_RATING_FORM: RatingForm = { serviceRating: 0, waiterRating: 0, comment: '' }

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `session-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

function getSessionStorageKey(restaurantId: string, tableDocId: string) {
  return `nerox:table-session:${restaurantId}:${tableDocId}`
}

function getRatingPromptKey(restaurantId: string, callId: string) {
  return `nerox:rating-prompted:${restaurantId}:${callId}`
}

function getCooldownRemainingMs(createdAt: number | null): number {
  if (!createdAt) return 0
  const remaining = createdAt + SESSION_COOLDOWN_MS - Date.now()
  return remaining > 0 ? remaining : 0
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds} sn`
  if (seconds === 0) return `${minutes} dk`
  return `${minutes} dk ${seconds} sn`
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

  if (numberSnap.empty) return null

  const matchedDoc = numberSnap.docs[0]
  return {
    tableDocId: matchedDoc.id,
    table: normalizeTable(matchedDoc.id, matchedDoc.data() as Record<string, unknown>),
  }
}

export default function MenuPage() {
  const params = useParams<{ restaurantId: string; tableId: string }>()
  const { restaurantId, tableId } = params
  const { user, profile, loading: authLoading } = useAuth()

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const [tableDocId, setTableDocId] = useState<string | null>(null)
  const [table, setTable] = useState<Table | null>(null)
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [accessMessage, setAccessMessage] = useState<string | null>(null)
  const [sessionCalls, setSessionCalls] = useState<WaiterCall[]>([])
  const [sessionRatings, setSessionRatings] = useState<Rating[]>([])
  const [ratingsLoaded, setRatingsLoaded] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

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
  const [, setTick] = useState(0)

  useEffect(() => {
    async function loadMenu() {
      const [catSnap, prodSnap] = await Promise.all([
        getDocs(query(collection(db, 'restaurants', restaurantId, 'categories'), orderBy('order', 'asc'))),
        getDocs(collection(db, 'restaurants', restaurantId, 'products')),
      ])
      const cats = catSnap.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Category))
      const prods = prodSnap.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as Product))
      setCategories(cats)
      setProducts(prods)
      setActiveCat(cats[0]?.id ?? null)
      setLoading(false)
    }

    loadMenu()
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
      setSessionRatings([])
      setRatingsLoaded(false)
      setRatingModal(false)
      setRatingTargetCallId(null)
      setRatingMessage(null)
      setRatingSubmitted(false)
      setRatingForm(EMPTY_RATING_FORM)

      try {
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

        const storageKey = getSessionStorageKey(restaurantId, resolved.tableDocId)
        const localSessionId = window.localStorage.getItem(storageKey)
        const tableRef = doc(db, 'restaurants', restaurantId, 'tables', resolved.tableDocId)

        const result = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(tableRef)

          if (!snap.exists()) {
            return {
              state: 'missing' as const,
              message: 'Bu masa bulunamadı. Lütfen garsondan yardım isteyin.',
              table: null,
              sessionId: null,
            }
          }

          const currentTable = normalizeTable(snap.id, snap.data() as Record<string, unknown>)

          if (currentTable.status === 'kapalı') {
            return {
              state: 'locked' as const,
              message: 'Bu masa şu anda hizmet vermiyor.',
              table: currentTable,
              sessionId: null,
            }
          }

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
          window.localStorage.setItem(storageKey, result.sessionId)
          setSessionId(result.sessionId)
          setAccessState('ready')
          setAccessMessage(null)
          return
        }

        window.localStorage.removeItem(storageKey)
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

  useEffect(() => {
    if (!tableDocId) return

    const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableDocId)
    return onSnapshot(tableRef, (snap) => {
      if (!snap.exists()) {
        setTable(null)
        setAccessState('missing')
        setAccessMessage('Bu masa bulunamadı. Lütfen garsondan yardım isteyin.')
        return
      }

      setTable(normalizeTable(snap.id, snap.data() as Record<string, unknown>))
    })
  }, [restaurantId, tableDocId])

  useEffect(() => {
    if (!sessionId || !tableDocId) return

    const callsQuery = query(
      collection(db, 'restaurants', restaurantId, 'calls'),
      where('sessionId', '==', sessionId)
    )

    return onSnapshot(callsQuery, (snap) => {
      const nextCalls = snap.docs
        .map((snapshot) => normalizeWaiterCall(snapshot.id, snapshot.data() as Record<string, unknown>))
        .filter((call) => call.tableId === tableDocId)
        .sort((a, b) => b.createdAt - a.createdAt)

      setSessionCalls(nextCalls)
    })
  }, [restaurantId, sessionId, tableDocId])

  useEffect(() => {
    if (!sessionId || !tableDocId) return

    const ratingsQuery = query(
      collection(db, 'restaurants', restaurantId, 'ratings'),
      where('sessionId', '==', sessionId)
    )

    return onSnapshot(ratingsQuery, (snap) => {
      const nextRatings = snap.docs
        .map((snapshot) => normalizeRating(snapshot.id, snapshot.data() as Record<string, unknown>))
        .filter((rating) => rating.tableId === tableDocId)
        .sort((a, b) => b.createdAt - a.createdAt)

      setSessionRatings(nextRatings)
      setRatingsLoaded(true)
    })
  }, [restaurantId, sessionId, tableDocId])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => current + 1)
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!table || !tableDocId || !sessionId) return
    if (table.sessionId !== sessionId) return

    const hasOpenRequest = sessionCalls.some((call) => call.durum === 'bekliyor' || call.durum === 'kabul edildi')
    const shouldRestoreActive = !hasOpenRequest && (table.status === 'çağrı var' || table.status === 'hesap istendi')

    if (!shouldRestoreActive) return

    updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableDocId), {
      status: 'aktif',
      updatedAt: serverTimestamp(),
    }).catch(() => {})
  }, [restaurantId, sessionCalls, sessionId, table, tableDocId])

  const completedPaymentCall =
    sessionCalls.find((call) => call.tip === 'hesap' && call.durum === 'tamamlandı' && call.sessionId === sessionId) ?? null

  const activeRatingCall =
    (ratingTargetCallId
      ? sessionCalls.find((call) => call.id === ratingTargetCallId) ?? null
      : null) ?? completedPaymentCall

  const hasExistingRatingForActiveCall =
    !!activeRatingCall && sessionRatings.some((rating) => rating.callId === activeRatingCall.id)

  useEffect(() => {
    if (!sessionId || !completedPaymentCall || !ratingsLoaded || ratingModal || hasExistingRatingForActiveCall) return

    const promptKey = getRatingPromptKey(restaurantId, completedPaymentCall.id)
    if (window.localStorage.getItem(promptKey)) return

    window.localStorage.setItem(promptKey, '1')
    const timeoutId = window.setTimeout(() => {
      setRatingTargetCallId(completedPaymentCall.id)
      setRatingMessage(null)
      setRatingSubmitted(false)
      setRatingForm(EMPTY_RATING_FORM)
      setRatingModal(true)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [completedPaymentCall, hasExistingRatingForActiveCall, ratingModal, ratingsLoaded, restaurantId, sessionId])

  function openCallModal() {
    if (callButtonDisabled) return
    setActionMessage(null)
    setSent(false)
    setCallModal(true)
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

  async function sendCall() {
    if (!selectedTip || !sessionId || !tableDocId) return

    setSending(true)
    setActionMessage(null)

    try {
      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableDocId)
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

      if (liveTable.sessionId !== sessionId) {
        setActionMessage(ACTIVE_SESSION_MESSAGE)
        return
      }

      const sessionQuery = query(
        collection(db, 'restaurants', restaurantId, 'calls'),
        where('sessionId', '==', sessionId)
      )
      const sessionSnap = await getDocs(sessionQuery)
      const liveSessionCalls = sessionSnap.docs
        .map((snapshot) => normalizeWaiterCall(snapshot.id, snapshot.data() as Record<string, unknown>))
        .filter((call) => call.tableId === tableDocId)
        .sort((a, b) => b.createdAt - a.createdAt)

      const openRequest = liveSessionCalls.find((call) => call.durum === 'bekliyor' || call.durum === 'kabul edildi')
      if (openRequest) {
        setActionMessage(ACTIVE_REQUEST_MESSAGE)
        return
      }

      const lastCallAt = liveSessionCalls[0]?.createdAt ?? null
      const remainingCooldownMs = getCooldownRemainingMs(lastCallAt)
      if (remainingCooldownMs > 0) {
        setActionMessage(`Yeni talep için ${formatRemaining(remainingCooldownMs)} bekleyin.`)
        return
      }

      const callsCollection = collection(db, 'restaurants', restaurantId, 'calls')
      const newCallRef = doc(callsCollection)
      const batch = writeBatch(db)

      batch.set(newCallRef, {
        tableId: tableDocId,
        tableNumber: liveTable.number,
        sessionId,
        restaurantId,
        tip: selectedTip,
        durum: 'bekliyor',
        createdAt: serverTimestamp(),
        waiterId: null,
        waiterName: null,
        note: note.trim(),
      })

      batch.update(tableRef, {
        status: selectedTip === 'hesap' ? 'hesap istendi' : 'çağrı var',
        updatedAt: serverTimestamp(),
      })

      await batch.commit()
      window.localStorage.setItem(`nerox_lastcall_${tableId}`, String(Date.now()))
      console.log('CALL CREATED:', newCallRef.id, {
        tableId: tableDocId, tableNumber: liveTable.number,
        tip: selectedTip, durum: 'bekliyor', sessionId,
        path: `restaurants/${restaurantId}/calls/${newCallRef.id}`,
      })

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

      // Update waiter avgRating + totalRatings
      if (liveCall.waiterId) {
        try {
          const waiterRef   = doc(db, 'users', liveCall.waiterId)
          const waiterSnap  = await getDoc(waiterRef)
          if (waiterSnap.exists()) {
            const wd       = waiterSnap.data()
            const oldCount = (wd.totalRatings as number) ?? 0
            const oldAvg   = (wd.avgRating   as number) ?? 0
            const newCount = oldCount + 1
            const newAvg   = Math.round(((oldAvg * oldCount + ratingForm.waiterRating) / newCount) * 10) / 10
            await updateDoc(waiterRef, { avgRating: newAvg, totalRatings: increment(1) })
          }
        } catch (err) {
          console.error('Waiter rating update error:', err)
        }
      }

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

  const hasActiveRequest = sessionCalls.some((call) => call.durum === 'bekliyor' || call.durum === 'kabul edildi')
  const latestCallAt = sessionCalls[0]?.createdAt ?? null
  const cooldownRemainingMs = hasActiveRequest ? 0 : getCooldownRemainingMs(latestCallAt)
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
    (hasActiveRequest
      ? ACTIVE_REQUEST_MESSAGE
      : cooldownRemainingMs > 0
        ? `Yeni talep için ${formatRemaining(cooldownRemainingMs)} bekleyin.`
        : actionMessage)

  const callButtonDisabled =
    accessState === 'checking' ||
    accessState === 'missing' ||
    accessState === 'error' ||
    !!derivedAccessMessage ||
    hasActiveRequest ||
    cooldownRemainingMs > 0 ||
    sending

  const displayTableLabel = table?.number ? String(table.number) : tableId
  const modalSendDisabled =
    !selectedTip ||
    sending ||
    !!derivedAccessMessage ||
    hasActiveRequest ||
    cooldownRemainingMs > 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#fefaf3' }}>
        <div className="text-center" style={{ color: '#3d2b1f' }}>
          <div className="text-4xl mb-3 animate-pulse">☕</div>
          <p style={{ fontFamily: 'var(--font-playfair, serif)', fontSize: '1.1rem' }}>Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-36" style={{ background: '#fefaf3', fontFamily: 'sans-serif' }}>
      <header className="sticky top-0 z-10 shadow-sm" style={{ background: '#3d2b1f' }}>
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <div>
            <h1 style={{ fontFamily: 'var(--font-playfair, serif)', color: '#d4a017', fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>
              Varina Chocolate
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '2px' }}>
              Masa {displayTableLabel}
            </p>
          </div>
          <div style={{ background: 'rgba(212,160,23,0.15)', border: '1px solid rgba(212,160,23,0.3)', borderRadius: '999px', padding: '4px 12px' }}>
            <span style={{ color: '#d4a017', fontSize: '0.75rem', fontWeight: 600 }}>#{displayTableLabel}</span>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="overflow-x-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex px-4 py-2 gap-2 w-max">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={
                    activeCat === cat.id
                      ? { background: '#d4a017', color: '#3d2b1f' }
                      : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }
                  }
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="max-w-lg mx-auto px-5 pt-5">
        {visibleProducts.length === 0 ? (
          <div className="text-center py-16" style={{ color: '#9ca3af' }}>
            <p>Bu kategoride ürün bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-2xl overflow-hidden"
                style={{ background: '#fff', border: '1px solid rgba(61,43,31,0.08)', boxShadow: '0 1px 8px rgba(61,43,31,0.05)' }}
              >
                <div className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3
                      style={{ fontFamily: 'var(--font-playfair, serif)', color: '#3d2b1f', fontWeight: 600, fontSize: '1rem', lineHeight: 1.3 }}
                    >
                      {product.name}
                    </h3>
                    {product.description && (
                      <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: '4px', lineHeight: 1.5 }}>
                        {product.description}
                      </p>
                    )}
                  </div>
                  <div
                    className="shrink-0 font-bold"
                    style={{ color: '#d4a017', fontSize: '1.1rem', fontFamily: 'var(--font-playfair, serif)' }}
                  >
                    ₺{product.price}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-6 left-0 right-0 px-5 z-20">
        <div className="max-w-lg mx-auto">
          {infoMessage && (
            <div
              className="mb-3 rounded-2xl px-4 py-3 text-sm shadow-lg"
              style={{
                background: derivedAccessMessage ? '#fff7ed' : '#fff',
                color: '#3d2b1f',
                border: `1px solid ${derivedAccessMessage ? 'rgba(194,65,12,0.18)' : 'rgba(61,43,31,0.08)'}`,
              }}
            >
              {infoMessage}
            </div>
          )}

          <button
            onClick={openCallModal}
            disabled={callButtonDisabled}
            className="w-full font-bold px-8 py-4 rounded-2xl text-base shadow-xl transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            style={{ background: '#3d2b1f', color: '#d4a017', boxShadow: '0 4px 24px rgba(61,43,31,0.35)' }}
          >
            {accessState === 'checking'
              ? 'Masa kontrol ediliyor...'
              : hasActiveRequest
                ? 'Talebiniz Aktif'
                : cooldownRemainingMs > 0
                  ? `Garsonunuz geliyor... (${formatRemaining(cooldownRemainingMs)})`
                  : '🔔 Garson Çağır'}
          </button>
        </div>
      </div>

      {callModal && (
        <div className="fixed inset-0 z-30 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-t-3xl p-6"
            style={{ background: '#fff', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {sent ? (
              <div className="py-8 text-center">
                <div className="text-5xl mb-4">✅</div>
                <p className="font-bold text-xl" style={{ color: '#3d2b1f', fontFamily: 'var(--font-playfair, serif)' }}>
                  Çağrınız iletildi!
                </p>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '8px' }}>
                  Garsonunuz en kısa sürede gelecek.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 style={{ fontFamily: 'var(--font-playfair, serif)', color: '#3d2b1f', fontSize: '1.2rem', fontWeight: 700 }}>
                    Ne yapmamızı istersiniz?
                  </h2>
                  <button onClick={closeCallModal} style={{ color: '#9ca3af', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {TIP_OPTIONS.map((opt) => (
                    <button
                      key={opt.tip}
                      onClick={() => setSelectedTip(opt.tip)}
                      className="rounded-2xl p-4 text-center transition-all"
                      style={
                        selectedTip === opt.tip
                          ? { background: '#3d2b1f', border: '2px solid #3d2b1f' }
                          : { background: '#fefaf3', border: '2px solid rgba(61,43,31,0.1)' }
                      }
                    >
                      <div className="text-2xl mb-1">{opt.icon}</div>
                      <p className="text-xs font-semibold" style={{ color: selectedTip === opt.tip ? '#d4a017' : '#3d2b1f' }}>
                        {opt.label}
                      </p>
                    </button>
                  ))}
                </div>

                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Not ekle (isteğe bağlı)..."
                  className="w-full rounded-xl resize-none text-sm"
                  rows={2}
                  style={{ background: '#fefaf3', border: '1px solid rgba(61,43,31,0.15)', padding: '12px', color: '#3d2b1f', outline: 'none' }}
                />

                {actionMessage && (
                  <p className="text-sm mt-3" style={{ color: '#c2410c' }}>
                    {actionMessage}
                  </p>
                )}

                <button
                  onClick={sendCall}
                  disabled={modalSendDisabled}
                  className="w-full mt-4 py-4 rounded-2xl font-bold text-base disabled:opacity-40 transition-opacity"
                  style={{ background: '#d4a017', color: '#3d2b1f' }}
                >
                  {sending ? 'Gönderiliyor...' : 'Garson Çağır 🔔'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {ratingModal && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-t-3xl p-6"
            style={{ background: '#fefaf3', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {ratingSubmitted ? (
              <div className="py-8 text-center">
                <div className="text-5xl mb-4">⭐</div>
                <p className="font-bold text-xl" style={{ color: '#3d2b1f', fontFamily: 'var(--font-playfair, serif)' }}>
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
                    <h2 style={{ fontFamily: 'var(--font-playfair, serif)', color: '#3d2b1f', fontSize: '1.3rem', fontWeight: 700 }}>
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
                    onChange={(value) => setRatingForm((current) => ({ ...current, serviceRating: value }))}
                  />
                  <StarRatingField
                    label="Garson puanı"
                    value={ratingForm.waiterRating}
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
  )
}

function StarRatingField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
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
            style={{ color: star <= value ? '#d4a017' : '#d1d5db' }}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  )
}
