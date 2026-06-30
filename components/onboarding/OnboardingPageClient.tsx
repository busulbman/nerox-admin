'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getDocs } from 'firebase/firestore'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CircleCheckBig,
  ImageUp,
  LoaderCircle,
  MapPinned,
  Package,
  Palette,
  Phone,
  ShieldCheck,
  Store,
  Table2,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { useRestaurantSettings } from '@/hooks/useRestaurantSettings'
import { normalizeTable } from '@/lib/firestore-models'
import { getRestaurantTablesQuery } from '@/lib/firestore-queries'
import {
  clearRecentOnboardingCompletion,
  hasRecentOnboardingCompletion,
  rememberOnboardingCompletion,
} from '@/lib/onboarding'
import { DEFAULT_PRIMARY_COLOR, isValidRestaurantThemeColor } from '@/lib/restaurant-settings'

const IMGBB_API_KEY = process.env.NEXT_PUBLIC_IMGBB_API_KEY || ''

const THEME_PRESET_COLORS = ['#7c3aed', '#6d28d9', '#9333ea', '#4f46e5', '#0f766e'] as const

const STEPS = [
  {
    key: 'business',
    title: 'İşletme bilgileri',
    description: 'Temel işletme profilini doğrulayın.',
    icon: Building2,
  },
  {
    key: 'branding',
    title: 'Marka ayarları',
    description: 'Logo ve tema rengini belirleyin.',
    icon: Palette,
  },
  {
    key: 'tables',
    title: 'Masa kurulumu',
    description: 'Toplam masa sayısını tanımlayın.',
    icon: Table2,
  },
  {
    key: 'menu',
    title: 'İlk kategori ve ürün',
    description: 'İsterseniz ilk menü verilerini ekleyin.',
    icon: Package,
  },
  {
    key: 'complete',
    title: 'Tamamla',
    description: 'Kurulumu gözden geçirip hesabı açın.',
    icon: CircleCheckBig,
  },
] as const

type OnboardingFormState = {
  businessName: string
  phone: string
  city: string
  district: string
  logoUrl: string
  primaryColor: string
  tablesCount: string
  categoryName: string
  productName: string
  productDescription: string
  productPrice: string
}

type FeedbackMessage = {
  tone: 'error' | 'success' | 'info'
  text: string
}

const INITIAL_FORM: OnboardingFormState = {
  businessName: '',
  phone: '',
  city: '',
  district: '',
  logoUrl: '',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  tablesCount: '1',
  categoryName: '',
  productName: '',
  productDescription: '',
  productPrice: '',
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function parsePrice(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return Number.NaN

  return Number.parseFloat(normalized)
}

async function uploadToImgBB(file: File): Promise<string | null> {
  if (!IMGBB_API_KEY) {
    return null
  }

  const formData = new FormData()
  formData.append('image', file)

  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('ImgBB upload failed')
    }

    const payload = await response.json()
    return typeof payload.data?.url === 'string' ? payload.data.url : null
  } catch (error) {
    console.error('ImgBB upload error:', error)
    return null
  }
}

