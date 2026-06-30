export const SUBSCRIPTION_EXTENSION_PRESETS = ['7d', '1m', '3m', '1y'] as const

export type SubscriptionExtensionPreset = (typeof SUBSCRIPTION_EXTENSION_PRESETS)[number]

export const SUBSCRIPTION_EXTENSION_LABELS: Record<SubscriptionExtensionPreset, string> = {
  '7d': '+7 gün',
  '1m': '+1 ay',
  '3m': '+3 ay',
  '1y': '+1 yıl',
}
