'use client'

import { t, type MenuLanguage } from '@/lib/menu-i18n'

export default function MenuDeveloperFooter({
  language,
  mutedColor,
  borderColor,
}: {
  language: MenuLanguage
  mutedColor: string
  borderColor: string
}) {
  return (
    <footer className="mt-10 border-t pt-5 pb-2 text-center" style={{ borderColor }}>
      <a
        href="https://www.neroxstudio.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block transition-opacity hover:opacity-70"
      >
        <p className="text-[11px] font-medium" style={{ color: mutedColor }}>
          {t(language, 'developerLabel')}: Nurali Kaimov
        </p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: mutedColor, opacity: 0.75 }}>
          Nerox Studio
        </p>
      </a>
      <div className="mt-1.5">
        <a
          href="https://wa.me/905421320706"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: mutedColor, opacity: 0.7 }}
        >
          {t(language, 'contactLabel')}
        </a>
      </div>
    </footer>
  )
}
