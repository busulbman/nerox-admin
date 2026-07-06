import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Blocks,
  Building2,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  MenuSquare,
  MessageSquareQuote,
  Palette,
  Phone,
  QrCode,
  Receipt,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Nerox Studio | QR Menü ve Sipariş Yönetim Sistemi',
  description: 'Kafeler ve restoranlar için QR menü, sipariş, garson ve yönetim paneli sistemi.',
  metadataBase: new URL('https://www.neroxstudio.com'),
  openGraph: {
    title: 'Nerox Studio | QR Menü ve Sipariş Yönetim Sistemi',
    description: 'Kafeler ve restoranlar için QR menü, sipariş, garson ve yönetim paneli sistemi.',
    url: 'https://www.neroxstudio.com',
    siteName: 'Nerox Studio',
  },
}

const heroCards = [
  {
    title: 'QR Menü',
    description: 'Masaya özel hızlı menü erişimi',
    icon: QrCode,
  },
  {
    title: 'Garson Paneli',
    description: 'Çağrılar ve siparişler tek akışta',
    icon: BellRing,
  },
  {
    title: 'Yönetim Paneli',
    description: 'Menü, masa ve ekip yönetimi',
    icon: LayoutDashboard,
  },
  {
    title: 'Masa Siparişi',
    description: 'Müşteri deneyimi için sade akış',
    icon: Receipt,
  },
] as const

const featureCards = [
  {
    title: 'QR Menü',
    description: 'Masalara yerleştirilen QR kod ile müşteriler menünüze anında erişir.',
    icon: QrCode,
  },
  {
    title: 'Masadan Sipariş',
    description: 'Ürün seçimi, sipariş akışı ve masa bazlı takip tek deneyimde ilerler.',
    icon: Receipt,
  },
  {
    title: 'Garson Paneli',
    description: 'Çağrılar, açık siparişler ve masa hareketleri operasyon ekranında toplanır.',
    icon: BellRing,
  },
  {
    title: 'Admin Panel',
    description: 'Menü, fiyat, personel, masa ve ayarlar tek merkezden yönetilir.',
    icon: LayoutDashboard,
  },
  {
    title: 'Masa Yönetimi',
    description: 'Her masa için ayrı QR akışı ve durum takibiyle servis tarafı net kalır.',
    icon: ClipboardList,
  },
  {
    title: 'Puanlama & Yorumlar',
    description: 'Müşteri geri bildirimlerini toplayıp hizmet kalitesini izleyebilirsiniz.',
    icon: MessageSquareQuote,
  },
  {
    title: 'Logo ve Renk Ayarı',
    description: 'Her işletme kendi logosu, renkleri ve marka diliyle yayına çıkar.',
    icon: Palette,
  },
  {
    title: 'Çoklu İşletme Desteği',
    description: 'Tek kod tabanıyla birden fazla restoran ve kafe için ayrı sistem kurulabilir.',
    icon: Building2,
  },
] as const

const steps = [
  'İşletmeniz için hesap açılır.',
  'Logo, renk, masa ve menü bilgileri eklenir.',
  'Masalara özel QR kodlar oluşturulur.',
  'Müşteri QR menüden ürün seçer ve sipariş gönderir.',
  'Garson panelinden çağrılar takip edilir.',
  'İşletme sahibi yönetim panelinden menüyü ve personeli yönetir.',
] as const

