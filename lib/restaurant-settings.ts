import type { MenuThemeMode, Restaurant, RestaurantGeneralSettings, RestaurantPlan, RestaurantStatus } from '@/lib/types'
import { DEFAULT_TABLE_SESSION_DURATION_MINUTES, resolveTableSessionDurationMinutes } from '@/lib/table-session'

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const DAY_IN_MS = 24 * 60 * 60 * 1000

export const DEFAULT_BUSINESS_NAME = 'İşletme'
export const DEFAULT_PRIMARY_COLOR = '#7c3aed'
export const DEFAULT_ACCENT_COLOR = '#ddd6fe'
export const DEFAULT_BRAND_LOGO_PATH = '/NeroxLogo.png'

export const EMPTY_RESTAURANT_GENERAL_SETTINGS: RestaurantGeneralSettings = {
  businessName: '',
  slug: '',
  logoUrl: '',
  primaryColor: '',
  panelPrimaryColor: '',
  menuPrimaryColor: '',
  wifiEnabled: false,
  wifiName: '',
  wifiPassword: '',
  tableSessionDurationMinutes: DEFAULT_TABLE_SESSION_DURATION_MINUTES,
  instagramUrl: '',
  whatsappNumber: '',
  phoneNumber: '',
  googleMapsUrl: '',
  googleReviewUrl: '',
  websiteUrl: '',
  menuThemeMode: 'system',
  updatedAt: null,
}

export function normalizeMenuThemeMode(value: unknown): MenuThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis()
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }
  return null
}

function normalizeRestaurantStatus(value: unknown): RestaurantStatus {
  if (value === 'passive') return 'passive'
  if (value === 'deleted') return 'deleted'
  return 'active'
}

export function normalizeRestaurantPlan(value: unknown): RestaurantPlan {
  if (value === 'pro') return 'pro'
  if (value === 'premium') return 'premium'
  return 'starter'
}

export function isValidRestaurantThemeColor(value: string) {
  return HEX_COLOR_PATTERN.test(value.trim())
}

export function generateSlug(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .trim()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 50
}

export function getUniqueRestaurantSlug(
  businessName: string,
  restaurants: Array<{ id: string; slug?: string | null }>,
  currentRestaurantId?: string | null
) {
  const baseSlug = generateSlug(businessName) || 'isletme'
  const takenSlugs = new Set(
    restaurants
      .filter((restaurant) => restaurant.id !== currentRestaurantId)
      .map((restaurant) => restaurant.slug?.trim().toLowerCase())
      .filter((slug): slug is string => Boolean(slug))
  )

  if (!takenSlugs.has(baseSlug)) return baseSlug

  let index = 2
  let nextSlug = `${baseSlug}-${index}`
  while (takenSlugs.has(nextSlug)) {
    index += 1
    nextSlug = `${baseSlug}-${index}`
  }

  return nextSlug
}

export function normalizeRestaurantGeneralSettings(value: unknown): RestaurantGeneralSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_RESTAURANT_GENERAL_SETTINGS }
  }

  const data = value as Record<string, unknown>
  const businessName = typeof data.businessName === 'string' ? data.businessName.trim() : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim().toLowerCase() : ''
  const logoUrl = typeof data.logoUrl === 'string' ? data.logoUrl.trim() : ''
  const normalizeThemeColor = (colorValue: unknown) =>
    typeof colorValue === 'string' && isValidRestaurantThemeColor(colorValue) ? colorValue.trim() : ''
  const primaryColor = normalizeThemeColor(data.primaryColor)
  const panelPrimaryColor = normalizeThemeColor(data.panelPrimaryColor)
  const menuPrimaryColor = normalizeThemeColor(data.menuPrimaryColor)
  const wifiEnabled = data.wifiEnabled === true
  const wifiName = typeof data.wifiName === 'string' ? data.wifiName.trim() : ''
  const wifiPassword = typeof data.wifiPassword === 'string' ? data.wifiPassword : ''
  const tableSessionDurationMinutes = resolveTableSessionDurationMinutes({
    tableSessionDurationMinutes:
      typeof data.tableSessionDurationMinutes === 'number' ? data.tableSessionDurationMinutes : undefined,
  })

  return {
    businessName,
    slug,
    logoUrl,
    primaryColor,
    panelPrimaryColor,
    menuPrimaryColor,
    wifiEnabled,
    wifiName,
    wifiPassword,
    tableSessionDurationMinutes,
    instagramUrl: typeof data.instagramUrl === 'string' ? data.instagramUrl.trim() : '',
    whatsappNumber: typeof data.whatsappNumber === 'string' ? data.whatsappNumber.trim() : '',
    phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '',
    googleMapsUrl: typeof data.googleMapsUrl === 'string' ? data.googleMapsUrl.trim() : '',
    googleReviewUrl: typeof data.googleReviewUrl === 'string' ? data.googleReviewUrl.trim() : '',
    websiteUrl: typeof data.websiteUrl === 'string' ? data.websiteUrl.trim() : '',
    menuThemeMode: normalizeMenuThemeMode(data.menuThemeMode),
    updatedAt: toMillis(data.updatedAt),
  }
}

