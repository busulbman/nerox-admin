import type { MenuLanguage } from '@/lib/menu-i18n'

export type CurrencyCode = 'TRY' | 'USD' | 'RUB' | 'SAR'

export type ExchangeRates = {
  USD: number
  RUB: number
  SAR: number
  fetchedAt: number
}

const CACHE_KEY = 'nerox_exchange_rates'
const CACHE_DURATION_MS = 60 * 60 * 1000 // 1 hour

const FALLBACK_RATES: Omit<ExchangeRates, 'fetchedAt'> = {
  USD: 33,
  RUB: 0.36,
  SAR: 8.8,
}

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  TRY: '₺',
  USD: '$',
  RUB: '₽',
  SAR: 'SR',
}

const LANGUAGE_CURRENCY_MAP: Record<MenuLanguage, CurrencyCode> = {
  tr: 'TRY',
  en: 'USD',
  ru: 'RUB',
  ar: 'USD',
}

let memoryCache: ExchangeRates | null = null

function readCachedRates(): ExchangeRates | null {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_DURATION_MS) {
    return memoryCache
  }

  if (typeof window === 'undefined') return null

  try {
    const cached = window.localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const parsed = JSON.parse(cached) as ExchangeRates
    if (Date.now() - parsed.fetchedAt < CACHE_DURATION_MS) {
      memoryCache = parsed
      return parsed
    }
  } catch {
    // Invalid cache
  }

  return null
}

function saveCachedRates(rates: ExchangeRates): void {
  memoryCache = rates

  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rates))
  } catch {
    // Storage full or unavailable
  }
}

export async function getExchangeRates(): Promise<ExchangeRates> {
  const cached = readCachedRates()
  if (cached) return cached

  try {
    // Free API - exchangerate-api.com free tier
    const response = await fetch(
      'https://api.exchangerate-api.com/v4/latest/TRY',
      { signal: AbortSignal.timeout(5000) }
    )

    if (!response.ok) throw new Error('API error')

    const data = await response.json() as { rates?: Record<string, number> }

    if (!data.rates) throw new Error('Invalid response')

    // API returns how many of each currency you get for 1 TRY
    // We need the inverse for display (how many TRY per 1 foreign currency)
    const rates: ExchangeRates = {
      USD: data.rates.USD ? 1 / data.rates.USD : FALLBACK_RATES.USD,
      RUB: data.rates.RUB ? 1 / data.rates.RUB : FALLBACK_RATES.RUB,
      SAR: data.rates.SAR ? 1 / data.rates.SAR : FALLBACK_RATES.SAR,
      fetchedAt: Date.now(),
    }

    saveCachedRates(rates)
    return rates
  } catch (error) {
    console.warn('[currency] Failed to fetch rates, using fallback:', error)

    const fallbackRates: ExchangeRates = {
      ...FALLBACK_RATES,
      fetchedAt: Date.now(),
    }

    saveCachedRates(fallbackRates)
    return fallbackRates
  }
}

export function convertTryToCurrency(amountTry: number, currency: CurrencyCode, rates: ExchangeRates): number {
  if (currency === 'TRY') return amountTry

  const rate = rates[currency]
  if (!rate || rate <= 0) return 0

  return amountTry / rate
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const symbol = CURRENCY_SYMBOLS[currency]

  if (currency === 'TRY') {
    return `${symbol}${amount.toLocaleString('tr-TR')}`
  }

  if (currency === 'RUB') {
    return `${symbol}${Math.round(amount).toLocaleString('ru-RU')}`
  }

  // USD, SAR - show 2 decimal places
  return `${symbol}${amount.toFixed(2)}`
}

export function formatPriceWithConversion(
  amountTry: number,
  language: MenuLanguage,
  rates: ExchangeRates | null
): { primary: string; secondary: string | null } {
  const primary = `₺${amountTry.toLocaleString('tr-TR')}`

  // Turkish = only TL
  if (language === 'tr') {
    return { primary, secondary: null }
  }

  if (!rates) {
    return { primary, secondary: null }
  }

  const targetCurrency = LANGUAGE_CURRENCY_MAP[language]
  const converted = convertTryToCurrency(amountTry, targetCurrency, rates)
  const secondary = `(${formatCurrency(converted, targetCurrency)})`

  return { primary, secondary }
}

export function getCurrencyForLanguage(language: MenuLanguage): CurrencyCode {
  return LANGUAGE_CURRENCY_MAP[language]
}
