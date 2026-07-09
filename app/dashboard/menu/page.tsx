'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { Upload, Trash2, Image as ImageIcon, FileUp, Settings, Pencil, Trash, Check, Square, Monitor, Sun, Moon, Globe, ShoppingBag, UtensilsCrossed, Wifi, Star, Gift, Receipt, MessageCircle, Phone, MapPin, Smartphone } from 'lucide-react'
import InstagramIcon from '@/components/icons/InstagramIcon'
import { db, rc, rd } from '@/lib/firebase'
import { useAuth } from '@/components/AuthProvider'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { useSystemPrefersDark } from '@/hooks/useSystemPrefersDark'
import {
  DEFAULT_BRAND_LOGO_PATH,
  DEFAULT_PRIMARY_COLOR,
  buildRestaurantContactLinks,
  getContrastColor,
  isValidRestaurantThemeColor,
  resolveMenuPrimaryColor,
  resolveRestaurantBusinessName,
} from '@/lib/restaurant-settings'
import { buildThemePalette, withAlpha } from '@/lib/ui-theme'
import type { Category, MenuThemeMode, Product } from '@/lib/types'

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

const MENU_THEME_MODE_OPTIONS: { value: MenuThemeMode; label: string; Icon: typeof Monitor }[] = [
  { value: 'system', label: 'Sistem', Icon: Monitor },
  { value: 'light', label: 'Açık Mod', Icon: Sun },
  { value: 'dark', label: 'Koyu Mod', Icon: Moon },
]

const MENU_PREVIEW_CATEGORIES = ['Kahveler', 'Tatlılar', 'Fırından']

