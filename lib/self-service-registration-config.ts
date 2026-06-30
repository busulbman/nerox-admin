export const SELF_SERVICE_BUSINESS_TYPES = ['Kafe', 'Restoran', 'Pastane', 'Diğer'] as const
export const TRIAL_DURATION_DAYS = 7

export type SelfServiceBusinessType = (typeof SELF_SERVICE_BUSINESS_TYPES)[number]
