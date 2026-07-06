'use client'

import { useState, type CSSProperties } from 'react'
import { UserRound } from 'lucide-react'

interface UserAvatarProps {
  name: string
  photoUrl?: string | null
  className?: string
  style?: CSSProperties
  fallbackStyle?: CSSProperties
  title?: string
  iconSize?: number
}

export default function UserAvatar({
  name,
  photoUrl,
  className = '',
  style,
  fallbackStyle,
  title,
  iconSize = 18,
}: UserAvatarProps) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null)

  const initial = name.trim().charAt(0).toUpperCase()
  const showImage = !!photoUrl && failedPhotoUrl !== photoUrl

  return (
    <div
      className={`overflow-hidden rounded-full shrink-0 ${className}`.trim()}
      style={style}
      title={title}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailedPhotoUrl(photoUrl ?? null)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={fallbackStyle}
          aria-hidden="true"
        >
          {initial ? (
            <span className="text-sm font-bold">{initial}</span>
          ) : (
            <UserRound size={iconSize} />
          )}
        </div>
      )}
    </div>
  )
}