export default function OnboardingPageClient() {
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<OnboardingFormState>(INITIAL_FORM)
  const [message, setMessage] = useState<FeedbackMessage | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [skipInitialMenu, setSkipInitialMenu] = useState(false)
  const [existingTableCount, setExistingTableCount] = useState(0)

  const initializedRestaurantId = useRef<string | null>(null)

  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const restaurantId = profile?.role === 'admin' ? profile.restaurantId || '' : ''
  const { settings, restaurant, loading: restaurantLoading } = useRestaurantSettings(restaurantId || null)
  const hasCompletionOverride = hasRecentOnboardingCompletion(restaurantId)

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      router.replace('/login')
      return
    }

    if (profile?.role === 'super_admin') {
      router.replace('/super-admin')
      return
    }

    if (profile?.role === 'waiter') {
      router.replace('/waiter')
      return
    }

    if (!restaurantId || restaurantLoading) return

    if (restaurant?.onboardingCompleted === true) {
      clearRecentOnboardingCompletion(restaurantId)
      router.replace('/dashboard')
      return
    }

    if (hasCompletionOverride) {
      router.replace('/dashboard')
    }
  }, [
    authLoading,
    hasCompletionOverride,
    profile?.role,
    restaurant?.onboardingCompleted,
    restaurantId,
    restaurantLoading,
    router,
    user,
  ])

  useEffect(() => {
    if (!restaurantId || restaurantLoading || initializedRestaurantId.current === restaurantId) {
      return
    }

    initializedRestaurantId.current = restaurantId
    setForm({
      businessName: settings.businessName || restaurant?.name || '',
      phone: restaurant?.phone || profile?.phone || '',
      city: restaurant?.city || '',
      district: restaurant?.district || '',
      logoUrl: settings.logoUrl || restaurant?.logoUrl || '',
      primaryColor: settings.primaryColor || restaurant?.primaryColor || DEFAULT_PRIMARY_COLOR,
      tablesCount: '1',
      categoryName: '',
      productName: '',
      productDescription: '',
      productPrice: '',
    })

    let active = true

    void (async () => {
      try {
        const tablesSnap = await getDocs(getRestaurantTablesQuery(restaurantId, 200))
        if (!active) return

        const tableNumbers = tablesSnap.docs
          .map((tableDoc) => normalizeTable(tableDoc.id, tableDoc.data() as Record<string, unknown>).number)
          .filter((tableNumber) => tableNumber > 0)

        const detectedTableCount = tableNumbers.length > 0 ? Math.max(tableNumbers.length, ...tableNumbers) : 1

        setExistingTableCount(tableNumbers.length)
        setForm((current) => ({
          ...current,
          tablesCount: String(detectedTableCount),
        }))
      } catch (error) {
        console.error('Onboarding tables preload error:', error)
        if (active) {
          setExistingTableCount(0)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [
    profile?.phone,
    restaurant?.city,
    restaurant?.district,
    restaurant?.logoUrl,
    restaurant?.name,
    restaurant?.phone,
    restaurant?.primaryColor,
    restaurantId,
    restaurantLoading,
    settings.businessName,
    settings.logoUrl,
    settings.primaryColor,
  ])

  function updateFormField<Key extends keyof OnboardingFormState>(field: Key, value: OnboardingFormState[Key]) {
    if (field === 'categoryName' || field === 'productName' || field === 'productDescription' || field === 'productPrice') {
      setSkipInitialMenu(false)
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function getBusinessStepError() {
    if (!form.businessName.trim()) return 'İşletme adı gerekli.'
    if (!form.phone.trim()) return 'Telefon gerekli.'
    if (!form.city.trim()) return 'Şehir gerekli.'
    if (!form.district.trim()) return 'İlçe gerekli.'
    return ''
  }

  function getBrandStepError() {
    const colorValue = form.primaryColor.trim() || DEFAULT_PRIMARY_COLOR
    if (!isValidRestaurantThemeColor(colorValue)) {
      return 'Tema rengi geçerli bir hex renk olmalı. Örnek: #7c3aed'
    }

    return ''
  }

  function getTablesStepError() {
    const tableCount = parsePositiveInteger(form.tablesCount)
    if (!Number.isFinite(tableCount) || tableCount < 1 || tableCount > 200) {
      return 'Masa sayısı 1 ile 200 arasında olmalı.'
    }

    return ''
  }

  function getMenuStepError() {
    if (skipInitialMenu) return ''

    const hasAnyMenuField = Boolean(
      form.categoryName.trim()
      || form.productName.trim()
      || form.productDescription.trim()
      || form.productPrice.trim(),
    )

    if (!hasAnyMenuField) return ''
    if (!form.categoryName.trim()) return 'İlk ürün için kategori adı gerekli.'
    if (!form.productName.trim()) return 'İlk ürün adı gerekli.'

    const parsedPrice = parsePrice(form.productPrice)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return 'İlk ürün fiyatı geçerli bir sayı olmalı.'
    }

    return ''
  }

  function getCurrentStepError(index: number) {
    if (index === 0) return getBusinessStepError()
    if (index === 1) return getBrandStepError()
    if (index === 2) return getTablesStepError()
    if (index === 3) return getMenuStepError()
    return ''
  }

  function getSubmissionError() {
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const currentError = getCurrentStepError(index)
      if (currentError) return currentError
    }

    return ''
  }

  function handleNextStep() {
    const currentError = getCurrentStepError(stepIndex)
    if (currentError) {
      setMessage({ tone: 'error', text: currentError })
      return
    }

    setMessage(null)
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1))
  }

  function handlePreviousStep() {
    setMessage(null)
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  function handleSkipMenuStep() {
    setSkipInitialMenu(true)
    setMessage({ tone: 'info', text: 'İlk kategori ve ürün adımı atlandı. Bu alanları daha sonra dashboard üzerinden ekleyebilirsiniz.' })
    setStepIndex(STEPS.length - 1)
  }

  async function handleLogoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage({ tone: 'error', text: 'Lütfen bir görsel dosyası seçin.' })
      return
    }

    if (file.size > 32 * 1024 * 1024) {
      setMessage({ tone: 'error', text: 'Dosya boyutu 32MB altında olmalı.' })
      return
    }

    setUploading(true)
    setMessage(null)

    const uploadedUrl = await uploadToImgBB(file)

    if (!uploadedUrl) {
      setMessage({
        tone: 'error',
        text: IMGBB_API_KEY
          ? 'Logo yüklenemedi. İsterseniz URL alanını kullanarak devam edin.'
          : 'Logo yükleme altyapısı tanımlı değil. İsterseniz URL alanını kullanarak devam edin.',
      })
    } else {
      updateFormField('logoUrl', uploadedUrl)
      setMessage({ tone: 'success', text: 'Logo yüklendi.' })
    }

    setUploading(false)
    event.target.value = ''
  }

  async function handleSubmit() {
    if (!user || !restaurantId) return
    if (submitting) return

    const validationError = getSubmissionError()
    if (validationError) {
      setMessage({ tone: 'error', text: validationError })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const token = await user.getIdToken()
      const payload = {
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        district: form.district.trim(),
        logoUrl: form.logoUrl.trim(),
        primaryColor: form.primaryColor.trim() || DEFAULT_PRIMARY_COLOR,
        tablesCount: parsePositiveInteger(form.tablesCount),
        categoryName: skipInitialMenu ? '' : form.categoryName.trim(),
        productName: skipInitialMenu ? '' : form.productName.trim(),
        productDescription: skipInitialMenu ? '' : form.productDescription.trim(),
        productPrice: skipInitialMenu ? '' : form.productPrice.trim(),
      }

      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const responseBody = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setMessage({ tone: 'error', text: responseBody?.error || 'Kurulum tamamlanamadı.' })
        return
      }

      rememberOnboardingCompletion(restaurantId)
      router.replace('/dashboard')
    } catch (error) {
      console.error('Onboarding submit error:', error)
      setMessage({ tone: 'error', text: 'Kurulum gönderilemedi. Lütfen tekrar deneyin.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || (user && profile?.role === 'admin' && restaurantLoading)) {
    return (
      <main className="relative flex min-h-[100svh] items-center justify-center overflow-x-clip bg-[#05010d] text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 top-[-18rem] h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(135,87,255,0.28),_transparent_58%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
        </div>
        <div className="relative flex items-center gap-3 rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm text-white/78 backdrop-blur-xl">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Kurulum ekranı hazırlanıyor...
        </div>
      </main>
    )
  }

  if (!user) return null
  if (profile?.role === 'super_admin' || profile?.role === 'waiter') return null

  if (!restaurantId) {
    return (
      <main className="relative flex min-h-[100svh] items-center justify-center overflow-x-clip bg-[#05010d] px-5 text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 top-[-18rem] h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(135,87,255,0.28),_transparent_58%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
        </div>
        <div className="relative w-full max-w-lg rounded-[2rem] border border-white/12 bg-[#090313]/88 p-8 shadow-[0_30px_120px_rgba(6,3,14,0.48)] backdrop-blur-2xl">
          <p className="text-lg font-semibold text-white">İşletme hesabı bulunamadı.</p>
          <p className="mt-2 text-sm leading-6 text-white/62">
            Kullanıcı profilinizde restaurantId tanımlı değil. Lütfen giriş hesabınızı kontrol edin.
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-white/20 hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Giriş sayfasına dön
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const activeStep = STEPS[stepIndex]
  const ActiveStepIcon = activeStep.icon
  const previewColor = form.primaryColor.trim() || DEFAULT_PRIMARY_COLOR
  const parsedTablesCount = parsePositiveInteger(form.tablesCount)
  const themeIsValid = isValidRestaurantThemeColor(previewColor)

  return (
    <main className="relative min-h-[100svh] overflow-x-clip bg-[#05010d] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-[-18rem] h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(135,87,255,0.28),_transparent_58%)]" />
        <div className="absolute right-[-8rem] top-24 h-80 w-80 rounded-full bg-[#5f1ae5]/20 blur-3xl" />
        <div className="absolute left-[-6rem] bottom-8 h-72 w-72 rounded-full bg-[#a855f7]/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col px-5 py-4 sm:px-8 sm:py-5 lg:min-h-screen lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:rounded-full">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-white/90">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xs tracking-[0.2em] text-white">
              NEROX
            </span>
            <span className="hidden sm:inline">Nerox Studio</span>
          </Link>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/30 bg-[#11061f]/80 px-4 py-2 text-sm font-medium text-[#d8c3ff]">
            <ShieldCheck className="h-4 w-4" />
            Temel kurulum
          </div>
        </header>

        <div className="grid gap-6 py-6 sm:gap-8 sm:py-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start lg:py-10">
          <section className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[#d8c3ff]">
                <ActiveStepIcon className="h-3.5 w-3.5" />
                Adım {stepIndex + 1} / {STEPS.length}
              </div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
                İşletmenizi canlıya almadan önce temel kurulumu tamamlayın
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/68 sm:text-lg">
                İlk girişte boş dashboard yerine temel bilgiler, marka ayarları, masa düzeni ve isterseniz ilk menü
                girdileriyle başlayın.
              </p>
            </div>

            <div className="grid gap-3">
              {STEPS.map((step, index) => {
                const StepIcon = step.icon
                const isActive = index === stepIndex
                const isCompleted = index < stepIndex

                return (
                  <div
                    key={step.key}
                    className={`rounded-[1.5rem] border px-4 py-4 transition ${
                      isActive
                        ? 'border-[#7c3aed]/40 bg-[#12071f]/88 shadow-[0_24px_80px_rgba(76,29,149,0.22)]'
                        : 'border-white/10 bg-white/6'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                          isCompleted
                            ? 'bg-[#7c3aed] text-white'
                            : isActive
                              ? 'bg-[#7c3aed]/18 text-[#d8c3ff]'
                              : 'bg-white/6 text-white/56'
                        }`}
                      >
                        {isCompleted ? <CircleCheckBig className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{step.title}</p>
                        <p className="mt-1 text-sm leading-6 text-white/58">{step.description}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="rounded-[1.6rem] border border-white/10 bg-white/6 p-5 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">Kurulum özeti</p>
              <div className="mt-4 grid gap-3 text-sm text-white/68">
                <div className="flex items-center gap-3">
                  <Store className="h-4 w-4 text-[#d8c3ff]" />
                  <span>{form.businessName.trim() || 'İşletme adı girilmedi'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-[#d8c3ff]" />
                  <span>{form.phone.trim() || 'Telefon girilmedi'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPinned className="h-4 w-4 text-[#d8c3ff]" />
                  <span>
                    {(form.city.trim() || 'Şehir') + (form.district.trim() ? ` / ${form.district.trim()}` : '')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Palette className="h-4 w-4 text-[#d8c3ff]" />
                  <span>{previewColor}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Table2 className="h-4 w-4 text-[#d8c3ff]" />
                  <span>{Number.isFinite(parsedTablesCount) ? `${parsedTablesCount} masa kurulacak` : 'Masa sayısı bekleniyor'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-[#d8c3ff]" />
                  <span>
                    {skipInitialMenu
                      ? 'İlk kategori ve ürün atlanacak'
                      : form.categoryName.trim()
                        ? `${form.categoryName.trim()} kategorisi hazırlanacak`
                        : 'İlk kategori ve ürün opsiyonel'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="w-full rounded-[2rem] border border-white/12 bg-white/10 p-2 shadow-[0_30px_120px_rgba(6,3,14,0.48)] backdrop-blur-2xl">
            <div className="rounded-[1.65rem] border border-white/10 bg-[#090313]/88 p-5 sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d8c3ff]">{activeStep.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/60">{activeStep.description}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
                  <ActiveStepIcon className="h-5 w-5" />
                </div>
              </div>

              {message && (
                <div
                  className={`mb-6 rounded-[1.2rem] border px-4 py-3 text-sm ${
                    message.tone === 'error'
                      ? 'border-red-400/22 bg-red-500/10 text-red-200'
                      : message.tone === 'success'
                        ? 'border-emerald-400/22 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/12 bg-white/6 text-white/72'
                  }`}
                >
                  {message.text}
                </div>
              )}

              {stepIndex === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-white/82">İşletme adı</label>
                    <input
                      type="text"
                      value={form.businessName}
                      onChange={(event) => updateFormField('businessName', event.target.value)}
                      className="theme-input"
                      placeholder="Local People Coffee"
                      autoComplete="organization"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/82">Telefon</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) => updateFormField('phone', event.target.value)}
                      className="theme-input"
                      placeholder="0555 555 55 55"
                      autoComplete="tel"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/82">Şehir</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(event) => updateFormField('city', event.target.value)}
                      className="theme-input"
                      placeholder="İstanbul"
                      autoComplete="address-level2"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-white/82">İlçe</label>
                    <input
                      type="text"
                      value={form.district}
                      onChange={(event) => updateFormField('district', event.target.value)}
                      className="theme-input"
                      placeholder="Kadıköy"
                      autoComplete="address-level3"
                    />
                  </div>
                </div>
              )}

              {stepIndex === 1 && (
                <div className="space-y-5">
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div
                        className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/6"
                        style={
                          form.logoUrl.trim()
                            ? {
                                backgroundImage: `url(${form.logoUrl.trim()})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                              }
                            : undefined
                        }
                      >
                        {!form.logoUrl.trim() && <ImageUp className="h-7 w-7 text-white/36" />}
                      </div>

                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">Logo yükleme</p>
                        <p className="mt-1 text-sm leading-6 text-white/58">
                          Logo opsiyonel. Yükleme aracı aktif değilse URL alanını kullanarak devam edebilirsiniz.
                        </p>
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-white/20 hover:bg-white/10">
                        {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                        {uploading ? 'Yükleniyor' : 'Logo Yükle'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/82">Logo URL</label>
                    <input
                      type="url"
                      value={form.logoUrl}
                      onChange={(event) => updateFormField('logoUrl', event.target.value)}
                      className="theme-input"
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/82">Tema rengi</label>
                    <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                      <input
                        type="text"
                        value={form.primaryColor}
                        onChange={(event) => updateFormField('primaryColor', event.target.value)}
                        className="theme-input"
                        placeholder="#7c3aed"
                      />
                      <div className="flex flex-wrap gap-2">
                        {THEME_PRESET_COLORS.map((colorValue) => {
                          const isActive = (form.primaryColor.trim() || DEFAULT_PRIMARY_COLOR).toLowerCase() === colorValue

                          return (
                            <button
                              key={colorValue}
                              type="button"
                              onClick={() => updateFormField('primaryColor', colorValue)}
                              className={`h-11 w-11 rounded-2xl border transition ${
                                isActive ? 'border-white/70 shadow-[0_0_0_3px_rgba(255,255,255,0.12)]' : 'border-white/10'
                              }`}
                              style={{ backgroundColor: colorValue }}
                              aria-label={`Tema rengi ${colorValue}`}
                            />
                          )
                        })}
                      </div>
                    </div>
                    <div className="mt-3 rounded-[1.2rem] border border-white/10 bg-white/6 p-4">
                      <div className="flex items-center justify-between gap-3 rounded-[1rem] px-4 py-3" style={{ backgroundColor: previewColor }}>
                        <span style={{ color: '#ffffff' }}>{form.businessName.trim() || 'İşletme adı'}</span>
                        <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: '#ffffff' }}>
                          Önizleme
                        </span>
                      </div>
                      {!themeIsValid && (
                        <p className="mt-3 text-sm text-red-200">Hex formatı kullanın. Örnek: #7c3aed</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {stepIndex === 2 && (
                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/82">Kaç masa var?</label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={form.tablesCount}
                      onChange={(event) => updateFormField('tablesCount', event.target.value)}
                      className="theme-input"
                      placeholder="10"
                    />
                  </div>

                  <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4 text-sm leading-6 text-white/62">
                    {existingTableCount > 0 ? (
                      <p>
                        Mevcut tenant içinde {existingTableCount} masa bulundu. Gönderdiğiniz sayı daha yüksekse eksik
                        masalar tamamlanır, mevcut masalar duplicate oluşturulmaz.
                      </p>
                    ) : (
                      <p>
                        İlk kurulumda mevcut masa kaydı yoksa 1&apos;den başlayarak yeni masa dokümanları oluşturulur.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {stepIndex === 3 && (
                <div className="space-y-5">
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4 text-sm leading-6 text-white/62">
                    Bu adım opsiyonel. İsterseniz ilk kategori ve ilk ürünü şimdi ekleyin, isterseniz dashboard üzerinden
                    daha sonra devam edin.
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-white/82">İlk kategori adı</label>
                    <input
                      type="text"
                      value={form.categoryName}
                      onChange={(event) => updateFormField('categoryName', event.target.value)}
                      className="theme-input"
                      placeholder="Kahveler"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-white/82">İlk ürün adı</label>
                      <input
                        type="text"
                        value={form.productName}
                        onChange={(event) => updateFormField('productName', event.target.value)}
                        className="theme-input"
                        placeholder="Flat White"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-white/82">Fiyat</label>
                      <input
                        type="text"
                        value={form.productPrice}
                        onChange={(event) => updateFormField('productPrice', event.target.value)}
                        className="theme-input"
                        placeholder="145"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-white/82">Açıklama</label>
                      <textarea
                        value={form.productDescription}
                        onChange={(event) => updateFormField('productDescription', event.target.value)}
                        className="theme-input min-h-28 resize-y"
                        placeholder="İki shot espresso ve mikro köpük."
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSkipMenuStep}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-white/20 hover:bg-white/10"
                  >
                    Şimdilik atla
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {stepIndex === 4 && (
                <div className="space-y-5">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
                    <p className="text-base font-semibold text-white">Kurulum sonunda yapılacaklar</p>
                    <div className="mt-4 grid gap-3 text-sm leading-6 text-white/68">
                      <div className="flex items-start gap-3">
                        <CircleCheckBig className="mt-0.5 h-4 w-4 text-[#d8c3ff]" />
                        <span>restaurants/{restaurantId} dokümanında temel alanlar ve onboardingCompleted değeri güncellenecek.</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <CircleCheckBig className="mt-0.5 h-4 w-4 text-[#d8c3ff]" />
                        <span>settings/general içinde marka bilgileri ve slug bilgisi güncellenecek.</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <CircleCheckBig className="mt-0.5 h-4 w-4 text-[#d8c3ff]" />
                        <span>
                          {Number.isFinite(parsedTablesCount)
                            ? `1 ile ${parsedTablesCount} arasındaki eksik masa kayıtları tamamlanacak.`
                            : 'Masa sayısı doğrulanınca eksik kayıtlar tamamlanacak.'}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <CircleCheckBig className="mt-0.5 h-4 w-4 text-[#d8c3ff]" />
                        <span>
                          {skipInitialMenu || !form.categoryName.trim()
                            ? 'İlk kategori ve ürün bu turda eklenmeyecek.'
                            : `İlk kategori olarak "${form.categoryName.trim()}" ve ilk ürün olarak "${form.productName.trim() || 'ürün'}" eklenecek.`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border border-[#7c3aed]/24 bg-[#12071f]/88 p-4 text-sm leading-6 text-white/70">
                    Kurulum tamamlandıktan sonra kullanıcı doğrudan dashboard&apos;a yönlendirilir. Bundan sonraki
                    girişlerde incomplete onboarding kontrolü devreden çıkar.
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handlePreviousStep}
                    disabled={stepIndex === 0 || submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/88 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Geri
                  </button>
                </div>

                {stepIndex < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="theme-button-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold sm:w-auto"
                  >
                    Devam et
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="theme-button-primary inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                  >
                    {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleCheckBig className="h-4 w-4" />}
                    {submitting ? 'Kurulum tamamlanıyor' : 'Kurulumu Tamamla'}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
