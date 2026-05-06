export async function requestPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showLocalNotification(title: string, body: string, url = '/') {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  const n = new Notification(title, { body, icon: '/icon.png' })
  n.onclick = () => { window.focus(); window.location.href = url; n.close() }
}

// Keep old name as alias for backward compatibility
export const showNotification = showLocalNotification
