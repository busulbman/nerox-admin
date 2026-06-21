'use client'

import { useEffect, useState } from 'react'
import { addDoc, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { useAuth } from '@/components/AuthProvider'
import { db, rc, rd, RESTAURANT_ID } from '@/lib/firebase'
import {
  DEFAULT_MENU_DISPLAY_NAME,
  EMPTY_MENU_THEME_SETTINGS,
  getMenuPrimaryTextColor,
  isValidMenuPrimaryColor,
  normalizeMenuThemeSettings,
  resolveMenuDisplayName,
} from '@/lib/menu-theme'
import type { Category, MenuThemeSettings, Product } from '@/lib/types'

type ProdForm = { name: string; description: string; price: string; categoryId: string; available: boolean }
type MenuTab = 'products' | 'settings'

const EMPTY_PROD: ProdForm = { name: '', description: '', price: '', categoryId: '', available: true }

const BROWN = '#3d2b1f'
const GOLD = '#d4a017'

export default function MenuPage() {
  const { profile } = useAuth()
  const restaurantId = profile?.restaurantId || RESTAURANT_ID

  const [activeTab, setActiveTab] = useState<MenuTab>('products')
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const [catModal, setCatModal] = useState<{ open: boolean; editing?: Category }>({ open: false })
  const [catName, setCatName] = useState('')

  const [prodModal, setProdModal] = useState<{ open: boolean; editing?: Product }>({ open: false })
  const [prodForm, setProdForm] = useState<ProdForm>(EMPTY_PROD)

  const [settingsForm, setSettingsForm] = useState<MenuThemeSettings>(EMPTY_MENU_THEME_SETTINGS)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

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

  useEffect(() => {
    const settingsRef = doc(db, 'restaurants', restaurantId, 'settings', 'menu')

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        setSettingsForm(snapshot.exists() ? normalizeMenuThemeSettings(snapshot.data()) : { ...EMPTY_MENU_THEME_SETTINGS })
      },
      () => {
        setSettingsMessage({ tone: 'error', text: 'Menü ayarları yüklenemedi.' })
      }
    )

    return () => unsubscribe()
  }, [restaurantId])

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

  async function saveSettings() {
    const trimmedPrimaryColor = settingsForm.primaryColor.trim()

    if (trimmedPrimaryColor && !isValidMenuPrimaryColor(trimmedPrimaryColor)) {
      setSettingsMessage({ tone: 'error', text: 'Ana renk geçerli bir hex renk olmalı. Örnek: #d4a017' })
      return
    }

    setSettingsSaving(true)
    setSettingsMessage(null)

    try {
      await setDoc(
        doc(db, 'restaurants', restaurantId, 'settings', 'menu'),
        {
          displayName: settingsForm.displayName.trim(),
          logoUrl: settingsForm.logoUrl.trim(),
          primaryColor: trimmedPrimaryColor || GOLD,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      setSettingsMessage({ tone: 'success', text: 'Menü ayarları kaydedildi.' })
    } catch (error) {
      console.error('Menü ayarları kaydedilemedi:', error)
      setSettingsMessage({ tone: 'error', text: 'Menü ayarları kaydedilemedi. Lütfen tekrar deneyin.' })
    } finally {
      setSettingsSaving(false)
    }
  }

  const visibleProducts = products.filter((product) => product.categoryId === selectedCatId)
  const selectedCat = categories.find((category) => category.id === selectedCatId)
  const previewName = resolveMenuDisplayName(settingsForm)
  const previewPrimaryTextColor = getMenuPrimaryTextColor(settingsForm.primaryColor)
  const inputCls = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#d4a017] focus:ring-1 focus:ring-[#d4a017]'

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-bold text-2xl" style={{ color: BROWN }}>Menü Yönetimi</h1>
          <p className="text-gray-400 text-sm mt-0.5">Menü içerikleri ve QR menü görünümü buradan yönetilir.</p>
        </div>

        <div className="inline-flex rounded-2xl bg-white p-1.5 border border-gray-100 shadow-sm">
          <button
            onClick={() => setActiveTab('products')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={activeTab === 'products' ? { background: BROWN, color: '#fff' } : { color: '#6b7280' }}
          >
            Ürünler
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={activeTab === 'settings' ? { background: GOLD, color: BROWN } : { color: '#6b7280' }}
          >
            Ayarlar
          </button>
        </div>
      </div>

      {activeTab === 'products' ? (
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
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,540px)_minmax(0,1fr)] gap-6 items-start">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
            <h2 className="font-semibold text-lg mb-1" style={{ color: BROWN }}>QR Menü Ayarları</h2>
            <p className="text-gray-400 text-sm mb-5">Bu alan QR menü üst bilgisi ve ana vurgu rengi için kullanılır.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: BROWN }}>Görünen İşletme Adı</label>
                <input
                  className={inputCls}
                  value={settingsForm.displayName}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder={`Varsayılan: ${DEFAULT_MENU_DISPLAY_NAME}`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: BROWN }}>Logo URL</label>
                <input
                  className={inputCls}
                  value={settingsForm.logoUrl}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, logoUrl: event.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: BROWN }}>Ana Renk</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={settingsForm.primaryColor}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, primaryColor: event.target.value }))}
                    className="h-11 w-14 rounded-lg border border-gray-200 bg-white p-1 cursor-pointer"
                  />
                  <input
                    className={inputCls}
                    value={settingsForm.primaryColor}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, primaryColor: event.target.value }))}
                    placeholder="#d4a017"
                  />
                </div>
              </div>
            </div>

            {settingsMessage && (
              <div
                className="mt-5 rounded-xl px-4 py-3 text-sm"
                style={
                  settingsMessage.tone === 'success'
                    ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }
                    : { background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }
                }
              >
                {settingsMessage.text}
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button
                onClick={() => void saveSettings()}
                disabled={settingsSaving}
                className="font-semibold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
                style={{ background: settingsForm.primaryColor || GOLD, color: previewPrimaryTextColor }}
              >
                {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-3">Canlı Önizleme</p>
            <div className="rounded-[28px] overflow-hidden border border-gray-100">
              <div className="bg-[#fafafa] px-5 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    {settingsForm.logoUrl && (
                      <div className="mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={settingsForm.logoUrl}
                          alt={previewName}
                          className="h-14 w-14 rounded-2xl object-cover border border-black/5 bg-white"
                        />
                      </div>
                    )}
                    <p className="text-xl font-semibold" style={{ fontFamily: 'var(--font-playfair), serif', color: BROWN }}>
                      {previewName}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">QR menü üst başlığı</p>
                  </div>
                  <div
                    className="rounded-2xl px-4 py-3 text-sm font-semibold"
                    style={{ background: settingsForm.primaryColor || GOLD, color: previewPrimaryTextColor }}
                  >
                    Ana Renk
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    className="rounded-[20px] px-4 py-3 text-sm font-bold"
                    style={{ background: settingsForm.primaryColor || GOLD, color: previewPrimaryTextColor }}
                  >
                    Sipariş Ver
                  </button>
                  <div className="rounded-[20px] bg-white px-4 py-3 text-sm font-semibold" style={{ color: settingsForm.primaryColor || GOLD }}>
                    Vurgu Metni
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