// Gerçek fotoğraf görünümlü örnek ürünler; görsel yüklenemezse gradient fallback gösterilir.
const MENU_PREVIEW_PRODUCTS = [
  {
    name: 'Latte',
    desc: 'Çift shot espresso, ipeksi süt köpüğü',
    price: 120,
    image: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=180&q=70',
  },
  {
    name: 'San Sebastian',
    desc: 'Bask usulü fırınlanmış cheesecake',
    price: 210,
    image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=180&q=70',
  },
  {
    name: 'Kruvasan',
    desc: 'Tereyağlı, günlük taze fırından',
    price: 95,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=180&q=70',
  },
  {
    name: 'Ice Americano',
    desc: 'Bol buzlu, yoğun espresso',
    price: 105,
    image: 'https://images.unsplash.com/photo-1517959105821-eaf2591984ca?auto=format&fit=crop&w=180&q=70',
  },
]

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

  // QR menü görünüm ayarları (menuPrimaryColor + menuThemeMode)
  const { settings, loading: settingsLoading } = useRestaurantSettings(restaurantId)
  const systemPrefersDark = useSystemPrefersDark()
  const [menuColor, setMenuColor] = useState('')
  const [menuMode, setMenuMode] = useState<MenuThemeMode>('system')
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const [appearanceMessage, setAppearanceMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const appearanceInitRef = useRef<string | null>(null)

  useEffect(() => {
    if (!restaurantId) {
      appearanceInitRef.current = null
      return
    }
    if (!settingsLoading && appearanceInitRef.current !== restaurantId) {
      setMenuColor(resolveMenuPrimaryColor(settings))
      setMenuMode(settings.menuThemeMode ?? 'system')
      appearanceInitRef.current = restaurantId
    }
  }, [restaurantId, settings, settingsLoading])

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

  async function saveMenuAppearance() {
    if (!restaurantId) return

    const trimmedColor = menuColor.trim()
    if (trimmedColor && !isValidRestaurantThemeColor(trimmedColor)) {
      setAppearanceMessage({ tone: 'error', text: 'Menü rengi geçerli bir hex renk olmalı. Örnek: #7c3aed' })
      return
    }

    setAppearanceSaving(true)
    setAppearanceMessage(null)

    try {
      await setDoc(
        doc(db, 'restaurants', restaurantId, 'settings', 'general'),
        {
          menuPrimaryColor: trimmedColor || DEFAULT_PRIMARY_COLOR,
          menuThemeMode: menuMode,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setAppearanceMessage({ tone: 'success', text: 'QR menü görünümü kaydedildi.' })
    } catch (error) {
      console.error('Menu appearance save error:', error)
      setAppearanceMessage({ tone: 'error', text: 'Kaydedilemedi. Lütfen tekrar deneyin.' })
    } finally {
      setAppearanceSaving(false)
    }
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

  function openCreateProductModal() {
    if (!selectedCatId) return
    setProdForm({ ...EMPTY_PROD, categoryId: selectedCatId })
    setProdImageError('')
    setProdModal({ open: true })
  }

  function openEditProductModal(product: Product) {
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
  }

  const tenantCategories = categoriesRestaurantId === restaurantId ? categories : []
  const tenantProducts = productsRestaurantId === restaurantId ? products : []

  const visibleProducts = tenantProducts.filter((product) => product.categoryId === selectedCatId)
  const selectedCat = tenantCategories.find((category) => category.id === selectedCatId)
  const inputCls = 'theme-input rounded-xl text-sm'
  const validItemsCount = bulkParsed.filter((i) => i.valid).length
  const invalidItemsCount = bulkParsed.filter((i) => !i.valid).length

  // QR menü canlı önizleme değerleri — renk/mod değişiminde anında güncellenir
  const trimmedMenuColor = menuColor.trim()
  const menuPreviewColor = isValidRestaurantThemeColor(trimmedMenuColor) ? trimmedMenuColor : DEFAULT_PRIMARY_COLOR
  const menuPreviewDark = menuMode === 'dark' || (menuMode === 'system' && systemPrefersDark)
  const menuPalette = buildThemePalette(menuPreviewColor, menuPreviewDark ? 'dark' : 'light')
  const menuPreviewTextColor = getContrastColor(menuPreviewColor)
  const previewBusinessName = resolveRestaurantBusinessName(settings)
  const previewLogoUrl = settings.logoUrl?.trim() || DEFAULT_BRAND_LOGO_PATH
  const previewContactLinks = buildRestaurantContactLinks(settings)
  const previewSocialIcons = [
    { key: 'instagram', Icon: InstagramIcon, visible: !!previewContactLinks.instagram },
    { key: 'whatsapp', Icon: MessageCircle, visible: !!previewContactLinks.whatsapp },
    { key: 'phone', Icon: Phone, visible: !!previewContactLinks.phone },
    { key: 'maps', Icon: MapPin, visible: !!previewContactLinks.maps },
    { key: 'website', Icon: Globe, visible: !!previewContactLinks.website },
  ].filter((item) => item.visible)
  const previewCartCount = 2
  const previewCartTotal = MENU_PREVIEW_PRODUCTS[0].price + MENU_PREVIEW_PRODUCTS[2].price

  return (
    <div className="overflow-x-hidden p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: TEXT }}>Menü Yönetimi</h1>
          <p className="text-gray-400 text-sm mt-0.5">Menü içerikleri ve QR menü görünümü buradan yönetilir.</p>
          {process.env.NODE_ENV === 'development' && restaurantId && (
            <p className="text-[11px] mt-2 font-mono text-gray-400">Aktif restaurantId: {restaurantId}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isDevelopment && (
            <button
              onClick={() => setBulkModal(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors sm:w-auto"
              style={{ background: PRIMARY, color: PRIMARY_FOREGROUND }}
            >
              <FileUp size={16} />
              Toplu Ürün Ekle
            </button>
          )}
          <Link
            href="/dashboard/settings"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-50 sm:w-auto"
            style={{ color: TEXT, borderColor: BORDER_SOFT, background: SURFACE }}
          >
            <Settings size={16} />
            Genel Ayarlar
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <div className="md:hidden">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: TEXT }}>Kategoriler</span>
            <button
              onClick={() => {
                setCatName('')
                setCatModal({ open: true })
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold leading-none"
              style={{ background: SURFACE, color: PRIMARY, border: `1px solid ${BORDER_SOFT}` }}
              aria-label="Kategori ekle"
            >
              +
            </button>
          </div>

          {tenantCategories.length > 0 ? (
            <>
              <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [-ms-overflow-style:none]">
                <div className="flex w-max gap-2 pb-1">
                  {tenantCategories.map((category) => {
                    const active = selectedCatId === category.id
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCatId(category.id)}
                        className="max-w-[12rem] shrink-0 rounded-full px-4 py-2 text-sm font-medium"
                        style={active
                          ? { background: PRIMARY, color: PRIMARY_FOREGROUND }
                          : { background: SURFACE, color: TEXT, border: `1px solid ${BORDER_SOFT}` }}
                      >
                        <span className="block truncate">{category.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedCat && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setCatName(selectedCat.name)
                      setCatModal({ open: true, editing: selectedCat })
                    }}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                    style={{ background: SURFACE, color: TEXT, border: `1px solid ${BORDER_SOFT}` }}
                  >
                    <Pencil size={14} />
                    Kategoriyi Düzenle
                  </button>
                  <button
                    onClick={() => void deleteCat(selectedCat.id)}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-red-500"
                    style={{ background: SURFACE, border: `1px solid ${BORDER_SOFT}` }}
                  >
                    <Trash size={14} />
                    Sil
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 text-center text-xs text-gray-400">Henüz kategori eklenmedi.</p>
          )}
        </div>

        <div className="hidden w-52 shrink-0 md:block">
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

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="min-w-0 font-semibold" style={{ color: TEXT }}>
              <span className="block truncate">{selectedCat?.name ?? 'Kategori seçin'}</span>
              <span className="ml-0 mt-1 block text-sm font-normal text-gray-400 sm:ml-2 sm:mt-0 sm:inline">({visibleProducts.length} ürün)</span>
            </h2>
            {selectedCatId && (
              <button
                onClick={openCreateProductModal}
                className="w-full rounded-lg px-4 py-2 text-sm font-semibold sm:w-auto"
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
            <>
              <div className="space-y-3 md:hidden">
                {visibleProducts.map((product) => (
                  <div
                    key={product.id}
                    className="w-full rounded-2xl border p-4"
                    style={{ borderColor: BORDER_SOFT, opacity: product.available ? 1 : 0.7, background: SURFACE }}
                  >
                    <div className="flex items-start gap-4">
                      <ProductImagePreview image={product.image} name={product.name} className="h-20 w-20 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-sm font-semibold" style={{ color: TEXT }}>{product.name}</h3>
                          <span
                            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={product.available ? { background: '#dcfce7', color: '#166534' } : { background: '#f3f4f6', color: '#6b7280' }}
                          >
                            {product.available ? 'Aktif' : 'Pasif'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-gray-400">{product.description || 'Açıklama girilmedi.'}</p>
                        <p className="mt-3 text-sm font-semibold" style={{ color: PRIMARY }}>₺{product.price}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        onClick={() => openEditProductModal(product)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold"
                        style={{ background: SURFACE, color: TEXT, border: `1px solid ${BORDER_SOFT}` }}
                      >
                        <Pencil size={16} />
                        Düzenle
                      </button>
                      <button
                        onClick={() => void toggleAvailable(product)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold"
                        style={product.available
                          ? { background: '#ecfdf5', color: '#15803d', border: '1px solid rgba(34,197,94,0.18)' }
                          : { background: '#f3f4f6', color: '#6b7280', border: '1px solid rgba(156,163,175,0.25)' }}
                      >
                        {product.available ? <Check size={16} /> : <Square size={16} />}
                        {product.available ? 'Pasif Yap' : 'Aktif Yap'}
                      </button>
                      <button
                        onClick={() => void deleteProd(product.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-500"
                        style={{ background: '#fef2f2', border: '1px solid rgba(239,68,68,0.16)' }}
                      >
                        <Trash size={16} />
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden space-y-2 md:block">
                {visibleProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-4 rounded-xl border bg-white p-4"
                    style={{ borderColor: BORDER_SOFT, opacity: product.available ? 1 : 0.6, background: SURFACE }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <ProductImagePreview image={product.image} name={product.name} className="h-12 w-12 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="truncate font-medium text-sm" style={{ color: TEXT }}>{product.name}</span>
                          {!product.available && <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Pasif</span>}
                        </div>
                        <p className="truncate text-xs text-gray-400">{product.description}</p>
                      </div>
                    </div>
                    <div className="flex w-auto items-center justify-end gap-3">
                      <div className="shrink-0 font-semibold text-sm" style={{ color: PRIMARY }}>₺{product.price}</div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          onClick={() => void toggleAvailable(product)}
                          className="rounded p-1.5 hover:bg-gray-50"
                          style={{ color: product.available ? '#22c55e' : '#9ca3af' }}
                        >
                          {product.available ? <Check size={16} /> : <Square size={16} />}
                        </button>
                        <button
                          onClick={() => openEditProductModal(product)}
                          className="rounded p-1.5 hover:bg-gray-50"
                          style={{ color: TEXT }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => void deleteProd(product.id)}
                          className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── QR Menü Görünümü ──────────────────────────────────────────────── */}
      <div className="theme-card mt-8 rounded-2xl p-6">
        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <Smartphone size={20} style={{ color: menuPreviewColor }} />
              <h2 className="text-lg font-semibold" style={{ color: TEXT }}>QR Menü Görünümü</h2>
            </div>
            <p className="mt-1 text-sm text-gray-400">
              Müşterinin telefonunda açılan QR menünün rengi ve açık/koyu modu buradan ayarlanır.
              Panel rengini etkilemez; panel rengi Genel Ayarlar sayfasındadır.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: TEXT }}>
                  Menü Tema Rengi
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={menuPreviewColor}
                    onChange={(event) => setMenuColor(event.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                  />
                  <input
                    className={inputCls}
                    value={menuColor}
                    onChange={(event) => setMenuColor(event.target.value)}
                    placeholder={DEFAULT_PRIMARY_COLOR}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Kategori butonları, sepet, kampanya kartları ve tüm menü vurguları bu rengi kullanır.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: TEXT }}>
                  Görünüm Modu
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {MENU_THEME_MODE_OPTIONS.map(({ value, label, Icon }) => {
                    const selected = menuMode === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMenuMode(value)}
                        className="flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-semibold transition-all"
                        style={selected
                          ? { background: menuPreviewColor, borderColor: menuPreviewColor, color: menuPreviewTextColor }
                          : { background: SURFACE, borderColor: BORDER_SOFT, color: TEXT }}
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  &quot;Sistem&quot; seçiliyse müşterinin cihaz teması kullanılır.
                </p>
              </div>

              {appearanceMessage && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={
                    appearanceMessage.tone === 'success'
                      ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }
                      : { background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }
                  }
                >
                  {appearanceMessage.text}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => void saveMenuAppearance()}
                  disabled={appearanceSaving || settingsLoading}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ background: menuPreviewColor, color: menuPreviewTextColor }}
                >
                  {appearanceSaving ? 'Kaydediliyor...' : 'Görünümü Kaydet'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Canlı Önizleme</p>
              <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: menuPalette.surfaceMuted, color: menuPalette.text }}>
                {menuPreviewDark ? 'Koyu Mod' : 'Açık Mod'}
              </span>
            </div>

            {/* Phone mockup — gerçek telefon oranında (9:19.5), gerçek QR menü düzenini taklit eder */}
            <div className="mx-auto w-full max-w-[340px]">
              <div className="overflow-hidden rounded-[3rem] border-[10px] border-[#1c1c1e] bg-[#1c1c1e] shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
                <div className="relative flex aspect-[9/19.5] flex-col overflow-hidden rounded-[2.4rem]" style={{ background: menuPalette.pageBg }}>
                  <div className="absolute left-1/2 top-2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-[#1c1c1e]" />

                  <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-9">
                    {/* Menü header: logo + işletme adı + dil + sepet */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewLogoUrl}
                          alt={previewBusinessName}
                          className="h-9 w-9 shrink-0 rounded-xl border border-black/5 bg-white object-cover shadow-sm"
                        />
                        <p className="truncate text-[13px] font-semibold" style={{ color: menuPalette.text }}>
                          {previewBusinessName}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="flex h-7 items-center gap-1 rounded-full px-2 shadow-sm" style={{ color: menuPalette.text, background: menuPalette.surface }}>
                          <Globe size={11} />
                          <span className="text-[9px] font-semibold">TR</span>
                        </span>
                        <span className="relative flex h-7 w-7 items-center justify-center rounded-full shadow-sm" style={{ color: menuPalette.text, background: menuPalette.surface }}>
                          <ShoppingBag size={12} />
                          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold" style={{ background: menuPreviewColor, color: menuPreviewTextColor }}>
                            {previewCartCount}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Karşılama kartı */}
                    <div className="mt-2.5 rounded-2xl px-3 py-2 shadow-sm" style={{ background: menuPalette.surface }}>
                      <p className="text-[9px]" style={{ color: menuPalette.muted }}>Masa 1 • Hoş geldiniz</p>
                      <p className="mt-0.5 text-[11px] font-semibold" style={{ color: menuPalette.text }}>
                        Günün favorilerini keşfedin
                      </p>
                    </div>

                    {/* Kampanya kartı */}
                    <div className="mt-2 rounded-2xl border p-2.5 shadow-sm" style={{ borderColor: withAlpha(menuPreviewColor, 0.3), background: withAlpha(menuPreviewColor, menuPreviewDark ? 0.16 : 0.08) }}>
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: menuPreviewColor, color: menuPreviewTextColor }}>
                          <Gift size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-bold uppercase tracking-[0.16em]" style={{ color: menuPreviewDark ? menuPalette.primarySoftForeground : menuPreviewColor }}>Kampanya</p>
                          <p className="truncate text-[10px] font-semibold" style={{ color: menuPalette.text }}>
                            2 Latte alana 1 Kruvasan hediye
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Wi-Fi kartı */}
                    {settings.wifiEnabled && (
                      <div className="mt-2 flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm" style={{ borderColor: menuPalette.borderSoft, background: menuPalette.surface }}>
                        <Wifi size={12} className="shrink-0" style={{ color: menuPreviewColor }} />
                        <p className="min-w-0 flex-1 truncate text-[10px] font-semibold" style={{ color: menuPalette.text }}>
                          {settings.wifiName?.trim() || 'Isletme_WiFi'}
                        </p>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[8px] font-medium" style={{ background: menuPalette.surfaceMuted, color: menuPalette.text }}>
                          Kopyala
                        </span>
                      </div>
                    )}

                    {/* Kategori butonları */}
                    <div className="mt-2.5 flex gap-1.5 overflow-hidden">
                      {MENU_PREVIEW_CATEGORIES.map((category, index) => (
                        <span
                          key={category}
                          className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-semibold"
                          style={index === 0
                            ? { background: menuPreviewColor, color: menuPreviewTextColor, borderColor: menuPreviewColor }
                            : { background: menuPalette.surface, color: menuPalette.muted, borderColor: menuPalette.borderSoft }}
                        >
                          {category}
                        </span>
                      ))}
                    </div>

                    {/* Ürün kartları */}
                    <div className="mt-2.5 space-y-1.5">
                      {MENU_PREVIEW_PRODUCTS.map((product) => (
                        <div key={product.name} className="flex items-center gap-2.5 rounded-2xl border p-2 shadow-sm" style={{ borderColor: menuPalette.borderSoft, background: menuPalette.surface }}>
                          <MenuPreviewProductImage image={product.image} name={product.name} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-bold" style={{ color: menuPalette.text }}>{product.name}</p>
                            <p className="truncate text-[9px]" style={{ color: menuPalette.muted }}>{product.desc}</p>
                            <p className="mt-0.5 text-[11px] font-bold" style={{ color: menuPreviewDark ? menuPalette.primarySoftForeground : menuPreviewColor }}>₺{product.price}</p>
                          </div>
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow" style={{ background: menuPreviewColor, color: menuPreviewTextColor }}>
                            +
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Sosyal medya / iletişim */}
                    {previewSocialIcons.length > 0 && (
                      <div className="mt-2 flex items-center justify-center gap-1.5">
                        {previewSocialIcons.map(({ key, Icon }) => (
                          <span key={key} className="flex h-6 w-6 items-center justify-center rounded-full border shadow-sm" style={{ background: menuPalette.surface, borderColor: menuPalette.borderSoft, color: menuPalette.text }}>
                            <Icon size={10} />
                          </span>
                        ))}
                        {previewContactLinks.review && (
                          <span className="flex h-6 items-center gap-1 rounded-full px-2 text-[8px] font-bold shadow-sm" style={{ background: menuPreviewColor, color: menuPreviewTextColor }}>
                            <Star size={9} fill="currentColor" />
                            Puan Ver
                          </span>
                        )}
                      </div>
                    )}

                    {/* Alt aksiyonlar: sepet + garson çağır + hesap iste */}
                    <div className="mt-auto flex gap-1.5 pt-2.5">
                      <span
                        className="flex flex-1 items-center justify-between rounded-xl px-3 py-2.5 text-[10px] font-bold"
                        style={{ background: menuPreviewColor, color: menuPreviewTextColor, boxShadow: `0 8px 18px ${withAlpha(menuPreviewColor, 0.3)}` }}
                      >
                        <span className="flex items-center gap-1">
                          <ShoppingBag size={11} />
                          Sipariş Ver ({previewCartCount})
                        </span>
                        <span>₺{previewCartTotal}</span>
                      </span>
                      <span className="flex shrink-0 items-center justify-center rounded-xl border px-2.5" style={{ borderColor: menuPalette.borderSoft, color: menuPalette.text, background: menuPalette.surface }} title="Garson Çağır">
                        <UtensilsCrossed size={13} />
                      </span>
                      <span className="flex shrink-0 items-center justify-center rounded-xl border px-2.5" style={{ borderColor: menuPalette.borderSoft, color: menuPalette.text, background: menuPalette.surface }} title="Hesap İste">
                        <Receipt size={13} />
                      </span>
                    </div>

                    {/* Footer */}
                    <p className="mt-2 text-center text-[7px] font-semibold uppercase tracking-[0.22em]" style={{ color: menuPalette.muted, opacity: 0.8 }}>
                      Nerox Studio
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-gray-400">
              Renk ve görünüm modu değişiklikleri önizlemeye anında yansır; kaydedince QR menüde yayınlanır.
            </p>
          </div>
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

function MenuPreviewProductImage({ image, name }: { image: string; name: string }) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl"
      style={{ background: 'linear-gradient(160deg, #e9e1d2 0%, #c9b998 100%)' }}
    >
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-sm font-bold text-white">{name.charAt(0)}</span>
      )}
    </div>
  )
}

function ProductImagePreview({ image, name, className }: { image?: string; name: string; className: string }) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const showImage = !!image && failedImage !== image

  return (
    <div className={`${className} flex shrink-0 items-center justify-center overflow-hidden bg-gray-100`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailedImage(image)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-100">
          <ImageIcon size={18} className="text-gray-300" />
        </div>
      )}
    </div>
  )
}
