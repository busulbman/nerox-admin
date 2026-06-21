// import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata = {
  title: 'Mrs.Simone Admin',
  description: 'QR Menü ve Sipariş Yönetim Sistemi',
  openGraph: {
    title: 'Mrs.Simone Admin',
    description: 'QR Menü ve Sipariş Yönetim Sistemi',
    images: ['/simoneLogo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mrs.Simone Admin',
    description: 'QR Menü ve Sipariş Yönetim Sistemi',
    images: ['/simoneLogo.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
