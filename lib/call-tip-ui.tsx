import type { LucideIcon } from 'lucide-react'
import { CreditCard, Hand, ShoppingBag } from 'lucide-react'

export type UiCallTip = 'sipariş' | 'hesap' | 'yardım'

export const CALL_TIP_UI: Record<UiCallTip, {
  label: string
  description: string
  Icon: LucideIcon
  accent: string
  surface: string
}> = {
  sipariş: {
    label: 'Sipariş',
    description: 'Sipariş vermek istiyorum',
    Icon: ShoppingBag,
    accent: '#f97316',
    surface: '#fff7ed',
  },
  hesap: {
    label: 'Hesap',
    description: 'Hesabı getirin lütfen',
    Icon: CreditCard,
    accent: '#16a34a',
    surface: '#f0fdf4',
  },
  yardım: {
    label: 'Yardım',
    description: 'Yardıma ihtiyacım var',
    Icon: Hand,
    accent: '#2563eb',
    surface: '#eff6ff',
  },
}

export function getCallTipUi(tip: string) {
  return CALL_TIP_UI[(tip as UiCallTip)] ?? CALL_TIP_UI.yardım
}
