import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
import { DEFAULT_BRAND_LOGO_PATH } from '@/lib/restaurant-settings'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Mrs.Simone Admin',
  description: 'QR Menü ve Sipariş Yönetim Sistemi',
  icons: {
    icon: DEFAULT_BRAND_LOGO_PATH,
    shortcut: DEFAULT_BRAND_LOGO_PATH,
    apple: DEFAULT_BRAND_LOGO_PATH,
  },
  openGraph: {
    title: 'Mrs.Simone Admin',
    description: 'QR Menü ve Sipariş Yönetim Sistemi',
    images: [DEFAULT_BRAND_LOGO_PATH],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mrs.Simone Admin',
    description: 'QR Menü ve Sipariş Yönetim Sistemi',
    images: [DEFAULT_BRAND_LOGO_PATH],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