const hasBrandLogo = existsSync(join(process.cwd(), 'public', 'NeroxLogo.png'))
const hasFounderPhoto = existsSync(join(process.cwd(), 'public', 'nurali.png'))

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function HomePage() {
  return (
    <main className="relative overflow-x-clip bg-[#05010d] text-white">
      <style>{`
        @keyframes landing-fade-up {
          from {
            opacity: 0;
            transform: translate3d(0, 32px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes landing-float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        .landing-fade-up {
          animation: landing-fade-up 720ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          opacity: 0;
          will-change: transform, opacity;
        }

        .landing-float {
          animation: landing-float 6s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .landing-fade-up,
          .landing-float {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-[-18rem] h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(135,87,255,0.28),_transparent_58%)]" />
        <div className="absolute right-[-8rem] top-24 h-80 w-80 rounded-full bg-[#5f1ae5]/20 blur-3xl" />
        <div className="absolute left-[-6rem] top-[34rem] h-72 w-72 rounded-full bg-[#a855f7]/15 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(180deg,transparent,rgba(4,2,10,0.9))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-7xl flex-col px-5 pb-10 pt-4 sm:px-8 sm:pb-16 sm:pt-5 lg:min-h-screen lg:px-10">
        <header
          className="landing-fade-up flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:rounded-full sm:px-5"
          style={{ animationDelay: '60ms' }}
        >
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-white/90">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              {hasBrandLogo ? (
                <Image
                  src="/NeroxLogo.png"
                  alt="Nerox Studio logosu"
                  width={44}
                  height={44}
                  className="h-full w-full object-contain"
                  priority
                />
              ) : (
                  <span className="px-2 text-center text-[10px] tracking-[0.2em] text-white">NEROX</span>
              )}
            </span>
            <span className="hidden sm:inline">Nerox Studio</span>
          </Link>

          <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3 sm:justify-end">
            <Link
              href="/menu/demo/1"
              className="inline-flex flex-1 items-center justify-center rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-white/10 sm:flex-none"
            >
              Demo Menü
            </Link>
            <Link
              href="/login"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#12061f] transition hover:bg-white/90 sm:flex-none"
            >
              Giriş Yap
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="grid gap-8 py-6 sm:gap-10 sm:py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:py-14">
          <div className="max-w-3xl min-w-0">
            <div
              className="landing-fade-up inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/30 bg-[#11061f]/80 px-4 py-2 text-sm font-medium text-[#d8c3ff]"
              style={{ animationDelay: '140ms' }}
            >
              <ShieldCheck className="h-4 w-4" />
              Modern QR menü ve operasyon altyapısı
            </div>

            <h1
              className="landing-fade-up mt-5 text-4xl font-semibold leading-tight tracking-[-0.05em] text-white sm:text-5xl lg:text-7xl"
              style={{ animationDelay: '220ms' }}
            >
              Restoran ve kafeler için akıllı QR menü sistemi
            </h1>

            <p
              className="landing-fade-up mt-5 max-w-2xl text-base leading-8 text-white/72 sm:text-lg"
              style={{ animationDelay: '300ms' }}
            >
              Menünüzü dijitalleştirin, masalardan sipariş alın, garson çağrılarını yönetin ve tüm işletmenizi tek
              panelden takip edin.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/menu/demo/1"
                className="landing-fade-up inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7c3aed] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(124,58,237,0.35)] transition hover:bg-[#6d28d9] sm:w-auto"
                style={{ animationDelay: '380ms' }}
              >
                Demo Menüyü Gör
                <ArrowRight className="h-4 w-4" />
              </Link>

              <a
                href="https://wa.me/905421320706?text=Merhaba%2C%20Nerox%20Restaurant%20i%C3%A7in%207%20g%C3%BCn%20%C3%BCcretsiz%20deneme%20hesab%C4%B1%20olu%C5%9Fturmak%20istiyorum."
                target="_blank"
                rel="noreferrer"
                className="landing-fade-up inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-[#12061f] transition hover:bg-white/90 sm:w-auto"
                style={{ animationDelay: '440ms' }}
              >
                Hesap Oluştur
                <Building2 className="h-4 w-4" />
              </a>

              <Link
                href="/login"
                className="landing-fade-up inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/10 sm:w-auto"
                style={{ animationDelay: '500ms' }}
              >
                Yönetim Paneline Giriş
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div
              className="landing-fade-up mt-8 flex flex-wrap gap-2.5 text-sm text-white/70"
              style={{ animationDelay: '540ms' }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">
                <CheckCircle2 className="h-4 w-4 text-[#c084fc]" />
                Hızlı kurulum
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">
                <CheckCircle2 className="h-4 w-4 text-[#c084fc]" />
                Mobil uyumlu arayüz
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2">
                <CheckCircle2 className="h-4 w-4 text-[#c084fc]" />
                Çoklu işletme desteği
              </div>
            </div>
          </div>

          <div
            className="landing-fade-up landing-float relative rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(23,10,42,0.94),rgba(9,4,18,0.98))] p-4 shadow-[0_30px_100px_rgba(10,4,24,0.55)] sm:p-6"
            style={{ animationDelay: '320ms' }}
          >
            <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b998ff]">Nerox Studio</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Tek ekranda restoran operasyonu</h2>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7c3aed]/18 text-[#d8c3ff]">
                  <Sparkles className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {heroCards.map(({ title, description, icon: Icon }, index) => (
                  <article
                    key={title}
                    className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_40px_rgba(2,0,8,0.18)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium text-white/35">0{index + 1}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/62">{description}</p>
                  </article>
                ))}
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-[#8b5cf6]/20 bg-[#10061f] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#7c3aed]/20 text-[#d8c3ff]">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Her işletmeye özel kurulum</p>
                    <p className="text-sm text-white/60">Marka renkleri, logo, masa yapısı ve menü verisi ayrı yönetilir.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-4 sm:py-5 lg:py-7">
          <div className="landing-fade-up max-w-2xl" style={{ animationDelay: '120ms' }}>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#c7a6ff]">Özellikler</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              İşletme operasyonu için tek platform
            </h2>
            <p className="mt-4 text-base leading-7 text-white/70">
              Nerox Studio, müşteriden garsona ve yöneticiye kadar tüm akışların aynı sistemde toplanması için
              tasarlandı.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {featureCards.map(({ title, description, icon: Icon }, index) => (
              <article
                key={title}
                className="landing-fade-up rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
                style={{ animationDelay: `${180 + index * 70}ms` }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-white/65">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-4 sm:py-5 lg:py-7">
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div
              className="landing-fade-up rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-6 backdrop-blur-xl sm:p-7"
              style={{ animationDelay: '120ms' }}
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5">
                  {hasFounderPhoto ? (
                    <Image
                      src="/nurali.png"
                      alt="Nurali"
                      width={96}
                      height={96}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound className="h-10 w-10 text-white/60" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c7a6ff]">Kurucu & Geliştirici</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Nurali</h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-white/70">
                    Kafeler ve restoranlar için modern QR menü ve sipariş sistemleri geliştiriyorum.
                  </p>
                </div>
              </div>
            </div>

            <div
              className="landing-fade-up rounded-[2rem] border border-white/10 bg-[#0d0618]/90 p-6 shadow-[0_24px_80px_rgba(7,2,18,0.4)] sm:p-7"
              style={{ animationDelay: '220ms' }}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#c7a6ff]">İletişim</p>
              <div className="mt-5 grid gap-3 text-sm text-white/72">
                <a
                  href="https://instagram.com/nurali.builder"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:bg-white/[0.07]"
                >
                  <InstagramIcon className="h-5 w-5 shrink-0 text-[#d8c3ff]" />
                  <div>
                    <p className="font-medium text-white">Instagram</p>
                    <p className="text-white/62">@nurali.builder</p>
                  </div>
                </a>
                <a
                  href="tel:+905421320706"
                  className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:bg-white/[0.07]"
                >
                  <Phone className="h-5 w-5 shrink-0 text-[#d8c3ff]" />
                  <div>
                    <p className="font-medium text-white">Telefon</p>
                    <p className="text-white/62">+90 542 132 07 06</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="py-4 sm:py-5 lg:py-7">
          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <div
              className="landing-fade-up rounded-[2rem] border border-white/10 bg-[#0d0618]/90 p-6 sm:p-7"
              style={{ animationDelay: '120ms' }}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#c7a6ff]">Nasıl kullanılır</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                Kurulumdan yayına kısa bir akış
              </h2>
              <p className="mt-4 text-base leading-7 text-white/70">
                İşletme kurulumu, menü tanımı ve masa bazlı kullanım akışı basit bir sırada ilerler.
              </p>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <article
                  key={step}
                  className="landing-fade-up flex gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
                  style={{ animationDelay: `${180 + index * 70}ms` }}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-sm font-semibold text-[#d8c3ff]">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-sm leading-7 text-white/75">{step}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-4 sm:py-5 lg:py-7">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div
              className="landing-fade-up rounded-[2rem] border border-white/10 bg-[linear-gradient(140deg,rgba(124,58,237,0.2),rgba(10,4,24,0.95))] p-6 sm:p-7"
              style={{ animationDelay: '120ms' }}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#d8c3ff]">Demo</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Canlı akış yerine örnek deneyim</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/72">
                Demo menü örnek içeriklerle hazırlanmıştır. Gerçek kullanımda işletme adı, logo, renkler ve ürünler size
                özel olur.
              </p>
            </div>

            <Link
              href="/menu/demo/1"
              className="landing-fade-up inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/10 sm:w-auto"
              style={{ animationDelay: '220ms' }}
            >
              Demo Menüyü Gör
              <MenuSquare className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="py-4 sm:py-5 lg:py-7">
          <div
            className="landing-fade-up rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur-xl sm:p-8"
            style={{ animationDelay: '120ms' }}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
              <Blocks className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              İşletmeniz için kendi QR menü sisteminizi hazırlayalım.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/70">
              Kurulumu hızlı, kullanımı net ve markanıza özel bir sistem için Nerox Studio altyapısını kullanabilirsiniz.
            </p>

            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-[#12061f] transition hover:bg-white/90 sm:w-auto"
              >
                Giriş Yap
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/menu/demo/1"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/6 px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/18 hover:bg-white/10 sm:w-auto"
              >
                Demo Menüyü Gör
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <footer className="pb-2 pt-2 text-center text-sm text-white/45 sm:pt-3">
          <p>© Nerox Studio - Tüm hakları saklıdır.</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/55">
            <Link href="/kvkk" className="transition hover:text-white/85">
              KVKK Aydınlatma Metni
            </Link>
            <Link href="/privacy" className="transition hover:text-white/85">
              Gizlilik Politikası
            </Link>
            <Link href="/terms" className="transition hover:text-white/85">
              Kullanım Şartları
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}
