import type { CSSProperties } from 'react'
import {
  DEFAULT_PRIMARY_COLOR,
  getContrastColor,
  isValidRestaurantThemeColor,
} from '@/lib/restaurant-settings'

function normalizeHexColor(colorValue: string) {
  const trimmed = colorValue.trim().replace('#', '')
  if (trimmed.length === 3) {
    return trimmed
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
  }

  return trimmed
}

function hexToRgb(colorValue: string) {
  const normalized = normalizeHexColor(colorValue)

  if (normalized.length !== 6) {
    return { red: 124, green: 58, blue: 237 }
  }

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function clampChannel(channel: number) {
  return Math.max(0, Math.min(255, Math.round(channel)))
}

export function withAlpha(colorValue: string, alpha: number) {
  const { red, green, blue } = hexToRgb(colorValue)
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`
}

export function mixHexColors(firstColor: string, secondColor: string, weight = 0.5) {
  const ratio = Math.max(0, Math.min(1, weight))
  const first = hexToRgb(firstColor)
  const second = hexToRgb(secondColor)

  const red = clampChannel(first.red * (1 - ratio) + second.red * ratio)
  const green = clampChannel(first.green * (1 - ratio) + second.green * ratio)
  const blue = clampChannel(first.blue * (1 - ratio) + second.blue * ratio)

  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`
}

export function resolveThemePrimaryColor(colorValue?: string | null) {
  if (typeof colorValue === 'string' && isValidRestaurantThemeColor(colorValue)) {
    return colorValue.trim()
  }

  return DEFAULT_PRIMARY_COLOR
}

export function buildThemePalette(colorValue?: string | null) {
  const primary = resolveThemePrimaryColor(colorValue)
  const primaryForeground = getContrastColor(primary)
  const text = mixHexColors('#0f172a', primary, 0.08)

  return {
    primary,
    primarySoft: withAlpha(primary, 0.14),
    primaryForeground,
    surface: '#ffffff',
    surfaceMuted: mixHexColors(primary, '#ffffff', 0.93),
    text,
    muted: mixHexColors(text, '#ffffff', 0.42),
    borderSoft: withAlpha(primary, 0.16),
    pageBg: mixHexColors(primary, '#ffffff', 0.965),
    pageGlow: withAlpha(primary, 0.18),
  }
}

export function buildThemeStyleVars(colorValue?: string | null): CSSProperties {
  const palette = buildThemePalette(colorValue)

  return {
    '--primary': palette.primary,
    '--primary-soft': palette.primarySoft,
    '--primary-foreground': palette.primaryForeground,
    '--surface': palette.surface,
    '--surface-muted': palette.surfaceMuted,
    '--text': palette.text,
    '--muted': palette.muted,
    '--border-soft': palette.borderSoft,
    '--page-bg': palette.pageBg,
    '--page-glow': palette.pageGlow,
  } as CSSProperties
}
