'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { useOnboarding } from './OnboardingProvider'

export default function FloatingHelpButton() {
  const { startOnboarding } = useOnboarding()
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50 md:bottom-8 md:right-8">
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-[var(--text)] px-3 py-2 text-xs font-medium text-white shadow-lg"
          >
            Sistem turunu başlat
            <div className="absolute -bottom-1 right-4 h-2 w-2 rotate-45 bg-[var(--text)]" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.5 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={startOnboarding}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-shadow hover:shadow-xl md:h-14 md:w-14"
        style={{
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
        }}
        aria-label="Sistem turunu başlat"
      >
        <HelpCircle size={24} className="md:hidden" />
        <HelpCircle size={28} className="hidden md:block" />
      </motion.button>
    </div>
  )
}
