import { NextResponse } from 'next/server'

/**
 * Server-side rate limiting backed by Upstash Redis / Vercel KV (same REST
 * protocol). When no store is configured it degrades to an in-memory limiter
 * that is per-instance and therefore NOT reliable across serverless instances —
 * this path logs a warning in production so the misconfiguration is visible.
 */

const isProd = process.env.NODE_ENV === 'production'

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL?.trim() ||
  process.env.KV_REST_API_URL?.trim() ||
  ''
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
  process.env.KV_REST_API_TOKEN?.trim() ||
  ''

const redisConfigured = Boolean(REDIS_URL && REDIS_TOKEN)

export const RATE_LIMIT_MESSAGE =
  'Çok fazla işlem denendi. Lütfen biraz sonra tekrar deneyin.'

export type RateLimitResult = {
  success: boolean
  limit: number
  remaining: number
  resetSeconds: number
}

let warnedAboutFallback = false
function warnFallbackOnce() {
  if (warnedAboutFallback) return
  warnedAboutFallback = true
  if (isProd) {
    console.warn(
      '[rate-limit] No Redis store configured (set UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN or KV_REST_API_URL/KV_REST_API_TOKEN). ' +
        'Falling back to in-memory rate limiting, which is per-instance and unreliable in production.',
    )
  }
}

// ─── In-memory fallback (fixed window) ────────────────────────────────────────

type MemoryEntry = { count: number; expiresAt: number }
const memoryStore = new Map<string, MemoryEntry>()

function memoryRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now()
  const entry = memoryStore.get(key)

  if (!entry || entry.expiresAt <= now) {
    // Opportunistic cleanup so the map can't grow unbounded.
    if (memoryStore.size > 5000) {
      for (const [k, v] of memoryStore) {
        if (v.expiresAt <= now) memoryStore.delete(k)
      }
    }
    memoryStore.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 })
    return { success: true, limit, remaining: limit - 1, resetSeconds: windowSeconds }
  }

  entry.count += 1
  const resetSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))
  if (entry.count > limit) {
    return { success: false, limit, remaining: 0, resetSeconds }
  }
  return { success: true, limit, remaining: Math.max(0, limit - entry.count), resetSeconds }
}

// ─── Redis (Upstash / Vercel KV) fixed window ─────────────────────────────────

type PipelineItem = { result?: number; error?: string }

async function redisRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const redisKey = `rl:${key}`
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify([
      ['INCR', redisKey],
      // Set the window only on the first hit so the window is fixed, not sliding.
      ['EXPIRE', redisKey, String(windowSeconds), 'NX'],
      ['TTL', redisKey],
    ]),
  })

  if (!response.ok) {
    throw new Error(`Redis pipeline failed with status ${response.status}`)
  }

  const data = (await response.json()) as PipelineItem[]
  const count = typeof data?.[0]?.result === 'number' ? data[0].result : 0
  const ttl = typeof data?.[2]?.result === 'number' ? data[2].result : windowSeconds
  const resetSeconds = ttl > 0 ? ttl : windowSeconds

  if (count > limit) {
    return { success: false, limit, remaining: 0, resetSeconds }
  }
  return { success: true, limit, remaining: Math.max(0, limit - count), resetSeconds }
}

/**
 * Consumes one unit against `key`. `windowSeconds` is the fixed window length.
 * Fails open (allows the request) only if a configured Redis store is briefly
 * unreachable, degrading to the in-memory limiter rather than blocking traffic.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!redisConfigured) {
    warnFallbackOnce()
    return memoryRateLimit(key, limit, windowSeconds)
  }

  try {
    return await redisRateLimit(key, limit, windowSeconds)
  } catch (error) {
    if (isProd) {
      console.warn(
        '[rate-limit] Redis error, degrading to in-memory limiter:',
        error instanceof Error ? error.message : error,
      )
    }
    return memoryRateLimit(key, limit, windowSeconds)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return 'unknown'
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: RATE_LIMIT_MESSAGE },
    {
      status: 429,
      headers: { 'Retry-After': String(result.resetSeconds) },
    },
  )
}
