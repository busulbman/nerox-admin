'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  UtensilsCrossed,
  Bell,
  QrCode,
  Gift,
  Users,
  Settings,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
} from 'lucide-react'

type OnboardingStep = {
  id: string
  title: string
  description: string
  icon: typeof LayoutDashboard
  targetSelector?: string
  position?: 'center' | 'right' | 'left'
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Hoş Geldiniz!',
    description: 'Yönetim panelinize hoş geldiniz. Bu kısa tur ile panelin temel özelliklerini tanıyacaksınız.',
    icon: Sparkles,
    position: 'center',
  },
  {
    id: 'dashboard',
    title: 'Genel Bakış',
    description: 'Ciro, sipariş sayısı ve performans metriklerinizi tek bakışta görün. Günlük, haftalık veya aylık verilerinizi takip edin.',
    icon: LayoutDashboard,
    targetSelector: '[data-onboarding="dashboard"]',
    position: 'right',
  },
  {
    id: 'menu',
    title: 'Menü Yönetimi',
    description: 'Kategoriler oluşturun, ürünler ekleyin ve fiyatları güncelleyin. QR menünüz otomatik güncellenir.',
    icon: UtensilsCrossed,
    targetSelector: '[data-onboarding="menu"]',
    position: 'right',
  },
  {
    id: 'calls',
    title: 'Çağrılar',
    description: 'Müşteri çağrılarını ve siparişlerini anlık takip edin. Garsonlarınız bildirimleri anında alır.',
    icon: Bell,
    targetSelector: '[data-onboarding="calls"]',
    position: 'right',
  },
  {
    id: 'tables',
    title: 'Masalar & QR',
    description: 'Masalarınızı yönetin ve her masa için benzersiz QR kodları indirin. Müşteriler QR ile menüye erişir.',
    icon: QrCode,
    targetSelector: '[data-onboarding="tables"]',
    position: 'right',
  },
  {
    id: 'waiters',
    title: 'Garsonlar',
    description: 'Garson hesapları oluşturun ve performanslarını takip edin. Her garsonun kendi giriş paneli var.',
    icon: Users,
    targetSelector: '[data-onboarding="waiters"]',
    position: 'right',
  },
  {
    id: 'campaigns',
    title: 'Kampanyalar',
    description: 'Sadakat kampanyaları oluşturun. Örneğin: "5 kahve alana 1 kahve hediye" gibi kampanyalar tanımlayın.',
    icon: Gift,
    targetSelector: '[data-onboarding="campaigns"]',
    position: 'right',
  },
  {
    id: 'settings',
    title: 'Genel Ayarlar',
    description: 'İşletme adı, logo, renk teması ve WiFi bilgilerini ayarlayın. Menünüzü özelleştirin.',
    icon: Settings,
    targetSelector: '[data-onboarding="settings"]',
    position: 'right',
  },
  {
    id: 'complete',
    title: 'Hazırsınız!',
    description: 'Artık paneli kullanmaya hazırsınız. İstediğiniz zaman ayarlardan bu turu tekrar başlatabilirsiniz.',
    icon: Sparkles,
    position: 'center',
  },
]

function getOnboardingStorageKey(restaurantId: string) {
  return `onboarding_completed_${restaurantId}`
}

export function hasCompletedOnboarding(restaurantId: string): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(getOnboardingStorageKey(restaurantId)) === 'true'
}

export function setOnboardingCompleted(restaurantId: string, completed: boolean) {
  if (typeof window === 'undefined') return
  if (completed) {
    localStorage.setItem(getOnboardingStorageKey(restaurantId), 'true')
  } else {
    localStorage.removeItem(getOnboardingStorageKey(restaurantId))
  }
}

interface DashboardOnboardingProps {
  restaurantId: string
  isOpen: boolean
  onClose: () => void
  onOpenSidebar?: () => void
}

