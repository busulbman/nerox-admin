import { DEFAULT_PRIMARY_COLOR, getContrastColor } from '@/lib/restaurant-settings'
import type { MenuThemeSettings } from '@/lib/types'

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const DEFAULT_MENU_DISPLAY_NAME = 'İşletme'
export const DEFAULT_MENU_PRIMARY_COLOR = DEFAULT_PRIMARY_COLOR
export const EMPTY_MENU_THEME_SETTINGS: MenuThemeSettings = {
  displayName: '',
  logoUrl: '',
  primaryColor: DEFAULT_MENU_PRIMARY_COLOR,
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

export function isValidMenuPrimaryColor(value: string) {
  return HEX_COLOR_PATTERN.test(value.trim())
}

export function normalizeMenuThemeSettings(value: unknown): MenuThemeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_MENU_THEME_SETTINGS }
  }

  const data = value as Record<string, unknown>
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
  const logoUrl = typeof data.logoUrl === 'string' ? data.logoUrl.trim() : ''
  const primaryColor =
    typeof data.primaryColor === 'string' && isValidMenuPrimaryColor(data.primaryColor)
      ? data.primaryColor.trim()
      : DEFAULT_MENU_PRIMARY_COLOR

  return {
    displayName,
    logoUrl,
    primaryColor,
    updatedAt: toMillis(data.updatedAt),
  }
}

export function resolveMenuDisplayName(settings: Pick<MenuThemeSettings, 'displayName'> | null | undefined) {
  return settings?.displayName?.trim() || DEFAULT_MENU_DISPLAY_NAME
}

export function getMenuPrimaryTextColor(primaryColor: string) {
  return getContrastColor(primaryColor)
}
