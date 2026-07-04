'use client'

import { useEffect, useState } from 'react'

type LoadingVariant = 'menu' | 'admin' | 'waiter' | 'default'

const VARIANT_MESSAGES: Record<LoadingVariant, string> = {
  menu: 'Menünüz hazırlanıyor...',
  admin: 'Panel yükleniyor...',
  waiter: 'Siparişler hazırlanıyor...',
  default: 'Yükleniyor...',
}

interface LoadingScreenProps {
  variant?: LoadingVariant
  message?: string
  fullScreen?: boolean
  primaryColor?: string
}

function FallbackSpinner({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-3 w-3 rounded-full animate-pulse"
          style={{
            backgroundColor: color,
            animationDelay: `${i * 150}ms`,
            animationDuration: '600ms',
          }}
        />
      ))}
    </div>
  )
}

function LottieAnimation({ color }: { color: string }) {
  const [animationData, setAnimationData] = useState<object | null>(null)
  const [LottieComponent, setLottieComponent] = useState<React.ComponentType<{
    animationData: object
    loop: boolean
    autoplay: boolean
    style?: React.CSSProperties
  }> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLottie() {
      try {
        const [lottieModule, animData] = await Promise.all([
          import('lottie-react'),
          fetch('/lottie/loading.json').then((r) => r.json()),
        ])
        if (cancelled) return
        setLottieComponent(() => lottieModule.default)
        setAnimationData(animData)
      } catch {
        // Lottie yüklenemezse fallback kullanılır
      }
    }

    void loadLottie()
    return () => { cancelled = true }
  }, [])

  if (!LottieComponent || !animationData) {
    return <FallbackSpinner color={color} />
  }

  return (
    <LottieComponent
      animationData={animationData}
      loop
      autoplay
      style={{ width: 64, height: 64 }}
    />
  )
}

export default function LoadingScreen({
  variant = 'default',
  message,
  fullScreen = true,
  primaryColor = 'var(--primary)',
}: LoadingScreenProps) {
  const displayMessage = message ?? VARIANT_MESSAGES[variant]

  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <LottieAnimation color={primaryColor} />
      <p
        className="text-sm font-medium animate-pulse"
        style={{ color: 'var(--muted)' }}
      >
        {displayMessage}
      </p>
    </div>
  )

  if (!fullScreen) {
    return <div className="flex min-h-[200px] items-center justify-center">{content}</div>
  }

  return (
    <div
      className="theme-page fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'var(--page-bg)' }}
    >
      {content}
    </div>
  )
}
