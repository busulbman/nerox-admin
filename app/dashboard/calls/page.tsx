'use client'

import { useState, useEffect } from 'react'
import { onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getCallTableLabel, normalizeWaiterCall } from '@/lib/firestore-models'
import { rc, rd } from '@/lib/firebase'
import type { WaiterCall } from '@/lib/types'

const TIP_CONFIG: Record<string, { label: string; icon: string; border: string; bg: string }> = {
  sipariş: { label: 'Sipariş', icon: '📋', border: '#fed7aa', bg: '#fff7ed' },
  hesap:   { label: 'Hesap',   icon: '💳', border: '#bbf7d0', bg: '#f0fdf4' },
  yardım:  { label: 'Yardım',  icon: '🙋', border: '#bfdbfe', bg: '#eff6ff' },
}

const DURUM_LABEL: Record<string, string> = {
  'bekliyor':     'Bekliyor',
  'kabul edildi': 'Kabul Edildi',
}

function elapsed(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s`
  return `${Math.floor(diff / 60)}dk ${diff % 60}s`
}

export default function CallsPage() {
  const [calls, setCalls] = useState<WaiterCall[]>([])
  const [, setTick] = useState(0)

  useEffect(() => {
    // Get all non-completed calls client-side filtered
    const unsub = onSnapshot(rc('calls'), (snap) => {
      const list = snap.docs
        .map((d) => normalizeWaiterCall(d.id, d.data() as Record<string, unknown>))
        .filter((c) => c.durum !== 'tamamlandı')
        .sort((a, b) => a.createdAt - b.createdAt)
      setCalls(list)
    })
    return unsub
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(interval)
  }, [])

  async function resolveCall(call: WaiterCall) {
    try {
      const updates: Promise<void>[] = [
        updateDoc(rd('calls', call.id), { durum: 'tamamlandı', resolvedAt: serverTimestamp() }),
      ]
      if (call.tableId) {
        updates.push(updateDoc(rd('tables', call.tableId), { status: 'aktif', updatedAt: serverTimestamp() }))
      }
      await Promise.all(updates)
    } catch (err) {
      console.error('Çağrı tamamlama hatası:', err)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="font-bold text-2xl" style={{ color: '#3d2b1f' }}>Garson Çağrıları</h1>
        {calls.length > 0 && (
          <span className="text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse" style={{ background: '#ef4444' }}>
            {calls.length}
          </span>
        )}
      </div>

      {calls.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-gray-400 text-sm">Bekleyen çağrı yok</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {calls.map((call) => {
            const cfg = TIP_CONFIG[call.tip] ?? TIP_CONFIG.yardım
            return (
              <div key={call.id} className="bg-white rounded-xl p-5 flex flex-col gap-3 border-2" style={{ borderColor: cfg.border, background: cfg.bg }}>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-3xl">{cfg.icon}</span>
                    <p className="font-semibold mt-1" style={{ color: '#3d2b1f' }}>{cfg.label}</p>
                    {call.durum === 'kabul edildi' && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full mt-1 inline-block">
                        {DURUM_LABEL[call.durum]}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: '#3d2b1f' }}>#{getCallTableLabel(call)}</div>
                    <div className="text-gray-400 text-xs">Masa</div>
                  </div>
                </div>
                {call.note && <p className="text-gray-500 text-sm italic">&quot;{call.note}&quot;</p>}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-xs">⏱ {elapsed(call.createdAt)} önce</span>
                  <button
                    onClick={() => resolveCall(call)}
                    className="text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
                    style={{ background: '#22c55e' }}
                  >
                    Tamamlandı ✓
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
