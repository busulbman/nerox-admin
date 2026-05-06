const isDev = process.env.NODE_ENV === 'development'

export function logFirestoreRead(target: string, detail?: unknown) {
  if (!isDev) return
  if (typeof detail === 'undefined') {
    console.log('[FIRESTORE READ]', target)
    return
  }
  console.log('[FIRESTORE READ]', target, detail)
}

export function logFirestoreWrite(target: string, detail?: unknown) {
  if (!isDev) return
  if (typeof detail === 'undefined') {
    console.log('[FIRESTORE WRITE]', target)
    return
  }
  console.log('[FIRESTORE WRITE]', target, detail)
}
