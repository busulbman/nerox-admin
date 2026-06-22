import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Armchair,
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  LayoutDashboard,
  QrCode,
  Star,
  UserRound,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'QR Menü ve Sipariş Yönetim Sistemi',
  description: 'Kafeler ve restoranlar için QR menü, masa siparişi, garson paneli ve yönetim paneli.',
}

const featureCards = [
  {
    title: 'QR Menü',
    description: 'Müşteriler masadaki QR kodu okutup menüye anında ulaşır ve cihazından sipariş akışını başlatır.',
    icon: QrCode,
  },
  {
    title: 'Garson Paneli',
    description: 'Açık çağrılar, aktif masalar ve sipariş takibi garson ekranında tek akışta yönetilir.',
    icon: BellRing,
  },
  {
    title: 'Admin Paneli',
    description: 'Menü, çağrı, masa ve ekip yönetimi tek panelden kontrol edilir.',
    icon: LayoutDashboard,
  },
  {
    title: 'Masa Yönetimi',
    description: 'Masaların durumu, oturum akışı ve servis hareketleri operasyon tarafında net şekilde izlenir.',
    icon: Armchair,
  },
  {
    title: 'Puanlama Sistemi',
    description: 'Servis sonrası müşteri geri bildirimleri toplanır, kalite ve ekip performansı ölçülür.',
    icon: Star,
  },
]

const highlights = [
  'QR ile hızlı erişim',
  'Masa bazlı sipariş takibi',
  'Canlı çağrı yönetimi',
]

export default function HomePage() {
  return (
    <main className="relative overflow-hidden bg-[#f6f1ea] text-[#24160e]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-[#d8b788]/30 blur-3xl" />
        <div className="absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-[#8f6a4b]/18 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#fff1d8]/80 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 pb-16 pt-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-white/70 bg-white/75 px-5 py-3 shadow-[0_18px_60px_rgba(76,49,29,0.08)] backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8f6a4b]">Nerox Studio</p>
            <p className="text-sm font-medium text-[#4a3426]">Restoran operasyonları için SaaS altyapısı</p>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-[#d6c2ae] bg-[#2f1f15] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#20150f]"
          >
            Giriş Yap
            <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d7c0a7] bg-white/85 px-4 py-2 text-sm font-medium text-[#7c5a3f] shadow-sm">
              <CheckCircle2 className="h-4 w-4" />
              QR menü, sipariş ve servis yönetimi tek yapıda
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.04em] text-[#1f140d] sm:text-5xl lg:text-7xl">
              QR Menü ve Sipariş Yönetim Sistemi
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[#5f4636] sm:text-lg">
              Kafeler ve restoranlar için QR menü, masa siparişi, garson paneli ve yönetim paneli.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2f1f15] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(47,31,21,0.18)] transition hover:bg-[#20150f]"
              >
                Giriş Yap
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d8bca1] bg-white/85 px-6 py-3.5 text-sm font-semibold text-[#3e2a1d] transition hover:bg-white"
              >
                Paneli İncele
                <QrCode className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {highlights.map((item) => (
                <div
                  key={item}
                  className="inline-flex items-center gap-2 rounded-full border border-[#e4d2c0] bg-white/70 px-3.5 py-2 text-sm text-[#5f4636]"
                >
                  <CheckCircle2 className="h-4 w-4 text-[#8f6a4b]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-[linear-gradient(160deg,#fffaf4_0%,#f0dfc7_100%)] p-5 shadow-[0_30px_100px_rgba(76,49,29,0.12)] sm:p-7">
            <div className="rounded-[1.75rem] border border-[#ebdccd] bg-[#fffdf9] p-5 shadow-inner sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b7658]">Operasyon Özeti</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#24160e]">Müşteri akışı tek ekranda</h2>
                </div>
                <div className="rounded-2xl bg-[#2f1f15] p-3 text-white">
                  <LayoutDashboard className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#efe3d7] bg-[#fcf7f2] p-4">
                  <p className="text-sm font-medium text-[#8b6547]">Müşteri deneyimi</p>
                  <p className="mt-2 text-lg font-semibold text-[#2b1d14]">QR ile sipariş ve çağrı</p>
                  <p className="mt-2 text-sm leading-6 text-[#5f4636]">
                    Menüye erişim, sipariş gönderimi ve hesap isteme adımları mobilde sade kalır.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#efe3d7] bg-[#fcf7f2] p-4">
                  <p className="text-sm font-medium text-[#8b6547]">Servis akışı</p>
                  <p className="mt-2 text-lg font-semibold text-[#2b1d14]">Garson tarafı canlı yönetim</p>
                  <p className="mt-2 text-sm leading-6 text-[#5f4636]">
                    Açık çağrılar, aktif masalar ve tamamlanan işlemler tek iş akışında toplanır.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#e7d7c6] bg-[#2f1f15] p-5 text-white">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-[#f2d3a6]" />
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f2d3a6]">İşletme tarafı</p>
                </div>
                <p className="mt-3 text-lg font-semibold">Menü, masa, ekip ve servis performansını aynı panelde yönetin.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 lg:py-12">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8f6a4b]">Modüller</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#24160e] sm:text-4xl">
              Restoran operasyonunun temel bileşenleri
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {featureCards.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="rounded-[1.75rem] border border-white/80 bg-white/80 p-5 shadow-[0_18px_50px_rgba(76,49,29,0.08)] backdrop-blur"
              >
                <div className="inline-flex rounded-2xl bg-[#f4e7d7] p-3 text-[#6f4f37]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#24160e]">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#5f4636]">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-8 lg:py-12">
          <div className="rounded-[2rem] border border-[#e6d7c9] bg-white/85 p-6 shadow-[0_22px_60px_rgba(76,49,29,0.08)] backdrop-blur sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8f6a4b]">Kurucu</p>
            <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#24160e]">Nerox Studio</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5f4636] sm:text-base">
                  Restoranlar için dijital sipariş, operasyon ve servis akışını sadeleştiren ürünler geliştirir.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-[#efe3d7] bg-[#fcf8f3] p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-[#2f1f15] p-3 text-white">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8f6a4b]">Kurucu</p>
                    <p className="text-xl font-semibold text-[#24160e]">Nurali</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-[#5f4636]">
                  Ürün stratejisi, operasyonel kullanılabilirlik ve restoran deneyimini aynı akışta birleştiren yapı üzerinde çalışır.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
