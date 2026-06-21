import type { RestaurantGeneralSettings } from '@/lib/types'

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const DEFAULT_BUSINESS_NAME = 'Mrs.Simone'
export const DEFAULT_PRIMARY_COLOR = '#3d2b1f'
export const DEFAULT_ACCENT_COLOR = '#d4a017'
export const DEFAULT_BRAND_LOGO_PATH = '/mrs-simone-logo.png'

export const EMPTY_RESTAURANT_GENERAL_SETTINGS: RestaurantGeneralSettings = {
  businessName: '',
  slug: '',
  logoUrl: '',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  updatedAt: null,
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

export function isValidRestaurantThemeColor(value: string) {
  return HEX_COLOR_PATTERN.test(value.trim())
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+$/.test(slug) && slug.length >= 2 && slug.length <= 30
}

export function normalizeRestaurantGeneralSettings(value: unknown): RestaurantGeneralSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_RESTAURANT_GENERAL_SETTINGS }
  }

  const data = value as Record<string, unknown>
  const businessName = typeof data.businessName === 'string' ? data.businessName.trim() : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim().toLowerCase() : ''
  const logoUrl = typeof data.logoUrl === 'string' ? data.logoUrl.trim() : ''
  const primaryColor =
    typeof data.primaryColor === 'string' && isValidRestaurantThemeColor(data.primaryColor)
      ? data.primaryColor.trim()
      : DEFAULT_PRIMARY_COLOR

  return {
    businessName,
    slug,
    logoUrl,
    primaryColor,
    updatedAt: toMillis(data.updatedAt),
  }
}

export function resolveRestaurantBusinessName(
  settings: Pick<RestaurantGeneralSettings, 'businessName'> | null | undefined
) {
  return settings?.businessName?.trim() || DEFAULT_BUSINESS_NAME
}

export function resolveRestaurantLogoUrl(
  settings: Pick<RestaurantGeneralSettings, 'logoUrl'> | null | undefined
) {
  return settings?.logoUrl?.trim() || DEFAULT_BRAND_LOGO_PATH
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
