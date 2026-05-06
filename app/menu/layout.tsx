import { DM_Sans, Playfair_Display } from 'next/font/google'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${playfair.variable} ${dmSans.variable}`}>{children}</div>
}
