'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import {
  deleteDoc, getDocs, runTransaction, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { useOpenCalls } from '@/components/dashboard/OpenCallsProvider'
import { logFirestoreRead, logFirestoreWrite } from '@/lib/firestore-debug'
import { normalizeTable } from '@/lib/firestore-models'
import { getRestaurantTablesQuery } from '@/lib/firestore-queries'
import { db, rd, RESTAURANT_ID } from '@/lib/firebase'
import type { Table, TableStatus, WaiterCall } from '@/lib/types'

const BROWN = '#3d2b1f'
const GOLD  = '#d4a017'

const STATUS_META: Record<TableStatus, {
  label: string; badgeBg: string; badgeText: string; border: string; cardBg: string; pulse?: boolean
}> = {
  boş:             { label: 'Boş',          badgeBg: '#f3f4f6', badgeText: '#6b7280', border: '#e5e7eb', cardBg: '#ffffff' },
  aktif:           { label: 'Aktif',         badgeBg: '#dcfce7', badgeText: '#15803d', border: '#86efac', cardBg: '#f0fdf4' },
  'çağrı var':     { label: 'Çağrı Var',    badgeBg: '#fef3c7', badgeText: '#a16207', border: '#fcd34d', cardBg: '#fffbeb', pulse: true },
  'hesap istendi': { label: 'Hesap İstendi', badgeBg: '#ffedd5', badgeText: '#c2410c', border: '#fdba74', cardBg: '#fff7ed' },
  temizlik:        { label: 'Temizlik',      badgeBg: '#dbeafe', badgeText: '#1d4ed8', border: '#93c5fd', cardBg: '#eff6ff' },
  kapalı:          { label: 'Kapalı',        badgeBg: '#fee2e2', badgeText: '#b91c1c', border: '#fca5a5', cardBg: '#fff5f5' },
}

function formatOpenMinutes(openedAt: number): string {
  return `${Math.max(0, Math.floor((Date.now() - openedAt) / 60000))} dk açık`
}

