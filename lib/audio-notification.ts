const AUDIO_ENABLED_KEY = 'nerox_audio_enabled'
const AUDIO_INITIALIZED_KEY = 'nerox_audio_initialized'

export type NotificationSoundType = 'newCall' | 'readyOrder'

const SOUND_PREF_KEYS: Record<NotificationSoundType, string> = {
  newCall: 'nerox_audio_pref_new_call',
  readyOrder: 'nerox_audio_pref_ready_order',
}

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioContext) return audioContext

  try {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    return audioContext
  } catch {
    console.warn('[audio] AudioContext not available')
    return null
  }
}

export function isAudioEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(AUDIO_ENABLED_KEY) === 'true'
}

export function isAudioInitialized(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(AUDIO_INITIALIZED_KEY) === 'true'
}

export function setAudioEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUDIO_ENABLED_KEY, enabled ? 'true' : 'false')
  window.localStorage.setItem(AUDIO_INITIALIZED_KEY, 'true')
}

export function isSoundPrefEnabled(type: NotificationSoundType): boolean {
  if (typeof window === 'undefined') return true
  // Missing value means the sound was never disabled → default on
  return window.localStorage.getItem(SOUND_PREF_KEYS[type]) !== 'false'
}

export function setSoundPref(type: NotificationSoundType, enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SOUND_PREF_KEYS[type], enabled ? 'true' : 'false')
}

export async function playNotificationSound(type?: NotificationSoundType): Promise<boolean> {
  if (!isAudioEnabled()) return false
  if (type && !isSoundPrefEnabled(type)) return false

  const ctx = getAudioContext()
  if (!ctx) return false

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = 'sine'
    // Ready-order uses a rising tone so waiters can tell it apart from new calls
    const frequencies = type === 'readyOrder' ? [659, 880, 1046] : [880, 1100, 880]
    oscillator.frequency.setValueAtTime(frequencies[0], ctx.currentTime)
    oscillator.frequency.setValueAtTime(frequencies[1], ctx.currentTime + 0.1)
    oscillator.frequency.setValueAtTime(frequencies[2], ctx.currentTime + 0.2)

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.3)

    return true
  } catch (error) {
    console.warn('[audio] Failed to play sound:', error)
    return false
  }
}

export async function initializeAudioWithUserInteraction(): Promise<boolean> {
  const ctx = getAudioContext()
  if (!ctx) return false

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    return true
  } catch {
    return false
  }
}
