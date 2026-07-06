const isDev = process.env.NODE_ENV === 'development'

export type SafeErrorResult = {
  message: string
  code?: string
}

const GENERIC_ERROR = 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.'

const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-token': 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.',
  'auth/user-not-found': 'Kullanıcı bulunamadı.',
  'auth/email-already-exists': 'Bu e-posta adresi zaten kayıtlı.',
  'auth/invalid-email': 'Geçerli bir e-posta adresi girin.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'permission-denied': 'Bu işlem için yetkiniz yok.',
  'not-found': 'İstenen kayıt bulunamadı.',
  'already-exists': 'Bu kayıt zaten mevcut.',
  'resource-exhausted': 'Çok fazla istek gönderdiniz. Lütfen bekleyin.',
  'unavailable': 'Servis geçici olarak kullanılamıyor.',
  'network-error': 'İnternet bağlantınızı kontrol edin.',
  'timeout': 'İşlem zaman aşımına uğradı.',
  'invalid-argument': 'Geçersiz veri gönderildi.',
  RATE_LIMITED: 'Çok fazla istek gönderdiniz. Lütfen bekleyin.',
  SUBSCRIPTION_EXPIRED: 'Abonelik süreniz dolmuş.',
  RESTAURANT_INACTIVE: 'İşletme aktif değil.',
}

export function toSafeError(error: unknown): SafeErrorResult {
  if (isDev) {
    console.error('[safe-error] Original error:', error)
  }

  if (error instanceof Error) {
    const code = (error as { code?: string }).code
    if (code && ERROR_MESSAGES[code]) {
      return { message: ERROR_MESSAGES[code], code }
    }

    const firebaseCode = error.message.match(/\[([a-z\-/]+)\]/i)?.[1]
    if (firebaseCode && ERROR_MESSAGES[firebaseCode]) {
      return { message: ERROR_MESSAGES[firebaseCode], code: firebaseCode }
    }

    if (error.message.includes('permission-denied') || error.message.includes('Permission denied')) {
      return { message: ERROR_MESSAGES['permission-denied'], code: 'permission-denied' }
    }

    if (error.message.includes('network') || error.message.includes('Network')) {
      return { message: ERROR_MESSAGES['network-error'], code: 'network-error' }
    }

    if (isDev) {
      return { message: error.message, code }
    }
  }

  return { message: GENERIC_ERROR }
}

export function logError(context: string, error: unknown): void {
  const timestamp = new Date().toISOString()
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined

  console.error(`[${timestamp}] [${context}] Error:`, errorMessage)

  if (isDev && errorStack) {
    console.error('Stack:', errorStack)
  }
}

export function createApiError(status: number, message: string, code?: string) {
  return {
    status,
    body: {
      error: message,
      code,
    },
  }
}

export function sanitizeErrorForClient(error: unknown): string {
  const safe = toSafeError(error)
  return safe.message
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code
    return ['unavailable', 'resource-exhausted', 'timeout', 'network-error'].includes(code || '')
  }
  return false
}
