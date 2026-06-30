import type { Metadata } from 'next'
import RegisterPageClient from '@/components/register/RegisterPageClient'

export const metadata: Metadata = {
  title: 'İşletme Hesabı Oluştur | Nerox Studio',
  description: 'Nerox Studio üzerinden işletme hesabınızı oluşturun ve 7 günlük ücretsiz denemenizi başlatın.',
}

export default function RegisterPage() {
  return <RegisterPageClient />
}
