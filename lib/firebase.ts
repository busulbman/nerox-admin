import { initializeApp, getApps, deleteApp } from 'firebase/app'
import { getFirestore, collection, doc } from 'firebase/firestore'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const db   = getFirestore(app)
export const auth = getAuth(app)
export const rtdb = getDatabase(app)

export const RESTAURANT_ID = 'varina'

/** Shorthand: collection under restaurants/varina */
export function rc(colName: string) {
  return collection(db, 'restaurants', RESTAURANT_ID, colName)
}

/** Shorthand: doc under restaurants/varina */
export function rd(colName: string, docId: string) {
  return doc(db, 'restaurants', RESTAURANT_ID, colName, docId)
}

/**
 * Creates a Firebase Auth user without affecting the current admin session.
 * Uses a secondary app instance that is cleaned up afterwards.
 */
export async function createFirebaseUser(email: string, password: string): Promise<string> {
  const appName = `secondary-${Date.now()}`
  const secondaryApp = initializeApp(firebaseConfig, appName)
  const secondaryAuth = getAuth(secondaryApp)
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    return cred.user.uid
  } finally {
    await signOut(secondaryAuth).catch(() => {})
    await deleteApp(secondaryApp)
  }
}
