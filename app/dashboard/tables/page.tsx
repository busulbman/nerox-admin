'use client'

import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'

const BROWN = '#3d2b1f'
const GOLD = '#d4a017'

interface QRItem {
  tableNum: number
  dataUrl: string
}

export default function TablesPage() {
  const [count, setCount] = useState(10)
  const [items, setItems] = useState<QRItem[]>([])
  const [generating, setGenerating] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  async function generateQRs() {
    setGenerating(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const results: QRItem[] = []
    for (let i = 1; i <= count; i++) {
      const url = `${origin}/menu/varina/${i}`
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: BROWN, light: '#fefaf3' },
      })
      results.push({ tableNum: i, dataUrl })
    }
    setItems(results)
    setGenerating(false)
  }

  function handlePrint() {
    window.print()
  }

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #qr-print-area { display: block !important; }
          #qr-print-area .no-print { display: none !important; }
        }
      `}</style>

      <div className="p-8" id="qr-print-area">
        <div className="no-print">
          <h1 className="font-bold text-2xl mb-1" style={{ color: BROWN }}>QR Kod Yönetimi</h1>
          <p className="text-gray-400 text-sm mb-8">Her masa için QR kod oluştur ve PDF olarak indir</p>

          <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8 flex items-end gap-4 max-w-sm">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" style={{ color: BROWN }}>Masa Sayısı</label>
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value))))}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]"
              />
            </div>
            <button
              onClick={generateQRs}
              disabled={generating}
              className="font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50 shrink-0"
              style={{ background: GOLD, color: BROWN }}
            >
              {generating ? 'Oluşturuluyor...' : 'QR Oluştur'}
            </button>
          </div>
        </div>

        {items.length > 0 && (
          <>
            <div className="no-print flex items-center justify-between mb-6">
              <p className="text-sm text-gray-500">{items.length} masa için QR kod hazır</p>
              <button
                onClick={handlePrint}
                className="font-semibold px-5 py-2.5 rounded-lg text-sm"
                style={{ background: BROWN, color: '#fff' }}
              >
                🖨️ Tümünü PDF İndir
              </button>
            </div>

            <div
              ref={printRef}
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {items.map((item) => (
                <div
                  key={item.tableNum}
                  className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col items-center gap-3 text-center"
                  style={{ breakInside: 'avoid' }}
                >
                  <img src={item.dataUrl} alt={`Masa ${item.tableNum} QR`} className="w-40 h-40" />
                  <div>
                    <p className="font-bold text-lg" style={{ color: BROWN }}>Masa {item.tableNum}</p>
                    <p className="text-gray-400 text-xs mt-0.5">Varina Chocolate</p>
                    <p className="text-gray-300 text-xs mt-0.5 break-all">/menu/varina/{item.tableNum}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {items.length === 0 && !generating && (
          <div className="bg-white rounded-xl border border-gray-100 p-16 text-center text-gray-400 text-sm">
            Masa sayısını girin ve "QR Oluştur" butonuna basın.
          </div>
        )}
      </div>
    </>
  )
}
