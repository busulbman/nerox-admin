'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { addDoc, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore'
import { db, rc, rd } from '@/lib/firebase'
import type { Category, Product } from '@/lib/types'

type ProdForm = { name: string; description: string; price: string; categoryId: string; available: boolean }
type ParsedItem = {
  category: string
  name: string
  description: string
  price: number
  valid: boolean
  error?: string
}
type ImportResult = {
  categoriesCreated: number
  productsCreated: number
  productsUpdated: number
}

const EMPTY_PROD: ProdForm = { name: '', description: '', price: '', categoryId: '', available: true }

const BROWN = '#3d2b1f'
const GOLD = '#d4a017'

function parseMenuInput(input: string): { items: ParsedItem[]; errors: string[] } {
  const lines = input.trim().split('\n').filter((line) => line.trim())
  const items: ParsedItem[] = []
  const errors: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const parts = line.split('|').map((part) => part.trim())

    if (parts.length < 4) {
      errors.push(`Satır ${i + 1}: Eksik alan (en az 4 alan gerekli: Kategori | Ürün | Açıklama | Fiyat)`)
      items.push({ category: '', name: '', description: '', price: 0, valid: false, error: 'Eksik alan' })
      continue
    }

    const [category, name, description, priceStr] = parts
    const price = parseFloat(priceStr.replace(',', '.').replace(/[^\d.]/g, ''))

    if (!category) {
      errors.push(`Satır ${i + 1}: Kategori boş olamaz`)
      items.push({ category, name, description, price: 0, valid: false, error: 'Kategori boş' })
      continue
    }

    if (!name) {
      errors.push(`Satır ${i + 1}: Ürün adı boş olamaz`)
      items.push({ category, name, description, price: 0, valid: false, error: 'Ürün adı boş' })
      continue
    }

    if (Number.isNaN(price) || price < 0) {
      errors.push(`Satır ${i + 1}: Geçersiz fiyat "${priceStr}"`)
      items.push({ category, name, description, price: 0, valid: false, error: 'Geçersiz fiyat' })
      continue
    }

    items.push({ category, name, description: description || '', price, valid: true })
  }

  return { items, errors }
}

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const [catModal, setCatModal] = useState<{ open: boolean; editing?: Category }>({ open: false })
  const [catName, setCatName] = useState('')

  const [prodModal, setProdModal] = useState<{ open: boolean; editing?: Product }>({ open: false })
  const [prodForm, setProdForm] = useState<ProdForm>(EMPTY_PROD)

  const [bulkModal, setBulkModal] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkParsed, setBulkParsed] = useState<ParsedItem[]>([])
  const [bulkErrors, setBulkErrors] = useState<string[]>([])
  const [bulkStep, setBulkStep] = useState<'input' | 'preview' | 'importing' | 'done'>('input')
  const [bulkResult, setBulkResult] = useState<ImportResult | null>(null)

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

  function handleBulkParse() {
    const { items, errors } = parseMenuInput(bulkInput)
    setBulkParsed(items)
    setBulkErrors(errors)
    setBulkStep('preview')
  }

  async function handleBulkImport() {
    setBulkStep('importing')

    const validItems = bulkParsed.filter((item) => item.valid)
    const categoryNames = [...new Set(validItems.map((item) => item.category))]

    const categoryMap = new Map<string, string>()
    for (const cat of categories) {
      categoryMap.set(cat.name.toLowerCase(), cat.id)
    }

    let categoriesCreated = 0
    let productsCreated = 0
    let productsUpdated = 0

    const batch = writeBatch(db)
    let maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.order)) : 0

    for (const catName of categoryNames) {
      const existing = categoryMap.get(catName.toLowerCase())
      if (!existing) {
        maxOrder += 1
        const newCatRef = doc(rc('categories'))
        batch.set(newCatRef, { name: catName, order: maxOrder })
        categoryMap.set(catName.toLowerCase(), newCatRef.id)
        categoriesCreated++
      }
    }

    await batch.commit()

    const productBatch = writeBatch(db)

    for (const item of validItems) {
      const categoryId = categoryMap.get(item.category.toLowerCase())
      if (!categoryId) continue

      const existingProduct = products.find(
        (p) => p.name.toLowerCase() === item.name.toLowerCase() && p.categoryId === categoryId
      )

      if (existingProduct) {
        productBatch.update(rd('products', existingProduct.id), {
          description: item.description,
          price: item.price,
          available: true,
        })
        productsUpdated++
      } else {
        const newProdRef = doc(rc('products'))
        productBatch.set(newProdRef, {
          name: item.name,
          description: item.description,
          price: item.price,
          categoryId,
          available: true,
          image: '',
        })
        productsCreated++
      }
    }

    await productBatch.commit()

    setBulkResult({ categoriesCreated, productsCreated, productsUpdated })
    setBulkStep('done')
  }

  function closeBulkModal() {
    setBulkModal(false)
    setBulkInput('')
    setBulkParsed([])
    setBulkErrors([])
    setBulkStep('input')
    setBulkResult(null)
  }

  const visibleProducts = products.filter((product) => product.categoryId === selectedCatId)
  const selectedCat = categories.find((category) => category.id === selectedCatId)
  const inputCls = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]'
  const validItemsCount = bulkParsed.filter((i) => i.valid).length
  const invalidItemsCount = bulkParsed.filter((i) => !i.valid).length

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Menü Yönetimi</h1>
          <p className="text-gray-400 text-sm mt-0.5">Menü içerikleri ve QR menü görünümü buradan yönetilir.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkModal(true)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            style={{ background: GOLD, color: BROWN }}
          >
            📋 Toplu Ürün Ekle
          </button>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
            style={{ color: BROWN }}
          >
            ⚙️ Genel Ayarlar
          </Link>
        </div>
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

      {bulkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg" style={{ color: BROWN }}>Toplu Ürün Ekle</h3>
              <button onClick={closeBulkModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {bulkStep === 'input' && (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Menü verilerini aşağıdaki formatta yapıştırın. Her satır bir ürün olmalıdır.
                </p>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs font-mono" style={{ color: BROWN }}>
                  Kategori | Ürün Adı | Açıklama | Fiyat
                </div>
                <textarea
                  className={`${inputCls} resize-none font-mono text-xs`}
                  rows={15}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="KAHVALTI | Simone Kahvaltı | 2 kişilik. Yöresel mezelerimiz... | 1790"
                />
                <div className="flex gap-2 justify-end mt-4">
                  <button onClick={closeBulkModal} className="px-4 py-2 text-sm text-gray-500">İptal</button>
                  <button
                    onClick={handleBulkParse}
                    disabled={!bulkInput.trim()}
                    className="font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50"
                    style={{ background: GOLD, color: BROWN }}
                  >
                    Önizle
                  </button>
                </div>
              </>
            )}

            {bulkStep === 'preview' && (
              <>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-sm px-3 py-1 rounded-full bg-green-100 text-green-700">
                    ✓ {validItemsCount} geçerli
                  </span>
                  {invalidItemsCount > 0 && (
                    <span className="text-sm px-3 py-1 rounded-full bg-red-100 text-red-700">
                      ✗ {invalidItemsCount} hatalı
                    </span>
                  )}
                </div>

                {bulkErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-sm font-medium text-red-700 mb-2">Hatalar:</p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {bulkErrors.slice(0, 10).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {bulkErrors.length > 10 && (
                        <li>...ve {bulkErrors.length - 10} hata daha</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: BROWN }}>Kategori</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: BROWN }}>Ürün</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: BROWN }}>Açıklama</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: BROWN }}>Fiyat</th>
                        <th className="text-center px-3 py-2 font-medium" style={{ color: BROWN }}>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkParsed.slice(0, 20).map((item, i) => (
                        <tr key={i} className={item.valid ? '' : 'bg-red-50'}>
                          <td className="px-3 py-2 border-t">{item.category || '—'}</td>
                          <td className="px-3 py-2 border-t">{item.name || '—'}</td>
                          <td className="px-3 py-2 border-t text-gray-500 truncate max-w-[200px]">{item.description || '—'}</td>
                          <td className="px-3 py-2 border-t text-right">{item.valid ? `₺${item.price}` : '—'}</td>
                          <td className="px-3 py-2 border-t text-center">
                            {item.valid ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <span className="text-red-600" title={item.error}>✗</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bulkParsed.length > 20 && (
                    <div className="px-3 py-2 bg-gray-50 text-sm text-gray-500 border-t">
                      ...ve {bulkParsed.length - 20} ürün daha
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <button onClick={() => setBulkStep('input')} className="px-4 py-2 text-sm text-gray-500">Geri</button>
                  <button
                    onClick={() => void handleBulkImport()}
                    disabled={validItemsCount === 0}
                    className="font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50"
                    style={{ background: GOLD, color: BROWN }}
                  >
                    {validItemsCount} Ürünü İçe Aktar
                  </button>
                </div>
              </>
            )}

            {bulkStep === 'importing' && (
              <div className="py-12 text-center">
                <div className="text-4xl mb-4 animate-pulse">⏳</div>
                <p className="text-sm text-gray-500">Ürünler ekleniyor...</p>
              </div>
            )}

            {bulkStep === 'done' && bulkResult && (
              <div className="py-8 text-center">
                <div className="text-4xl mb-4">✅</div>
                <p className="font-semibold text-lg mb-4" style={{ color: BROWN }}>İçe aktarma tamamlandı!</p>
                <div className="inline-flex flex-col gap-2 text-sm text-left">
                  <p>📁 <strong>{bulkResult.categoriesCreated}</strong> yeni kategori oluşturuldu</p>
                  <p>🆕 <strong>{bulkResult.productsCreated}</strong> yeni ürün eklendi</p>
                  <p>🔄 <strong>{bulkResult.productsUpdated}</strong> ürün güncellendi</p>
                </div>
                <div className="mt-6">
                  <button
                    onClick={closeBulkModal}
                    className="font-semibold px-6 py-2.5 rounded-lg text-sm"
                    style={{ background: GOLD, color: BROWN }}
                  >
                    Tamam
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
