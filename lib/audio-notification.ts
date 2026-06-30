const AUDIO_ENABLED_KEY = 'nerox_audio_enabled'
const AUDIO_INITIALIZED_KEY = 'nerox_audio_initialized'

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

export async function playNotificationSound(): Promise<boolean> {
  if (!isAudioEnabled()) return false

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
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
    oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2)

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
