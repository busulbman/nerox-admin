'use client'

import { useState } from 'react'
import { BellRing, CircleCheckBig, Flame, Globe, Sparkles, Users } from 'lucide-react'
import { withAlpha } from '@/lib/ui-theme'
import { t, type MenuLanguage } from '@/lib/menu-i18n'

export const DEMO_TOUR_STORAGE_KEY = 'demo_menu_tour_completed'

const TOUR_STEPS = [
  { Icon: Sparkles, titleKey: 'demoTourStep1Title', textKey: 'demoTourStep1Text' },
  { Icon: Users, titleKey: 'demoTourStep2Title', textKey: 'demoTourStep2Text' },
  { Icon: BellRing, titleKey: 'demoTourStep3Title', textKey: 'demoTourStep3Text' },
  { Icon: Flame, titleKey: 'demoTourStep4Title', textKey: 'demoTourStep4Text' },
  { Icon: Globe, titleKey: 'demoTourStep5Title', textKey: 'demoTourStep5Text' },
  { Icon: CircleCheckBig, titleKey: 'demoTourStep6Title', textKey: 'demoTourStep6Text' },
] as const

export default function DemoMenuTour({
  language,
  primaryColor,
  primaryTextColor,
  textColor,
  mutedColor,
  borderColor,
  surfaceMutedColor,
  onClose,
}: {
  language: MenuLanguage
  primaryColor: string
  primaryTextColor: string
  textColor: string
  mutedColor: string
  borderColor: string
  surfaceMutedColor: string
  onClose: () => void
}) {
  const [step, setStep] = useState(0)

  const { Icon, titleKey, textKey } = TOUR_STEPS[step]
  const isLastStep = step === TOUR_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/45 backdrop-blur-[2px] sm:items-center sm:justify-center">
      <div
        className="w-full rounded-t-[32px] px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-[28px] sm:px-6 sm:pb-6"
        style={{ background: 'var(--page-bg)', animation: 'menu-modal-pop 240ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ background: withAlpha(primaryColor, 0.12), color: primaryColor }}>
            {t(language, 'demoTourBadge')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: surfaceMutedColor, color: mutedColor }}
          >
            {t(language, 'demoTourSkip')}
          </button>
        </div>

        <div className="mt-5 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: surfaceMutedColor }}>
          <Icon className="h-6 w-6" style={{ color: primaryColor }} />
        </div>

        <h2 className="mt-4 text-[22px] font-bold leading-tight" style={{ color: textColor }}>
          {t(language, titleKey)}
        </h2>
        <p className="mt-2 min-h-[72px] text-sm leading-6" style={{ color: mutedColor }}>
          {t(language, textKey)}
        </p>

        <div className="mt-4 flex items-center gap-1.5">
          {TOUR_STEPS.map((_, index) => (
            <span
              key={index}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: index === step ? 22 : 8,
                background: index === step ? primaryColor : withAlpha(primaryColor, 0.2),
              }}
            />
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          {step > 0 && !isLastStep && (
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-semibold border"
              style={{ background: '#fff', color: textColor, borderColor }}
            >
              {t(language, 'demoTourBack')}
            </button>
          )}
          {isLastStep ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-bold"
              style={{ background: primaryColor, color: primaryTextColor, boxShadow: `0 12px 24px ${withAlpha(primaryColor, 0.3)}` }}
            >
              {t(language, 'demoTourStart')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((current) => Math.min(TOUR_STEPS.length - 1, current + 1))}
              className="flex-1 rounded-[20px] px-4 py-3.5 text-sm font-bold"
              style={{ background: primaryColor, color: primaryTextColor, boxShadow: `0 12px 24px ${withAlpha(primaryColor, 0.3)}` }}
            >
              {t(language, 'demoTourNext')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
