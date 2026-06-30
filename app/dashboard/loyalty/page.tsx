'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import {
  CircleCheckBig,
  Gift,
  LoaderCircle,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { db } from '@/lib/firebase'
import { normalizeLoyaltyCampaign } from '@/lib/firestore-models'
import { getMenuProductsQuery, getRestaurantLoyaltyCampaignsQuery } from '@/lib/firestore-queries'
import type { LoyaltyCampaign, Product } from '@/lib/types'

type CampaignFormState = {
  name: string
  targetProductId: string
  requiredQuantity: string
  rewardProductId: string
  rewardQuantity: string
  description: string
  active: boolean
}

const EMPTY_FORM: CampaignFormState = {
  name: '',
  targetProductId: '',
  requiredQuantity: '5',
  rewardProductId: '',
  rewardQuantity: '1',
  description: '',
  active: true,
}

function buildCampaignRule(campaign: Pick<LoyaltyCampaign, 'targetProductName' | 'requiredQuantity' | 'rewardProductName' | 'rewardQuantity'>) {
  return `${campaign.requiredQuantity} adet ${campaign.targetProductName} alana ${campaign.rewardQuantity} adet ${campaign.rewardProductName} hediye`
}

function formatDate(value: number | null) {
  if (!value) return 'Belirtilmedi'
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

export default function LoyaltyPage() {
  const { profile } = useAuth()
  const restaurantId = profile?.restaurantId || ''

  const [products, setProducts] = useState<Product[]>([])
  const [campaigns, setCampaigns] = useState<LoyaltyCampaign[]>([])
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!restaurantId) return

    const unsubscribeProducts = onSnapshot(
      getMenuProductsQuery(restaurantId),
      (snapshot) => {
        const nextProducts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Product))
        setProducts(nextProducts)
      },
      (error) => {
        console.error('Loyalty products listener error:', error)
        setMessage({ tone: 'error', text: 'Ürünler yüklenemedi.' })
      },
    )

    const unsubscribeCampaigns = onSnapshot(
      getRestaurantLoyaltyCampaignsQuery(restaurantId),
      (snapshot) => {
        const nextCampaigns = snapshot.docs.map((docSnap) =>
          normalizeLoyaltyCampaign(docSnap.id, docSnap.data() as Record<string, unknown>),
        )
        setCampaigns(nextCampaigns)
        setLoading(false)
      },
      (error) => {
        console.error('Loyalty campaigns listener error:', error)
        setMessage({ tone: 'error', text: 'Kampanyalar yüklenemedi.' })
        setLoading(false)
      },
    )

    return () => {
      unsubscribeProducts()
      unsubscribeCampaigns()
    }
  }, [restaurantId])

  const productOptions = useMemo(
    () => products.map((product) => ({ id: product.id, name: product.name })),
    [products],
  )

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingCampaignId(null)
  }

  function handleChange<K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function getProductName(productId: string, fallbackName = '') {
    return productOptions.find((product) => product.id === productId)?.name || fallbackName
  }

  function startEdit(campaign: LoyaltyCampaign) {
    setEditingCampaignId(campaign.id)
    setForm({
      name: campaign.name,
      targetProductId: campaign.targetProductId,
      requiredQuantity: String(campaign.requiredQuantity),
      rewardProductId: campaign.rewardProductId,
      rewardQuantity: String(campaign.rewardQuantity),
      description: campaign.description,
      active: campaign.active,
    })
    setMessage(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!restaurantId) {
      setMessage({ tone: 'error', text: 'İşletme hesabı bulunamadı.' })
      return
    }

    const name = form.name.trim()
    const targetProductId = form.targetProductId.trim()
    const rewardProductId = form.rewardProductId.trim()
    const requiredQuantity = Number.parseInt(form.requiredQuantity, 10)
    const rewardQuantity = Number.parseInt(form.rewardQuantity, 10)
    const description = form.description.trim()

    if (!name) {
      setMessage({ tone: 'error', text: 'Kampanya adı gerekli.' })
      return
    }

    if (!targetProductId || !rewardProductId) {
      setMessage({ tone: 'error', text: 'Takip edilecek ve hediye ürünleri seçin.' })
      return
    }

    if (!Number.isFinite(requiredQuantity) || requiredQuantity < 1) {
      setMessage({ tone: 'error', text: 'Kaç adet alınca alanı en az 1 olmalı.' })
      return
    }

    if (!Number.isFinite(rewardQuantity) || rewardQuantity < 1) {
      setMessage({ tone: 'error', text: 'Hediye adet alanı en az 1 olmalı.' })
      return
    }

    const targetProductName = getProductName(targetProductId)
    const rewardProductName = getProductName(rewardProductId)

    if (!targetProductName || !rewardProductName) {
      setMessage({ tone: 'error', text: 'Seçilen ürünler bulunamadı. Lütfen tekrar seçin.' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const payload = {
        name,
        active: form.active,
        targetProductId,
        targetProductName,
        requiredQuantity,
        rewardProductId,
        rewardProductName,
        rewardQuantity,
        description,
        updatedAt: serverTimestamp(),
      }

      if (editingCampaignId) {
        await setDoc(
          doc(db, 'restaurants', restaurantId, 'loyaltyCampaigns', editingCampaignId),
          payload,
          { merge: true },
        )
        setMessage({ tone: 'success', text: 'Kampanya güncellendi.' })
      } else {
        await addDoc(collection(db, 'restaurants', restaurantId, 'loyaltyCampaigns'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
        setMessage({ tone: 'success', text: 'Kampanya oluşturuldu.' })
      }

      resetForm()
    } catch (error) {
      console.error('Loyalty campaign save error:', error)
      setMessage({ tone: 'error', text: 'Kampanya kaydedilemedi.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(campaign: LoyaltyCampaign) {
    if (!restaurantId) return
    if (!window.confirm(`"${campaign.name}" kampanyasını silmek istediğinize emin misiniz?`)) return

    setDeletingId(campaign.id)
    setMessage(null)

    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'loyaltyCampaigns', campaign.id))
      if (editingCampaignId === campaign.id) {
        resetForm()
      }
      setMessage({ tone: 'success', text: 'Kampanya silindi.' })
    } catch (error) {
      console.error('Loyalty campaign delete error:', error)
      setMessage({ tone: 'error', text: 'Kampanya silinemedi.' })
    } finally {
      setDeletingId(null)
    }
  }

  const isEditing = editingCampaignId !== null
  const submitLabel = saving
    ? 'Kaydediliyor...'
    : isEditing
      ? 'Kampanyayı Güncelle'
      : 'Kampanya Oluştur'

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Kampanyalar</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Aktif kampanyaları oluşturun ve QR menüye gelen müşteriler için kayıt akışını yönetin.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-xs font-semibold text-[var(--text)] shadow-sm">
          <Sparkles size={14} className="text-[var(--primary)]" />
          QR menüde yalnızca aktif kampanyalar gösterilir
        </div>
      </div>

      {message && (
        <div
          className="mb-6 rounded-2xl border px-4 py-3 text-sm"
          style={
            message.tone === 'success'
              ? { borderColor: 'rgba(34,197,94,0.22)', background: 'rgba(34,197,94,0.08)', color: '#166534' }
              : { borderColor: 'rgba(239,68,68,0.22)', background: 'rgba(239,68,68,0.08)', color: '#b91c1c' }
          }
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <section className="theme-card rounded-[1.75rem] p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {isEditing ? 'Kampanyayı Düzenle' : 'Yeni Kampanya'}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Örnek: Latte’den 5 adet alana 1 Latte hediye
              </p>
            </div>
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-[var(--border-soft)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text)]"
              >
                Temizle
              </button>
            )}
          </div>

          {productOptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-white px-5 py-10 text-center">
              <Gift className="mx-auto mb-3 h-9 w-9 text-[var(--primary)]" />
              <p className="font-semibold text-[var(--text)]">Henüz ürün bulunmuyor</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Kampanya oluşturmak için önce menüye en az bir ürün ekleyin.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="campaign-name" className="mb-2 block text-sm font-medium text-[var(--text)]">
                  Kampanya adı
                </label>
                <input
                  id="campaign-name"
                  value={form.name}
                  onChange={(event) => handleChange('name', event.target.value)}
                  placeholder="Örn. Latte Sadakat Kampanyası"
                  className="theme-input rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="target-product" className="mb-2 block text-sm font-medium text-[var(--text)]">
                    Takip edilecek ürün
                  </label>
                  <select
                    id="target-product"
                    value={form.targetProductId}
                    onChange={(event) => handleChange('targetProductId', event.target.value)}
                    className="theme-input rounded-xl text-sm"
                  >
                    <option value="">Ürün seçin</option>
                    {productOptions.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="required-quantity" className="mb-2 block text-sm font-medium text-[var(--text)]">
                    Kaç adet alınca?
                  </label>
                  <input
                    id="required-quantity"
                    type="number"
                    min={1}
                    value={form.requiredQuantity}
                    onChange={(event) => handleChange('requiredQuantity', event.target.value)}
                    className="theme-input rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reward-product" className="mb-2 block text-sm font-medium text-[var(--text)]">
                    Hediye ürün
                  </label>
                  <select
                    id="reward-product"
                    value={form.rewardProductId}
                    onChange={(event) => handleChange('rewardProductId', event.target.value)}
                    className="theme-input rounded-xl text-sm"
                  >
                    <option value="">Ürün seçin</option>
                    {productOptions.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="reward-quantity" className="mb-2 block text-sm font-medium text-[var(--text)]">
                    Hediye adet
                  </label>
                  <input
                    id="reward-quantity"
                    type="number"
                    min={1}
                    value={form.rewardQuantity}
                    onChange={(event) => handleChange('rewardQuantity', event.target.value)}
                    className="theme-input rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="campaign-description" className="mb-2 block text-sm font-medium text-[var(--text)]">
                  Açıklama
                </label>
                <textarea
                  id="campaign-description"
                  rows={4}
                  value={form.description}
                  onChange={(event) => handleChange('description', event.target.value)}
                  placeholder="Müşteriye gösterilecek kısa açıklama"
                  className="theme-input min-h-28 rounded-xl text-sm"
                />
              </div>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-soft)] bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Kampanya aktif olsun</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Aktif kampanyalar QR menü açıldığında müşteriye gösterilir.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => handleChange('active', event.target.checked)}
                  className="h-5 w-5 accent-[var(--primary)]"
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={saving}
                  className="theme-button-primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                >
                  {saving ? <LoaderCircle size={18} className="animate-spin" /> : <Plus size={18} />}
                  {submitLabel}
                </button>

                {isEditing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-white px-5 py-3.5 text-sm font-semibold text-[var(--text)] sm:w-auto"
                  >
                    Vazgeç
                  </button>
                )}
              </div>
            </form>
          )}
        </section>

        <section className="theme-card rounded-[1.75rem] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Kampanya Listesi</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Aktif kampanyalar QR menüde modal olarak görünür.
              </p>
            </div>
            <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--text)]">
              {campaigns.length} kampanya
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-56 items-center justify-center">
              <LoaderCircle className="h-7 w-7 animate-spin text-[var(--primary)]" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-white px-5 py-12 text-center">
              <Gift className="mx-auto mb-3 h-9 w-9 text-[var(--primary)]" />
              <p className="font-semibold text-[var(--text)]">Henüz kampanya yok</p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                İlk kampanyanızı oluşturduğunuzda burada listelenecek.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => {
                const deleting = deletingId === campaign.id
                return (
                  <article
                    key={campaign.id}
                    className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[var(--text)]">{campaign.name}</h3>
                          <span
                            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={
                              campaign.active
                                ? { background: 'rgba(34,197,94,0.10)', color: '#166534' }
                                : { background: 'rgba(148,163,184,0.14)', color: '#475569' }
                            }
                          >
                            {campaign.active ? 'Aktif' : 'Pasif'}
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-medium text-[var(--text)]">
                          Şart: {buildCampaignRule(campaign)}
                        </p>

                        <p className="mt-2 text-sm text-[var(--muted)]">
                          Hediye: {campaign.rewardQuantity} adet {campaign.rewardProductName}
                        </p>

                        {campaign.description && (
                          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{campaign.description}</p>
                        )}

                        <p className="mt-3 text-xs text-[var(--muted)]">
                          Son güncelleme: {formatDate(campaign.updatedAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(campaign)}
                          className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text)]"
                        >
                          <PencilLine size={14} />
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(campaign)}
                          disabled={deleting}
                          className="inline-flex items-center gap-2 rounded-full border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.06)] px-3 py-2 text-xs font-semibold text-[#b91c1c] disabled:opacity-60"
                        >
                          {deleting ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Sil
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-[rgba(124,58,237,0.12)] bg-[rgba(124,58,237,0.06)] px-4 py-3 text-sm text-[var(--text)]">
            <div className="flex items-start gap-3">
              <CircleCheckBig size={18} className="mt-0.5 shrink-0 text-[var(--primary)]" />
              <p>
                QR menüde modal yalnızca aktif kampanya bulunduğunda ve müşteri aynı oturumda daha önce kapatmadıysa gösterilir.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
