'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { addDoc, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore'
import { Upload, Trash2, Image as ImageIcon, FileUp, Settings, Pencil, Trash, Check, Square } from 'lucide-react'
import { db, rc, rd } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import type { Category, Product } from '@/lib/types'

type ProdForm = { name: string; description: string; price: string; categoryId: string; available: boolean; image: string }
type ParsedItem = {
  category: string
  name: string
  description: string
  price: number
  imageUrl: string
  valid: boolean
  error?: string
}
type ImportResult = {
  categoriesCreated: number
  productsCreated: number
  productsUpdated: number
}

const EMPTY_PROD: ProdForm = { name: '', description: '', price: '', categoryId: '', available: true, image: '' }

const PRIMARY = 'var(--primary)'
const PRIMARY_FOREGROUND = 'var(--primary-foreground)'
const SURFACE = 'var(--surface)'
const TEXT = 'var(--text)'
const BORDER_SOFT = 'var(--border-soft)'

const IMGBB_API_KEY = process.env.NEXT_PUBLIC_IMGBB_API_KEY || ''

function isValidImageUrl(url: string): boolean {
  if (!url.trim()) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

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
      items.push({ category: '', name: '', description: '', price: 0, imageUrl: '', valid: false, error: 'Eksik alan' })
      continue
    }

    const [category, name, description, priceStr, imageUrl = ''] = parts
    const price = parseFloat(priceStr.replace(',', '.').replace(/[^\d.]/g, ''))

    if (!category) {
      errors.push(`Satır ${i + 1}: Kategori boş olamaz`)
      items.push({ category, name, description, price: 0, imageUrl: '', valid: false, error: 'Kategori boş' })
      continue
    }

    if (!name) {
      errors.push(`Satır ${i + 1}: Ürün adı boş olamaz`)
      items.push({ category, name, description, price: 0, imageUrl: '', valid: false, error: 'Ürün adı boş' })
      continue
    }

    if (Number.isNaN(price) || price < 0) {
      errors.push(`Satır ${i + 1}: Geçersiz fiyat "${priceStr}"`)
      items.push({ category, name, description, price: 0, imageUrl: '', valid: false, error: 'Geçersiz fiyat' })
      continue
    }

    const cleanImageUrl = imageUrl.trim()
    if (cleanImageUrl && !isValidImageUrl(cleanImageUrl)) {
      errors.push(`Satır ${i + 1}: Geçersiz görsel URL "${cleanImageUrl}" - URL atlanacak`)
    }

    items.push({
      category,
      name,
      description: description || '',
      price,
      imageUrl: isValidImageUrl(cleanImageUrl) ? cleanImageUrl : '',
      valid: true,
    })
  }

  return { items, errors }
}

async function uploadToImgBB(file: File): Promise<{ success: true; url: string } | { success: false; error: string }> {
  if (!IMGBB_API_KEY) {
    return { success: false, error: 'ImgBB API anahtarı ayarlanmamış.' }
  }

  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      return { success: false, error: 'Görsel yüklenemedi. Lütfen tekrar deneyin.' }
    }

    const data = await response.json()
    const url = data.data?.url
    if (!url) {
      return { success: false, error: 'Görsel yüklenemedi. Yanıt geçersiz.' }
    }

    return { success: true, url }
  } catch (error) {
    console.error('ImgBB upload error:', error)
    return { success: false, error: 'Görsel yüklenirken bir hata oluştu.' }
  }
}

