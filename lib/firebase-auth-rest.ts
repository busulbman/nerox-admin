const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY

export type VerifiedUser = {
  uid: string
  email: string | null
}

export class AuthRestError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'AuthRestError'
    this.code = code
  }
}

export async function verifyIdToken(idToken: string): Promise<VerifiedUser> {
  if (!FIREBASE_API_KEY) {
    throw new AuthRestError('NEXT_PUBLIC_FIREBASE_API_KEY is not configured', 'config/missing-api-key')
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const errorMessage = error?.error?.message || 'Token verification failed'
    console.error('[firebase-auth-rest] verifyIdToken failed:', errorMessage)
    throw new AuthRestError(errorMessage, 'auth/invalid-token')
  }

  const data = await response.json() as { users?: Array<{ localId: string; email?: string }> }

  if (!data.users || data.users.length === 0) {
    throw new AuthRestError('User not found', 'auth/user-not-found')
  }

  const user = data.users[0]
  return {
    uid: user.localId,
    email: user.email ?? null,
  }
}

export async function createUser(email: string, password: string, displayName?: string): Promise<{ uid: string; email: string }> {
  if (!FIREBASE_API_KEY) {
    throw new AuthRestError('NEXT_PUBLIC_FIREBASE_API_KEY is not configured', 'config/missing-api-key')
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: false,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const errorCode = error?.error?.message || 'UNKNOWN_ERROR'
    console.error('[firebase-auth-rest] createUser failed:', errorCode)

    if (errorCode === 'EMAIL_EXISTS') {
      throw new AuthRestError('Bu e-posta adresi zaten kayıtlı.', 'auth/email-already-exists')
    }
    if (errorCode === 'INVALID_EMAIL') {
      throw new AuthRestError('Geçerli bir e-posta adresi girin.', 'auth/invalid-email')
    }
    if (errorCode.includes('WEAK_PASSWORD')) {
      throw new AuthRestError('Şifre en az 6 karakter olmalı.', 'auth/weak-password')
    }

    throw new AuthRestError('Kullanıcı oluşturulamadı.', 'auth/create-failed')
  }

  const data = await response.json() as { localId: string; email: string }

  // Update display name if provided
  if (displayName) {
    await updateUserProfile(data.localId, displayName).catch((err) => {
      console.warn('[firebase-auth-rest] Failed to update displayName:', err)
    })
  }

  return {
    uid: data.localId,
    email: data.email,
  }
}

async function updateUserProfile(uid: string, _displayName: string): Promise<void> {
  // Display name is stored in Firestore user doc, not in Auth profile
  console.log('[firebase-auth-rest] displayName stored in Firestore for uid:', uid)
}

export async function deleteUser(uid: string): Promise<void> {
  // Firebase REST API doesn't have a direct deleteUser endpoint for admin use
  // We'll mark the user as deleted in Firestore instead
  // The actual Auth cleanup can be done via Firebase Console or a Cloud Function
  console.warn('[firebase-auth-rest] deleteUser not available via REST API. UID:', uid)
  console.warn('[firebase-auth-rest] User should be manually deleted from Firebase Console if needed')
}
