import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'

type BrandAuthShellProps = {
  title: string
  description: string
  eyebrow: string
  children: React.ReactNode
  alternateHref: string
  alternateLabel: string
  alternateText: string
}

export default function BrandAuthShell({
  title,
  description,
  eyebrow,
  children,
  alternateHref,
  alternateLabel,
  alternateText,
}: BrandAuthShellProps) {
  return (
    <main className="relative min-h-[100svh] overflow-x-clip bg-[#05010d] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-[-18rem] h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(135,87,255,0.28),_transparent_58%)]" />
        <div className="absolute right-[-8rem] top-16 h-80 w-80 rounded-full bg-[#5f1ae5]/20 blur-3xl" />
        <div className="absolute left-[-7rem] bottom-10 h-72 w-72 rounded-full bg-[#a855f7]/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col px-5 py-4 sm:px-8 sm:py-5 lg:min-h-screen lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:rounded-full">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-[0.18em] text-white/90">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <Image
                src="/NeroxLogo.png"
                alt="Nerox Studio logosu"
                width={44}
                height={44}
                className="h-full w-full object-contain"
                priority
              />
            </span>
            <span className="hidden sm:inline">Nerox Studio</span>
          </Link>

          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-white/10 sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sm:hidden">Ana sayfa</span>
            <span className="hidden sm:inline">Ana sayfaya dön</span>
          </Link>
        </header>

        <div className="flex py-6 sm:py-10 lg:flex-1 lg:items-center lg:py-12">
          <div className="grid w-full gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <section className="max-w-xl min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/30 bg-[#11061f]/80 px-4 py-2 text-sm font-medium text-[#d8c3ff]">
                <ShieldCheck className="h-4 w-4" />
                {eyebrow}
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/68 sm:text-lg">
                {description}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.75rem] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-white">Güvenli erişim</p>
                  <p className="mt-1 text-sm leading-6 text-white/58">
                    Tenant ayrımı, rol kontrolü ve gerçek zamanlı panel akışı tek marka diliyle ilerler.
                  </p>
                </div>

                <div className="rounded-[1.75rem] border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7c3aed]/16 text-[#d8c3ff]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-white">Tek platform</p>
                  <p className="mt-1 text-sm leading-6 text-white/58">
                    Menü, masa, sipariş ve ekip yönetimi aynı premium arayüz içinde kalır.
                  </p>
                </div>
              </div>
            </section>

            <section className="w-full max-w-md justify-self-center lg:justify-self-end">
              <div className="rounded-[2rem] border border-white/12 bg-white/10 p-2 shadow-[0_30px_120px_rgba(6,3,14,0.48)] backdrop-blur-2xl">
                <div className="rounded-[1.6rem] border border-white/10 bg-[#090313]/86 p-6 sm:p-7">
                  {children}
                </div>
              </div>

              <p className="mt-5 text-center text-sm text-white/56">
                {alternateText}{' '}
                <Link href={alternateHref} className="inline-flex items-center gap-1 font-semibold text-[#d8c3ff] transition hover:text-white">
                  {alternateLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