export default function MenuPage() {
  const { profile, loading: authLoading } = useAuth()
  const restaurantId = profile?.restaurantId || ''
  const isDevelopment = process.env.NODE_ENV === 'development'

  // Debug: log profile state
  useEffect(() => {
    console.log('[ADMIN MENU DEBUG] Auth loading:', authLoading)
    console.log('[ADMIN MENU DEBUG] Profile:', profile ? { uid: profile.uid, restaurantId: profile.restaurantId, role: profile.role } : null)
  }, [authLoading, profile])

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categoriesRestaurantId, setCategoriesRestaurantId] = useState<string | null>(null)
  const [productsRestaurantId, setProductsRestaurantId] = useState<string | null>(null)
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const [catModal, setCatModal] = useState<{ open: boolean; editing?: Category }>({ open: false })
  const [catName, setCatName] = useState('')

  const [prodModal, setProdModal] = useState<{ open: boolean; editing?: Product }>({ open: false })
  const [prodForm, setProdForm] = useState<ProdForm>(EMPTY_PROD)
  const [prodImageUploading, setProdImageUploading] = useState(false)
  const [prodImageError, setProdImageError] = useState('')
  const prodFileInputRef = useRef<HTMLInputElement>(null)

  const [bulkModal, setBulkModal] = useState(false)
  const [bulkInput, setBulkInput] = useState('')
  const [bulkParsed, setBulkParsed] = useState<ParsedItem[]>([])
  const [bulkErrors, setBulkErrors] = useState<string[]>([])
  const [bulkStep, setBulkStep] = useState<'input' | 'preview' | 'importing' | 'done'>('input')
  const [bulkResult, setBulkResult] = useState<ImportResult | null>(null)
  const categoryDocRef = (categoryId: string) => rd(restaurantId, 'categories', categoryId)
  const productDocRef = (productId: string) => rd(restaurantId, 'products', productId)

  useEffect(() => {
    if (!restaurantId) {
      console.log('[ADMIN MENU DEBUG] No restaurantId, skipping load')
      return
    }

    const currentRestaurantId = restaurantId
    console.log('[ADMIN MENU DEBUG] Loading menu for restaurantId:', currentRestaurantId)
    console.log('[ADMIN MENU DEBUG] Categories path: restaurants/' + currentRestaurantId + '/categories')
    console.log('[ADMIN MENU DEBUG] Products path: restaurants/' + currentRestaurantId + '/products')

    const unsubCats = onSnapshot(
      query(rc(currentRestaurantId, 'categories'), orderBy('order', 'asc')),
      (snapshot) => {
        const cats = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Category))
        console.log('[ADMIN MENU DEBUG] Categories loaded:', cats.length)
        setCategories(cats)
        setCategoriesRestaurantId(currentRestaurantId)
        setSelectedCatId((prev) => (prev && cats.some((category) => category.id === prev) ? prev : (cats[0]?.id ?? null)))
      },
      (error) => {
        console.error('[ADMIN MENU DEBUG] Categories error:', error.code, error.message)
      }
    )
    const unsubProds = onSnapshot(
      query(rc(currentRestaurantId, 'products'), orderBy('name', 'asc')),
      (snapshot) => {
        console.log('[ADMIN MENU DEBUG] Products loaded:', snapshot.docs.length)
        setProducts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Product)))
        setProductsRestaurantId(currentRestaurantId)
      },
      (error) => {
        console.error('[ADMIN MENU DEBUG] Products error:', error.code, error.message)
      }
    )
    return () => {
      unsubCats()
      unsubProds()
    }
  }, [restaurantId])

  async function saveCat() {
    if (!catName.trim()) return
    if (catModal.editing) {
      await updateDoc(categoryDocRef(catModal.editing.id), { name: catName.trim() })
    } else {
      const maxOrder = tenantCategories.length > 0 ? Math.max(...tenantCategories.map((category) => category.order)) : 0
      await addDoc(rc(restaurantId, 'categories'), { name: catName.trim(), order: maxOrder + 1 })
    }
    setCatModal({ open: false })
  }

  async function deleteCat(catId: string) {
    if (!confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) return
    await deleteDoc(categoryDocRef(catId))
    setSelectedCatId((prev) => (prev === catId ? (tenantCategories.find((category) => category.id !== catId)?.id ?? null) : prev))
  }

  async function handleProdImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setProdImageError('Lütfen bir görsel dosyası seçin.')
      return
    }

    if (file.size > 32 * 1024 * 1024) {
      setProdImageError('Dosya boyutu 32MB\'dan küçük olmalı.')
      return
    }

    setProdImageUploading(true)
    setProdImageError('')

    const result = await uploadToImgBB(file)

    if (result.success) {
      setProdForm((current) => ({ ...current, image: result.url }))
    } else {
      setProdImageError(result.error)
    }

    setProdImageUploading(false)
    if (prodFileInputRef.current) {
      prodFileInputRef.current.value = ''
    }
  }

  async function saveProd() {
    if (!prodForm.name.trim() || !prodForm.categoryId) return
    const data = {
      name: prodForm.name.trim(),
      description: prodForm.description.trim(),
      price: parseFloat(prodForm.price) || 0,
      categoryId: prodForm.categoryId,
      available: prodForm.available,
      image: prodForm.image.trim(),
    }
    if (prodModal.editing) {
      await updateDoc(productDocRef(prodModal.editing.id), data)
    } else {
      await addDoc(rc(restaurantId, 'products'), data)
    }
    setProdModal({ open: false })
    setProdImageError('')
  }

  async function deleteProd(prodId: string) {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return
    await deleteDoc(productDocRef(prodId))
  }

  async function toggleAvailable(product: Product) {
    await updateDoc(productDocRef(product.id), { available: !product.available })
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
    for (const cat of tenantCategories) {
      categoryMap.set(cat.name.toLowerCase(), cat.id)
    }

    let categoriesCreated = 0
    let productsCreated = 0
    let productsUpdated = 0

    const batch = writeBatch(db)
    let maxOrder = tenantCategories.length > 0 ? Math.max(...tenantCategories.map((c) => c.order)) : 0

    for (const catName of categoryNames) {
      const existing = categoryMap.get(catName.toLowerCase())
      if (!existing) {
        maxOrder += 1
        const newCatRef = doc(rc(restaurantId, 'categories'))
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

      const existingProduct = tenantProducts.find(
        (p) => p.name.toLowerCase() === item.name.toLowerCase() && p.categoryId === categoryId
      )

      if (existingProduct) {
        productBatch.update(productDocRef(existingProduct.id), {
          description: item.description,
          price: item.price,
          available: true,
          ...(item.imageUrl ? { image: item.imageUrl } : {}),
        })
        productsUpdated++
      } else {
        const newProdRef = doc(rc(restaurantId, 'products'))
        productBatch.set(newProdRef, {
          name: item.name,
          description: item.description,
          price: item.price,
          categoryId,
          available: true,
          image: item.imageUrl || '',
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

  const tenantCategories = categoriesRestaurantId === restaurantId ? categories : []
  const tenantProducts = productsRestaurantId === restaurantId ? products : []

  const visibleProducts = tenantProducts.filter((product) => product.categoryId === selectedCatId)
  const selectedCat = tenantCategories.find((category) => category.id === selectedCatId)
  const inputCls = 'theme-input rounded-xl text-sm'
  const validItemsCount = bulkParsed.filter((i) => i.valid).length
  const invalidItemsCount = bulkParsed.filter((i) => !i.valid).length

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: TEXT }}>Menü Yönetimi</h1>
          <p className="text-gray-400 text-sm mt-0.5">Menü içerikleri ve QR menü görünümü buradan yönetilir.</p>
          {process.env.NODE_ENV === 'development' && restaurantId && (
            <p className="text-[11px] mt-2 font-mono text-gray-400">Aktif restaurantId: {restaurantId}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isDevelopment && (
            <button
              onClick={() => setBulkModal(true)}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
              style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}
            >
              <FileUp size={16} />
              Toplu Ürün Ekle
            </button>
          )}
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
            style={{ color: TEXT, borderColor: BORDER_SOFT, background: SURFACE }}
          >
            <Settings size={16} />
            Genel Ayarlar
          </Link>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-52 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: TEXT }}>Kategoriler</span>
            <button
              onClick={() => {
                setCatName('')
                setCatModal({ open: true })
              }}
              className="text-lg font-bold leading-none hover:opacity-70"
              style={{ color: PRIMARY }}
            >
              +
            </button>
          </div>
          <ul className="space-y-1">
            {tenantCategories.map((category) => {
              const active = selectedCatId === category.id
              return (
                <li key={category.id}>
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer group text-sm transition-colors"
                    style={active ? { background: PRIMARY, color: PRIMARY_FOREGROUND } : { background: SURFACE, border: `1px solid ${BORDER_SOFT}`, color: TEXT }}
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
                        className="p-1 hover:bg-white/20 rounded"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation()
                          void deleteCat(category.id)
                        }}
                        className="p-1 hover:bg-white/20 rounded"
                      >
                        <Trash size={12} />
                      </button>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
          {tenantCategories.length === 0 && <p className="text-gray-400 text-xs text-center mt-4">Henüz kategori eklenmedi.</p>}
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: TEXT }}>
              {selectedCat?.name ?? 'Kategori seçin'}
              <span className="text-gray-400 font-normal text-sm ml-2">({visibleProducts.length} ürün)</span>
            </h2>
            {selectedCatId && (
              <button
                onClick={() => {
                  setProdForm({ ...EMPTY_PROD, categoryId: selectedCatId })
                  setProdImageError('')
                  setProdModal({ open: true })
                }}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}
              >
                + Ürün Ekle
              </button>
            )}
          </div>

          {visibleProducts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
              {tenantProducts.length === 0 ? (
                <>
                  <p>Henüz ürün eklenmedi.</p>
                  <p className="mt-2 text-xs text-gray-400">İlk ürününüzü yönetim panelinden ekleyebilirsiniz.</p>
                </>
              ) : selectedCatId ? 'Bu kategoride ürün yok.' : 'Soldaki listeden bir kategori seçin.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleProducts.map((product) => (
                <div
                  key={product.id}
                  className="bg-white rounded-xl border p-4 flex items-center gap-4"
                  style={{ borderColor: BORDER_SOFT, opacity: product.available ? 1 : 0.6, background: SURFACE }}
                >
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          target.parentElement!.innerHTML = '<span class="text-[11px] font-semibold text-gray-400">Görsel</span>'
                        }}
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-gray-400">Görsel</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm" style={{ color: TEXT }}>{product.name}</span>
                      {!product.available && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Pasif</span>}
                    </div>
                    <p className="text-gray-400 text-xs truncate">{product.description}</p>
                  </div>
                  <div className="shrink-0 font-semibold text-sm" style={{ color: PRIMARY }}>₺{product.price}</div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => void toggleAvailable(product)}
                      className="p-1.5 rounded hover:bg-gray-50"
                      style={{ color: product.available ? '#22c55e' : '#9ca3af' }}
                    >
                      {product.available ? <Check size={16} /> : <Square size={16} />}
                    </button>
                    <button
                      onClick={() => {
                        setProdForm({
                          name: product.name,
                          description: product.description,
                          price: String(product.price),
                          categoryId: product.categoryId,
                          available: product.available,
                          image: product.image || '',
                        })
                        setProdImageError('')
                        setProdModal({ open: true, editing: product })
                      }}
                      className="p-1.5 rounded hover:bg-gray-50"
                      style={{ color: TEXT }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => void deleteProd(product.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500"
                    >
                      <Trash size={16} />
                    </button>
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
            <h3 className="font-semibold mb-4" style={{ color: TEXT }}>{catModal.editing ? 'Kategori Düzenle' : 'Yeni Kategori'}</h3>
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
              <button onClick={() => void saveCat()} className="font-semibold px-5 py-2 rounded-lg text-sm" style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {prodModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-4" style={{ color: TEXT }}>{prodModal.editing ? 'Ürün Düzenle' : 'Yeni Ürün'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: TEXT }}>Ürün Görseli</label>
                <div className="flex items-start gap-3">
                  <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden border border-gray-200">
                    {prodForm.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={prodForm.image}
                        alt="Ürün önizleme"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          target.parentElement!.innerHTML = '<span class="text-[11px] font-semibold text-gray-400">Görsel</span>'
                        }}
                      />
                    ) : (
                      <ImageIcon size={28} className="text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      ref={prodFileInputRef}
                      onChange={handleProdImageUpload}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => prodFileInputRef.current?.click()}
                        disabled={prodImageUploading || !IMGBB_API_KEY}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                        style={{ color: TEXT, borderColor: BORDER_SOFT }}
                      >
                        <Upload size={14} />
                        {prodImageUploading ? 'Yükleniyor...' : 'Dosya Seç'}
                      </button>
                      {prodForm.image && (
                        <button
                          type="button"
                          onClick={() => setProdForm((current) => ({ ...current, image: '' }))}
                          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {!IMGBB_API_KEY && (
                      <p className="text-xs text-gray-500">ImgBB API anahtarı ayarlanmamış. Manuel URL kullanın.</p>
                    )}
                    <input
                      className="theme-input rounded-lg px-3 py-1.5 text-xs"
                      value={prodForm.image}
                      onChange={(e) => setProdForm((current) => ({ ...current, image: e.target.value }))}
                      placeholder="veya URL girin: https://..."
                    />
                    {prodImageError && <p className="text-xs text-red-500">{prodImageError}</p>}
                  </div>
                </div>
              </div>
              <input className={inputCls} value={prodForm.name} onChange={(event) => setProdForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ürün adı *" />
              <textarea className={`${inputCls} resize-none h-20`} value={prodForm.description} onChange={(event) => setProdForm((current) => ({ ...current, description: event.target.value }))} placeholder="Açıklama" />
              <input type="number" className={inputCls} value={prodForm.price} onChange={(event) => setProdForm((current) => ({ ...current, price: event.target.value }))} placeholder="Fiyat (₺)" min="0" />
              <select className={inputCls} value={prodForm.categoryId} onChange={(event) => setProdForm((current) => ({ ...current, categoryId: event.target.value }))}>
                <option value="">Kategori seç *</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: TEXT }}>
                <input type="checkbox" checked={prodForm.available} onChange={(event) => setProdForm((current) => ({ ...current, available: event.target.checked }))} className="rounded" />
                Aktif (menüde göster)
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setProdModal({ open: false })} className="px-4 py-2 text-sm text-gray-500">İptal</button>
              <button onClick={() => void saveProd()} disabled={prodImageUploading} className="font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50" style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {isDevelopment && bulkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg" style={{ color: TEXT }}>Toplu Ürün Ekle</h3>
              <button onClick={closeBulkModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {bulkStep === 'input' && (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Menü verilerini aşağıdaki formatta yapıştırın. Her satır bir ürün olmalıdır.
                </p>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs font-mono" style={{ color: TEXT }}>
                  Kategori | Ürün Adı | Açıklama | Fiyat | Görsel URL (opsiyonel)
                </div>
                <textarea
                  className={`${inputCls} resize-none font-mono text-xs`}
                  rows={15}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="KAHVALTI | Simone Kahvaltı | 2 kişilik. Yöresel mezelerimiz... | 1790 | https://i.ibb.co/xxx/image.jpg"
                />
                <div className="flex gap-2 justify-end mt-4">
                  <button onClick={closeBulkModal} className="px-4 py-2 text-sm text-gray-500">İptal</button>
                  <button
                    onClick={handleBulkParse}
                    disabled={!bulkInput.trim()}
                    className="font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-50"
                    style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}
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
                    {validItemsCount} geçerli
                  </span>
                  {invalidItemsCount > 0 && (
                    <span className="text-sm px-3 py-1 rounded-full bg-red-100 text-red-700">
                      {invalidItemsCount} hatalı
                    </span>
                  )}
                </div>

                {bulkErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-sm font-medium text-red-700 mb-2">Uyarılar:</p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {bulkErrors.slice(0, 10).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {bulkErrors.length > 10 && (
                        <li>...ve {bulkErrors.length - 10} uyarı daha</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: TEXT }}>Görsel</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: TEXT }}>Kategori</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: TEXT }}>Ürün</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: TEXT }}>Açıklama</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ color: TEXT }}>Fiyat</th>
                        <th className="text-center px-3 py-2 font-medium" style={{ color: TEXT }}>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkParsed.slice(0, 20).map((item, i) => (
                        <tr key={i} className={item.valid ? '' : 'bg-red-50'}>
                          <td className="px-3 py-2 border-t">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="w-8 h-8 rounded object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                }}
                              />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-t">{item.category || '—'}</td>
                          <td className="px-3 py-2 border-t">{item.name || '—'}</td>
                          <td className="px-3 py-2 border-t text-gray-500 truncate max-w-[150px]">{item.description || '—'}</td>
                          <td className="px-3 py-2 border-t text-right">{item.valid ? `₺${item.price}` : '—'}</td>
                          <td className="px-3 py-2 border-t text-center">
                            {item.valid ? (
                              <span className="text-green-600"><Check size={16} className="inline" /></span>
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
                    style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}
                  >
                    {validItemsCount} Ürünü İçe Aktar
                  </button>
                </div>
              </>
            )}

            {bulkStep === 'importing' && (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--primary)]" />
                <p className="text-sm text-gray-500">Ürünler ekleniyor...</p>
              </div>
            )}

            {bulkStep === 'done' && bulkResult && (
              <div className="py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Check size={32} className="text-green-600" />
                </div>
                <p className="font-semibold text-lg mb-4" style={{ color: TEXT }}>İçe aktarma tamamlandı!</p>
                <div className="inline-flex flex-col gap-2 text-sm text-left">
                  <p><strong>{bulkResult.categoriesCreated}</strong> yeni kategori oluşturuldu</p>
                  <p><strong>{bulkResult.productsCreated}</strong> yeni ürün eklendi</p>
                  <p><strong>{bulkResult.productsUpdated}</strong> ürün güncellendi</p>
                </div>
                <div className="mt-6">
                  <button
                    onClick={closeBulkModal}
                    className="font-semibold px-6 py-2.5 rounded-lg text-sm"
                    style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}
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
