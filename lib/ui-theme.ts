import type { CSSProperties } from 'react'
import { DEFAULT_PRIMARY_COLOR, isValidRestaurantThemeColor } from '@/lib/restaurant-settings'

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

function rgbToHex(red: number, green: number, blue: number) {
  const r = Math.max(0, Math.min(255, Math.round(red)))
  const g = Math.max(0, Math.min(255, Math.round(green)))
  const b = Math.max(0, Math.min(255, Math.round(blue)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
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

  return rgbToHex(red, green, blue)
}

function getLuminance(colorValue: string) {
  const { red, green, blue } = hexToRgb(colorValue)
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255
}

export function getContrastColor(hexColor: string): string {
  const luminance = getLuminance(hexColor)
  return luminance > 0.55 ? '#1a1a1a' : '#ffffff'
}

export function getContrastColorSoft(hexColor: string): string {
  const luminance = getLuminance(hexColor)
  return luminance > 0.55 ? '#374151' : '#f3f4f6'
}

function adjustBrightness(colorValue: string, factor: number): string {
  const { red, green, blue } = hexToRgb(colorValue)
  return rgbToHex(
    red + (255 - red) * factor,
    green + (255 - green) * factor,
    blue + (255 - blue) * factor
  )
}

function darken(colorValue: string, factor: number): string {
  const { red, green, blue } = hexToRgb(colorValue)
  return rgbToHex(red * (1 - factor), green * (1 - factor), blue * (1 - factor))
}

export function resolveThemePrimaryColor(colorValue?: string | null) {
  if (typeof colorValue === 'string' && isValidRestaurantThemeColor(colorValue)) {
    return colorValue.trim()
  }
  return DEFAULT_PRIMARY_COLOR
}

export interface ThemePalette {
  primary: string
  primaryForeground: string
  primaryHover: string
  primaryActive: string
  primarySoft: string
  primarySoftForeground: string
  primaryBorder: string
  primaryGlow: string
  surface: string
  surfaceMuted: string
  surfaceHover: string
  text: string
  textSecondary: string
  muted: string
  border: string
  borderSoft: string
  pageBg: string
  success: string
  successForeground: string
  successSoft: string
  warning: string
  warningForeground: string
  warningSoft: string
  error: string
  errorForeground: string
  errorSoft: string
  info: string
  infoForeground: string
  infoSoft: string
}

export type ThemeMode = 'light' | 'dark'

export function buildThemePalette(colorValue?: string | null, mode: ThemeMode = 'light'): ThemePalette {
  const primary = resolveThemePrimaryColor(colorValue)
  const luminance = getLuminance(primary)
  const isLight = luminance > 0.55
  const isDark = luminance < 0.3

  const primaryForeground = getContrastColor(primary)
  const primaryHover = isDark ? adjustBrightness(primary, 0.15) : darken(primary, 0.12)
  const primaryActive = isDark ? adjustBrightness(primary, 0.08) : darken(primary, 0.18)

  const primarySoft = withAlpha(primary, isLight ? 0.18 : 0.14)
  const primarySoftForeground = isLight ? darken(primary, 0.5) : primary
  const primaryBorder = withAlpha(primary, isLight ? 0.25 : 0.2)
  const primaryGlow = withAlpha(primary, isLight ? 0.22 : 0.18)

  if (mode === 'dark') {
    // Koyu mod: yüzeyler laciverte yakın koyu tonlar; işletme rengi vurgu
    // olarak korunur ve kart/sayfa zeminlerine hafifçe karıştırılır.
    return {
      primary,
      primaryForeground,
      primaryHover,
      primaryActive,
      primarySoft: withAlpha(primary, 0.22),
      primarySoftForeground: adjustBrightness(primary, 0.35),
      primaryBorder: withAlpha(primary, 0.32),
      primaryGlow: withAlpha(primary, 0.28),
      surface: mixHexColors('#1b2230', primary, 0.05),
      surfaceMuted: mixHexColors('#151b27', primary, 0.06),
      surfaceHover: mixHexColors('#232b3b', primary, 0.06),
      text: mixHexColors('#f3f4f6', primary, 0.04),
      textSecondary: '#cbd5e1',
      muted: '#94a3b8',
      border: 'rgba(255, 255, 255, 0.08)',
      borderSoft: withAlpha(primary, 0.26),
      pageBg: mixHexColors('#0e1420', primary, 0.05),
      success: '#34d399',
      successForeground: '#052e1c',
      successSoft: 'rgba(16, 185, 129, 0.18)',
      warning: '#fbbf24',
      warningForeground: '#1a1a1a',
      warningSoft: 'rgba(245, 158, 11, 0.18)',
      error: '#f87171',
      errorForeground: '#2c0b0b',
      errorSoft: 'rgba(239, 68, 68, 0.18)',
      info: '#60a5fa',
      infoForeground: '#0b1c33',
      infoSoft: 'rgba(59, 130, 246, 0.18)',
    }
  }

  const text = mixHexColors('#0f172a', primary, 0.06)
  const textSecondary = mixHexColors('#475569', primary, 0.08)
  const muted = mixHexColors(text, '#ffffff', 0.45)

  const surfaceMuted = mixHexColors(primary, '#ffffff', isLight ? 0.96 : 0.94)
  const surfaceHover = mixHexColors(primary, '#ffffff', isLight ? 0.92 : 0.9)
  const pageBg = mixHexColors(primary, '#ffffff', isLight ? 0.975 : 0.965)

  const border = 'rgba(15, 23, 42, 0.08)'
  const borderSoft = withAlpha(primary, isLight ? 0.12 : 0.14)

  return {
    primary,
    primaryForeground,
    primaryHover,
    primaryActive,
    primarySoft,
    primarySoftForeground,
    primaryBorder,
    primaryGlow,
    surface: '#ffffff',
    surfaceMuted,
    surfaceHover,
    text,
    textSecondary,
    muted,
    border,
    borderSoft,
    pageBg,
    success: '#10b981',
    successForeground: '#ffffff',
    successSoft: 'rgba(16, 185, 129, 0.12)',
    warning: '#f59e0b',
    warningForeground: '#1a1a1a',
    warningSoft: 'rgba(245, 158, 11, 0.12)',
    error: '#ef4444',
    errorForeground: '#ffffff',
    errorSoft: 'rgba(239, 68, 68, 0.12)',
    info: '#3b82f6',
    infoForeground: '#ffffff',
    infoSoft: 'rgba(59, 130, 246, 0.12)',
  }
}

export function buildThemeStyleVars(colorValue?: string | null, mode: ThemeMode = 'light'): CSSProperties {
  const p = buildThemePalette(colorValue, mode)

  return {
    '--primary': p.primary,
    '--primary-foreground': p.primaryForeground,
    '--primary-hover': p.primaryHover,
    '--primary-active': p.primaryActive,
    '--primary-soft': p.primarySoft,
    '--primary-soft-foreground': p.primarySoftForeground,
    '--primary-border': p.primaryBorder,
    '--primary-glow': p.primaryGlow,
    '--surface': p.surface,
    '--surface-muted': p.surfaceMuted,
    '--surface-hover': p.surfaceHover,
    '--text': p.text,
    '--text-secondary': p.textSecondary,
    '--muted': p.muted,
    '--border': p.border,
    '--border-soft': p.borderSoft,
    '--page-bg': p.pageBg,
    '--success': p.success,
    '--success-foreground': p.successForeground,
    '--success-soft': p.successSoft,
    '--warning': p.warning,
    '--warning-foreground': p.warningForeground,
    '--warning-soft': p.warningSoft,
    '--error': p.error,
    '--error-foreground': p.errorForeground,
    '--error-soft': p.errorSoft,
    '--info': p.info,
    '--info-foreground': p.infoForeground,
    '--info-soft': p.infoSoft,
  } as CSSProperties
}

export function getStatusColor(status: string, palette: ThemePalette) {
  switch (status) {
    case 'boş':
    case 'empty':
      return { bg: palette.surfaceMuted, text: palette.muted, border: palette.borderSoft }
    case 'aktif':
    case 'active':
      return { bg: palette.successSoft, text: palette.success, border: palette.success }
    case 'çağrı var':
    case 'calling':
      return { bg: palette.warningSoft, text: palette.warning, border: palette.warning }
    case 'hesap istendi':
    case 'bill':
      return { bg: palette.infoSoft, text: palette.info, border: palette.info }
    case 'temizlik':
    case 'cleaning':
      return { bg: palette.primarySoft, text: palette.primary, border: palette.primary }
    case 'kapalı':
    case 'closed':
      return { bg: palette.errorSoft, text: palette.error, border: palette.error }
    default:
      return { bg: palette.surfaceMuted, text: palette.muted, border: palette.borderSoft }
  }
}
