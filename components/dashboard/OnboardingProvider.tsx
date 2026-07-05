'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import DashboardOnboarding, { hasCompletedOnboarding, setOnboardingCompleted } from './DashboardOnboarding'

type OnboardingContextValue = {
  isOpen: boolean
  startOnboarding: () => void
  resetOnboarding: () => void
}

const OnboardingContext = createContext<OnboardingContextValue>({
  isOpen: false,
  startOnboarding: () => {},
  resetOnboarding: () => {},
})

export function useOnboarding() {
  return useContext(OnboardingContext)
}

interface OnboardingProviderProps {
  restaurantId: string
  children: React.ReactNode
  onOpenSidebar?: () => void
}

export function OnboardingProvider({ restaurantId, children, onOpenSidebar }: OnboardingProviderProps) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!restaurantId) return
    if (!hasCompletedOnboarding(restaurantId)) {
      const timer = setTimeout(() => setIsOpen(true), 500)
      return () => clearTimeout(timer)
    }
  }, [restaurantId])

  const startOnboarding = useCallback(() => {
    setIsOpen(true)
  }, [])

  const resetOnboarding = useCallback(() => {
    setOnboardingCompleted(restaurantId, false)
    setIsOpen(true)
  }, [restaurantId])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <OnboardingContext.Provider value={{ isOpen, startOnboarding, resetOnboarding }}>
      {children}
      <DashboardOnboarding
        restaurantId={restaurantId}
        isOpen={isOpen}
        onClose={handleClose}
        onOpenSidebar={onOpenSidebar}
      />
    </OnboardingContext.Provider>
  )
}
