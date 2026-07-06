'use client'

import type { ChangeEventHandler } from 'react'
import UserAvatar from '@/components/UserAvatar'

interface ProfilePhotoPickerProps {
  name: string
  photoUrl?: string | null
  label: string
  helperText?: string
  disabledText?: string
  uploading?: boolean
  disabled?: boolean
  onFileChange: ChangeEventHandler<HTMLInputElement>
  onClear?: () => void
}

export default function ProfilePhotoPicker({
  name,
  photoUrl,
  label,
  helperText,
  disabledText,
  uploading = false,
  disabled = false,
  onFileChange,
  onClear,
}: ProfilePhotoPickerProps) {
  const uploadDisabled = disabled || uploading

  return (
    <div
      className="rounded-2xl border px-4 py-4"
      style={{ background: '#fff', borderColor: 'var(--border-soft)' }}
    >
      <div className="flex items-center gap-4">
        <UserAvatar
          name={name}
          photoUrl={photoUrl}
          className="h-16 w-16 border"
          style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-muted)' }}
          fallbackStyle={{ color: 'var(--text)' }}
          title={name}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text)]">{label}</p>
          {helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
          {disabledText && <p className="mt-1 text-xs text-gray-500">{disabledText}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <label
          className={[
            'inline-flex cursor-pointer items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors',
            uploadDisabled ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
          style={{ background: 'var(--surface-muted)', color: 'var(--text)' }}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
            disabled={uploadDisabled}
          />
          {uploading ? 'Fotoğraf yükleniyor...' : 'Fotoğraf yükle'}
        </label>

        {photoUrl && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--text)' }}
          >
            Fotoğrafı kaldır
          </button>
        )}
      </div>
    </div>
  )
}