export function normalizeRestaurantDocument(value: unknown, id = ''): Restaurant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      id,
      name: '',
      slug: '',
      logoUrl: '',
      primaryColor: '',
      status: 'active',
      plan: 'starter',
      trialStartedAt: null,
      trialEndsAt: null,
      subscriptionExpiresAt: null,
      createdAt: null,
      updatedAt: null,
      phone: '',
      ownerUid: '',
      ownerName: '',
      ownerEmail: '',
      businessType: '',
      city: '',
      district: '',
      onboardingCompleted: false,
      adminEmail: '',
    }
  }

  const data = value as Record<string, unknown>
  return {
    id,
    name: typeof data.name === 'string' ? data.name.trim() : '',
    slug: typeof data.slug === 'string' ? data.slug.trim().toLowerCase() : '',
    logoUrl: typeof data.logoUrl === 'string' ? data.logoUrl.trim() : '',
    primaryColor:
      typeof data.primaryColor === 'string' && isValidRestaurantThemeColor(data.primaryColor)
        ? data.primaryColor.trim()
        : '',
    status: normalizeRestaurantStatus(data.status),
    plan: normalizeRestaurantPlan(typeof data.plan === 'string' ? data.plan.trim().toLowerCase() : ''),
    trialStartedAt: toMillis(data.trialStartedAt),
    trialEndsAt: toMillis(data.trialEndsAt),
    subscriptionExpiresAt: toMillis(data.subscriptionExpiresAt),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    phone: typeof data.phone === 'string' ? data.phone.trim() : '',
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid.trim() : '',
    ownerName: typeof data.ownerName === 'string' ? data.ownerName.trim() : '',
    ownerEmail: typeof data.ownerEmail === 'string' ? data.ownerEmail.trim() : '',
    businessType: typeof data.businessType === 'string' ? data.businessType.trim() : '',
    city: typeof data.city === 'string' ? data.city.trim() : '',
    district: typeof data.district === 'string' ? data.district.trim() : '',
    onboardingCompleted: data.onboardingCompleted === true,
    adminEmail: typeof data.adminEmail === 'string' ? data.adminEmail.trim() : '',
  }
}

export function mergeRestaurantGeneralSettings(
  settingsValue: unknown,
  restaurantValue?: unknown,
): RestaurantGeneralSettings {
  const settings = normalizeRestaurantGeneralSettings(settingsValue)
  const restaurant = normalizeRestaurantDocument(restaurantValue)

  // Geriye dönük uyumluluk: yeni panel/menü renkleri yoksa eski primaryColor kullanılır.
  const legacyPrimaryColor = settings.primaryColor || restaurant.primaryColor || DEFAULT_PRIMARY_COLOR

  return {
    businessName: settings.businessName || restaurant.name,
    slug: settings.slug || restaurant.slug,
    logoUrl: settings.logoUrl || restaurant.logoUrl || '',
    primaryColor: legacyPrimaryColor,
    panelPrimaryColor: settings.panelPrimaryColor || legacyPrimaryColor,
    menuPrimaryColor: settings.menuPrimaryColor || legacyPrimaryColor,
    wifiEnabled: settings.wifiEnabled ?? false,
    wifiName: settings.wifiName ?? '',
    wifiPassword: settings.wifiPassword ?? '',
    tableSessionDurationMinutes: resolveTableSessionDurationMinutes(settings),
    instagramUrl: settings.instagramUrl ?? '',
    whatsappNumber: settings.whatsappNumber ?? '',
    phoneNumber: settings.phoneNumber ?? '',
    googleMapsUrl: settings.googleMapsUrl ?? '',
    googleReviewUrl: settings.googleReviewUrl ?? '',
    websiteUrl: settings.websiteUrl ?? '',
    menuThemeMode: normalizeMenuThemeMode(settings.menuThemeMode),
    updatedAt: settings.updatedAt,
  }
}

