import type { Metadata } from 'next'
import OnboardingPageClient from '@/components/onboarding/OnboardingPageClient'

export const metadata: Metadata = {
  title: 'İşletme Kurulumu | Nerox Studio',
  description: 'Yeni işletmeniz için temel kurulum adımlarını tamamlayın.',
}

export default function OnboardingPage() {
  return <OnboardingPageClient />
}
