'use client'

import { useState, useEffect } from 'react'
import { addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { rc, rd } from '@/lib/firebase'
import type { Category, Product } from '@/lib/types'

type ProdForm = { name: string; description: string; price: string; categoryId: string; available: boolean }
const EMPTY_PROD: ProdForm = { name: '', description: '', price: '', categoryId: '', available: true }

const BROWN = '#3d2b1f'
const GOLD = '#d4a017'

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const [catModal, setCatModal] = useState<{ open: boolean; editing?: Category }>({ open: false })
  const [catName, setCatName] = useState('')

  const [prodModal, setProdModal] = useState<{ open: boolean; editing?: Product }>({ open: false })
  const [prodForm, setProdForm] = useState<ProdForm>(EMPTY_PROD)

  useEffect(() => {
    const unsubCats = onSnapshot(
      query(rc('categories'), orderBy('order', 'asc')),
      (s) => {
        const cats = s.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
        setCategories(cats)
        setSelectedCatId((prev) => prev ?? (cats[0]?.id ?? null))
      }
    )
    const unsubProds = onSnapshot(
      query(rc('products'), orderBy('name', 'asc')),
      (s) => setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() } as Product)))
    )
    return () => { unsubCats(); unsubProds() }
  }, [])

  async function saveCat() {
    if (!catName.trim()) return
    if (catModal.editing) {
      await updateDoc(rd('categories', catModal.editing.id), { name: catName.trim() })
    } else {
      const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.order)) : 0
      await addDoc(rc('categories'), { name: catName.trim(), order: maxOrder + 1 })
    }
    setCatModal({ open: false })
  }

  async function deleteCat(catId: string) {
    if (!confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) return
    await deleteDoc(rd('categories', catId))
    setSelectedCatId((prev) => (prev === catId ? (categories.find((c) => c.id !== catId)?.id ?? null) : prev))
  }

  async function saveProd() {
    if (!prodForm.name.trim() || !prodForm.categoryId) return
    const data = {
      name: prodForm.name.trim(),
      description: prodForm.description.trim(),
      price: parseFloat(prodForm.price) || 0,
      categoryId: prodForm.categoryId,
      available: prodForm.available,
    }
    if (prodModal.editing) {
      await updateDoc(rd('products', prodModal.editing.id), data)
    } else {
      await addDoc(rc('products'), data)
    }
    setProdModal({ open: false })
  }

  async function deleteProd(prodId: string) {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return
    await deleteDoc(rd('products', prodId))
  }

  async function toggleAvailable(p: Product) {
    await updateDoc(rd('products', p.id), { available: !p.available })
  }

  const visibleProducts = products.filter((p) => p.categoryId === selectedCatId)
  const selectedCat = categories.find((c) => c.id === selectedCatId)
  const inputCls = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]'

  return (
    <div className="p-8">
      <h1 className="font-bold text-2xl mb-6" style={{ color: BROWN }}>Menü Yönetimi</h1>

      <div className="flex gap-6">
        {/* Categories */}
        <div className="w-52 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: BROWN }}>Kategoriler</span>
            <button
              onClick={() => { setCatName(''); setCatModal({ open: true }) }}
              className="text-lg font-bold leading-none hover:opacity-70"
              style={{ color: GOLD }}
            >+</button>
          </div>
          <ul className="space-y-1">
            {categories.map((cat) => {
              const active = selectedCatId === cat.id
              return (
                <li key={cat.id}>
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group text-sm transition-colors"
                    style={active ? { background: BROWN, color: '#fff' } : { background: '#fff', border: '1px solid #f0ede9', color: BROWN }}
                    onClick={() => setSelectedCatId(cat.id)}
                  >
                    <span className="truncate">{cat.name}</span>
                    <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-1">
                      <button onClick={(e) => { e.stopPropagation(); setCatName(cat.name); setCatModal({ open: true, editing: cat }) }} className="px-1">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteCat(cat.id) }} className="px-1">🗑️</button>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          {categories.length === 0 && <p className="text-gray-400 text-xs text-center mt-4">Henüz kategori yok</p>}
        </div>

        {/* Products */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: BROWN }}>
              {selectedCat?.name ?? 'Kategori seçin'}
              <span className="text-gray-400 font-normal text-sm ml-2">({visibleProducts.length} ürün)</span>
            </h2>
            {selectedCatId && (
              <button
                onClick={() => { setProdForm({ ...EMPTY_PROD, categoryId: selectedCatId }); setProdModal({ open: true }) }}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: GOLD, color: BROWN }}
              >
                + Ürün Ekle
              </button>
            )}
          </div>

          {visibleProducts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
              {selectedCatId ? 'Bu kategoride ürün yok.' : 'Soldaki listeden bir kategori seçin.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleProducts.map((p) => (
                <div key={p.id} className="bg-white rounded-xl border p-4 flex items-center gap-4"
                  style={{ borderColor: '#f0ede9', opacity: p.available ? 1 : 0.6 }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm" style={{ color: BROWN }}>{p.name}</span>
                      {!p.available && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Pasif</span>}
                    </div>
                    <p className="text-gray-400 text-xs truncate">{p.description}</p>
                  </div>
                  <div className="shrink-0 font-semibold text-sm" style={{ color: BROWN }}>₺{p.price}</div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => toggleAvailable(p)} className="p-1.5 rounded hover:bg-gray-50 text-sm">{p.available ? '✅' : '⬜'}</button>
                    <button onClick={() => { setProdForm({ name: p.name, description: p.description, price: String(p.price), categoryId: p.categoryId, available: p.available }); setProdModal({ open: true, editing: p }) }} className="p-1.5 rounded hover:bg-gray-50 text-sm">✏️</button>
                    <button onClick={() => deleteProd(p.id)} className="p-1.5 rounded hover:bg-red-50 text-sm">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category Modal */}
      {catModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-4" style={{ color: BROWN }}>{catModal.editing ? 'Kategori Düzenle' : 'Yeni Kategori'}</h3>
            <input className={inputCls} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Kategori adı" autoFocus onKeyDown={(e) => e.key === 'Enter' && saveCat()} />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setCatModal({ open: false })} className="px-4 py-2 text-sm text-gray-500">İptal</button>
              <button onClick={saveCat} className="font-semibold px-5 py-2 rounded-lg text-sm" style={{ background: GOLD, color: BROWN }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {prodModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold mb-4" style={{ color: BROWN }}>{prodModal.editing ? 'Ürün Düzenle' : 'Yeni Ürün'}</h3>
            <div className="space-y-3">
              <input className={inputCls} value={prodForm.name} onChange={(e) => setProdForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ürün adı *" />
              <textarea className={`${inputCls} resize-none h-20`} value={prodForm.description} onChange={(e) => setProdForm((p) => ({ ...p, description: e.target.value }))} placeholder="Açıklama" />
              <input type="number" className={inputCls} value={prodForm.price} onChange={(e) => setProdForm((p) => ({ ...p, price: e.target.value }))} placeholder="Fiyat (₺)" min="0" />
              <select className={inputCls} value={prodForm.categoryId} onChange={(e) => setProdForm((p) => ({ ...p, categoryId: e.target.value }))}>
                <option value="">Kategori seç *</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BROWN }}>
                <input type="checkbox" checked={prodForm.available} onChange={(e) => setProdForm((p) => ({ ...p, available: e.target.checked }))} className="rounded" />
                Aktif (menüde göster)
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setProdModal({ open: false })} className="px-4 py-2 text-sm text-gray-500">İptal</button>
              <button onClick={saveProd} className="font-semibold px-5 py-2 rounded-lg text-sm" style={{ background: GOLD, color: BROWN }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
