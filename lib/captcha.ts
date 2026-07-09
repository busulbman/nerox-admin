/**
 * Captcha verification for public write endpoints. Disabled by default and
 * toggled with `ENABLE_CAPTCHA=true`. When enabled, a Cloudflare Turnstile
 * token is expected in the request body and verified with `TURNSTILE_SECRET_KEY`.
 *
 * If captcha is enabled but no secret is configured yet, verification is
 * skipped (with a production warning) so a half-configured deploy can't lock
 * out all registrations — this keeps it a safe "prep" switch.
 */

const isProd = process.env.NODE_ENV === 'production'
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY?.trim() || ''

export function isCaptchaEnabled(): boolean {
  return process.env.ENABLE_CAPTCHA === 'true'
}

export type CaptchaResult = { success: boolean; message?: string }

export async function verifyCaptcha(token: unknown, ip: string): Promise<CaptchaResult> {
  if (!isCaptchaEnabled()) {
    return { success: true }
  }

  const captchaToken = typeof token === 'string' ? token.trim() : ''
  if (!captchaToken) {
    return { success: false, message: 'Doğrulama gerekli. Lütfen robot olmadığınızı onaylayın.' }
  }

  if (!TURNSTILE_SECRET) {
    if (isProd) {
      console.warn('[captcha] ENABLE_CAPTCHA=true but TURNSTILE_SECRET_KEY is not set; skipping verification.')
    }
    return { success: true }
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cache: 'no-store',
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: captchaToken,
        ...(ip && ip !== 'unknown' ? { remoteip: ip } : {}),
      }),
    })

    const data = (await response.json()) as { success?: boolean }
    if (data?.success) {
      return { success: true }
    }
    return { success: false, message: 'Doğrulama başarısız. Lütfen tekrar deneyin.' }
  } catch {
    return { success: false, message: 'Doğrulama şu anda yapılamıyor. Lütfen tekrar deneyin.' }
  }
}