function createSessionId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Math.random().toString(16).slice(2)}-${Date.now()}`
}

type TableCallStatus = { id: string; tableId: string; tip: WaiterCall['tip']; durum: WaiterCall['durum'] }

function getCallDrivenStatus(calls: TableCallStatus[]): Extract<TableStatus, 'çağrı var' | 'hesap istendi'> | null {
  // Sadece bekliyor durumundaki çağrılar masa durumunu etkiler
  // Kabul edilmiş çağrılar işleniyor demek, masa aktif kalmalı
  const pending = calls.filter((c) => c.durum === 'bekliyor')
  if (pending.length === 0) return null
  if (pending.some((c) => c.tip === 'hesap')) return 'hesap istendi'
  return 'çağrı var'
}

export default function TablesPage() {
  const { openCalls } = useOpenCalls()
  const router = useRouter()
  const [count,         setCount]        = useState(10)
  const [tables,        setTables]       = useState<Table[]>([])
  const [qrMap,         setQrMap]        = useState<Record<string, string>>({})
  const [creating,      setCreating]     = useState(false)
  const [busyKey,       setBusyKey]      = useState<string | null>(null)
  const [message,       setMessage]      = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [qrModalTable,  setQrModalTable] = useState<Table | null>(null)
  const [pdfLoading,    setPdfLoading]   = useState(false)
  const [, setTicker] = useState(0)
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  // Delete mode state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteModal, setDeleteModal] = useState<{ type: 'single' | 'selected' | 'all'; tableId?: string; hasActive: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadTables() {
    logFirestoreRead('dashboard/tables', RESTAURANT_ID)
    const snap = await getDocs(getRestaurantTablesQuery(RESTAURANT_ID))
    setTables(snap.docs.map((d) => normalizeTable(d.id, d.data() as Record<string, unknown>)).sort((a, b) => a.number - b.number))
  }

  useEffect(() => {
    void loadTables()
  }, [])

  const callsByTable = openCalls.reduce<Record<string, TableCallStatus[]>>((acc, call) => {
    if (!call.tableId) return acc
    const key = String(call.tableId)
    acc[key] = [...(acc[key] ?? []), { id: call.id, tableId: key, tip: call.tip, durum: call.durum }]
    return acc
  }, {})

  useEffect(() => {
    if (!tables.some((table) => table.status === 'aktif' && table.openedAt)) return

    const t = window.setInterval(() => setTicker((n) => n + 1), 60_000)
    return () => window.clearInterval(t)
  }, [tables])

  // Build QR map whenever tables or origin changes
  useEffect(() => {
    if (!origin || tables.length === 0) return
    let cancelled = false
    Promise.all(
      tables.map(async (t) => {
        const url = `${origin}/menu/${RESTAURANT_ID}/${t.number}`
        const dataUrl = await QRCode.toDataURL(url, { width: 260, margin: 2, color: { dark: BROWN, light: '#ffffff' } })
        return [t.id, dataUrl] as const
      })
    ).then((entries) => {
      if (!cancelled) setQrMap(Object.fromEntries(entries))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [origin, tables])

  function getTableLink(tableNumber: number) {
    return `${origin || ''}/menu/${RESTAURANT_ID}/${tableNumber}`
  }

  function getEffectiveStatus(table: Table): TableStatus {
    if (table.status === 'temizlik' || table.status === 'kapalı' || table.status === 'boş') return table.status
    const calls = callsByTable[String(table.id)] ?? callsByTable[String(table.number)] ?? []
    return getCallDrivenStatus(calls) ?? table.status
  }

  // ─── Table action handlers ────────────────────────────────────────────────

  async function handleOpenTable(tableId: string) {
    setBusyKey(`open-${tableId}`)
    setMessage(null)
    const newSessionId = createSessionId()
    try {
      logFirestoreWrite('dashboard/open table', { tableId, sessionId: newSessionId })
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(rd('tables', tableId))
        if (!snap.exists()) throw new Error('Masa bulunamadı.')
        const t = normalizeTable(snap.id, snap.data() as Record<string, unknown>)
        if (t.status !== 'boş') throw new Error(`Masa "${STATUS_META[t.status]?.label ?? t.status}" durumunda, açılamaz.`)
        tx.update(rd('tables', tableId), {
          status: 'aktif' satisfies TableStatus,
          sessionId: newSessionId,
          openedAt: serverTimestamp(),
          lastPaymentCompletedAt: null,
          lastPaymentWaiterName: null,
          updatedAt: serverTimestamp(),
        })
      })
      void loadTables()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Masa açılamadı.' })
    } finally {
      setBusyKey(null)
    }
  }

  async function handleCloseTable(tableId: string) {
    setBusyKey(`close-${tableId}`)
    setMessage(null)
    try {
      logFirestoreWrite('dashboard/close table', tableId)
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(rd('tables', tableId))
        if (!snap.exists()) throw new Error('Masa bulunamadı.')
        tx.update(rd('tables', tableId), {
          status: 'temizlik' satisfies TableStatus,
          sessionId: null,
          openedAt: null,
          lastPaymentCompletedAt: null,
          lastPaymentWaiterName: null,
          updatedAt: serverTimestamp(),
        })
      })
      void loadTables()
    } catch (err) {
      console.error('Masa kapat hatası:', err)
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Masa kapatılamadı.' })
    } finally {
      setBusyKey(null)
    }
  }

  async function handleMarkCleaned(tableId: string) {
    setBusyKey(`clean-${tableId}`)
    setMessage(null)
    try {
      logFirestoreWrite('dashboard/mark cleaned', tableId)
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(rd('tables', tableId))
        if (!snap.exists()) throw new Error('Masa bulunamadı.')
        tx.update(rd('tables', tableId), {
          status: 'boş' satisfies TableStatus,
          sessionId: null,
          openedAt: null,
          lastPaymentCompletedAt: null,
          lastPaymentWaiterName: null,
          updatedAt: serverTimestamp(),
        })
      })
      void loadTables()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Güncelleme başarısız.' })
    } finally {
      setBusyKey(null)
    }
  }

  async function handleCreateTables() {
    const safeCount = Math.max(1, Math.min(100, Math.floor(count || 0)))
    setCreating(true)
    setMessage(null)
    try {
      logFirestoreWrite('dashboard/create tables', safeCount)
      const existingNumbers = new Set(tables.map((t) => t.number))
      const batch = writeBatch(db)
      let created = 0
      for (let n = 1; n <= safeCount; n++) {
        if (existingNumbers.has(n)) continue
        batch.set(rd('tables', String(n)), {
          id: String(n), number: n,
          status: 'boş' satisfies TableStatus,
          sessionId: null, openedAt: null,
          lastPaymentCompletedAt: null,
          lastPaymentWaiterName: null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
        created++
      }
      if (created > 0) {
        await batch.commit()
        setMessage({ tone: 'success', text: `${created} yeni masa oluşturuldu.` })
        void loadTables()
      } else {
        setMessage({ tone: 'info', text: 'İstenen aralıktaki tüm masalar zaten mevcut.' })
      }
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Masalar oluşturulamadı.' })
    } finally {
      setCreating(false)
    }
  }

  // ─── PDF download ─────────────────────────────────────────────────────────
  async function handleDownloadPDF() {
    if (tables.length === 0) return
    setPdfLoading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      for (let i = 0; i < tables.length; i++) {
        if (i > 0) pdf.addPage()
        const table = tables[i]
        const link = getTableLink(table.number)
        const qrDataUrl = await QRCode.toDataURL(link, {
          width: 600, margin: 2, color: { dark: BROWN, light: '#ffffff' },
        })
        const qrSize  = 120
        const xOffset = (210 - qrSize) / 2
        pdf.addImage(qrDataUrl, 'PNG', xOffset, 65, qrSize, qrSize)
        pdf.setFontSize(20)
        pdf.setTextColor(61, 43, 31)
        pdf.text(`Masa ${table.number}`, 105, 200, { align: 'center' })
        pdf.setFontSize(13)
        pdf.setTextColor(120, 90, 60)
        pdf.text('Varina Chocolate', 105, 212, { align: 'center' })
      }

      pdf.save('varina-qr-kodlar.pdf')
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'PDF oluşturulamadı.' })
    } finally {
      setPdfLoading(false)
    }
  }

  // ─── QR PNG download for single table ────────────────────────────────────
  function handleDownloadSingleQR(table: Table) {
    const dataUrl = qrMap[table.id]
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `masa-${table.number}-qr.png`
    a.click()
  }

  // ─── Delete functions ─────────────────────────────────────────────────────
  function isActiveTable(table: Table): boolean {
    const status = getEffectiveStatus(table)
    return status === 'aktif' || status === 'çağrı var' || status === 'hesap istendi'
  }

  function toggleSelect(tableId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tableId)) next.delete(tableId)
      else next.add(tableId)
      return next
    })
  }

  function openDeleteModal(type: 'single' | 'selected' | 'all', tableId?: string) {
    let hasActive = false
    if (type === 'single' && tableId) {
      const table = tables.find((t) => t.id === tableId)
      hasActive = table ? isActiveTable(table) : false
    } else if (type === 'selected') {
      hasActive = tables.filter((t) => selectedIds.has(t.id)).some(isActiveTable)
    } else if (type === 'all') {
      hasActive = tables.some(isActiveTable)
    }
    setDeleteModal({ type, tableId, hasActive })
  }

  async function confirmDelete() {
    if (!deleteModal) return
    setDeleting(true)
    setMessage(null)

    try {
      const batch = writeBatch(db)
      let deleteCount = 0

      if (deleteModal.type === 'single' && deleteModal.tableId) {
        batch.delete(rd('tables', deleteModal.tableId))
        deleteCount = 1
      } else if (deleteModal.type === 'selected') {
        for (const id of selectedIds) {
          batch.delete(rd('tables', id))
          deleteCount++
        }
      } else if (deleteModal.type === 'all') {
        for (const table of tables) {
          batch.delete(rd('tables', table.id))
          deleteCount++
        }
      }

      if (deleteCount > 0) {
        logFirestoreWrite('dashboard/delete tables', deleteCount)
        await batch.commit()
        setMessage({ tone: 'success', text: `${deleteCount} masa silindi.` })
        setSelectedIds(new Set())
        setSelectMode(false)
        void loadTables()
      }
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Silme başarısız.' })
    } finally {
      setDeleting(false)
      setDeleteModal(null)
    }
  }

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]'

  function formatCompletedPayment(ts: number) {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ts)
  }

  return (
    <>
      <div className="p-6 md:p-8">
        <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Masa Yönetimi / QR</h1>
            <p className="text-gray-400 text-sm mt-0.5">{tables.length} masa kayıtlı{selectMode && selectedIds.size > 0 ? ` • ${selectedIds.size} seçili` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tables.length > 0 && (
              <>
                <button
                  onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
                  className="font-semibold px-4 py-2.5 rounded-lg text-sm"
                  style={{ background: selectMode ? GOLD : '#f3f4f6', color: selectMode ? BROWN : '#374151' }}
                >
                  {selectMode ? 'Seçimi İptal' : 'Seç'}
                </button>
                {selectMode && selectedIds.size > 0 && (
                  <button
                    onClick={() => openDeleteModal('selected')}
                    className="font-semibold px-4 py-2.5 rounded-lg text-sm text-white"
                    style={{ background: '#ef4444' }}
                  >
                    Seçilenleri Sil ({selectedIds.size})
                  </button>
                )}
                <button
                  onClick={() => openDeleteModal('all')}
                  className="font-semibold px-4 py-2.5 rounded-lg text-sm"
                  style={{ background: '#fee2e2', color: '#b91c1c' }}
                >
                  Tümünü Sil
                </button>
              </>
            )}
            <button
              onClick={handleDownloadPDF}
              disabled={tables.length === 0 || pdfLoading}
              className="font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
              style={{ background: BROWN, color: '#fff' }}
            >
              {pdfLoading ? 'Hazırlanıyor...' : '⬇ PDF İndir'}
            </button>
          </div>
        </div>

        {/* Create tables form */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="w-full max-w-xs">
              <label className="block text-sm font-medium mb-1" style={{ color: BROWN }}>Masa sayısı</label>
              <input
                type="number" min={1} max={100} value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className={inputCls}
              />
            </div>
            <button
              onClick={handleCreateTables}
              disabled={creating}
              className="font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
              style={{ background: GOLD, color: BROWN }}
            >
              {creating ? 'Oluşturuluyor...' : 'Masaları Oluştur'}
            </button>
          </div>
          {message && (
            <p className="text-sm mt-4" style={{ color: message.tone === 'success' ? '#16a34a' : message.tone === 'error' ? '#dc2626' : '#6b7280' }}>
              {message.text}
            </p>
          )}
        </div>

        {/* Table grid */}
        {tables.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-16 text-center text-gray-400 text-sm">
            Önce masa sayısını girip masaları oluşturun.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-5">
            {tables.map((table) => {
              const effectiveStatus = getEffectiveStatus(table)
              const meta = STATUS_META[effectiveStatus]
              const openDuration = effectiveStatus === 'aktif' && table.openedAt ? formatOpenMinutes(table.openedAt) : null
              const busy = busyKey !== null

              return (
                <div
                  key={table.id}
                  className={`rounded-2xl border-2 p-5 transition-all ${selectMode && selectedIds.has(table.id) ? 'ring-2 ring-offset-2 ring-[#d4a017]' : ''}`}
                  style={{ borderColor: meta.border, background: meta.cardBg }}
                  onClick={selectMode ? () => toggleSelect(table.id) : undefined}
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(table.id)}
                          onChange={() => toggleSelect(table.id)}
                          className="w-5 h-5 rounded accent-[#d4a017]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <div>
                        <h2 className="font-bold text-xl" style={{ color: BROWN }}>Masa {table.number}</h2>
                        {openDuration && <p className="text-sm mt-0.5" style={{ color: '#4b5563' }}>{openDuration}</p>}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full ${meta.pulse ? 'animate-pulse' : ''}`}
                      style={{ background: meta.badgeBg, color: meta.badgeText }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  {table.lastPaymentCompletedAt && (
                    <div
                      className="mb-4 rounded-xl px-3 py-2 text-sm"
                      style={{ background: '#ecfdf5', color: '#166534', border: '1px solid #86efac' }}
                    >
                      Hesap tamamlandı • {formatCompletedPayment(table.lastPaymentCompletedAt)}
                      {table.lastPaymentWaiterName ? ` • ${table.lastPaymentWaiterName}` : ''}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {effectiveStatus === 'boş' && (
                      <ActionBtn
                        label={busyKey === `open-${table.id}` ? 'Açılıyor...' : 'Aç'}
                        color="#22c55e"
                        busy={busy}
                        onClick={() => handleOpenTable(table.id)}
                      />
                    )}
                    {effectiveStatus === 'aktif' && (
                      <ActionBtn
                        label={busyKey === `close-${table.id}` ? 'Kapatılıyor...' : 'Masayı Kapat'}
                        color="#f59e0b"
                        busy={busy}
                        onClick={() => handleCloseTable(table.id)}
                      />
                    )}
                    {effectiveStatus === 'çağrı var' && (
                      <ActionBtn
                        label="Çağrıyı Gör →"
                        color="#a16207"
                        busy={false}
                        onClick={() => router.push('/dashboard/calls')}
                      />
                    )}
                    {effectiveStatus === 'hesap istendi' && (
                      <ActionBtn
                        label="Çağrıyı Gör →"
                        color="#c2410c"
                        busy={false}
                        onClick={() => router.push('/dashboard/calls')}
                      />
                    )}
                    {effectiveStatus === 'temizlik' && (
                      <ActionBtn
                        label={busyKey === `clean-${table.id}` ? 'Kaydediliyor...' : 'Temizlendi'}
                        color="#3b82f6"
                        busy={busy}
                        onClick={() => handleMarkCleaned(table.id)}
                      />
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); setQrModalTable(table) }}
                      className="font-semibold px-3 py-2 rounded-lg text-xs"
                      style={{ background: '#f3f4f6', color: '#374151' }}
                    >
                      QR Göster
                    </button>
                    {!selectMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openDeleteModal('single', table.id) }}
                        className="font-semibold px-3 py-2 rounded-lg text-xs"
                        style={{ background: '#fee2e2', color: '#b91c1c' }}
                      >
                        Sil
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── QR Modal ── */}
      {qrModalTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setQrModalTable(null) }}
        >
          <div className="bg-white rounded-3xl p-8 w-full max-w-xs text-center shadow-2xl">
            <h2 className="font-bold text-xl mb-1" style={{ color: BROWN }}>Masa {qrModalTable.number}</h2>
            <p className="text-xs text-gray-400 mb-5">Varina Chocolate</p>

            <div className="flex items-center justify-center mb-5">
              {qrMap[qrModalTable.id] ? (
                <Image
                  src={qrMap[qrModalTable.id]}
                  alt={`Masa ${qrModalTable.number} QR`}
                  width={200}
                  height={200}
                  unoptimized
                  className="rounded-xl"
                />
              ) : (
                <div className="w-48 h-48 rounded-xl bg-gray-100 flex items-center justify-center">
                  <p className="text-xs text-gray-400 animate-pulse">QR hazırlanıyor...</p>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 break-all mb-5">{getTableLink(qrModalTable.number)}</p>

            <div className="flex gap-3">
              <button
                onClick={() => setQrModalTable(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#f3f4f6', color: '#374151' }}
              >
                Kapat
              </button>
              <button
                onClick={() => handleDownloadSingleQR(qrModalTable)}
                disabled={!qrMap[qrModalTable.id]}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: BROWN, color: '#fff' }}
              >
                ⬇ İndir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteModal(null) }}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-4xl mb-4 text-center">⚠️</div>
            <h2 className="font-bold text-lg text-center mb-2" style={{ color: BROWN }}>
              {deleteModal.type === 'single' ? 'Masayı Sil' : deleteModal.type === 'selected' ? 'Seçili Masaları Sil' : 'Tüm Masaları Sil'}
            </h2>
            <p className="text-sm text-gray-500 text-center mb-4">
              {deleteModal.type === 'single'
                ? 'Bu masa kalıcı olarak silinecek.'
                : deleteModal.type === 'selected'
                  ? `${selectedIds.size} masa kalıcı olarak silinecek.`
                  : `${tables.length} masa kalıcı olarak silinecek.`}
            </p>
            {deleteModal.hasActive && (
              <div className="rounded-xl px-4 py-3 mb-4 text-sm" style={{ background: '#fef3c7', color: '#a16207' }}>
                ⚠️ Aktif veya çağrı bekleyen masa(lar) var. Yine de silmek istiyor musunuz?
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: '#f3f4f6', color: '#374151' }}
              >
                İptal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#ef4444' }}
              >
                {deleting ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ActionBtn({
  label, color, busy, onClick,
}: {
  label: string; color: string; busy: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="font-semibold px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50"
      style={{ background: color }}
    >
      {label}
    </button>
  )
}
