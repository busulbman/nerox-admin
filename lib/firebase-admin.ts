import type { App } from 'firebase-admin/app'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

function getFirebaseAdminEnv() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin SDK env değişkenleri eksik.')
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  }
}

let cachedAdminApp: App | null = null

export function getAdminApp() {
  if (cachedAdminApp) return cachedAdminApp

  const existingApp = getApps().find((app) => app.name === 'firebase-admin-app')
  if (existingApp) {
    cachedAdminApp = existingApp
    return existingApp
  }

  const firebaseAdminEnv = getFirebaseAdminEnv()
  cachedAdminApp = initializeApp(
    {
      credential: cert(firebaseAdminEnv),
      projectId: firebaseAdminEnv.projectId,
    },
    'firebase-admin-app',
  )

  return cachedAdminApp
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminDb() {
  return getFirestore(getAdminApp())
}

export { FieldValue, Timestamp }
