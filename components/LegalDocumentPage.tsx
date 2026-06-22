import Link from 'next/link'

type LegalSection = {
  title: string
  paragraphs: readonly string[]
}

type LegalDocumentPageProps = {
  label: string
  title: string
  description: string
  sections: readonly LegalSection[]
}

const legalLinks = [
  { href: '/kvkk', label: 'KVKK Aydınlatma Metni' },
  { href: '/privacy', label: 'Gizlilik Politikası' },
  { href: '/terms', label: 'Kullanım Şartları' },
] as const

export default function LegalDocumentPage({
  label,
  title,
  description,
  sections,
}: LegalDocumentPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05010d] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-[-18rem] h-[30rem] bg-[radial-gradient(circle_at_top,_rgba(135,87,255,0.24),_transparent_58%)]" />
        <div className="absolute right-[-6rem] top-20 h-72 w-72 rounded-full bg-[#7c3aed]/18 blur-3xl" />
        <div className="absolute left-[-7rem] bottom-8 h-72 w-72 rounded-full bg-[#9333ea]/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-15" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em] text-white/88 transition hover:text-white">
            NEROX STUDIO
          </Link>
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            Ana Sayfaya Dön
          </Link>
        </header>

        <section className="pt-10 sm:pt-14">
          <div className="max-w-3xl rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-6 backdrop-blur-xl sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#d8c3ff]">{label}</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">{description}</p>
          </div>
        </section>

        <section className="mt-6 flex-1 space-y-4 pb-8 sm:mt-8">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl sm:p-6"
            >
              <h2 className="text-lg font-semibold text-white sm:text-xl">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-white/72 sm:text-base">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <footer className="border-t border-white/10 pt-5 text-sm text-white/50">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {legalLinks.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-white/85">
                {item.label}
              </Link>
            ))}
          </div>
        </footer>
      </div>
    </main>
  )
}
