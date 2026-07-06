'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'

export type ConfirmModalProps = {
  isOpen: boolean
  title: string
  message: string
  details?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  details,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  const variantStyles = {
    danger: {
      icon: 'bg-red-100 text-red-600',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      border: 'border-red-200',
    },
    warning: {
      icon: 'bg-amber-100 text-amber-600',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      border: 'border-amber-200',
    },
    info: {
      icon: 'bg-blue-100 text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      border: 'border-blue-200',
    },
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                {title}
              </h3>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg p-1 transition hover:bg-gray-100"
                disabled={loading}
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {message}
            </p>
            {details && (
              <div className={`mt-3 rounded-xl border px-4 py-3 ${styles.border}`} style={{ background: 'var(--surface-muted)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {details}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text)' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${styles.button}`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export type ConfirmDeleteProps = {
  isOpen: boolean
  itemType: string
  itemName: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDelete({ isOpen, itemType, itemName, onConfirm, onCancel }: ConfirmDeleteProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      title={`${itemType} Sil`}
      message={`Bu işlem geri alınamaz. ${itemType} kalıcı olarak silinecek.`}
      details={itemName}
      confirmLabel="Sil"
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

export type ConfirmPriceChangeProps = {
  isOpen: boolean
  productName: string
  oldPrice: number
  newPrice: number
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmPriceChange({
  isOpen,
  productName,
  oldPrice,
  newPrice,
  onConfirm,
  onCancel,
}: ConfirmPriceChangeProps) {
  const formatPrice = (price: number) => `${price.toLocaleString('tr-TR')} TL`
  const diff = newPrice - oldPrice
  const diffText = diff > 0 ? `+${formatPrice(diff)}` : formatPrice(diff)

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Fiyat Değişikliği"
      message={`${productName} fiyatı değiştirilecek.`}
      details={`${formatPrice(oldPrice)} → ${formatPrice(newPrice)} (${diffText})`}
      confirmLabel="Değiştir"
      variant="warning"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