export default function DashboardOnboarding({
  restaurantId,
  isOpen,
  onClose,
  onOpenSidebar,
}: DashboardOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  const step = ONBOARDING_STEPS[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1

  const updateTargetRect = useCallback(() => {
    if (!step.targetSelector) {
      setTargetRect(null)
      return
    }

    const element = document.querySelector(step.targetSelector)
    if (element) {
      setTargetRect(element.getBoundingClientRect())
    } else {
      setTargetRect(null)
    }
  }, [step.targetSelector])

  useEffect(() => {
    if (!isOpen) return

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    let mounted = true

    if (isMobile && step.targetSelector && onOpenSidebar) {
      onOpenSidebar()
      setTimeout(() => {
        if (mounted) updateTargetRect()
      }, 350)
    } else {
      requestAnimationFrame(() => {
        if (mounted) updateTargetRect()
      })
    }

    const handleResize = () => {
      if (mounted) updateTargetRect()
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)

    return () => {
      mounted = false
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [isOpen, currentStep, isMobile, onOpenSidebar, step.targetSelector, updateTargetRect])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOnboardingCompleted(restaurantId, true)
        setCurrentStep(0)
        onClose()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep === ONBOARDING_STEPS.length - 1) {
          setOnboardingCompleted(restaurantId, true)
          setCurrentStep(0)
          onClose()
        } else {
          setCurrentStep((prev) => prev + 1)
        }
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        setCurrentStep((prev) => prev - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentStep, restaurantId, onClose])

  function handleNext() {
    if (isLastStep) {
      handleComplete()
    } else {
      setCurrentStep((prev) => prev + 1)
    }
  }

  function handlePrev() {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  function handleSkip() {
    handleComplete()
  }

  function handleComplete() {
    setOnboardingCompleted(restaurantId, true)
    setCurrentStep(0)
    onClose()
  }

  if (!isOpen) return null

  const StepIcon = step.icon
  const spotlightPadding = 6
  const spotlightRadius = 12

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100]"
      >
        {/* Overlay with spotlight cutout */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - spotlightPadding}
                  y={targetRect.top - spotlightPadding}
                  width={targetRect.width + spotlightPadding * 2}
                  height={targetRect.height + spotlightPadding * 2}
                  rx={spotlightRadius}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.75)"
            mask="url(#spotlight-mask)"
          />
        </svg>

        {/* Spotlight border glow */}
        {targetRect && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute pointer-events-none"
            style={{
              left: targetRect.left - spotlightPadding,
              top: targetRect.top - spotlightPadding,
              width: targetRect.width + spotlightPadding * 2,
              height: targetRect.height + spotlightPadding * 2,
              borderRadius: spotlightRadius,
              boxShadow: '0 0 0 3px var(--primary), 0 0 20px var(--primary)',
            }}
          />
        )}

        {/* Tooltip/Card */}
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`z-10 ${isMobile ? 'fixed left-1/2 -translate-x-1/2 bottom-[88px] w-[calc(100vw-32px)] max-w-[360px]' : 'absolute'}`}
          style={isMobile ? undefined : getTooltipPosition(targetRect, step.position, false)}
        >
          <div
            className={`bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden ${isMobile ? 'max-h-[55vh] overflow-y-auto' : 'w-[360px]'}`}
          >
            {/* Progress bar */}
            <div className="h-1 bg-gray-100">
              <motion.div
                className="h-full"
                style={{ background: 'var(--primary)' }}
                initial={{ width: 0 }}
                animate={{ width: `${((currentStep + 1) / ONBOARDING_STEPS.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="p-5">
              {/* Header */}
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--primary-soft)' }}
                >
                  <StepIcon size={24} style={{ color: 'var(--primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg text-[var(--text)]">{step.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{step.description}</p>
                </div>
                <button
                  onClick={handleSkip}
                  className="p-1.5 -mt-1 -mr-1 rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label="Turu geç"
                >
                  <X size={18} className="text-gray-400" />
                </button>
              </div>

              {/* Step indicator */}
              <div className="flex items-center justify-center gap-1.5 mt-5">
                {ONBOARDING_STEPS.map((_, idx) => (
                  <div
                    key={idx}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: idx === currentStep ? 24 : 8,
                      background: idx === currentStep ? 'var(--primary)' : 'var(--border-soft)',
                    }}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-5">
                {!isFirstStep && (
                  <button
                    onClick={handlePrev}
                    className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-gray-50"
                    style={{ borderColor: 'var(--border-soft)', color: 'var(--text)' }}
                  >
                    <ChevronLeft size={16} />
                    Geri
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'var(--primary)' }}
                >
                  {isLastStep ? 'Başla' : 'İleri'}
                  {!isLastStep && <ChevronRight size={16} />}
                </button>
              </div>

              {/* Skip link */}
              {!isLastStep && (
                <button
                  onClick={handleSkip}
                  className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Turu geç
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function getTooltipPosition(
  targetRect: DOMRect | null,
  position: 'center' | 'right' | 'left' | undefined,
  isMobile: boolean
): React.CSSProperties {
  if (!targetRect || position === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const padding = 16
  const tooltipWidth = 360

  if (isMobile) {
    return {
      bottom: padding,
      left: '50%',
      transform: 'translateX(-50%)',
    }
  }

  const rightSpace = window.innerWidth - targetRect.right
  const leftSpace = targetRect.left

  if (rightSpace >= tooltipWidth + padding) {
    return {
      top: Math.max(padding, targetRect.top),
      left: targetRect.right + padding,
    }
  }

  if (leftSpace >= tooltipWidth + padding) {
    return {
      top: Math.max(padding, targetRect.top),
      right: window.innerWidth - targetRect.left + padding,
    }
  }

  return {
    top: targetRect.bottom + padding,
    left: '50%',
    transform: 'translateX(-50%)',
  }
}
