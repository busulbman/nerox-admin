'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MessageCircle, Sparkles, Clock } from 'lucide-react'
import type { Restaurant } from '@/lib/types'

const SUPPORT_PHONE = '+90 542 132 07 06'
const WHATSAPP_LINK = 'https://wa.me/905421320706'

function getTrialWelcomeKey(restaurantId: string) {
  return `trial_welcome_dismissed_${restaurantId}`
}

function hasTrialWelcomeBeenDismissed(restaurantId: string): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(getTrialWelcomeKey(restaurantId)) === 'true'
}

function dismissTrialWelcome(restaurantId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(getTrialWelcomeKey(restaurantId), 'true')
}

function calculateRemainingDays(trialEndsAt: number | undefined | null): number {
  if (!trialEndsAt) return 7
  const remaining = Math.ceil((trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24))
  return Math.max(0, remaining)
}

interface TrialWelcomeCardProps {
  restaurant: Restaurant | null
  restaurantId: string
}

export default function TrialWelcomeCard({ restaurant, restaurantId }: TrialWelcomeCardProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState(true)

  useEffect(() => {
    if (!restaurantId || !restaurant) return

    const isTrial = restaurant.plan === 'trial'
    const alreadyDismissed = hasTrialWelcomeBeenDismissed(restaurantId)

    if (isTrial && !alreadyDismissed) {
      const timer = setTimeout(() => {
        setIsDismissed(false)
        setIsVisible(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [restaurantId, restaurant])

  function handleDismiss() {
    setIsVisible(false)
    dismissTrialWelcome(restaurantId)
    setTimeout(() => setIsDismissed(true), 300)
  }

  if (isDismissed || !restaurant || restaurant.plan !== 'trial') return null

  const remainingDays = calculateRemainingDays(restaurant.trialEndsAt)

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
          >
            {/* Header with gradient */}
            <div
              className="relative px-6 py-8 text-center"
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
              }}
            >
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                style={{ color: 'var(--primary-foreground)' }}
              >
                <X size={18} />
              </button>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.2 }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4"
              >
                <Sparkles size={32} style={{ color: 'var(--primary-foreground)' }} />
              </motion.div>

              <h2 className="text-2xl font-bold" style={{ color: 'var(--primary-foreground)' }}>
                Deneme süreniz başladı!
              </h2>
              <p className="mt-2 text-sm opacity-90" style={{ color: 'var(--primary-foreground)' }}>
                TABPAD QR&apos;ın tüm özelliklerini 7 gün boyunca ücretsiz kullanabilirsiniz.
              </p>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              {/* Remaining days */}
              <div className="flex items-center gap-4 rounded-xl bg-[var(--surface-muted)] p-4 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--primary-soft)' }}>
                  <Clock size={24} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Kalan Süre</p>
                  <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                    {remainingDays} Gün
                  </p>
                </div>
              </div>

              {/* Support info */}
              <div className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] p-4 mb-5">
                <MessageCircle size={20} className="text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Destek Hattı</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{SUPPORT_PHONE}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleDismiss}
                  className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors hover:bg-gray-50"
                  style={{ borderColor: 'var(--border-soft)', color: 'var(--text)' }}
                >
                  Anladım
                </button>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
                  style={{ background: '#25d366' }}
                >
                  <MessageCircle size={18} />
                  WhatsApp Destek
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
