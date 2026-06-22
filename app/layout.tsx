import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
import { DEFAULT_BRAND_LOGO_PATH } from '@/lib/restaurant-settings'

const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Yönetim Paneli',
  description: 'QR Menü ve Sipariş Yönetim Sistemi',
  metadataBase: new URL('https://www.neroxstudio.com'),
  icons: {
    icon: DEFAULT_BRAND_LOGO_PATH,
    shortcut: DEFAULT_BRAND_LOGO_PATH,
    apple: DEFAULT_BRAND_LOGO_PATH,
  },
  openGraph: {
    title: 'Yönetim Paneli',
    description: 'QR Menü ve Sipariş Yönetim Sistemi',
    images: [DEFAULT_BRAND_LOGO_PATH],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yönetim Paneli',
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
    <html lang="tr" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
