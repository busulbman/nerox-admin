'use client'

import { Lock, MessageCircle } from 'lucide-react'
import type { RestaurantFeatures } from '@/lib/types'
import { FEATURE_LABELS } from '@/lib/types'

const WHATSAPP_URL = 'https://wa.me/905421320706?text=Merhaba%2C%20paket%20y%C3%BCkseltme%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum.'

interface FeatureGateProps {
  enabled: boolean
  children: React.ReactNode
}

export function FeatureGate({ enabled, children }: FeatureGateProps) {
  if (enabled) {
    return <>{children}</>
  }

  return null
}

interface FeatureLockedPageProps {
  feature: keyof RestaurantFeatures
}

export function FeatureLockedPage({ feature }: FeatureLockedPageProps) {
  const featureName = FEATURE_LABELS[feature]

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
        <Lock className="h-8 w-8" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-gray-900">
        {featureName} Özelliği Aktif Değil
      </h2>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        Bu özellik mevcut paketinizde aktif değil. Özelliği kullanmak için paketinizi yükseltin.
      </p>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
      >
        <MessageCircle className="h-4 w-4" />
        Paket Yükseltme İçin İletişime Geç
      </a>
    </div>
  )
}

interface FeatureLockedCardProps {
  feature: keyof RestaurantFeatures
  title: string
  description?: string
}

export function FeatureLockedCard({ feature, title, description }: FeatureLockedCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_rgba(255,255,255,0.8)_70%)]" />
      <div className="relative flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-200 text-gray-400">
          <Lock className="h-5 w-5" />
        </div>
        <h3 className="mt-4 font-semibold text-gray-700">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
        <span className="mt-3 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
          {FEATURE_LABELS[feature]} gerekli
        </span>
      </div>
    </div>
  )
}
