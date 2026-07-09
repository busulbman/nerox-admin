const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
const isDev = process.env.NODE_ENV === 'development'

export type VerifiedUser = {
  uid: string
  email: string | null
}

export type CreatedUser = {
  uid: string
  email: string
  /**
   * Fresh ID token for the just-created account. Kept so the account can be
   * deleted via REST (`accounts:delete`) during rollback without the Admin SDK.
   */
  idToken: string
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
    if (isDev) console.error('[firebase-auth-rest] verifyIdToken failed:', errorMessage)
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

export async function createUser(email: string, password: string, displayName?: string): Promise<CreatedUser> {
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
        // Return a token so the account can be deleted via REST during rollback.
        returnSecureToken: true,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const errorCode = error?.error?.message || 'UNKNOWN_ERROR'
    if (isDev) console.error('[firebase-auth-rest] createUser failed:', errorCode)

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

  const data = await response.json() as { localId: string; email: string; idToken: string }

  // Display name is persisted in the Firestore user doc (not the Auth profile),
  // so nothing extra to do here with `displayName`.
  void displayName

  return {
    uid: data.localId,
    email: data.email,
    idToken: data.idToken,
  }
}

/**
 * Deletes an Auth account via the REST `accounts:delete` endpoint using the
 * account's own ID token (obtained from `createUser`). This is a real deletion
 * — no Admin SDK / `firebase-admin/auth` import — and is used to roll back a
 * freshly created admin user when the Firestore seed write fails.
 *
 * Returns `true` on success and `false` on failure (never throws) so a rollback
 * failure can't mask the original error that triggered it.
 */
export async function deleteUser(idToken: string): Promise<boolean> {
  if (!FIREBASE_API_KEY) {
    if (isDev) console.error('[firebase-auth-rest] deleteUser: missing API key')
    return false
  }
  if (!idToken) {
    if (isDev) console.error('[firebase-auth-rest] deleteUser: missing idToken')
    return false
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorCode = error?.error?.message || 'UNKNOWN_ERROR'
      // Log only the Firebase error code (not the token) so no secret leaks.
      console.error('[firebase-auth-rest] deleteUser failed:', errorCode)
      return false
    }

    return true
  } catch (error) {
    if (isDev) console.error('[firebase-auth-rest] deleteUser error:', error instanceof Error ? error.message : error)
    return false
  }
}
