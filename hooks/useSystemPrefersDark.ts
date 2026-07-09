'use client'

import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getServerSnapshot() {
  return false
}

/** Cihazın koyu tema tercihini canlı izler ("system" görünüm modu için). */
export function useSystemPrefersDark() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
