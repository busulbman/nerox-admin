'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { addDoc, deleteDoc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
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
      (snapshot) => {
        const cats = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Category))
        setCategories(cats)
        setSelectedCatId((prev) => prev ?? (cats[0]?.id ?? null))
      }
    )
    const unsubProds = onSnapshot(
      query(rc('products'), orderBy('name', 'asc')),
      (snapshot) => setProducts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Product)))
    )
    return () => {
      unsubCats()
      unsubProds()
    }
  }, [])

  async function saveCat() {
    if (!catName.trim()) return
    if (catModal.editing) {
      await updateDoc(rd('categories', catModal.editing.id), { name: catName.trim() })
    } else {
      const maxOrder = categories.length > 0 ? Math.max(...categories.map((category) => category.order)) : 0
      await addDoc(rc('categories'), { name: catName.trim(), order: maxOrder + 1 })
    }
    setCatModal({ open: false })
  }

  async function deleteCat(catId: string) {
    if (!confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) return
    await deleteDoc(rd('categories', catId))
    setSelectedCatId((prev) => (prev === catId ? (categories.find((category) => category.id !== catId)?.id ?? null) : prev))
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

  async function toggleAvailable(product: Product) {
    await updateDoc(rd('products', product.id), { available: !product.available })
  }

  const visibleProducts = products.filter((product) => product.categoryId === selectedCatId)
  const selectedCat = categories.find((category) => category.id === selectedCatId)
  const inputCls = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]'

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Menü Yönetimi</h1>
          <p className="text-gray-400 text-sm mt-0.5">Menü içerikleri ve QR menü görünümü buradan yönetilir.</p>
        </div>

        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
          style={{ color: BROWN }}
        >
          ⚙️ Genel Ayarlar
        </Link>
      </div>

      <div className="flex gap-6">
          <div className="w-52 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: BROWN }}>Kategoriler</span>
              <button
                onClick={() => {
                  setCatName('')
                  setCatModal({ open: true })
                }}
                className="text-lg font-bold leading-none hover:opacity-70"
                style={{ color: GOLD }}
              >
                +
              </button>
            </div>
            <ul className="space-y-1">
              {categories.map((category) => {
                const active = selectedCatId === category.id
                return (
                  <li key={category.id}>
                    <div
                      className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group text-sm transition-colors"
                      style={active ? { background: BROWN, color: '#fff' } : { background: '#fff', border: '1px solid #f0ede9', color: BROWN }}
                      onClick={() => setSelectedCatId(category.id)}
                    >
                      <span className="truncate">{category.name}</span>
                      <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-1">
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            setCatName(category.name)
                            setCatModal({ open: true, editing: category })
                          }}
                          className="px-1"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteCat(category.id)
                          }}
                          className="px-1"
                        >
                          🗑️
                        </button>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
            {categories.length === 0 && <p className="text-gray-400 text-xs text-center mt-4">Henüz kategori yok</p>}
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold" style={{ color: BROWN }}>
                {selectedCat?.name ?? 'Kategori seçin'}
                <span className="text-gray-400 font-normal text-sm ml-2">({visibleProducts.length} ürün)</span>
              </h2>
              {selectedCatId && (
                <button
                  onClick={() => {
                    setProdForm({ ...EMPTY_PROD, categoryId: selectedCatId })
                    setProdModal({ open: true })
                  }}
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
                {visibleProducts.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white rounded-xl border p-4 flex items-center gap-4"
                    style={{ borderColor: '#f0ede9', opacity: product.available ? 1 : 0.6 }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm" style={{ color: BROWN }}>{product.name}</span>
                        {!product.available && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Pasif</span>}
                      </div>
                      <p className="text-gray-400 text-xs truncate">{product.description}</p>
                    </div>
                    <div className="shrink-0 font-semibold text-sm" style={{ color: BROWN }}>₺{product.price}</div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => void toggleAvailable(product)} className="p-1.5 rounded hover:bg-gray-50 text-sm">{product.available ? '✅' : '⬜'}</button>
                      <button
                        onClick={() => {
                          setProdForm({
                            name: product.name,
                            description: product.description,
                            price: String(product.price),
                            categoryId: product.categoryId,
                            available: product.available,
                          })
                          setProdModal({ open: true, editing: product })
                        }}
                        className="p-1.5 rounded hover:bg-gray-50 text-sm"
                      >
                        ✏️
                      </button>
                      <button onClick={() => void deleteProd(product.id)} className="p-1.5 rounded hover:bg-red-50 text-sm">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {catModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-4" style={{ color: BROWN }}>{catModal.editing ? 'Kategori Düzenle' : 'Yeni Kategori'}</h3>
            <input
              className={inputCls}
              value={catName}
              onChange={(event) => setCatName(event.target.value)}
              placeholder="Kategori adı"
              autoFocus
              onKeyDown={(event) => event.key === 'Enter' && void saveCat()}
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setCatModal({ open: false })} className="px-4 py-2 text-sm text-gray-500">İptal</button>
              <button onClick={() => void saveCat()} className="font-semibold px-5 py-2 rounded-lg text-sm" style={{ background: GOLD, color: BROWN }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {prodModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold mb-4" style={{ color: BROWN }}>{prodModal.editing ? 'Ürün Düzenle' : 'Yeni Ürün'}</h3>
            <div className="space-y-3">
              <input className={inputCls} value={prodForm.name} onChange={(event) => setProdForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ürün adı *" />
              <textarea className={`${inputCls} resize-none h-20`} value={prodForm.description} onChange={(event) => setProdForm((current) => ({ ...current, description: event.target.value }))} placeholder="Açıklama" />
              <input type="number" className={inputCls} value={prodForm.price} onChange={(event) => setProdForm((current) => ({ ...current, price: event.target.value }))} placeholder="Fiyat (₺)" min="0" />
              <select className={inputCls} value={prodForm.categoryId} onChange={(event) => setProdForm((current) => ({ ...current, categoryId: event.target.value }))}>
                <option value="">Kategori seç *</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: BROWN }}>
                <input type="checkbox" checked={prodForm.available} onChange={(event) => setProdForm((current) => ({ ...current, available: event.target.checked }))} className="rounded" />
                Aktif (menüde göster)
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setProdModal({ open: false })} className="px-4 py-2 text-sm text-gray-500">İptal</button>
              <button onClick={() => void saveProd()} className="font-semibold px-5 py-2 rounded-lg text-sm" style={{ background: GOLD, color: BROWN }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