/** İletişim linklerini tıklanabilir hedeflere çevirir; boş alanlar null döner. */
export function buildRestaurantContactLinks(
  settings: Pick<
    RestaurantGeneralSettings,
    'instagramUrl' | 'whatsappNumber' | 'phoneNumber' | 'googleMapsUrl' | 'googleReviewUrl' | 'websiteUrl'
  >,
) {
  const ensureHttps = (url?: string) => {
    const trimmed = url?.trim() ?? ''
    if (!trimmed) return null
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  }

  const whatsappDigits = (settings.whatsappNumber ?? '').replace(/\D+/g, '')
  // 05xx... yazılan Türkiye numaralarını uluslararası biçime çevir (905xx...).
  const whatsappTarget = whatsappDigits
    ? whatsappDigits.startsWith('0')
      ? `9${whatsappDigits}`
      : whatsappDigits
    : null

  const phone = (settings.phoneNumber ?? '').replace(/[^\d+]+/g, '')

  return {
    instagram: ensureHttps(settings.instagramUrl),
    whatsapp: whatsappTarget ? `https://wa.me/${whatsappTarget}` : null,
    phone: phone ? `tel:${phone}` : null,
    maps: ensureHttps(settings.googleMapsUrl),
    review: ensureHttps(settings.googleReviewUrl),
    website: ensureHttps(settings.websiteUrl),
  }
}

export function isRestaurantSubscriptionExpired(
  restaurant: Pick<Restaurant, 'subscriptionExpiresAt'> | null | undefined,
  now = Date.now(),
) {
  return typeof restaurant?.subscriptionExpiresAt === 'number' && restaurant.subscriptionExpiresAt < now
}

export function getRestaurantAccessBlockMessage(
  restaurant: Pick<Restaurant, 'status' | 'subscriptionExpiresAt'> | null | undefined,
  now = Date.now(),
) {
  if (!restaurant) return null
  if (restaurant.status === 'passive') return 'Aboneliğiniz pasif.'
  if (isRestaurantSubscriptionExpired(restaurant, now)) return 'Aboneliğinizin süresi dolmuş.'
  return null
}

export function getRestaurantRemainingDays(
  restaurant: Pick<Restaurant, 'subscriptionExpiresAt'> | null | undefined,
  now = Date.now(),
) {
  if (typeof restaurant?.subscriptionExpiresAt !== 'number') return null

  const diff = restaurant.subscriptionExpiresAt - now
  if (diff <= 0) return 0

  return Math.ceil(diff / DAY_IN_MS)
}

export function resolveRestaurantBusinessName(
  settings: Pick<RestaurantGeneralSettings, 'businessName'> | null | undefined
) {
  return settings?.businessName?.trim() || DEFAULT_BUSINESS_NAME
}

export function resolveRestaurantLogoUrl(
  settings: Pick<RestaurantGeneralSettings, 'logoUrl'> | null | undefined
) {
  return settings?.logoUrl?.trim() || ''
}

export function resolvePanelPrimaryColor(
  settings: Pick<RestaurantGeneralSettings, 'primaryColor' | 'panelPrimaryColor'> | null | undefined
) {
  return settings?.panelPrimaryColor || settings?.primaryColor || DEFAULT_PRIMARY_COLOR
}

export function resolveMenuPrimaryColor(
  settings: Pick<RestaurantGeneralSettings, 'primaryColor' | 'menuPrimaryColor'> | null | undefined
) {
  return settings?.menuPrimaryColor || settings?.primaryColor || DEFAULT_PRIMARY_COLOR
}

export function getContrastColor(hexColor: string): string {
  const color = hexColor.trim().replace('#', '')
  const normalized = color.length === 3 ? color.split('').map((char) => `${char}${char}`).join('') : color

  if (normalized.length !== 6) return '#ffffff'

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

  return luminance > 0.5 ? '#1a1a1a' : '#ffffff'
}

export function getThemeTextColor(colorValue: string) {
  return getContrastColor(colorValue)
}
