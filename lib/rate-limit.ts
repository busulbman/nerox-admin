const RATE_LIMIT_STORAGE_KEY = 'nerox_rate_limits'

type RateLimitEntry = {
  timestamp: number
  count: number
}

type RateLimitConfig = {
  maxRequests: number
  windowMs: number
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  waiter_call: { maxRequests: 3, windowMs: 30000 },
  order_submit: { maxRequests: 2, windowMs: 60000 },
  customer_register: { maxRequests: 2, windowMs: 120000 },
  campaign_register: { maxRequests: 3, windowMs: 60000 },
  rating_submit: { maxRequests: 1, windowMs: 300000 },
}

function getRateLimits(): Record<string, RateLimitEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(RATE_LIMIT_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function setRateLimits(limits: Record<string, RateLimitEntry>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(limits))
  } catch {
    // Storage full or disabled
  }
}

export function checkRateLimit(
  action: keyof typeof DEFAULT_CONFIGS,
  identifier: string
): { allowed: boolean; remainingMs: number; message: string } {
  const config = DEFAULT_CONFIGS[action]
  if (!config) {
    return { allowed: true, remainingMs: 0, message: '' }
  }

  const key = `${action}:${identifier}`
  const now = Date.now()
  const limits = getRateLimits()
  const entry = limits[key]

  if (!entry || now - entry.timestamp > config.windowMs) {
    limits[key] = { timestamp: now, count: 1 }
    setRateLimits(limits)
    return { allowed: true, remainingMs: 0, message: '' }
  }

  if (entry.count >= config.maxRequests) {
    const remainingMs = config.windowMs - (now - entry.timestamp)
    const remainingSec = Math.ceil(remainingMs / 1000)
    return {
      allowed: false,
      remainingMs,
      message: `Çok fazla istek gönderdiniz. Lütfen ${remainingSec} saniye bekleyin.`,
    }
  }

  limits[key] = { timestamp: entry.timestamp, count: entry.count + 1 }
  setRateLimits(limits)
  return { allowed: true, remainingMs: 0, message: '' }
}

export function resetRateLimit(action: string, identifier: string): void {
  const key = `${action}:${identifier}`
  const limits = getRateLimits()
  delete limits[key]
  setRateLimits(limits)
}

export function clearExpiredRateLimits(): void {
  const now = Date.now()
  const limits = getRateLimits()
  const maxWindow = Math.max(...Object.values(DEFAULT_CONFIGS).map((c) => c.windowMs))

  for (const key of Object.keys(limits)) {
    if (now - limits[key].timestamp > maxWindow) {
      delete limits[key]
    }
  }

  setRateLimits(limits)
}

export function getRateLimitConfig(action: keyof typeof DEFAULT_CONFIGS): RateLimitConfig | undefined {
  return DEFAULT_CONFIGS[action]
}
