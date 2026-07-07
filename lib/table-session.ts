import type { RestaurantGeneralSettings, Table, TableStatus } from '@/lib/types'

export const DEFAULT_TABLE_SESSION_DURATION_MINUTES = 120

export type LiveTableSessionStatus = Extract<TableStatus, 'aktif' | 'çağrı var' | 'hesap istendi'>

function normalizeTableSessionDurationMinutes(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TABLE_SESSION_DURATION_MINUTES
  }

  return Math.min(24 * 60, Math.max(15, Math.round(value)))
}

export function resolveTableSessionDurationMinutes(
  settings: Pick<RestaurantGeneralSettings, 'tableSessionDurationMinutes'> | null | undefined,
) {
  return normalizeTableSessionDurationMinutes(settings?.tableSessionDurationMinutes)
}

export function getTableSessionDurationMs(
  settings: Pick<RestaurantGeneralSettings, 'tableSessionDurationMinutes'> | null | undefined,
) {
  return resolveTableSessionDurationMinutes(settings) * 60_000
}

export function createTableSessionWindow(
  settings: Pick<RestaurantGeneralSettings, 'tableSessionDurationMinutes'> | null | undefined,
  now = Date.now(),
) {
  const sessionStartedAtMs = now
  const sessionExpiresAtMs = now + getTableSessionDurationMs(settings)

  return {
    sessionStartedAtMs,
    sessionExpiresAtMs,
  }
}

export function isLiveTableSessionStatus(status: TableStatus | null | undefined): status is LiveTableSessionStatus {
  return status === 'aktif' || status === 'çağrı var' || status === 'hesap istendi'
}

export function isTableSessionExpired(
  table: Pick<Table, 'sessionExpiresAt'> | null | undefined,
  now = Date.now(),
) {
  return typeof table?.sessionExpiresAt === 'number' && table.sessionExpiresAt <= now
}

export function isTableSessionLive(
  table: Pick<Table, 'status' | 'sessionId' | 'sessionExpiresAt'> | null | undefined,
  sessionId?: string | null,
  now = Date.now(),
) {
  if (!table?.sessionId || !isLiveTableSessionStatus(table.status)) {
    return false
  }

  if (sessionId && table.sessionId !== sessionId) {
    return false
  }

  return typeof table.sessionExpiresAt === 'number' && table.sessionExpiresAt > now
}
