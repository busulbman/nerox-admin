const ONBOARDING_COMPLETION_KEY_PREFIX = 'nerox:onboarding-complete:'
const ONBOARDING_COMPLETION_TTL_MS = 2 * 60 * 1000

function getOnboardingCompletionKey(restaurantId: string) {
  return `${ONBOARDING_COMPLETION_KEY_PREFIX}${restaurantId}`
}

export function rememberOnboardingCompletion(restaurantId: string) {
  if (typeof window === 'undefined' || !restaurantId) return

  window.sessionStorage.setItem(
    getOnboardingCompletionKey(restaurantId),
    String(Date.now() + ONBOARDING_COMPLETION_TTL_MS),
  )
}

export function hasRecentOnboardingCompletion(restaurantId: string) {
  if (typeof window === 'undefined' || !restaurantId) return false

  const rawValue = window.sessionStorage.getItem(getOnboardingCompletionKey(restaurantId))
  if (!rawValue) return false

  const expiresAt = Number.parseInt(rawValue, 10)
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
}

export function clearRecentOnboardingCompletion(restaurantId: string) {
  if (typeof window === 'undefined' || !restaurantId) return

  window.sessionStorage.removeItem(getOnboardingCompletionKey(restaurantId))
}
