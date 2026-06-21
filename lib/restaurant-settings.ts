import type { CSSProperties } from 'react'
import type { RestaurantGeneralSettings } from '@/lib/types'

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const DEFAULT_BUSINESS_NAME = 'Varina Chocolate'
export const DEFAULT_PRIMARY_COLOR = '#3d2b1f'
export const DEFAULT_SECONDARY_COLOR = '#d4a017'

export const EMPTY_RESTAURANT_GENERAL_SETTINGS: RestaurantGeneralSettings = {
  businessName: '',
  logoUrl: '',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
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

export function normalizeRestaurantGeneralSettings(value: unknown): RestaurantGeneralSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_RESTAURANT_GENERAL_SETTINGS }
  }

  const data = value as Record<string, unknown>
  const businessName = typeof data.businessName === 'string' ? data.businessName.trim() : ''
  const logoUrl = typeof data.logoUrl === 'string' ? data.logoUrl.trim() : ''
  const primaryColor =
    typeof data.primaryColor === 'string' && isValidRestaurantThemeColor(data.primaryColor)
      ? data.primaryColor.trim()
      : DEFAULT_PRIMARY_COLOR
  const secondaryColor =
    typeof data.secondaryColor === 'string' && isValidRestaurantThemeColor(data.secondaryColor)
      ? data.secondaryColor.trim()
      : DEFAULT_SECONDARY_COLOR

  return {
    businessName,
    logoUrl,
    primaryColor,
    secondaryColor,
    updatedAt: toMillis(data.updatedAt),
  }
}

export function resolveRestaurantBusinessName(
  settings: Pick<RestaurantGeneralSettings, 'businessName'> | null | undefined
) {
  return settings?.businessName?.trim() || DEFAULT_BUSINESS_NAME
}

export function getThemeTextColor(colorValue: string) {
  const color = colorValue.trim().replace('#', '')
  const normalized = color.length === 3 ? color.split('').map((char) => `${char}${char}`).join('') : color

  if (normalized.length !== 6) return '#ffffff'

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

  return luminance > 0.62 ? '#3d2b1f' : '#ffffff'
}

export function getRestaurantThemeStyle(settings: RestaurantGeneralSettings): CSSProperties {
  return {
    '--restaurant-primary': settings.primaryColor || DEFAULT_PRIMARY_COLOR,
    '--restaurant-primary-text': getThemeTextColor(settings.primaryColor || DEFAULT_PRIMARY_COLOR),
    '--restaurant-secondary': settings.secondaryColor || DEFAULT_SECONDARY_COLOR,
    '--restaurant-secondary-text': getThemeTextColor(settings.secondaryColor || DEFAULT_SECONDARY_COLOR),
  } as CSSProperties
}
