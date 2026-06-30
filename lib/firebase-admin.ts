import type { App } from 'firebase-admin/app'
import type { Firestore as AdminFirestore, FieldValue as AdminFieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'

const isDev = process.env.NODE_ENV === 'development'

export class FirebaseAdminError extends Error {
  code: string
  details?: string

  constructor(message: string, code: string, details?: string) {
    super(message)
    this.name = 'FirebaseAdminError'
    this.code = code
    this.details = details
  }
}

function getFirebaseAdminEnv() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  const missing: string[] = []
  if (!projectId) missing.push('FIREBASE_ADMIN_PROJECT_ID')
  if (!clientEmail) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL')
  if (!rawPrivateKey) missing.push('FIREBASE_ADMIN_PRIVATE_KEY')

  if (missing.length > 0 || !projectId || !clientEmail || !rawPrivateKey) {
    const errorMessage = `Firebase Admin SDK env eksik: ${missing.join(', ')}`
    console.error('[firebase-admin] ENV ERROR:', errorMessage)
    throw new FirebaseAdminError(errorMessage, 'env/missing', missing.join(', '))
  }

  let privateKey = rawPrivateKey
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n')
  }
  privateKey = privateKey.trim()

  if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY-----')) {
    const errorMessage = 'FIREBASE_ADMIN_PRIVATE_KEY formatı geçersiz. PEM formatında olmalı.'
    console.error('[firebase-admin] PRIVATE KEY ERROR:', errorMessage)
    console.error('[firebase-admin] Key starts with:', privateKey.substring(0, 50))
    throw new FirebaseAdminError(errorMessage, 'env/invalid-key')
  }

  return { projectId, clientEmail, privateKey }
}

let cachedAdminApp: App | null = null
let cachedFirestore: AdminFirestore | null = null

async function getAdminApp(): Promise<App> {
  if (cachedAdminApp) return cachedAdminApp

  const { cert, getApps, initializeApp } = await import('firebase-admin/app')

  const existingApp = getApps().find((app) => app.name === 'firebase-admin-app')
  if (existingApp) {
    cachedAdminApp = existingApp
    return existingApp
  }

  try {
    const firebaseAdminEnv = getFirebaseAdminEnv()
    console.log('[firebase-admin] Initializing with project:', firebaseAdminEnv.projectId)

    cachedAdminApp = initializeApp(
      {
        credential: cert(firebaseAdminEnv),
        projectId: firebaseAdminEnv.projectId,
      },
      'firebase-admin-app',
    )

    console.log('[firebase-admin] Initialized successfully')
    return cachedAdminApp
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[firebase-admin] INIT ERROR:', message)

    if (error instanceof FirebaseAdminError) {
      throw error
    }

    throw new FirebaseAdminError(
      `Firebase Admin SDK başlatılamadı: ${message}`,
      'init/failed',
      isDev ? message : undefined
    )
  }
}

export async function getAdminDb(): Promise<AdminFirestore> {
  if (cachedFirestore) return cachedFirestore

  try {
    const app = await getAdminApp()
    const { getFirestore } = await import('firebase-admin/firestore')
    cachedFirestore = getFirestore(app)
    return cachedFirestore
  } catch (error) {
    console.error('[firebase-admin] getAdminDb error:', error)
    throw error
  }
}

export async function getFieldValue(): Promise<typeof AdminFieldValue> {
  const { FieldValue } = await import('firebase-admin/firestore')
  return FieldValue
}

export async function getTimestamp(): Promise<typeof AdminTimestamp> {
  const { Timestamp } = await import('firebase-admin/firestore')
  return Timestamp
}
